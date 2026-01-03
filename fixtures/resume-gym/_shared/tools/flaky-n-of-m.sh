#!/usr/bin/env bash
# Deterministic "flake" simulator
# Usage: flaky-n-of-m.sh N M
#   Fails for attempts 1..N, passes on attempt N+1
#
# State is tracked in .flaky-state file

set -euo pipefail

N=${1:-2}  # fail first N attempts
M=${2:-5}  # max attempts

STATE_FILE=".flaky-state"

# Read current attempt count
if [ -f "$STATE_FILE" ]; then
  ATTEMPT=$(cat "$STATE_FILE")
else
  ATTEMPT=0
fi

# Increment
ATTEMPT=$((ATTEMPT + 1))
echo "$ATTEMPT" > "$STATE_FILE"

echo "Flaky test attempt $ATTEMPT/$M (will pass after attempt $N)" >&2

if [ "$ATTEMPT" -le "$N" ]; then
  echo "FAIL: flaky test failed (attempt $ATTEMPT)" >&2
  exit 1
else
  echo "PASS: flaky test passed (attempt $ATTEMPT)" >&2
  exit 0
fi
