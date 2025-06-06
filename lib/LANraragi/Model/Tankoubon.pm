package LANraragi::Model::Tankoubon;

use feature qw(signatures fc);
no warnings 'experimental::signatures';

use strict;
use warnings;
use utf8;

use Redis;
use Mojo::JSON qw(decode_json encode_json);
use List::Util qw(min);

use LANraragi::Utils::Database qw(redis_encode redis_decode invalidate_cache get_archive_json_multi get_tankoubons_by_file);
use LANraragi::Utils::Generic  qw(array_difference filter_hash_by_keys);
use LANraragi::Utils::Logging  qw(get_logger);
use LANraragi::Model::Archive;

use Exporter 'import';
our @EXPORT = qw(get_tankoubon_list create_tankoubon get_tankoubon delete_tankoubon update_tankoubon add_to_tankoubon remove_from_tankoubon get_tankoubons_containing_archive delete_tankoubon_and_archives);

my %TANK_METADATA = ( "name" => 0, "summary" => -1, "tags" => -2, "cover_archive" => -3, "last_updated" => -4 );

# get_tankoubon_list(page)
#   Returns a list of all the Tankoubon objects.
sub get_tankoubon_list {
    my ($page, $page_size, $sort_by, $sort_order) = @_;
    my $redis = LANraragi::Model::Config::get_redis();
    my $logger = get_logger("Tankoubon", "lanraragi");

    # Default to page 0 if not specified
    $page = 0 unless defined $page;

    # Use the provided page size or default to the configured value
    $page_size = LANraragi::Model::Config::get_pagesize() unless defined $page_size;

    # Default sort parameters
    $sort_by = 'name' unless defined $sort_by;
    $sort_order = 'asc' unless defined $sort_order;

    # Get all tankoubon IDs using pattern matching
    my @tank_ids = sort $redis->keys('TANK_??????????');
    my $total = scalar @tank_ids;

    # Get tankoubon data for all IDs
    my @tanks;
    foreach my $id (@tank_ids) {
        my ($total, $filtered, %tank) = get_tankoubon($id);
        if (%tank) {
            # Add the archive count to the data
            my $archive_count = $redis->zcount($id, 1, "+inf");
            $tank{archive_count} = $archive_count;
            
            # Get last_updated timestamp from metadata
            my @last_updated = $redis->zrangebyscore($id, $TANK_METADATA{"last_updated"}, $TANK_METADATA{"last_updated"}, qw{LIMIT 0 1});
            my $last_updated = 0;
            if (@last_updated) {
                my $last_updated_str = redis_decode($last_updated[0]);
                ($last_updated) = $last_updated_str =~ /last_updated_(\d+)/;
            }
            
            # If no last_updated metadata found, fall back to ID timestamp
            if (!$last_updated) {
                ($last_updated) = $id =~ /TANK_(\d+)/;
            }
            
            $tank{last_updated} = $last_updated || 0;
            
            push @tanks, \%tank;
        }
    }

    # Sort the tanks array based on sort parameters
    @tanks = sort {
        my ($result, $a_val, $b_val);
        
        if ($sort_by eq 'name') {
            $a_val = lc($a->{name});
            $b_val = lc($b->{name});
            $result = $a_val cmp $b_val;
        }
        elsif ($sort_by eq 'date_added') {
            # For date_added, use the ID timestamp
            my ($a_timestamp) = $a->{id} =~ /TANK_(\d+)/;
            my ($b_timestamp) = $b->{id} =~ /TANK_(\d+)/;
            $a_val = $a_timestamp || 0;
            $b_val = $b_timestamp || 0;
            $result = $a_val <=> $b_val;
        }
        elsif ($sort_by eq 'last_updated') {
            # For last_updated, use the metadata field
            $a_val = $a->{last_updated} || 0;
            $b_val = $b->{last_updated} || 0;
            $result = $a_val <=> $b_val;
        }
        elsif ($sort_by eq 'archive_count') {
            $a_val = $a->{archive_count} || 0;
            $b_val = $b->{archive_count} || 0;
            $result = $a_val <=> $b_val;
        }
        else {
            $result = 0;
        }
        
        return $sort_order eq 'desc' ? -$result : $result;
    } @tanks;

    # Calculate start and end indices for pagination
    my $start = $page * $page_size;
    my $end = $start + $page_size - 1;
    $end = $total - 1 if $end >= $total;

    # Get the paginated subset of tanks
    my @paginated_tanks = @tanks[$start..$end];
    my $filtered = scalar @paginated_tanks;

    $redis->quit();
    return ($total, $filtered, @paginated_tanks);
}

