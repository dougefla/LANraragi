package LANraragi::Plugin::Scripts::AutoTankoubon;

use strict;
use warnings;
use utf8;

use Redis;
use File::Basename;
use Mojo::JSON qw(decode_json encode_json);

use LANraragi::Utils::Logging qw(get_plugin_logger);
use LANraragi::Utils::Database qw(redis_decode redis_encode get_archive_json_multi);
use LANraragi::Model::Tankoubon;
use LANraragi::Model::Config;

# Meta-information about your plugin.
sub plugin_info {
    return (
        # Standard metadata
        name        => "Auto Tankoubon Creator",
        type        => "script",
        namespace   => "autotankoubon",
        author      => "ChatGPT",
        version     => "1.1",
        description => "Automatically creates tankoubons by analyzing archive titles and metadata to detect series. " .
                      "Supports titles in English, Japanese, and Chinese. " .
                      "Archives that appear to belong to the same series will be grouped into a tankoubon.",
        icon        =>
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAUCAYAAACNiR0NAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4wYCFQocjU4r+QAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVBkLmUHAAAEZElEQVQ4y42T3WtTdxzGn/M7J+fk5SRpTk7TxMZkXU84tTbVNrUT3YxO7HA4pdtQZDe7cgx2s8vBRvEPsOwFYTDYGJUpbDI2wV04cGXCGFLonIu1L2ptmtrmxeb1JDkvv121ZKVze66f74eH7/f5MmjRwMCAwrt4/9KDpflMJpPHvyiR2DPcJklJ3TRDDa0xk36cvrm8vDwHAAwAqKrqjjwXecPG205wHBuqa9rk77/d/qJYLD7cCht5deQIIczbgiAEKLVAKXWUiqVV06Tf35q8dYVJJBJem2A7Kwi2nQzDZig1CG93+PO5/KN6tf5NKpVqbsBUVVVFUUxwHJc1TXNBoxojS7IbhrnLMMx9pVJlBqFQKBKPxwcBkJYgjKIo3QCE1nSKoghbfJuKRqN2RVXexMaQzWaLezyeEUEQDjscjk78PxFFUYRkMsltJgGA3t7eyMLCwie6rr8iCILVbDbvMgwzYRjGxe0o4XC4s1AoHPP5fMP5/NNOyzLKAO6Ew+HrDADBbre/Ryk9nzx81FXJNlEpVpF+OqtpWu2MpmnXWmH9/f2umZmZi4cOHXnLbILLzOchhz1YerJAs9m1GwRAg2GYh7GYah488BJYzYW+2BD61AFBlmX/1nSNRqN9//792ujoaIPVRMjOKHoie3DytVGmp2fXCAEAjuMmu7u7Umosho6gjL/u/QHeEgvJZHJ2K/D+/fuL4+PjXyvPd5ldkShy1UXcmb4DnjgQj/fd5gDA6/XSYCAwTwh9oT3QzrS1+VDVi+vd3Tsy26yQVoFF3dAXJVmK96p9EJ0iLNOwKKU3CQCk0+lSOpP5WLDzF9Q9kZqyO0SloOs6gMfbHSU5NLRiUOuax2/HyZPHEOsLw2SbP83eu/fLxrkNp9P554XxCzVa16MC7+BPnTk9cfmH74KJE8nmga7Xy5JkZ8VKifGIHpoBb1VX8hNTd3/t/7lQ3OeXfFPvf/jBRw8ezD/a7M/aWq91cGgnJaZ2VcgSdnV1XRNNd3vAoBVVYusmnEQS65hfgSG6c+zy3Kre7nF/KrukcMW0Zg8OD08DoJutDxxOEb5IPUymwrq8ft1gLKfkFojkkRxemERCAQUACPFWRazYLJcrFGwQhyufbQQ7rFpyLMkCwGZC34qPIuwp+XPOjBFwazQ/txrdFS2GGS/Xuj+pUKLGk1Kjvlded3s72lyGW+PLbGVcmrAAgN0wTk1NWYODg9XOKltGtpazi5GigzroUnHN5nUHG1ylRsG7rDXHmnEpu4CeEtEKkqNc6QqlLc/M8uT5lLH5eq0aGxsju1O7GQB498a5s/0x9dRALPaQEDZnYwnhWJtMCCNrjeb0UP34Z6e/PW22zjPP+vwXBwfPvbw38XnXjk7GsiwKAIQQhjAMMrlsam45d+zLH6/8o6vkWcBcrXbVKQhf6bpucCwLjmUBSmmhXC419eblrbD/TAgAkUjE987xE0c7ZDmk66ajUCnq+cL63fErl25s5/8baQPaWLhx6goAAAAASUVORK5CYII=",
        parameters  => [
            { type => "bool", desc => "Delete all existing tankoubons before creating new ones" },
            { type => "bool", desc => "Use only title matching (ignore metadata)" },
            { type => "bool", desc => "Merge tankoubons with similar names" }
        ]
    );
}

