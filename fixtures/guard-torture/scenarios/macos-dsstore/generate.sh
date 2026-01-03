#!/usr/bin/env bash
# Generates macOS filesystem metadata

set -euo pipefail

echo "Generating macOS filesystem metadata..."

# .DS_Store files (macOS Finder metadata)
echo "Binary DS_Store data" > .DS_Store
echo "Binary DS_Store data" > src/.DS_Store

# ._* AppleDouble files (resource forks on non-HFS+ filesystems)
echo "Binary AppleDouble data" > ._example.txt

echo "✓ Generated macOS metadata files: .DS_Store, src/.DS_Store, ._example.txt"