# create_tankoubon(name, existing_id)
#   Create a Tankoubon.
#   If an existing Tankoubon ID is supplied, said Tankoubon will be updated with the given parameters.
#   Returns the ID of the created/updated Tankoubon.
sub create_tankoubon ( $name, $tank_id ) {

    my $redis        = LANraragi::Model::Config->get_redis;
    my $redis_search = LANraragi::Model::Config->get_redis_search;
    my $logger       = get_logger( "Tankoubon", "lanraragi" );

    # Validate name
    unless (defined $name && $name ne "") {
        $logger->error("Cannot create tankoubon: Name is undefined or empty");
        return undef;
    }

    # Set all fields of the group object
    unless ( defined $tank_id && length($tank_id) ) {
        $tank_id = "TANK_" . time();

        my $isnewkey = 0;
        until ($isnewkey) {

            # Check if the group ID exists, move timestamp further if it does
            if ( $redis->exists($tank_id) ) {
                $tank_id = "TANK_" . ( time() + 1 );
            } else {
                $isnewkey = 1;
            }
        }
    } else {

        # Get name
        my @old_name = $redis->zrangebyscore( $tank_id, 0, 0, qw{LIMIT 0 1} );
        my $n        = redis_decode( $old_name[0] );

        if ( $redis->exists($tank_id) ) {
            $redis->zrem( $tank_id, $n );
        }
    }

    # Default values for new group
    # Score 0 will be reserved for the name of the tank
    my $tank_title = redis_encode($name);

    # Add the tank name to LRR_TITLES so it shows up in tagless searches when tank grouping is enabled.
    # Ensure proper encoding for the search index
    my $search_title = redis_encode("$tank_title\0$tank_id");
    $redis_search->zadd( "LRR_TITLES", 0, $search_title );

    # Init metadata - ensure proper encoding for all metadata fields
    $redis->zadd( $tank_id, $TANK_METADATA{"name"},    redis_encode("name_$name") );
    $redis->zadd( $tank_id, $TANK_METADATA{"summary"}, redis_encode("summary_") );
    $redis->zadd( $tank_id, $TANK_METADATA{"tags"},    redis_encode("tags_") );
    $redis->zadd( $tank_id, $TANK_METADATA{"last_updated"}, redis_encode("last_updated_" . time()) );

    $redis->quit;
    $redis_search->quit;
    invalidate_cache();

    return $tank_id;
}

