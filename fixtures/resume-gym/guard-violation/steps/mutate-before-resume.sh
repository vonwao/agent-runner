#!/usr/bin/env bash
# Fix guard violation by moving file into allowed directory

set -euo pipefail

# Milestone 2 would have created notes/oops.txt outside allowlist
# Move it into allowed src/ directory
if [ -f "notes/oops.txt" ]; then
  mkdir -p src
  mv notes/oops.txt src/oops.txt
  rmdir notes 2>/dev/null || true
  echo "Moved notes/oops.txt to src/oops.txt (now in allowlist)"
fi

# Alternative: could add notes/ to .gitignore instead
