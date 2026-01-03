#!/usr/bin/env bash
# Create uncommitted changes to test dirty tree policy

set -euo pipefail

# Create a new file (untracked)
echo "uncommitted work" > src/draft.txt

# Modify existing file if it exists
if [ -f "src/main.txt" ]; then
  echo "uncommitted modification" >> src/main.txt
fi

echo "Created uncommitted changes for dirty tree test"
