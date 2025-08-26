package LANraragi::Plugin::Scripts::AutoTankoubon;

use strict;
use warnings;
use utf8;

use LANraragi::Utils::Logging  qw(get_logger);
use LANraragi::Utils::Database qw(get_archive_json_multi);
use LANraragi::Utils::Redis    qw(redis_decode);
use LANraragi::Model::Archive;
use LANraragi::Model::Tankoubon;
use LANraragi::Model::Search;
use Sort::Naturally;

# Meta-information about your plugin.
sub plugin_info {
    return (
        # Standard metadata
        name      => "Auto-Create Tankoubons",
        type      => "script",
        namespace => "autotankoubon",
        author    => "GitHub Copilot",
        version   => "1.0",
        icon      => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4wYCFQY4HfiAJAAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAADKUlEQVQ4y6WVsUtrVxzHP+fmkkiqJr2CQWKkvCTwJgkJDpmyVAR1cVOhdq04tHNB7BD8A97SXYkO3dRRsMSlFoIOLYFEohiDiiTNNeaGpLn5dRDv06ev75V+4SyH8/2c3/n+zuEoEeFTqtfrb5RS9d9cizOPH8z/f3+bHY7H0kuUrV6hCtmHxt7UnOXHiDInEJAAzM49kscMtw2xesWHfKOTGASNa+GnmHfYP7gSgr28TY2PnF4UBWAD88Tlk7kFVyuDbX0ew43vzU/6bnc+12vnqx4OrX//i4gIQXS2uJkZGvqRXD3Q/V9LKXdjmSxcmjq7ahi6vtRazMKAHGua8oolbsHDyFk7iF4r/3IOyGl9QKI1u+vo2kUhMsmZ3T8Pa5c+E5vYYzbFWWkQTW23R+XKc+9/+eKUB+MbBHZWqhpW9MGSjtdDes57OzRtZ2hFD4tshcEAVkHIeVIapse8wDPNQxbKBDuDhxHKODd5myZ44698dBTQgUbEkex0CFzJXIfDC58CDwCP3Z1ZtPpAaD4FWnJIv2Nkm+j85AroE/jRoHwI/SgoBbt27h+54DS3je0VEh7VtimOnm2mKxRcguhpUDXvGUDb9bd3fh14rCtNPWuh9/6s6RfWq6mEetG0le/cb5KPbpajKActwChaIVNR5ddAqeLkCmt9TLjCbzEVFtQDstENTW0c4M58cJbiNsPmxtBs7eQ03p87VANP3J+n94CjiPKj76N4z7M4f6IPKk35YAFMORUCzpRU3/VdoV82BytUm+jMQlEArlBJmEyncORdnroTypxCRt7YMp5IRUBVzv/cPnV0n+VshyH8MgYuycyjHJjPt4GbyONki5VIAItfQnBeTG62YD1458DTF8EJXscSw1lEu4s0m8TJ/k/o5iZuZIygHlb+ZHwzkUoC+2T+cuiNSd08/re1qMjFa25YM5D0xjVtGe8fUhg9/zfMf41+ZdKPYI8TqHgAAAABJRU5ErkJggg==",
        description =>
          "Automatically creates tankoubons by grouping archives with similar characteristics.<br>This Script analyzes your archive collection and creates tankoubons based on series names, artists, or custom grouping patterns.<br><br>The plugin will:<br>• Extract series information from archive titles and tags<br>• Group related archives together<br>• Create tankoubons with appropriate names<br>• Skip archives already in existing tankoubons (optional)",
        parameters => [
            {
                type => "bool",
                desc => "Group by series tags (looks for 'series:' namespace tags to group archives)"
            },
            {
                type => "bool", 
                desc => "Group by artist tags (looks for 'artist:' or 'circle:' namespace tags to group archives)"
            },
            {
                type => "bool",
                desc => "Group by title patterns (analyzes archive titles for common series patterns)"
            },
            {
                type => "int",
                desc => "Minimum archives per tankoubon (groups with fewer archives will be ignored, default: 2)"
            },
            {
                type => "bool",
                desc => "Skip archives already in tankoubons (if enabled, won't add archives that are already in existing tankoubons)"
            },
            {
                type => "bool",
                desc => "Dry run mode (shows what tankoubons would be created without actually creating them)"
            },
            {
                type => "bool",
                desc => "Remove all existing tankoubons before creating new ones (WARNING: This will delete all existing tankoubons!)"
            }
        ]
    );
}

