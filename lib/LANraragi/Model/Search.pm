package LANraragi::Model::Search;

use feature qw(signatures);
no warnings 'experimental::signatures';

use strict;
use warnings;
use utf8;

use List::Util qw(min);
use Redis;
use Storable qw/ nfreeze thaw /;
use Sort::Naturally;

use LANraragi::Utils::Generic  qw(split_workload_by_cpu intersect_arrays);
use LANraragi::Utils::String   qw(trim);
use LANraragi::Utils::Database qw(redis_decode redis_encode);
use LANraragi::Utils::Logging  qw(get_logger);

use LANraragi::Model::Archive;
use LANraragi::Model::Category;

# do_search (filter, category_id, page, key, order, newonly, untaggedonly)
# Performs a search on the database.
sub do_search ( $filter, $category_id, $start, $sortkey, $sortorder, $newonly, $untaggedonly, $grouptanks ) {

    my $redis  = LANraragi::Model::Config->get_redis_search;
    my $logger = get_logger( "Search Engine", "lanraragi" );

    unless ( $redis->exists("LAST_JOB_TIME") && ( $redis->exists("LRR_TANKGROUPED") || !$grouptanks ) ) {
        $logger->error("Search engine is not initialized yet. Please wait a few seconds.");

        # TODO - This is the only case where the API returns -1, but it's not really handled well clientside at the moment.
        return ( -1, -1, () );
    }

    my $tankcount = $redis->scard("LRR_TANKGROUPED") + 0;

    # Get tank ids count
    my $tankidscount = scalar( LANraragi::Model::Config->get_redis->keys('TANK_??????????') );

    # Total number of archives (as int)
    my $total = $grouptanks ? $tankcount : $redis->zcard("LRR_TITLES") - $tankidscount;

    # Look in searchcache first
    my $sortorder_inv = $sortorder ? 0 : 1;
    my $cachekey      = redis_encode("$category_id-$filter-$sortkey-$sortorder-$newonly-$untaggedonly-$grouptanks");
    my $cachekey_inv  = redis_encode("$category_id-$filter-$sortkey-$sortorder_inv-$newonly-$untaggedonly-$grouptanks");
    my ( $cachehit, @filtered ) = check_cache( $cachekey, $cachekey_inv );

    # Don't use cache for history searches since setting lastreadtime doesn't (and shouldn't) cachebust
    unless ( $cachehit && $sortkey ne "lastread" ) {
        $logger->debug("No cache available (or history-sorted search), doing a full DB parse.");
        @filtered = search_uncached( $category_id, $filter, $sortkey, $sortorder, $newonly, $untaggedonly, $grouptanks );

        # Cache this query in the search database
        eval { $redis->hset( "LRR_SEARCHCACHE", $cachekey, nfreeze \@filtered ); };
    }
    $redis->quit();

    # If start is negative, return all possible data.
    if ( $start == -1 ) {
        return ( $total, $#filtered + 1, @filtered );
    }

    # Only get the first X keys
    my $keysperpage = LANraragi::Model::Config->get_pagesize;

    # Return total keys and the filtered ones
    my $end = min( $start + $keysperpage - 1, $#filtered );
    return ( $total, $#filtered + 1, @filtered[ $start .. $end ] );
}

sub check_cache ( $cachekey, $cachekey_inv ) {

    my $redis  = LANraragi::Model::Config->get_redis_search;
    my $logger = get_logger( "Search Cache", "lanraragi" );

    my @filtered = ();
    my $cachehit = 0;
    $logger->debug("Search request: $cachekey");

    if ( $redis->exists("LRR_SEARCHCACHE") && $redis->hexists( "LRR_SEARCHCACHE", $cachekey ) ) {
        $logger->debug("Using cache for this query.");
        $cachehit = 1;

        # Thaw cache and use that as the filtered list
        my $frozendata = $redis->hget( "LRR_SEARCHCACHE", $cachekey );
        @filtered = @{ thaw $frozendata };

    } elsif ( $redis->exists("LRR_SEARCHCACHE") && $redis->hexists( "LRR_SEARCHCACHE", $cachekey_inv ) ) {
        $logger->debug("A cache key exists with the opposite sortorder.");
        $cachehit = 1;

        # Thaw cache, invert the list to match the sortorder and use that as the filtered list
        my $frozendata = $redis->hget( "LRR_SEARCHCACHE", $cachekey_inv );
        @filtered = reverse @{ thaw $frozendata };
    }

    $redis->quit();
    return ( $cachehit, @filtered );
}

# Grab all our IDs, then filter them down according to the following filters and tokens' ID groups.
sub search_uncached ( $category_id, $filter, $sortkey, $sortorder, $newonly, $untaggedonly, $grouptanks ) {

    my $redis    = LANraragi::Model::Config->get_redis_search;
    my $redis_db = LANraragi::Model::Config->get_redis;
    my $logger   = get_logger( "Search Core", "lanraragi" );

    # Compute search filters
    my @tokens = compute_search_filter($filter);

    # Prepare array: For each token, we'll have a list of matching archive IDs.
    # We intersect those lists as we proceed to get the final result.
    my @filtered;
    if ($grouptanks) {
        # Start with our tank IDs, and all other archive IDs that aren't in tanks
        @filtered = $redis->smembers("LRR_TANKGROUPED");
    } else {
        # Start with all our archive IDs. Tank IDs won't be present in this search.
        @filtered = $redis_db->keys('????????????????????????????????????????');
    }

    # If we're using a category, we'll need to get its source data first.
    my %category = LANraragi::Model::Category::get_category($category_id);

    if (%category) {
        # If the category is dynamic, get its search predicate and add it to the tokens.
        # If it's static however, we can use its ID list as the base for our result array.
        if ( $category{search} ne "" ) {
            my @cat_tokens = compute_search_filter( $category{search} );
            push @tokens, @cat_tokens;
        } else {
            @filtered = intersect_arrays( $category{archives}, \@filtered, 0 );
        }
    }

    # If the untagged filter is enabled, call the untagged files API
    if ($untaggedonly) {
        my @untagged = $redis->smembers("LRR_UNTAGGED");
        @filtered = intersect_arrays( \@untagged, \@filtered, 0 );
    }

    # Check new filter
    if ($newonly) {
        my @new = $redis->smembers("LRR_NEW");
        @filtered = intersect_arrays( \@new, \@filtered, 0 );
    }

    # Iterate through each token and intersect the results with the previous ones.
    unless ( scalar @tokens == 0 || scalar @filtered == 0 ) {
        foreach my $token (@tokens) {

            my $tag     = $token->{tag};
            my $isneg   = $token->{isneg};
            my $isexact = $token->{isexact};

            $logger->debug("Searching for $tag, isneg=$isneg, isexact=$isexact");

            # Encode tag as we'll use it in redis operations
            $tag = redis_encode($tag);

            my @ids = ();

            # For exact tag searches, just check if an index for it exists
            if ( $isexact && $redis->exists("INDEX_$tag") ) {
                # Get the list of IDs for this tag
                @ids = $redis->smembers("INDEX_$tag");
                $logger->debug( "Found tag index for $tag, containing " . scalar @ids . " IDs" );
            } else {
                # Get index keys that match this tag.
                # If the tag has a namespace, We don't add a wildcard at the start of the tag to keep it intact.
                # Otherwise, we add a wildcard at the start to match all namespaces.
                my $indexkey = $tag =~ /:/ ? "INDEX_$tag*" : "INDEX_*$tag*";
                my @keys     = $redis->keys($indexkey);

                # Get the list of IDs for each key
                foreach my $key (@keys) {
                    my @keyids = $redis->smembers($key);
                    $logger->trace( "Found index $key for $tag, containing " . scalar @ids . " IDs" );
                    push @ids, @keyids;
                }
            }

            # Append fuzzy title search
            my $namesearch = $isexact ? "$tag\x00*" : "*$tag*";
            my $scan       = -1;
            while ( $scan != 0 ) {
                # First iteration
                if ( $scan == -1 ) { $scan = 0; }
                $logger->trace("Scanning for $namesearch, cursor=$scan");

                my @result = $redis->zscan( "LRR_TITLES", $scan, "MATCH", $namesearch, "COUNT", 100 );
                $scan = $result[0];

                foreach my $title ( @{ $result[1] } ) {
                    if ( $title eq "0" ) { next; }    # Skip scores
                    $logger->trace("Found title match: $title");

                    # Strip everything before \x00 to get the ID out of the key
                    my $id = substr( $title, index( $title, "\x00" ) + 1 );
                    push @ids, $id;
                }
            }

            # For tankoubons, also search in their metadata
            if ($grouptanks) {
                foreach my $id (@filtered) {
                    if ($id =~ /^TANK/) {
                        # Get tank metadata
                        my $tank_name = $redis_db->zrangebyscore( $id, $LANraragi::Utils::Database::TANK_METADATA{"name"}, $LANraragi::Utils::Database::TANK_METADATA{"name"}, qw{LIMIT 0 1} );
                        my $tank_summary = $redis_db->zrangebyscore( $id, $LANraragi::Utils::Database::TANK_METADATA{"summary"}, $LANraragi::Utils::Database::TANK_METADATA{"summary"}, qw{LIMIT 0 1} );
                        my $tank_tags = $redis_db->zrangebyscore( $id, $LANraragi::Utils::Database::TANK_METADATA{"tags"}, $LANraragi::Utils::Database::TANK_METADATA{"tags"}, qw{LIMIT 0 1} );

                        # Remove prefix from metadata
                        $tank_name =~ s/^name_//i if $tank_name;
                        $tank_summary =~ s/^summary_//i if $tank_summary;
                        $tank_tags =~ s/^tags_//i if $tank_tags;

                        # Convert the search pattern to match archive search behavior
                        my $search_pattern = $tag;
                        $search_pattern =~ s/\.\*/\*/g;  # Convert .* back to * for wildcard matching
                        $search_pattern =~ s/\./\?/g;    # Convert . back to ? for single character matching

                        # For exact matches, only match complete tags
                        if ($isexact) {
                            # Split tags and check each one
                            my @tank_tag_list = split(/,\s*/, $tank_tags);
                            foreach my $t (@tank_tag_list) {
                                if (lc($t) eq lc($search_pattern)) {
                                    push @ids, $id;
                                    last;
                                }
                            }
                        } else {
                            # For non-exact matches, search in all metadata
                            if (($tank_name && $tank_name =~ /$search_pattern/i) ||
                                ($tank_summary && $tank_summary =~ /$search_pattern/i) ||
                                ($tank_tags && $tank_tags =~ /$search_pattern/i)) {
                                push @ids, $id;
                            }
                        }
                    }
                }
            }

            if ( scalar @ids == 0 && !$isneg ) {
                # No more results, we can end search here
                $logger->trace("No results for this token, halting search.");
                @filtered = ();
                last;
            } else {
                $logger->trace( "Found " . scalar @ids . " results for this token." );

                # Intersect the new list with the previous ones
                @filtered = intersect_arrays( \@ids, \@filtered, $isneg );

                if ( scalar @filtered == 0 ) {
                    $logger->trace("No more results after intersection, halting search.");
                    last;
                }
            }
        }
    }

    if ( scalar @filtered > 0 ) {
        $logger->debug( "Found " . scalar @filtered . " results after filtering." );

        if ( !$sortkey ) {
            $sortkey = "title";
        }

        if ( $sortkey eq "title" ) {
            my @ordered = ();

            # For title sorting, we can just use the LRR_TITLES set, which is sorted lexicographically (but not naturally).
            @ordered = nsort( $redis->zrangebylex( "LRR_TITLES", "-", "+" ) );
            if ($sortorder) {
                @ordered = reverse(@ordered);
            }

            # Remove the titles from the keys, which are stored as "title\x00id"
            @ordered = map { substr( $_, index( $_, "\x00" ) + 1 ) } @ordered;

            $logger->trace( "Example element from ordered list: " . $ordered[0] );

            # Just intersect the ordered list with the filtered one to get the final result
            @filtered = intersect_arrays( \@filtered, \@ordered, 0 );
        } else {
            # For other sorting, we need to get the metadata for each archive and sort it manually.
            # Just use the old sort algorithm at this point.
            @filtered = sort_results( $sortkey, $sortorder, @filtered );
        }
    }

    $redis->quit();
    $redis_db->quit();
    return @filtered;
}

# Transform the search engine syntax into a list of tokens.
# A token object contains the tag, whether it must be an exact match, and whether it must be absent.
sub compute_search_filter ($filter) {

    my $logger = get_logger( "Search Core", "lanraragi" );
    my @tokens = ();
    if ( !$filter ) { $filter = ""; }

    # Special characters:
    # "" for exact search (or $, but is that one really useful now?)
    # ?/_ for any character
    # * % for multiple characters
    # - to exclude the next tag

    $b = reverse($filter);
    while ( $b ne "" ) {

        my $char  = chop $b;
        my $isneg = 0;

        # Skip spaces
        while ( $char eq " " && $b ne "" ) {
            $char = chop $b;
        }

        if ( $char eq "-" ) {
            $isneg = 1;
            $char  = chop $b;
        }

        # Get characters until the next comma, or the next " if the following char is "
        my $delimiter = ',';
        if ( $char eq '"' ) {
            $delimiter = '"';
            $char      = chop $b;
        }

        my $tag     = "";
        my $isexact = 0;
      TAGBUILD: while (1) {
            if ( $char eq $delimiter || $char eq "" ) { last TAGBUILD; }
            $tag  = $tag . $char;    # Add characters in reverse order since we used reverse earlier on
            $char = chop $b;
        }

        #If last char is $ or delimiter was ", enable isexact
        if ( $delimiter eq '"' ) {
            $isexact = 1;

            # Quotes then $ is an accepted syntax, even though it does nothing
            $char = chop $b;
            unless ( $char eq "\$" ) {
                $b = $b . $char;
            }
        } else {
            $char = chop $tag;
            if ( $char eq "\$" ) {
                $isexact = 1;
            } else {
                $tag = $tag . $char;
            }
        }

        # Escape already present regex characters
        $logger->debug("Pre-escaped tag: $tag");

        $tag = trim($tag);

        # Escape characters according to redis zscan rules
        $tag =~ s/([\[\]\^\\])/\\$1/g;

        # Replace placeholders with glob-style patterns,
        # ? or _ => ?
        $tag =~ s/\_/\?/g;

        # * or % => *
        $tag =~ s/\%/\*/g;

        if ( $tag ne "" ) {    # Blank tokens shouldn't be added as theyll slow down search
            push @tokens,
              { tag     => lc($tag),
                isneg   => $isneg,
                isexact => $isexact
              };
        }

    }
    return @tokens;
}

sub sort_results ( $sortkey, $sortorder, @filtered ) {

    my $redis = LANraragi::Model::Config->get_redis;

    my %tmpfilter = ();
    my @sorted    = ();

    # Map our archives to a hash, where the key is the ID and the value is what we want to sort by.
    # For lastreadtime, we just get the value directly.
    if ( $sortkey eq "lastread" ) {
        # For tanks, we need to handle them differently since they use zrangebyscore
        %tmpfilter = map { 
            if ($_ =~ /^TANK/) {
                # For tanks, use 0 as lastreadtime since they don't track reading
                $_ => 0;
            } else {
                # For regular archives, use hget
                $_ => $redis->hget( $_, "lastreadtime" );
            }
        } @filtered;

        # Invert sort order for lastreadtime, biggest timestamps come first
        @sorted = map { $_->[0] }                    # Map back to only having the ID
          sort { $b->[1] <=> $a->[1] }               # Sort by the timestamp
          grep { defined $_->[1] }                    # Remove nil timestamps
          map  { [ $_, $tmpfilter{$_} ] }            # Map to an array containing the ID and the timestamp
          @filtered;                                 # List of IDs
    } else {
        my $re = qr/$sortkey/;

        # For other tags, we need to handle tanks and archives differently
        %tmpfilter = map {
            if ($_ =~ /^TANK/) {
                # For tanks, get tags using zrangebyscore
                my $tank_tags = $redis->zrangebyscore( $_, $LANraragi::Utils::Database::TANK_METADATA{"tags"}, $LANraragi::Utils::Database::TANK_METADATA{"tags"}, qw{LIMIT 0 1} );
                $tank_tags =~ s/^tags_//i if $tank_tags;
                $_ => ($tank_tags =~ m/.*${re}:(.*?)(\,.*|$)/) ? $1 : "zzzz";
            } else {
                # For regular archives, use hget
                $_ => ($redis->hget( $_, "tags" ) =~ m/.*${re}:(.*?)(\,.*|$)/) ? $1 : "zzzz";
            }
        } @filtered;

        # Read comments from the bottom up for a better understanding of this sort algorithm.
        @sorted = map { $_->[0] }                  # Map back to only having the ID
          sort { ncmp( $a->[1], $b->[1] ) }        # Sort by the tag
          map  { [ $_, lc( $tmpfilter{$_} ) ] }    # Map to an array containing the ID and the lowercased tag
          @filtered;                               # List of IDs
    }

    if ($sortorder) {
        @sorted = reverse @sorted;
    }

    return @sorted;
}

1;
