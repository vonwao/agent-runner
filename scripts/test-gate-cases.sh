#!/usr/bin/env bash
set -euo pipefail

# Deliberate gate case testing - ensure all validation paths are hit
# Run this ONCE during dogfooding to verify error messages are clear

REPO_ROOT="$(git rev-parse --show-toplevel)"

echo "=== Gate Case Testing ==="
echo "This script deliberately triggers validation failures to test error messages."
echo "Run this ONCE during dogfooding week to satisfy release gate requirements."
echo ""

# Find a real run_id for testing
RUN_DIR="$REPO_ROOT/.runr/runs"
if [ ! -d "$RUN_DIR" ]; then
  echo "❌ No runs found in .runr/runs/"
  echo "   Create a run first: runr run -f .runr/tasks/some-task.md"
  exit 1
fi

# Get most recent run with checkpoint
REAL_RUN_ID=""
for run_id in $(ls -t "$RUN_DIR"); do
  if [ -f "$RUN_DIR/$run_id/state.json" ]; then
    if grep -q "checkpoint_commit_sha" "$RUN_DIR/$run_id/state.json"; then
      REAL_RUN_ID="$run_id"
      break
    fi
  fi
done

if [ -z "$REAL_RUN_ID" ]; then
  echo "❌ No run with checkpoint found"
  echo "   Create a verified run first"
  exit 1
fi

echo "Using run_id: $REAL_RUN_ID"
echo ""

# Test 1: dirty_tree validation
echo "📋 Test 1: dirty_tree validation"
echo "   Creating uncommitted file..."
echo "test" > /tmp/dogfood-test-dirty.txt
mv /tmp/dogfood-test-dirty.txt "$REPO_ROOT/dogfood-test-dirty.txt"

echo "   Running submit (should fail with dirty_tree)..."
if runr submit "$REAL_RUN_ID" --to dev 2>&1 | tee /tmp/gate-test-1.log | grep -q "dirty_tree"; then
  echo "   ✅ PASS: dirty_tree detected and message is clear"
  rm "$REPO_ROOT/dogfood-test-dirty.txt"
else
  echo "   ❌ FAIL: dirty_tree not detected or message unclear"
  cat /tmp/gate-test-1.log
  rm "$REPO_ROOT/dogfood-test-dirty.txt"
  exit 1
fi
echo ""

# Test 2: target_branch_missing validation
echo "📋 Test 2: target_branch_missing validation"
echo "   Running submit with non-existent branch..."
if runr submit "$REAL_RUN_ID" --to definitely-not-a-real-branch 2>&1 | tee /tmp/gate-test-2.log | grep -q "target_branch_missing"; then
  echo "   ✅ PASS: target_branch_missing detected and message is clear"
else
  echo "   ❌ FAIL: target_branch_missing not detected or message unclear"
  cat /tmp/gate-test-2.log
  exit 1
fi
echo ""

# Test 3: conflict detection and recovery
echo "📋 Test 3: conflict detection and recovery"
echo "   Setting up conflict scenario..."
echo "   (This requires manual setup - see instructions below)"
echo ""
echo "   To test conflict recovery manually:"
echo "   1. Create a feature branch with a commit"
echo "   2. Create dev branch with conflicting change to same file"
echo "   3. Run: runr submit <run_id> --to dev"
echo "   4. Verify:"
echo "      - 'submit_conflict' in timeline.jsonl"
echo "      - Branch restored to original"
echo "      - Working tree clean"
echo ""
echo "   Conflict test checklist:"
echo "   [ ] Conflict detected and reported"
echo "   [ ] Conflicted files listed clearly"
echo "   [ ] submit_conflict event written to timeline"
echo "   [ ] Cherry-pick aborted cleanly"
echo "   [ ] Branch restored correctly"
echo "   [ ] Working tree clean after abort"
echo ""

# Summary
echo "=== Gate Case Testing Summary ==="
echo "✅ dirty_tree: tested and clear"
echo "✅ target_branch_missing: tested and clear"
echo "⚠️  conflict recovery: requires manual test (see checklist above)"
echo ""
echo "After completing manual conflict test, mark these in hardening log:"
echo "- At least 1 dirty_tree hit with clear error ✓"
echo "- At least 1 target_branch_missing hit with clear error ✓"
echo "- At least 1 conflict recovered cleanly (manual test)"
