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

    # Get tankoubon data
    my ($total, $filtered, %tank) = LANraragi::Model::Tankoubon::get_tankoubon($tank_id);

    # If tankoubon doesn't exist, redirect to management page
    unless (%tank) {
        $self->redirect_to('tankoubons');
        return;
    }

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