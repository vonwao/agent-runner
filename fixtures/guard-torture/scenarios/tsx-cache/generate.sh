#!/usr/bin/env bash
# Generates tsx/ts-node compilation caches

set -euo pipefail

echo "Generating tsx/ts-node caches..."

# tsx caches go to .tmp/ by default
mkdir -p .tmp/tsx-{501,502,503}
mkdir -p .tmp/node-compile-cache

# Fake cache files
for dir in .tmp/tsx-*; do
  echo "// transform cache" > "$dir/transform-cache.json"
  echo "binary cache" > "$dir/cache.bin"
done

echo "// V8 compile cache" > .tmp/node-compile-cache/hash-abc123.bin

echo "✓ Generated $(find .tmp -type f | wc -l | tr -d ' ') cache files in .tmp/"