# get_tankoubon(tankoubonid, fulldata, page, size)
#   Returns the Tankoubon matching the given id.
#   Returns undef if the id doesn't exist.
sub get_tankoubon ( $tank_id, $fulldata = 0, $page = 0, $size = undef ) {
    my $logger      = get_logger( "Tankoubon", "lanraragi" );
    my $redis       = LANraragi::Model::Config->get_redis;
    my $keysperpage = defined $size && $size > 0 ? $size : LANraragi::Model::Config->get_pagesize;

    $page //= 0;

    unless (defined $tank_id) {
        $logger->error("No Tankoubon ID provided (undefined)");
        return ();
    }

    if ( $tank_id eq "" ) {
        $logger->error("No Tankoubon ID provided (empty string)");
        return ();
    }

    unless ( length($tank_id) == 15 && $redis->exists($tank_id) ) {
        $logger->warn("$tank_id doesn't exist in the database or has invalid length!");
        return ();
    }

    # Declare some needed variables
    my @allowed_keys = ( 'name', 'summary', 'tags', 'archives', 'full_data', 'id', 'cover_archive' );
    my @archives;
    my $offset = ($page + 0) * ($keysperpage + 0);  # Force numeric context
    my @limit = split( ' ', "LIMIT $offset $keysperpage" );
    my %tank  = fetch_metadata_fields($tank_id);

    my %tankoubon;

    # Grab page - if size is -1 or negative, get all archives
    if ( defined $size && $size < 0 ) {
        %tankoubon = $redis->zrangebyscore( $tank_id, 1, "+inf", "WITHSCORES" );
    } else {
        %tankoubon = $redis->zrangebyscore( $tank_id, 1, "+inf", "WITHSCORES", @limit );
    }

    # Sort and add IDs to archives array based on their scores
    @archives = sort { $tankoubon{$a} <=> $tankoubon{$b} } keys %tankoubon;

    # Verify if we require fulldata files or just IDs
    if ($fulldata) {
        my @data = get_archive_json_multi(@archives);
        eval { $tank{archives}  = \@archives };
        eval { $tank{full_data} = \@data }
    } else {
        eval { $tank{archives} = \@archives };
    }

    if ($@) {
        $logger->error("Couldn't deserialize contents of Tankoubon $tank_id! $@");
    }

    # Add the key as well
    $tank{id} = $tank_id;

    %tank = filter_hash_by_keys( \@allowed_keys, %tank );

    my $total = $redis->zcount($tank_id, 1, "+inf");

    return ( $total, $#archives + 1, %tank );
}

# delete_tankoubon(tankoubonid)
#   Deletes the Tankoubon with the given ID.
#   Returns 0 if the given ID isn't a Tankoubon ID, 1 otherwise
sub delete_tankoubon ($tank_id) {

    my $logger       = get_logger( "Tankoubon", "lanraragi" );
    my $redis        = LANraragi::Model::Config->get_redis;
    my $redis_search = LANraragi::Model::Config->get_redis_search;

    if ( length($tank_id) != 15 ) {

        # Probably not a Tankoubon ID
        $logger->error("$tank_id is not a Tankoubon ID, doing nothing.");
        $redis->quit;
        return 0;
    }

    if ( $redis->exists($tank_id) ) {
        # Get all archives in the tankobon before deleting it
        my @archives = $redis->zrangebyscore( $tank_id, 1, "+inf" );

        $redis->del($tank_id);

        # The ID will remain in LRR_TITLES until the next stats compute, but this'll prevent it from appearing in search.
        $redis_search->srem( "LRR_TANKGROUPED", $tank_id );

        # Make all contained archives visible in search again
        foreach my $arc_id (@archives) {
            $redis_search->sadd( "LRR_TANKGROUPED", $arc_id );
        }

        $redis->quit;
        $redis_search->quit;
        invalidate_cache();

        return 1;
    } else {
        $logger->warn("$tank_id doesn't exist in the database!");
        $redis->quit;
        return 1;
    }
}

# update_tankoubon(name, data)
#   Updates metadata and archive list.
#   Returns 1 on success, 0 on failure alongside an error message.
sub update_tankoubon ( $tank_id, $data ) {
    my $logger = get_logger( "Tankoubon", "lanraragi" );

    unless (defined $tank_id && length($tank_id) == 15) {
        return (0, "Invalid or undefined tankoubon ID");
    }

    unless (defined $data) {
        return (0, "No update data provided");
    }

    my ( $result, $err ) = update_metadata( $tank_id, $data );
    if ($result) {
        ( $result, $err ) = update_archive_list( $tank_id, $data );
    }

    return ( $result, $err );
}

# update_metadata(tankoubonid, data)
#   Updates the metadata in the Tankoubon.
#   Returns 1 on success, 0 on failure alongside an error message.
sub update_metadata ( $tank_id, $data ) {

    if ( not defined $data->{"metadata"} and not defined $data->{"cover_archive"} ) {
        return ( 1, "" );
    }

    my $logger  = get_logger( "Tankoubon", "lanraragi" );
    my $redis   = LANraragi::Model::Config->get_redis;
    my $err     = "";
    my $name    = $data->{"metadata"}->{"name"}    || undef;
    my $summary = exists $data->{"metadata"}->{"summary"} ? $data->{"metadata"}->{"summary"} : undef;
    my $tags = exists $data->{"metadata"}->{"tags"} ? $data->{"metadata"}->{"tags"} : undef;
    my $cover_archive = $data->{"cover_archive"} || undef;

    if ( $redis->exists($tank_id) ) {
        if ( defined $name ) {
            update_metadata_field( $tank_id, "name", $name );
        }

        if ( defined $summary ) {
            update_metadata_field( $tank_id, "summary", $summary );
        }

        if ( defined $tags ) {
            update_metadata_field( $tank_id, "tags", $tags );
        }

        if ( defined $cover_archive ) {
            update_metadata_field( $tank_id, "cover_archive", $cover_archive );
        }

        # Update last_updated timestamp
        update_metadata_field( $tank_id, "last_updated", time() );

        $redis->quit;
        return ( 1, $err );
    }

    $redis->quit;

    $err = "$tank_id doesn't exist in the database!";
    $logger->warn($err);

    invalidate_cache();
    return ( 0, $err );
}

# update_archive_list(tankoubonid, arcid)
#   Updates the archives list in a Tankoubon.
#   Returns 1 on success, 0 on failure alongside an error message.
sub update_archive_list ( $tank_id, $data ) {

    if ( not defined $data->{"archives"} ) {
        return ( 1, "" );
    }

    my $logger        = get_logger( "Tankoubon", "lanraragi" );
    my $redis         = LANraragi::Model::Config->get_redis;
    my $redis_search  = LANraragi::Model::Config->get_redis_search;
    my $err           = "";
    my @tank_archives = @{ $data->{"archives"} };

    if ( $redis->exists($tank_id) ) {

        foreach my $key (@tank_archives) {
            unless ( $redis->exists($key) ) {
                $err = "$key does not exist in the database.";
                $logger->error($err);
                $redis->quit;
                return ( 0, $err );
            }
        }

        my @origs = $redis->zrangebyscore( $tank_id, 1, "+inf" );
        my @diff  = array_difference( \@tank_archives, \@origs );
        my @update;

        $redis->multi;
        $redis_search->multi;

        # Remove the ones not in the order
        if (@diff) {
            $redis->zrem( $tank_id, @diff );

            # Make removed archives visible in search again unless other tanks contain them
            foreach my $arc_id (@diff) {
                unless ( get_tankoubons_containing_archive($arc_id) ) {
                    $redis_search->sadd( "LRR_TANKGROUPED", $arc_id );
                }
            }
        }

        # Prepare zadd array
        my $len = @tank_archives;

        if ( $len == 0 ) {
            $redis_search->srem( "LRR_TANKGROUPED", $tank_id );
        } else {
            $redis_search->sadd( "LRR_TANKGROUPED", $tank_id );

            for ( my $i = 0; $i < $len; $i = $i + 1 ) {
                push @update, $i + 1;
                push @update, $tank_archives[$i];

                # Remove the ID if present, as it's been absorbed into the tank
                $redis_search->srem( "LRR_TANKGROUPED", $tank_archives[$i] );
            }

            # Update
            $redis->zadd( $tank_id, @update );
        }

        # Update last_updated timestamp
        update_metadata_field($tank_id, "last_updated", time());

        $redis->exec;
        $redis_search->exec;

        $redis->quit;
        $redis_search->quit;

        invalidate_cache();
        return ( 1, $err );
    }

    $err = "$tank_id doesn't exist in the database!";
    $logger->warn($err);
    $redis->quit;
    return ( 0, $err );
}

# add_to_tankoubon(tankoubonid, arcid)
#   Adds the given archive ID to the given Tankoubon.
#   Returns 1 on success, 0 on failure alongside an error message.
sub add_to_tankoubon ( $tank_id, $arc_id ) {

    my $logger = get_logger( "Tankoubon", "lanraragi" );
    my $redis  = LANraragi::Model::Config->get_redis;
    my $err    = "";

    if ( $redis->exists($tank_id) ) {

        unless ( $redis->exists($arc_id) ) {
            $err = "$arc_id does not exist in the database.";
            $logger->error($err);
            $redis->quit;
            return ( 0, $err );
        }

        if ( $redis->zscore( $tank_id, $arc_id ) ) {
            $err = "$arc_id already present in category $tank_id, doing nothing.";
            $logger->warn($err);
            $redis->quit;
            return ( 1, $err );
        }

        my $score = $redis->zcard($tank_id);

        # If this is the first archive being added (score == 1 because metadata fields take up scores -3 to 0)
        if ($score == 1) {
            # Copy tags from the first archive
            my $archive_tags = $redis->hget($arc_id, "tags");
            if ($archive_tags) {
                update_metadata_field($tank_id, "tags", redis_decode($archive_tags));
            }
        }

        $redis->zadd( $tank_id, $score, $arc_id );

        # Update last_updated timestamp
        update_metadata_field($tank_id, "last_updated", time());

        $redis->quit;

        # Adding an archive to the tank will always hide it from main search, and show the tank instead
        $redis = LANraragi::Model::Config->get_redis_search;
        $redis->srem( "LRR_TANKGROUPED", $arc_id );
        $redis->sadd( "LRR_TANKGROUPED", $tank_id );    # Set elements are unique so no problem if the tank is already added here
        $redis->quit;

        invalidate_cache();
        return ( 1, $err );
    }

    $err = "$tank_id doesn't exist in the database!";
    $logger->warn($err);
    $redis->quit;
    return ( 0, $err );
}

# remove_from_tankoubon(tankoubonid, arcid)
#   Removes the given archive ID from the given Tankoubon.
#   Returns 1 on success, 0 on failure alongside an error message.
sub remove_from_tankoubon ( $tank_id, $arcid ) {

    my $logger = get_logger( "Tankoubon", "lanraragi" );
    my $redis  = LANraragi::Model::Config->get_redis;
    my $err    = "";

    if ( $redis->exists($tank_id) ) {

        unless ( $redis->exists($arcid) ) {
            $err = "$arcid does not exist in the database.";
            $logger->error($err);
            $redis->quit;
            return ( 0, $err );
        }

        # Get the score for reference
        my $score = $redis->zscore( $tank_id, $arcid );

        unless ($score) {
            $err = "$arcid not present in category $tank_id, doing nothing.";
            $logger->warn($err);
            $redis->quit;
            return ( 1, $err );
        }

        $redis->zrem( $tank_id, $arcid );

        # Update last_updated timestamp
        update_metadata_field($tank_id, "last_updated", time());

        $redis->quit;

        # Make archive visible in search again unless other tanks contain it
        $redis = LANraragi::Model::Config->get_redis_search;
        unless ( get_tankoubons_containing_archive($arcid) ) {
            $redis->sadd( "LRR_TANKGROUPED", $arcid );
        }
        $redis->quit;

        invalidate_cache();
        return ( 1, $err );
    }

    $err = "$tank_id doesn't exist in the database!";
    $logger->warn($err);
    $redis->quit;
    return ( 0, $err );
}

# get_tankoubons_containing_archive(arcid)
#   Gets a list of Tankoubons where archive ID is contained.
#   Returns an array of tank IDs.
sub get_tankoubons_containing_archive ($arcid) {

    my $redis = LANraragi::Model::Config->get_redis;
    my @tankoubons;

    my $logger = get_logger( "Tankoubon", "lanraragi" );
    my $err    = "";

    unless ( $redis->exists($arcid) ) {
        $err = "$arcid does not exist in the database.";
        $logger->error($err);
        $redis->quit;
        return ();
    }

    my @tanks = $redis->keys('TANK_??????????');

    foreach my $key ( sort @tanks ) {

        if ( $redis->zscore( $key, $arcid ) ) {
            push( @tankoubons, $key );
        }
    }

    $redis->quit;
    return @tankoubons;
}

sub update_metadata_field ( $tank_id, $field, $value ) {
    my $redis = LANraragi::Model::Config->get_redis;

    $redis->zremrangebyscore( $tank_id, $TANK_METADATA{$field}, $TANK_METADATA{$field} );
    $redis->zadd( $tank_id, $TANK_METADATA{$field}, redis_encode("${field}_${value}") );

    return 1;
}

sub fetch_metadata_fields ($tank_id) {
    my $redis = LANraragi::Model::Config->get_redis;

    # Fetch from DB
    my @keys       = sort { $TANK_METADATA{$a} <=> $TANK_METADATA{$b} } keys(%TANK_METADATA);
    my @raw_values = $redis->zrangebyscore( $tank_id, $TANK_METADATA{ $keys[0] }, 0 );

    # Clean the data
    my %metadata;
    foreach my $raw_value (@raw_values) {
        foreach my $key (@keys) {
            if ( $raw_value =~ /^$key\_/ ) {
                my $clean_value = redis_decode($raw_value) || "";
                $clean_value =~ s/^$key\_//;
                $metadata{$key} = $clean_value;
                last;    # Exit the loop once the key is matched
            }
        }
    }

    return %metadata;
}

# Delete a tankoubon and all its archives
sub delete_tankoubon_and_archives {
    my $tankid = shift;

    # Get the tankoubon first to get the list of archives
    my %tankoubon = get_tankoubon($tankid);
    return 0 unless %tankoubon;

    # Delete all archives in the tankoubon
    foreach my $arcid (@{$tankoubon{archives}}) {
        LANraragi::Model::Archive::delete_archive($arcid);
    }

    # Delete the tankoubon itself
    return delete_tankoubon($tankid);
}

1;
