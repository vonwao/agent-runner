#!/usr/bin/env bash
# Generates ESLint cache

set -euo pipefail

echo "Generating ESLint cache..."

mkdir -p .eslintcache_dir

# ESLint cache file
cat > .eslintcache << 'EOF'
{
  "/path/to/file.js": {
    "size": 1234,
    "mtime": 1234567890,
    "hashOfConfig": "abc123def456"
  }
}
EOF

echo "✓ Generated ESLint cache: .eslintcache"
