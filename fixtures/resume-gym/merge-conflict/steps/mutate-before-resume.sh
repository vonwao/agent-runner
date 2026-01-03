#!/usr/bin/env bash
# Create changes that would conflict
# For minimal version, just create uncommitted changes

set -euo pipefail

# Modify existing file to simulate conflict
echo "conflicting change" > src/main.txt

echo "Created conflicting changes"