# Helper function to detect the primary language of a title
sub detect_language {
    my ($text) = @_;
    
    # Count characters in different ranges
    my $jp = 0;  # Hiragana and Katakana
    my $cn = 0;  # Chinese characters (also used in Japanese)
    my $en = 0;  # Basic Latin alphabet
    
    while ($text =~ /(.)/g) {
        my $char = $1;
        my $ord = ord($char);
        
        if ($char =~ /[\p{Hiragana}\p{Katakana}]/) {
            $jp++;
        }
        elsif ($char =~ /\p{Han}/) {  # Chinese characters (also used in Japanese)
            $cn++;
        }
        elsif ($char =~ /[a-zA-Z]/) {
            $en++;
        }
    }
    
    # Determine primary language
    if ($jp > 0) {
        return 'jp';  # If there's any Japanese-specific characters, it's likely Japanese
    }
    elsif ($cn > $en) {
        return 'cn';  # If there's more Chinese characters than English, it's likely Chinese
    }
    else {
        return 'en';  # Default to English
    }
}

# Helper function for natural sorting
sub natural_sort_key {
    my ($str) = @_;
    return "" unless defined $str;
    
    # Split string into chunks of numbers and non-numbers
    my @chunks = split /(\d+)/, $str;
    
    # Pad numbers with zeros for proper sorting
    for my $chunk (@chunks) {
        if ($chunk =~ /^\d+$/) {
            $chunk = sprintf("%09d", $chunk);
        }
    }
    
    return join "", @chunks;
}

