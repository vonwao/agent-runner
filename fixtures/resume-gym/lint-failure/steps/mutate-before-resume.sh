#!/usr/bin/env bash
# Mutation script for lint-failure fixture
# Simulates user fixing the lint errors before resume

set -euo pipefail

# Remove the .flag-lint-broken and create .flag-lint-fixed
# This simulates the user manually fixing lint errors before resuming
rm -f .flag-lint-broken
touch .flag-lint-fixed

echo "Fixed: replaced .flag-lint-broken with .flag-lint-fixed"