# Mandatory function to be implemented by your script
sub run_script {
    shift;
    my $lrr_info = shift;
    my ( $group_by_series, $group_by_artist, $group_by_title, $min_archives, $skip_existing, $dry_run, $remove_all_existing ) = @_;
    
    # Set defaults
    $min_archives ||= 2;
    $min_archives = int($min_archives) if $min_archives;
    $min_archives = 2 if $min_archives < 1;
    
    my $logger = get_logger("AutoTankoubon", "plugins");
    my $created_count = 0;
    my $skipped_count = 0;
    
    $logger->info("Starting auto-tankoubon creation process...");
    $logger->info("Parameters: series=$group_by_series, artist=$group_by_artist, title=$group_by_title, min=$min_archives, skip_existing=$skip_existing, dry_run=$dry_run, remove_all=$remove_all_existing");
    
    # Remove all existing tankoubons if requested
    if ($remove_all_existing) {
        if ($dry_run) {
            $logger->info("DRY RUN: Would remove all existing tankoubons");
        } else {
            $logger->info("Removing all existing tankoubons...");
            my ($total, $filtered, @tankoubon_list) = LANraragi::Model::Tankoubon::get_tankoubon_list(-1, 0, 'name', 'asc');  # Get all tankoubons
            my $removed_count = 0;
            for my $tank (@tankoubon_list) {
                if (LANraragi::Model::Tankoubon::delete_tankoubon($tank->{id})) {
                    $removed_count++;
                } else {
                    $logger->warn("Failed to delete tankoubon: " . $tank->{name});
                }
            }
            $logger->info("Removed $removed_count existing tankoubons");
        }
    }
    
    # Get all archives
    my @archive_list = LANraragi::Model::Archive::generate_archive_list();
    $logger->info("Found " . scalar(@archive_list) . " total archives in database");
    
    if (scalar(@archive_list) == 0) {
        $logger->warn("No archives found in database!");
        return "No archives found in database.";
    }
    
    # Get existing tankoubons if skip_existing is enabled
    my %existing_tankoubon_archives;
    if ($skip_existing) {
        my ($total, $filtered, @tankoubon_list) = LANraragi::Model::Tankoubon::get_tankoubon_list(0, 0, 'name', 'asc');
        for my $tank (@tankoubon_list) {
            my %tank_data = LANraragi::Model::Tankoubon::get_tankoubon($tank->{id});
            if (%tank_data && $tank_data{archives}) {
                for my $arc_id (@{$tank_data{archives}}) {
                    $existing_tankoubon_archives{$arc_id} = 1;
                }
            }
        }
        $logger->info("Found " . scalar(keys %existing_tankoubon_archives) . " archives already in existing tankoubons");
    }
    
    my %groups;
    
    # Process each archive to determine grouping
    for my $archive (@archive_list) {
        my $arc_id = $archive->{arcid};
        my $title = $archive->{title};
        my $tags = $archive->{tags};
        
        # Skip if already in a tankoubon and skip_existing is enabled
        if ($skip_existing && $existing_tankoubon_archives{$arc_id}) {
            $skipped_count++;
            next;
        }
        
        $logger->debug("Processing archive: $title ($arc_id)");
        
        my @potential_groups;
        
        # Group by series tags
        if ($group_by_series) {
            my @series_tags = extract_namespace_tags($tags, 'series');
            for my $series (@series_tags) {
                push @potential_groups, "series:$series";
            }
        }
        
        # Group by artist/circle tags
        if ($group_by_artist) {
            my @artist_tags = extract_namespace_tags($tags, 'artist');
            my @circle_tags = extract_namespace_tags($tags, 'circle');
            for my $artist (@artist_tags) {
                push @potential_groups, "artist:$artist";
            }
            for my $circle (@circle_tags) {
                push @potential_groups, "circle:$circle";
            }
        }
        
        # Group by title patterns
        if ($group_by_title) {
            my ($title_group, $index) = extract_title_series_with_index($title);
            if ($title_group) {
                push @{$groups{"title:$title_group"}}, {
                    id => $arc_id,
                    title => $title,
                    tags => $tags,
                    index => $index // 0  # Store index for potential sorting
                };
                next; # Skip adding to potential_groups to avoid duplication
            }
        }
        
        # Add archive to all potential groups (for non-title groups)
        for my $group (@potential_groups) {
            push @{$groups{$group}}, {
                id => $arc_id,
                title => $title,
                tags => $tags
            };
        }
    }
    
    $logger->info("Found " . scalar(keys %groups) . " potential groups");
    if ($skipped_count > 0) {
        $logger->info("Skipped $skipped_count archives already in tankoubons");
    }
    
    # Create tankoubons for groups that meet minimum size requirement
    my @creation_log;
    
    for my $group_key (sort keys %groups) {
        my @group_archives = @{$groups{$group_key}};
        
        if (scalar(@group_archives) < $min_archives) {
            $logger->debug("Skipping group '$group_key' - only " . scalar(@group_archives) . " archives (minimum: $min_archives)");
            next;
        }
        
        # Generate tankoubon name from group key
        my $tankoubon_name = generate_tankoubon_name($group_key);
        
        # Sort archives by natural order of titles
        # This ensures proper ordering like "Chapter 2" before "Chapter 10"
        @group_archives = sort {
            # First try to sort by index if both have indices (for title-based groups)
            if ($group_key =~ /^title:/ && defined $a->{index} && defined $b->{index}) {
                my $index_cmp = $a->{index} <=> $b->{index};
                return $index_cmp if $index_cmp != 0;
            }
            # Fall back to natural sorting of full titles
            return ncmp($a->{title}, $b->{title});
        } @group_archives;
        
        $logger->info("Creating tankoubon '$tankoubon_name' with " . scalar(@group_archives) . " archives");
        
        my $log_entry = "Tankoubon: '$tankoubon_name' (" . scalar(@group_archives) . " archives)";
        for my $archive (@group_archives) {
            $log_entry .= "\n  - " . $archive->{title};
        }
        push @creation_log, $log_entry;
        
        if (!$dry_run) {
            # Create the tankoubon
            my $tank_id = LANraragi::Model::Tankoubon::create_tankoubon($tankoubon_name, "");
            
            if ($tank_id) {
                # Add archives to the tankoubon
                my $success_count = 0;
                for my $archive (@group_archives) {
                    my ($result, $err) = LANraragi::Model::Tankoubon::add_to_tankoubon($tank_id, $archive->{id});
                    if ($result) {
                        $success_count++;
                    } else {
                        $logger->error("Failed to add archive '" . $archive->{title} . "' to tankoubon: $err");
                    }
                }
                
                if ($success_count > 0) {
                    $created_count++;
                    $logger->info("Successfully created tankoubon '$tankoubon_name' with $success_count archives");
                } else {
                    $logger->error("Failed to add any archives to tankoubon '$tankoubon_name'");
                    # Delete the empty tankoubon
                    LANraragi::Model::Tankoubon::delete_tankoubon($tank_id);
                }
            } else {
                $logger->error("Failed to create tankoubon '$tankoubon_name'");
            }
        }
    }
    
    # Generate result message
    my $result_message;
    if ($dry_run) {
        $result_message = "DRY RUN - Would create " . scalar(grep { scalar(@{$groups{$_}}) >= $min_archives } keys %groups) . " tankoubons:\n\n";
    } else {
        $result_message = "Successfully created $created_count tankoubons:\n\n";
    }
    
    $result_message .= join("\n\n", @creation_log);
    
    if ($skipped_count > 0) {
        $result_message .= "\n\nSkipped $skipped_count archives already in existing tankoubons.";
    }
    
    $logger->info("Auto-tankoubon creation process completed. Created: $created_count tankoubons");
    
    return $result_message;
}