# Helper function to extract series name from a title
sub extract_series_name {
    my ($title) = @_;
    return "" unless defined $title;
    
    my $logger = get_plugin_logger();
    $logger->debug("Extracting series name from title: $title");
    
    # Detect the primary language
    my $lang = detect_language($title);
    
    # Return empty string if title is just a number or mostly numbers
    if ($title =~ /^\s*\d+\s*$/ || $title =~ /^\s*[0-9０-９一二三四五六七八九十]+\s*$/) {
        $logger->debug("Title appears to be just a number, skipping: $title");
        return "";
    }
    
    # For titles starting with numbers, ensure there are at least 2 meaningful characters after
    if ($title =~ /^\s*(?:[0-9０-９一二三四五六七八九十]+)/) {
        # Check if there are at least 2 non-number, non-symbol characters after the numbers
        unless ($title =~ /^\s*(?:[0-9０-９一二三四五六七八九十]+)(?:[^\w\s]|\s)*([^\d\s\p{P}]{2,})/) {
            $logger->debug("Title starts with numbers but doesn't have enough meaningful characters after: $title");
            return "";
        }
        $logger->debug("Title starts with numbers but has enough meaningful characters after");
    }
    
    if ($lang eq 'jp' || $lang eq 'cn') {
        # For Japanese/Chinese titles:
        
        # First try to match content between 『』 brackets
        if ($title =~ /『([^』]+)』/) {
            my $base_name = $1;
            
            # Get any subtitle that follows (before any chapter numbers)
            my $subtitle = "";
            if ($title =~ /』([^第\d]+)/) {
                $subtitle = $1;
                $subtitle =~ s/^\s+|\s+$//g; # Trim whitespace
            }
            
            # Return the full series name with brackets and subtitle
            my $series_name = "『${base_name}』" . ($subtitle ? " ${subtitle}" : "");
            $logger->debug("Extracted series name (with brackets): $series_name");
            return $series_name;
        }
        
        # If no 『』, try to match the base series name
        # First try to match series name before number + 「」quotes pattern
        if ($title =~ /^(.+?)[0-9０-９一二三四五六七八九十]+「/) {
            my $base_name = $1;
            $base_name =~ s/\s+$//; # Remove trailing whitespace
            
            # Skip if base_name is just a number
            if ($base_name =~ /^\s*[0-9０-９一二三四五六七八九十]+\s*$/) {
                $logger->debug("Base name is just a number, skipping: $base_name");
                return "";
            }
            
            $logger->debug("Extracted base series name (before number and quotes): $base_name");
            return $base_name;
        }
        
        # Then try to match by removing trailing numbers for Chinese titles
        if ($title =~ /^(.+?)[0-9０-９一二三四五六七八九十]+$/) {
            my $base_name = $1;
            $base_name =~ s/\s+$//; # Remove trailing whitespace
            
            # Skip if base_name is just a number
            if ($base_name =~ /^\s*[0-9０-９一二三四五六七八九十]+\s*$/) {
                $logger->debug("Base name is just a number, skipping: $base_name");
                return "";
            }
            
            $logger->debug("Extracted base series name (with trailing number): $base_name");
            return $base_name;
        }
        
        # If no trailing number, match everything up to the first space or Japanese/Chinese punctuation
        if ($title =~ /^(.+?)(?:[　\s]|\p{P}|[、。！？]|$)/) {
            my $base_name = $1;
            $base_name =~ s/\s+$//; # Remove trailing whitespace
            
            # Skip if base_name is just a number
            if ($base_name =~ /^\s*[0-9０-９一二三四五六七八九十]+\s*$/) {
                $logger->debug("Base name is just a number, skipping: $base_name");
                return "";
            }
            
            $logger->debug("Extracted base series name: $base_name");
            return $base_name;
        }
        
        # Remove volume/chapter indicators but preserve numbers that are part of the title
        $title =~ s/\s*第\s*\d+\s*[巻話].*$//g;
        $title =~ s/\s*(?:Vol\.?\s*\d+|Ch\.?\s*\d+|\(\d+\)|\[\d+\])\s*$//gi;
        
        # Remove common suffixes
        $title =~ s/(?:完|総集編|アンソロジー)$//g;  # Japanese
        $title =~ s/(?:完|全|选集|合集)$//g;         # Chinese
        
    } else {
        # For English titles:
        
        # First try to match the base series name
        if ($title =~ /^(.+?)(?:\s+(?:vol\.?|chapter|ch\.?|part)?\s*[0-9]+|\s*[0-9]+(?:st|nd|rd|th)|\s*\([0-9]+\)|\s*$)/i) {
            my $base_name = $1;
            $base_name =~ s/\s+$//; # Remove trailing whitespace
            
            # Skip if base_name is just a number
            if ($base_name =~ /^\s*\d+\s*$/) {
                $logger->debug("Base name is just a number, skipping: $base_name");
                return "";
            }
            
            $logger->debug("Extracted base series name: $base_name");
            return $base_name;
        }
        
        # If that didn't work, use the old method
        $title =~ s/\s*(?:Vol(?:ume)?\.?\s*\d+|Ch(?:apter)?\.?\s*\d+|\(\d+\)|\[\d+\]|\d+(?:st|nd|rd|th)?)\s*$//gi;
        $title =~ s/\[(.*?)\]|\((.*?)\)//g;
        $title =~ s/(?:Complete|Anthology|Collection)$//gi;
    }
    
    # Clean up extra whitespace for all languages
    $title =~ s/^\s+|\s+$//g;
    $title =~ s/\s+/ /g;
    
    # Final check - don't return if just a number
    if ($title =~ /^\s*[0-9０-９一二三四五六七八九十]+\s*$/) {
        $logger->debug("Final title is just a number, skipping: $title");
        return "";
    }
    
    $logger->debug("Final extracted series name: $title");
    return $title;
}

