#!/usr/bin/env bash
# Generates Vite build cache

set -euo pipefail

echo "Generating Vite cache..."

mkdir -p node_modules/.vite/deps
mkdir -p node_modules/.vite/deps_temp

# Fake dependency cache
echo "// React chunk" > node_modules/.vite/deps/react.js
echo "// React-DOM chunk" > node_modules/.vite/deps/react-dom.js
echo '{"hash":"abc123"}' > node_modules/.vite/deps/_metadata.json

echo "✓ Generated $(find node_modules/.vite -type f | wc -l | tr -d ' ') cache files in node_modules/.vite/"