# Extract tags from a specific namespace
sub extract_namespace_tags {
    my ($tags_string, $namespace) = @_;
    return () unless $tags_string;
    
    my @tags = split(/,/, $tags_string);
    my @namespace_tags;
    
    for my $tag (@tags) {
        $tag =~ s/^\s+|\s+$//g; # trim whitespace
        if ($tag =~ /^\Q$namespace\E:(.+)$/i) {
            push @namespace_tags, $1;
        }
    }
    
    return @namespace_tags;
}

# Extract series name and index from title using pattern %1%2 %3 format
sub extract_title_series_with_index {
    my ($title) = @_;
    return ("", undef) unless $title;
    
    # Remove content in parentheses at the beginning (often event/circle info)
    my $clean_title = $title;
    $clean_title =~ s/^\([^)]+\)\s*//;
    
    # Remove content in square brackets at the beginning (often artist info)  
    $clean_title =~ s/^\[[^\]]+\]\s*//;
    
    # Pattern matching for %1%2 %3 format
    # %1 = tankoubon title (cannot be empty)
    # %2 = index (starts with number or space)
    # %3 = remaining part (can be empty)
    
    my $tankoubon_title = "";
    my $index = undef;
    
    # Look for patterns where we have a title followed by a number/space-number
    # Priority order: more specific patterns first
    
    # Pattern 1: "第X話" format (Japanese chapter format) - space optional
    if ($clean_title =~ /^(.+?)\s*第(\d+)話(?:\s|$)(.*)$/) {
        $tankoubon_title = $1;
        $index = int($2);
    }
    # Pattern 2: "第X章/巻/集/期/部/編/篇" format - space optional
    elsif ($clean_title =~ /^(.+?)\s*第(\d+)(?:章|巻|集|期|部|編|篇)(?:\s|$)(.*)$/) {
        $tankoubon_title = $1;
        $index = int($2);
    }
    # Pattern 3: "Vol/Chapter/Part X" format
    elsif ($clean_title =~ /^(.+?)\s+(?:Vol\.?\s*|Chapter\s*|Part\s*)(\d+)(?:\s|$)(.*)$/i) {
        $tankoubon_title = $1;
        $index = int($2);
    }
    # Pattern 4: "#X" format
    elsif ($clean_title =~ /^(.+?)\s+#(\d+)(?:\s|$)(.*)$/) {
        $tankoubon_title = $1;
        $index = int($2);
    }
    # Pattern 5: Number with suffix (話|号|章|巻|集|期|部|編|篇)
    elsif ($clean_title =~ /^(.+?)\s+(\d+)(?:話|号|章|巻|集|期|部|編|篇)(?:\s|$)(.*)$/) {
        $tankoubon_title = $1;
        $index = int($2);
    }
    # Pattern 6: Simple number at the end (1-3 digits, not years like 2019)
    elsif ($clean_title =~ /^(.+?)\s+(\d{1,3})(?:\s|$)(.*)$/ && int($2) <= 999) {
        $tankoubon_title = $1;
        $index = int($2);
    }
    
    if ($tankoubon_title) {
        # Clean up the tankoubon title
        $tankoubon_title =~ s/^\s+|\s+$//g;
        $tankoubon_title =~ s/\s+/ /g;
        
        # Extract only the first word for tankoubon name (no spaces allowed)
        if ($tankoubon_title =~ /^(\S+)/) {
            $tankoubon_title = $1;
        }
        
        # Tankoubon title cannot be empty and should be at least 2 characters
        if (length($tankoubon_title) >= 2) {
            return ($tankoubon_title, $index);
        }
    }
    
    # If no pattern matched, try the old logic for fallback
    my $fallback_title = extract_title_series($clean_title);
    return ($fallback_title, undef) if $fallback_title;
    
    return ("", undef);
}

