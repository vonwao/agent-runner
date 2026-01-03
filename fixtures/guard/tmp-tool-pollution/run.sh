#!/usr/bin/env bash
# Simulates verification command creating .tmp/ tool caches

set -euo pipefail

# Create .tmp/ directory structure (like tsx/ts-node would)
mkdir -p .tmp/node-compile-cache
mkdir -p .tmp/tsx-501

# Write some fake cache files
echo "// V8 cache" > .tmp/node-compile-cache/some-hash.bin
echo "// tsx cache" > .tmp/tsx-501/transform-cache.json

echo "Created .tmp/ tool pollution ($(find .tmp -type f | wc -l) files)"
