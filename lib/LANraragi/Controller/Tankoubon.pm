package LANraragi::Controller::Tankoubon;
use Mojo::Base 'Mojolicious::Controller';

use utf8;
use URI::Escape;
use Redis;
use Encode;
use Mojo::Util qw(xml_escape);

use LANraragi::Utils::Generic qw(generate_themes_header);
use LANraragi::Utils::Database qw(redis_decode);
use LANraragi::Model::Tankoubon;
use LANraragi::Model::Config;

# Go through the archives in the content directory and build the template at the end.
sub index {
    my $self = shift;

    my $userlogged = $self->LRR_CONF->enable_pass == 0 || $self->session('is_logged');

    $self->render(
        template   => "tankoubon",
        title      => $self->LRR_CONF->get_htmltitle,
        csshead    => generate_themes_header($self),
        version    => $self->LRR_VERSION,
        userlogged => $userlogged
    );
}

# Management view
sub management {
    my $self = shift;

    my $userlogged = $self->LRR_CONF->enable_pass == 0 || $self->session('is_logged');

    $self->render(
        template   => "tankoubons",
        title      => $self->LRR_CONF->get_htmltitle,
        csshead    => generate_themes_header($self),
        version    => $self->LRR_VERSION,
        userlogged => $userlogged
    );
}

# View a specific tankoubon
sub view {
    my $self = shift;
    my $tank_id = $self->param('id');

    my $userlogged = $self->LRR_CONF->enable_pass == 0 || $self->session('is_logged');

    # Get tankoubon data with full data to include last_updated
    my ($total, $filtered, %tank) = LANraragi::Model::Tankoubon::get_tankoubon($tank_id, 1);

    # If tankoubon doesn't exist, redirect to management page
    unless (%tank) {
        $self->redirect_to('tankoubons');
        return;
    }

    # Get last_updated timestamp from Redis
    my $redis = LANraragi::Model::Config->get_redis;
    my @last_updated = $redis->zrangebyscore($tank_id, $LANraragi::Utils::Database::TANK_METADATA{"last_updated"}, 
                                           $LANraragi::Utils::Database::TANK_METADATA{"last_updated"}, qw{LIMIT 0 1});
    if (@last_updated) {
        my $last_updated_str = LANraragi::Utils::Database::redis_decode($last_updated[0]);
        my ($timestamp) = $last_updated_str =~ /last_updated_(\d+)/;
        $tank{last_updated} = $timestamp if $timestamp;
    }

    # Get total archive count
    my $archive_count = $redis->zcount($tank_id, 1, "+inf");
    $tank{total} = $archive_count;

    $redis->quit;

    $self->render(
        template   => "tankoubon_view",
        title      => $self->LRR_CONF->get_htmltitle,
        csshead    => generate_themes_header($self),
        version    => $self->LRR_VERSION,
        userlogged => $userlogged,
        tank       => \%tank
    );
}

1;