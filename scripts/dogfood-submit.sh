#!/usr/bin/env bash
set -euo pipefail

# Dogfood submit wrapper - enforces checklist and spot-checks invariants
# Usage: ./scripts/dogfood-submit.sh <run_id> [--to branch]

if [ $# -lt 1 ]; then
  echo "Usage: $0 <run_id> [--to branch]"
  echo "Example: $0 20260105-abc123 --to dev"
  exit 1
fi

RUN_ID="$1"
shift

# Default target branch
TARGET_BRANCH="${2:-dev}"
if [ "${1:-}" = "--to" ]; then
  shift
  TARGET_BRANCH="${1:-dev}"
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
TIMELINE_PATH="$REPO_ROOT/.runr/runs/$RUN_ID/timeline.jsonl"
BUNDLE_OUTPUT="/tmp/bundle-$RUN_ID.md"

echo "=== Dogfood Submit Checklist ==="
echo "Run ID: $RUN_ID"
echo "Target: $TARGET_BRANCH"
echo ""

# Step 1: Bundle
echo "📦 [1/5] Generating bundle..."
if ! runr bundle "$RUN_ID" --output "$BUNDLE_OUTPUT"; then
  echo "❌ FAIL: Bundle failed"
  exit 1
fi
echo "   ✓ Bundle saved to: $BUNDLE_OUTPUT"
echo ""

# Step 2: Dry-run
echo "🔍 [2/5] Running dry-run..."
if ! runr submit "$RUN_ID" --to "$TARGET_BRANCH" --dry-run; then
  echo "❌ FAIL: Dry-run failed (validation error?)"
  exit 1
fi
echo "   ✓ Dry-run passed"
echo ""

# Step 3: Spot-check invariants (capture BEFORE submit)
echo "🔎 [3/5] Spot-checking invariants..."
BEFORE_BRANCH="$(git branch --show-current)"
BEFORE_STATUS="$(git status --porcelain | wc -l | tr -d ' ')"
BEFORE_TIMELINE_LINES="0"
if [ -f "$TIMELINE_PATH" ]; then
  BEFORE_TIMELINE_LINES="$(wc -l < "$TIMELINE_PATH" | tr -d ' ')"
fi

echo "   Branch: $BEFORE_BRANCH"
echo "   Dirty files: $BEFORE_STATUS"
echo "   Timeline lines: $BEFORE_TIMELINE_LINES"
echo ""

# Step 4: Real submit
echo "🚀 [4/5] Submitting to $TARGET_BRANCH..."
if ! runr submit "$RUN_ID" --to "$TARGET_BRANCH"; then
  echo "❌ FAIL: Submit failed"

  # Check if branch was restored
  AFTER_BRANCH="$(git branch --show-current)"
  if [ "$AFTER_BRANCH" != "$BEFORE_BRANCH" ]; then
    echo "⚠️  WARNING: Branch NOT restored (was: $BEFORE_BRANCH, now: $AFTER_BRANCH)"
    echo "   P0 invariant violation detected!"
  else
    echo "   ✓ Branch restored correctly despite failure"
  fi

  exit 1
fi
echo "   ✓ Submit succeeded"
echo ""

# Step 5: Verify branch restored
AFTER_BRANCH="$(git branch --show-current)"
if [ "$AFTER_BRANCH" != "$BEFORE_BRANCH" ]; then
  echo "❌ FAIL: Branch NOT restored (was: $BEFORE_BRANCH, now: $AFTER_BRANCH)"
  echo "   P0 invariant violation!"
  exit 1
fi
echo "   ✓ Branch restored: $AFTER_BRANCH"
echo ""

# Step 6: Optional push (Git owns push - Option B)
echo "📤 [5/5] Push to origin?"
read -p "   Push $TARGET_BRANCH to origin? (y/N): " -n 1 -r
echo ""
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo "   Pushing $TARGET_BRANCH to origin..."
  if git push origin "$TARGET_BRANCH"; then
    echo "   ✓ Pushed successfully"
  else
    echo "   ⚠️  Push failed (but submit succeeded)"
  fi
else
  echo "   Skipped push (run manually: git push origin $TARGET_BRANCH)"
fi
echo ""

# Summary
echo "=== Summary ==="
echo "✅ PASS: All checks passed"
echo "   Bundle: $BUNDLE_OUTPUT"
echo "   Submit: $RUN_ID → $TARGET_BRANCH"
echo "   Timeline: $BEFORE_TIMELINE_LINES → $(wc -l < "$TIMELINE_PATH" | tr -d ' ') lines"
echo ""
echo "Next: Review bundle if needed, or continue dogfooding"
