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
my %plugin_args = (
    groupby => "title",
    min_archives => "2",
    dry_run => "1"  # Enable dry run to see what would be created without actually creating
);

my $plugin_info = LANraragi::Plugin::Scripts::AutoTankoubon::plugin_info();
print "Plugin Info:\n";
print "Name: " . $plugin_info->{name} . "\n";
print "Description: " . $plugin_info->{description} . "\n\n";

# Run the plugin
my ($plugin_success, $plugin_result) = LANraragi::Plugin::Scripts::AutoTankoubon::plugin_exec(%plugin_args);

if ($plugin_success) {
    print "Plugin execution successful!\n";
    print "Result: $plugin_result\n";
} else {
    print "Plugin execution failed: $plugin_result\n";
}
