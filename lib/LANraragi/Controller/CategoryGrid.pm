package LANraragi::Controller::CategoryGrid;
use Mojo::Base 'Mojolicious::Controller';

use LANraragi::Utils::Generic qw(generate_themes_header);

sub index {
    my $self = shift;

    $self->render(
        template => "category_grid",
        title    => $self->LRR_CONF->get_htmltitle,
        csshead  => generate_themes_header($self),
        version  => $self->LRR_VERSION
    );
}

1; 