#!/usr/bin/env bash
# Generates pytest cache

set -euo pipefail

echo "Generating pytest cache..."

mkdir -p .pytest_cache/v/cache

# pytest cache structure
cat > .pytest_cache/README.md << 'EOF'
# pytest cache directory #

This directory contains data from the pytest's cache plugin,
which provides the `--lf` and `--ff` options, as well as the `cache` fixture.

**Do not** commit this to version control.
EOF

echo '{"last_failed":[]}' > .pytest_cache/v/cache/lastfailed
echo '{"node_ids":[]}' > .pytest_cache/v/cache/nodeids

echo "✓ Generated pytest cache in .pytest_cache/"
