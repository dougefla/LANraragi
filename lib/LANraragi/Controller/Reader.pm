package LANraragi::Controller::Reader;
use Mojo::Base 'Mojolicious::Controller';

use Encode;

use LANraragi::Utils::Generic qw(generate_themes_header);
use LANraragi::Utils::Database qw(redis_decode);

use LANraragi::Model::Reader;

# This action will render a template
sub index {
    my $self = shift;

    if ( $self->req->param('id') ) {

        # Allow adding to category
        my @categories = LANraragi::Model::Category->get_category_list;

        # But only to static categories
        @categories = grep { %$_{"search"} eq "" } @categories;

        $self->render(
            template   => "reader",
            title      => $self->LRR_CONF->get_htmltitle,
            use_local  => $self->LRR_CONF->enable_localprogress,
            id         => $self->req->param('id'),
            categories => \@categories,
            csshead    => generate_themes_header($self),
            version    => $self->LRR_VERSION,
            userlogged => $self->LRR_CONF->enable_pass == 0 || $self->session('is_logged')
        );
    } else {

        # No parameters back the fuck off
        $self->redirect_to('index');
    }
}

1;
