package LANraragi::Controller::Api::Tankoubon;
use strict;
use warnings;
use utf8;

use Mojo::Base 'Mojolicious::Controller';
use Redis;
use Encode;

use LANraragi::Model::Tankoubon;
use LANraragi::Model::Config;
use LANraragi::Model::Archive;
use LANraragi::Utils::Generic qw(render_api_response);

our $VERSION = '1.0';

# Prevent subroutine redefinition warnings
no warnings 'redefine';

sub get_tankoubon_list {
    my $self = shift;
    my ($total, $filtered, @tanks) = LANraragi::Model::Tankoubon::get_tankoubon_list;
    $self->render(json => \@tanks);
}

sub get_tankoubon {
    my $self = shift;
    my $tankid = $self->stash('id');
    my %tankoubon = LANraragi::Model::Tankoubon::get_tankoubon($tankid);

    unless (%tankoubon) {
        render_api_response($self, "get_tankoubon", "The given tankoubon does not exist.");
        return;
    }

    $self->render(json => \%tankoubon);
}

sub create_tankoubon {
    my $self = shift;
    my $name = $self->req->param('name') || "";

    if ($name eq "") {
        render_api_response($self, "create_tankoubon", "Tankoubon name not specified.");
        return;
    }

    my $created_id = LANraragi::Model::Tankoubon::create_tankoubon($name, "");
    $self->render(
        json => {
            operation => "create_tankoubon",
            tankoubon_id => $created_id,
            success => 1
        }
    );
}

sub update_tankoubon {
    my $self = shift;
    my $tankid = $self->stash('id');
    my %tankoubon = LANraragi::Model::Tankoubon::get_tankoubon($tankid);

    unless (%tankoubon) {
        render_api_response($self, "update_tankoubon", "The given tankoubon does not exist.");
        return;
    }

    my $json = $self->req->json;
    my ($result, $err) = LANraragi::Model::Tankoubon::update_tankoubon($tankid, $json);

    if ($result) {
        render_api_response($self, "update_tankoubon", undef, "Updated tankoubon \"$tankoubon{name}\"!");
    } else {
        render_api_response($self, "update_tankoubon", $err);
    }
}

sub delete_tankoubon {
    my $self = shift;
    my $tankid = $self->stash('id');
    my $delete_archives = $self->param('delete_archives');

    my $result;
    if ($delete_archives) {
        $result = LANraragi::Model::Tankoubon::delete_tankoubon_and_archives($tankid);
    } else {
        $result = LANraragi::Model::Tankoubon::delete_tankoubon($tankid);
    }

    if ($result) {
        render_api_response($self, "delete_tankoubon");
    } else {
        render_api_response($self, "delete_tankoubon", "The given tankoubon does not exist.");
    }
}

sub add_to_tankoubon {
    my $self = shift;
    my $tankid = $self->stash('id');
    my $arcid = $self->stash('archive');

    my ($result, $err) = LANraragi::Model::Tankoubon::add_to_tankoubon($tankid, $arcid);

    if ($result) {
        my $successMessage = "Added $arcid to Tankoubon $tankid!";
        my %tankoubon = LANraragi::Model::Tankoubon::get_tankoubon($tankid);
        my $title = LANraragi::Model::Archive::get_title($arcid);

        if (%tankoubon && defined($title)) {
            $successMessage = "Added \"$title\" to tankoubon \"$tankoubon{name}\"!";
        }

        render_api_response($self, "add_to_tankoubon", undef, $successMessage);
    } else {
        render_api_response($self, "add_to_tankoubon", $err);
    }
}

sub remove_from_tankoubon {
    my $self = shift;
    my $tankid = $self->stash('id');
    my $arcid = $self->stash('archive');

    my ($result, $err) = LANraragi::Model::Tankoubon::remove_from_tankoubon($tankid, $arcid);

    if ($result) {
        my $successMessage = "Removed $arcid from Tankoubon $tankid!";
        my %tankoubon = LANraragi::Model::Tankoubon::get_tankoubon($tankid);
        my $title = LANraragi::Model::Archive::get_title($arcid);

        if (%tankoubon && defined($title)) {
            $successMessage = "Removed \"$title\" from tankoubon \"$tankoubon{name}\"!";
        }

        render_api_response($self, "remove_from_tankoubon", undef, $successMessage);
    } else {
        render_api_response($self, "remove_from_tankoubon", $err);
    }
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

