#!/usr/bin/env bash
# Mutation script for test-failure fixture
# Simulates user fixing the broken tests before resume

set -euo pipefail

# Remove the .flag-broken and create .flag-fixed
# This simulates the user manually fixing the issue before resuming
rm -f .flag-broken
touch .flag-fixed

echo "Fixed: replaced .flag-broken with .flag-fixed"
