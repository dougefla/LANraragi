package LANraragi::Controller::Api::Tankoubon;
use Mojo::Base 'Mojolicious::Controller';

use Redis;
use Encode;

use LANraragi::Model::Tankoubon;
use LANraragi::Model::Archive;
use LANraragi::Utils::Generic qw(render_api_response exec_with_lock);

sub get_tankoubon_list {

    my $self = shift;
    my $req  = $self->req;

    my $page = $req->param('page') || 1;  # Default to page 1
    my $pagesize = $req->param('pagesize') || 0;
    my $sort = $req->param('sort') || 'name';
    my $order = $req->param('order') || 'asc';
    
    # Validate parameters
    $page = int($page) if $page;
    $page = 1 if $page < 1;  # Ensure page is at least 1
    $pagesize = int($pagesize) if $pagesize;
    $sort = 'name' unless $sort =~ /^(name|created|archives)$/;
    $order = 'asc' unless $order =~ /^(asc|desc)$/;
    
    # Convert to 0-based page number for the model
    my $zero_based_page = $page - 1;

    my ( $total, $filtered, @rgs ) = LANraragi::Model::Tankoubon::get_tankoubon_list($zero_based_page, $pagesize, $sort, $order);
    $self->render( json => { result => \@rgs, total => $total, filtered => $filtered } );

}

sub get_tankoubon {

    my $self    = shift;
    my $tank_id = $self->stash('id');
    my $req     = $self->req;

    my $fulldata = $req->param('include_full_data');
    my $page     = $req->param('page');

    # If include_full_data is requested and no page is specified, show all archives
    if ($fulldata && !defined $page) {
        $page = -1;
    }

    my ( $total, $filtered, %tankoubon ) = LANraragi::Model::Tankoubon::get_tankoubon( $tank_id, $fulldata, $page );

    unless (%tankoubon) {
        render_api_response( $self, "get_tankoubon", "The given tankoubon does not exist." );
        return;
    }

    $self->render( json => { result => \%tankoubon, total => $total, filtered => $filtered } );
}

sub create_tankoubon {

    my $self   = shift;
    my $name   = $self->req->param('name')   || "";
    my $tankid = $self->req->param('tankid') || "";

    if ( $name eq "" ) {
        render_api_response( $self, "create_tankoubon", "Tankoubon name not specified." );
        return;
    }

    my $created_id = LANraragi::Model::Tankoubon::create_tankoubon( $name, $tankid );
    $self->render(
        json => {
            operation    => "create_tankoubon",
            tankoubon_id => $created_id,
            success      => 1
        }
    );

}

sub delete_tankoubon {

    my $self   = shift;
    my $tankid = $self->stash('id');

    my $redis = LANraragi::Model::Config->get_redis;

    return unless exec_with_lock( $self, $redis, "tankoubon-write:$tankid", "delete_tankoubon", $tankid, sub {
        my $result = LANraragi::Model::Tankoubon::delete_tankoubon($tankid);

        if ($result) {
            render_api_response( $self, "delete_tankoubon" );
        } else {
            render_api_response( $self, "delete_tankoubon", "The given tankoubon does not exist." );
        }
    });
}

sub update_tankoubon {

    my $self   = shift;
    my $tankid = $self->stash('id');
    my $data   = $self->req->json;

    my $redis = LANraragi::Model::Config->get_redis;

    return unless exec_with_lock( $self, $redis, "tankoubon-write:$tankid", "update_tankoubon", $tankid, sub {
        my ( $result, $err ) = LANraragi::Model::Tankoubon::update_tankoubon( $tankid, $data );

        if ($result) {
            my %tankoubon      = LANraragi::Model::Tankoubon::get_tankoubon($tankid);
            my $successMessage = "Updated tankoubon \"$tankoubon{name}\"!";

            render_api_response( $self, "update_tankoubon", undef, $successMessage );
        } else {
            render_api_response( $self, "update_tankoubon", $err );
        }
    });
}

