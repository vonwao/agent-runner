#!/usr/bin/env bash
# Writes deterministic content to a file
# Usage: write-file.sh <path> <content>

set -euo pipefail

FILE=${1:-output.txt}
CONTENT=${2:-"default content"}

mkdir -p "$(dirname "$FILE")"
echo "$CONTENT" > "$FILE"
echo "Wrote: $FILE" >&2
