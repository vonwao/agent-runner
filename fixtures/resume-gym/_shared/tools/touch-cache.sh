#!/usr/bin/env bash
# Creates ignored cache files
# Usage: touch-cache.sh [cache-type]

set -euo pipefail

CACHE_TYPE=${1:-default}

case "$CACHE_TYPE" in
  tsx)
    mkdir -p .tmp/tsx-501
    echo "// cache" > .tmp/tsx-501/cache.json
    ;;
  pytest)
    mkdir -p .pytest_cache/v/cache
    echo '{}' > .pytest_cache/v/cache/lastfailed
    ;;
  *)
    mkdir -p .cache
    echo "cache" > .cache/data.bin
    ;;
esac

echo "Created cache: $CACHE_TYPE" >&2
