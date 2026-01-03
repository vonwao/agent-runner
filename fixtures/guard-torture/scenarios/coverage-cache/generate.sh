#!/usr/bin/env bash
# Generates coverage cache (nyc/coverage)

set -euo pipefail

echo "Generating coverage cache..."

mkdir -p coverage
mkdir -p .nyc_output

# Coverage output files
cat > coverage/coverage-final.json << 'EOF'
{
  "/path/to/file.js": {
    "path": "/path/to/file.js",
    "s": {"0": 1, "1": 1},
    "b": {},
    "f": {"0": 1}
  }
}
EOF

echo '{"uuid": "abc-123"}' > .nyc_output/processinfo.json

echo "✓ Generated coverage artifacts in coverage/ and .nyc_output/"