# Helper function to extract volume/chapter number from a title
sub extract_number {
    my ($title) = @_;
    return 0 unless defined $title;
    
    my $lang = detect_language($title);
    my $number = 0;
    
    if ($lang eq 'jp' || $lang eq 'cn') {
        # Try various Japanese/Chinese number patterns
        if ($title =~ /第([0-9０-９一二三四五六七八九十]+)[巻話]/ ||  # 第X巻/話
            $title =~ /([0-9０-９一二三四五六七八九十]+)$/ ||         # Ends with number
            $title =~ /([0-9０-９一二三四五六七八九十]+)\s*[（\(]/ || # Number before parenthesis
            $title =~ /([0-9０-９一二三四五六七八九十]+)(?:\s|$)/) {  # Number followed by space or end
            
            my $num = $1;
            # Convert Japanese numerals to Arabic numerals if needed
            if ($num =~ /[一二三四五六七八九十]/) {
                $num =~ tr/一二三四五六七八九十/1234567890/;
            }
            # Convert full-width numbers to half-width
            $num =~ tr/０-９/0-9/;
            $number = $num;
        }
    } else {
        # For English titles, try common patterns
        if ($title =~ /(?:vol(?:ume)?\.?\s*(\d+)|ch(?:apter)?\.?\s*(\d+)|\((\d+)\)|\s(\d+)(?:st|nd|rd|th)?(?:\s|$))/i) {
            $number = $1 || $2 || $3 || $4;
        }
    }
    
    return $number || 0;  # Return 0 if no number found
}

# Mandatory function to be implemented by your script
sub run_script {
    shift;
    my $lrr_info = shift;
    my ($delete_old_tanks, $title_only, $merge_similar) = @_;
    
    my $logger = get_plugin_logger();
    $logger->info("Starting AutoTankoubon script...");
    
    my $redis;
    my %plugin_return = (
        created_tanks => 0,
        message => ""
    );
    
    eval {
        $logger->info("Connecting to Redis...");
        $redis = LANraragi::Model::Config->get_redis;
        die "Failed to get Redis connection" unless $redis;
        
        $logger->info("Connected to Redis successfully");
        
        # Delete existing tankoubons if requested
        if ($delete_old_tanks) {
            $logger->info("Deleting all existing tankoubons...");
            my @tank_ids = $redis->keys('TANK_??????????');
            $logger->info("Found " . scalar(@tank_ids) . " existing tankoubons");
            foreach my $tank_id (@tank_ids) {
                $logger->info("Deleting tankoubon: $tank_id");
                LANraragi::Model::Tankoubon::delete_tankoubon($tank_id);
            }
        }
        
        # Get all archives
        $logger->info("Searching for archives...");
        my @archive_ids = $redis->keys('????????????????????????????????????????');
        unless (@archive_ids) {
            $logger->warn("No archives found in Redis database");
            $plugin_return{message} = "No archives found in Redis database";
            return;
        }
        
        $logger->info("Found " . scalar(@archive_ids) . " archives in database");
        $logger->info("Fetching archive details...");
        
        my @archives;
        eval {
            @archives = get_archive_json_multi(@archive_ids);
            $logger->info("Successfully retrieved " . scalar(@archives) . " archive details");
        };
        if ($@) {
            $logger->error("Error getting archive details: $@");
            die "Failed to get archive details: $@";
        }
        
        unless (@archives) {
            $logger->error("No valid archives returned from get_archive_json_multi");
            $plugin_return{message} = "No valid archives found in database";
            return;
        }
        
        # Group archives by series
        $logger->info("Grouping archives by series...");
        my %series;
        my $processed_count = 0;
        foreach my $archive (@archives) {
            eval {
                next unless $archive && ref($archive) eq 'HASH';  # Skip if archive data is invalid
                
                my $id = $archive->{arcid};
                my $title = $archive->{title};
                my $tags = $archive->{tags} || "";
                
                next unless $id && $title;  # Skip if missing required data
                
                $logger->debug("Processing archive: $title (ID: $id)");
                
                # Extract series name from title
                my $series_name = extract_series_name($title);
                next unless $series_name;  # Skip if no series name could be extracted
                
                # If not title_only, try to use metadata to improve series detection
                unless ($title_only) {
                    # Look for series: or parody: tags
                    if ($tags =~ /(?:series|parody):(.*?)(?:,|$)/i) {
                        my $tag_series = $1;
                        $series_name = $tag_series if $tag_series;
                    }
                }
                
                # Initialize array if not exists
                $series{$series_name} = [] unless exists $series{$series_name};
                
                # Store archive info
                push @{$series{$series_name}}, {
                    id => $id,
                    title => $title,
                    number => extract_number($title)
                };
                
                $processed_count++;
            };
            if ($@) {
                $logger->warn("Error processing archive: $@");
            }
        }
        
        $logger->info("Successfully processed $processed_count archives into " . scalar(keys %series) . " series");
        
        # Create tankoubons for each series
        my $tanks_created = 0;
        foreach my $series_name (sort keys %series) {
            eval {
                next unless $series_name;  # Skip empty series names
                next unless exists $series{$series_name} && ref($series{$series_name}) eq 'ARRAY';
                next unless length($series_name) >= 3;  # Skip series names shorter than 3 characters
                
                my @archives = @{$series{$series_name}};
                next unless @archives > 1;  # Only create tankoubon if there are multiple archives
                
                $logger->info("Creating tankoubon for series: $series_name with " . scalar(@archives) . " archives");
                
                # Sort archives by natural sort of title if numbers are the same
                @archives = sort { 
                    my $num_diff = $a->{number} <=> $b->{number};
                    return $num_diff if $num_diff != 0;
                    return natural_sort_key($a->{title}) cmp natural_sort_key($b->{title});
                } @archives;
                
                # Create tankoubon - pass undef as second argument since we're creating a new one
                my $tank_id = LANraragi::Model::Tankoubon::create_tankoubon($series_name, undef);
                unless ($tank_id) {
                    $logger->error("Failed to create tankoubon for series: $series_name");
                    next;
                }
                $tanks_created++;
                
                # Add archives to tankoubon in order
                my $first_archive;
                my $success = 1;
                foreach my $archive (@archives) {
                    unless ($archive && $archive->{id}) {  # Skip invalid archives
                        $logger->warn("Invalid archive data found, skipping");
                        $success = 0;
                        last;
                    }
                    
                    $logger->debug("Adding archive " . $archive->{id} . " to tankoubon $tank_id");
                    my ($result, $error) = LANraragi::Model::Tankoubon::add_to_tankoubon($tank_id, $archive->{id});
                    unless ($result) {
                        $logger->error("Failed to add archive to tankoubon: $error");
                        $success = 0;
                        last;
                    }
                    
                    # Keep track of first archive for cover and tags
                    $first_archive = $archive unless $first_archive;
                }
                
                # If we failed to add any archives, delete the tankoubon and continue
                unless ($success) {
                    $logger->warn("Failed to add all archives to tankoubon $tank_id, deleting tankoubon");
                    LANraragi::Model::Tankoubon::delete_tankoubon($tank_id);
                    $tanks_created--;
                    next;
                }
                
                # Update tankoubon metadata
                if ($first_archive) {
                    my $metadata = {
                        metadata => {
                            tags => $first_archive->{tags} || "",
                            summary => "Tankoubon containing " . scalar(@archives) . " archives"
                        },
                        cover_archive => $first_archive->{id}
                    };
                    
                    my ($result, $error) = LANraragi::Model::Tankoubon::update_metadata($tank_id, $metadata);
                    if (!$result) {
                        $logger->warn("Failed to update tankoubon metadata: $error");
                    }
                }
                
                $logger->info("Successfully created tankoubon for series: $series_name");
            };
            if ($@) {
                $logger->warn("Error creating tankoubon for series $series_name: $@");
            }
        }
        
        $logger->info("Script completed. Created $tanks_created tankoubons.");
        $redis->quit;
        
        $plugin_return{created_tanks} = $tanks_created;
        $plugin_return{message} = "Created $tanks_created tankoubons from detected series.";
    };
    
    if ($@) {
        my $error = $@;
        $logger->error("Fatal error during script execution: $error");
        eval { $redis->quit if $redis; };
        $plugin_return{message} = "Fatal error during script execution: $error";
    }
    
    return %plugin_return;
}

1; 