#!/usr/bin/env perl

use strict;
use warnings;
use utf8;
use feature 'say';

use Cwd qw(getcwd);
use lib getcwd() . "/lib";
use lib getcwd();

use LANraragi::Utils::Database;
use LANraragi::Plugin::Scripts::AutoTankoubon;
use LANraragi::Model::Archive;

# Initialize
LANraragi::Utils::Database::invalidate_cache;

print "Testing AutoTankoubon plugin with improved title parsing...\n\n";

# Test the plugin with title grouping and minimum 2 archives
my $group_by_series = 0;
my $group_by_artist = 0;
my $group_by_title = 1;
my $min_archives = 2;
my $skip_existing = 0;
my $dry_run = 1;

print "Running AutoTankoubon plugin with parameters:\n";
print "- Group by title: enabled\n";
print "- Minimum archives: 2\n";
print "- Dry run: enabled\n\n";

# Run the plugin
my $plugin_result = LANraragi::Plugin::Scripts::AutoTankoubon::run_script("", "", $group_by_series, $group_by_artist, $group_by_title, $min_archives, $skip_existing, $dry_run);

print "Plugin execution completed!\n";
print "Result: $plugin_result\n" if defined $plugin_result;