sub set_tankoubon_thumbnail {

    my $self     = shift;
    my $tankid   = $self->stash('id');
    my $archiveid = $self->req->json->{archive_id};

    if (!$archiveid) {
        render_api_response( $self, "set_tankoubon_thumbnail", "No archive ID provided." );
        return;
    }

    my $redis = LANraragi::Model::Config->get_redis;

    return unless exec_with_lock( $self, $redis, "tankoubon-write:$tankid", "set_tankoubon_thumbnail", $tankid, sub {
        
        # Check if the archive exists in the tankoubon
        my $score = $redis->zscore($tankid, $archiveid);
        if (!defined $score || $score < 1) {
            render_api_response( $self, "set_tankoubon_thumbnail", "Archive is not part of this tankoubon." );
            return;
        }

        # Update the thumbnail field
        my $result = LANraragi::Model::Tankoubon::update_metadata_field($tankid, "thumbnail", $archiveid);

        if ($result) {
            my %tankoubon      = LANraragi::Model::Tankoubon::get_tankoubon($tankid);
            my $title          = LANraragi::Model::Archive::get_title($archiveid);
            my $successMessage = "Set thumbnail for tankoubon \"$tankoubon{name}\" to \"$title\"!";

            render_api_response( $self, "set_tankoubon_thumbnail", undef, $successMessage );
        } else {
            render_api_response( $self, "set_tankoubon_thumbnail", "Failed to set thumbnail." );
        }
    });
}

sub add_to_tankoubon {

    my $self   = shift;
    my $tankid = $self->stash('id');
    my $arcid  = $self->stash('archive');

    my $redis = LANraragi::Model::Config->get_redis;

    return unless exec_with_lock( $self, $redis, "tankoubon-write:$tankid", "add_to_tankoubon", $tankid, sub {
        my ( $result, $err ) = LANraragi::Model::Tankoubon::add_to_tankoubon( $tankid, $arcid );

        if ($result) {
            my $successMessage = "Added $arcid to tankoubon $tankid!";
            my %tankoubon      = LANraragi::Model::Tankoubon::get_tankoubon($tankid);
            my $title          = LANraragi::Model::Archive::get_title($arcid);

            if ( %tankoubon && defined($title) ) {
                $successMessage = "Added \"$title\" to tankoubon \"$tankoubon{name}\"!";
            }

            render_api_response( $self, "add_to_tankoubon", undef, $successMessage );
        } else {
            render_api_response( $self, "add_to_tankoubon", $err );
        }
    });
}

sub remove_from_tankoubon {

    my $self   = shift;
    my $tankid = $self->stash('id');
    my $arcid  = $self->stash('archive');

    my $redis = LANraragi::Model::Config->get_redis;

    return unless exec_with_lock( $self, $redis, "tankoubon-write:$tankid", "remove_from_tankoubon", $tankid, sub {
        my ( $result, $err ) = LANraragi::Model::Tankoubon::remove_from_tankoubon( $tankid, $arcid );

        if ($result) {
            my $successMessage = "Removed $arcid from tankoubon $tankid!";
            my %tankoubon      = LANraragi::Model::Tankoubon::get_tankoubon($tankid);
            my $title          = LANraragi::Model::Archive::get_title($arcid);

            if ( %tankoubon && defined($title) ) {
                $successMessage = "Removed \"$title\" from tankoubon \"$tankoubon{name}\"!";
            }

            render_api_response( $self, "remove_from_tankoubon", undef, $successMessage );
        } else {
            render_api_response( $self, "remove_from_tankoubon", $err );
        }
    });
}

sub get_tankoubons_file {

    my $self  = shift;
    my $arcid = $self->stash('id');

    if ( $arcid eq "" ) {
        render_api_response( $self, "get_tankoubons_file", "Archive not specified." );
        return;
    }

    my @tanks = LANraragi::Model::Tankoubon::get_tankoubons_containing_archive($arcid);

    $self->render(
        json => {
            operation  => "find_arc_tankoubons",
            tankoubons => \@tanks,
            success    => 1
        }
    );
}

1;