# Extract series name from title using pattern %1%2 %3 format
sub extract_title_series {
    my ($title) = @_;
    return "" unless $title;
    
    # Remove content in parentheses at the beginning (often event/circle info)
    my $clean_title = $title;
    $clean_title =~ s/^\([^)]+\)\s*//;
    
    # Remove content in square brackets at the beginning (often artist info)  
    $clean_title =~ s/^\[[^\]]+\]\s*//;
    
    # Pattern matching for %1%2 %3 format
    # %1 = tankoubon title (cannot be empty)
    # %2 = index (starts with number or space)
    # %3 = remaining part (can be empty)
    
    # Look for patterns where we have a title followed by a number/space-number
    # Match various number formats: "1", " 1", "01", " 01", "第1話", "1話", etc.
    if ($clean_title =~ /^(.+?)\s*(\d+(?:話|号|章|巻|集|期|部|編|篇)?(?:\s|$))(.*)$/
        || $clean_title =~ /^(.+?)\s*(第\s*\d+(?:話|号|章|巻|集|期|部|編|篇)?(?:\s|$))(.*)$/
        || $clean_title =~ /^(.+?)\s*(Vol\.?\s*\d+(?:\s|$))(.*)$/i
        || $clean_title =~ /^(.+?)\s*(Chapter\s*\d+(?:\s|$))(.*)$/i
        || $clean_title =~ /^(.+?)\s*(Part\s*\d+(?:\s|$))(.*)$/i
        || $clean_title =~ /^(.+?)\s*(#\s*\d+(?:\s|$))(.*)$/) {
        
        my $tankoubon_title = $1;
        my $index_part = $2;
        my $remaining_part = $3;
        
        # Clean up the tankoubon title
        $tankoubon_title =~ s/^\s+|\s+$//g;
        $tankoubon_title =~ s/\s+/ /g;
        
        # Extract only the first word for tankoubon name (no spaces allowed)
        if ($tankoubon_title =~ /^(\S+)/) {
            $tankoubon_title = $1;
        }
        
        # Tankoubon title cannot be empty and should be at least 2 characters
        if (length($tankoubon_title) >= 2) {
            return $tankoubon_title;
        }
    }
    
    # Fallback: try to extract series name by removing trailing numbers and common patterns
    $clean_title =~ s/\s+(vol|volume|ch|chapter|part|#|第|話|号|章|巻|集|期|部|編|篇)\s*\d+.*$//i;
    $clean_title =~ s/\s+\d+\s*$//;
    $clean_title =~ s/\s*[-–—]\s*.*$//;
    
    # Clean up whitespace
    $clean_title =~ s/^\s+|\s+$//g;
    $clean_title =~ s/\s+/ /g;
    
    # Extract only the first word for tankoubon name (no spaces allowed)
    if ($clean_title =~ /^(\S+)/) {
        $clean_title = $1;
    }
    
    # Only return if we have a meaningful series name (at least 2 characters)
    return (length($clean_title) >= 2) ? $clean_title : "";
}

# Generate a user-friendly tankoubon name from group key
sub generate_tankoubon_name {
    my ($group_key) = @_;
    
    if ($group_key =~ /^series:(.+)$/) {
        return $1;
    } elsif ($group_key =~ /^artist:(.+)$/) {
        return "Works by $1";
    } elsif ($group_key =~ /^circle:(.+)$/) {
        return "Works by $1 (Circle)";
    } elsif ($group_key =~ /^title:(.+)$/) {
        return $1 . " Series";
    }
    
    return $group_key;
}

1;
