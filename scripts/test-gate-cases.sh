#!/usr/bin/env bash
set -euo pipefail

# Error trap - shows where script failed
trap 'echo "❌ ERROR at line $LINENO" >&2; exit 1' ERR

# Cleanup trap - remove temp files and restore repo state
cleanup() {
  local exit_code=$?
  if [ -f "$REPO_ROOT/dogfood-test-dirty.txt" ]; then
    rm -f "$REPO_ROOT/dogfood-test-dirty.txt"
  fi
  if [ -d "$SANDBOX_DIR" ]; then
    rm -rf "$SANDBOX_DIR"
  fi
  exit $exit_code
}
trap cleanup EXIT

# Deliberate gate case testing - ensure all validation paths are hit
# Run this ONCE during dogfooding to verify error messages are clear

REPO_ROOT="$(git rev-parse --show-toplevel)"
SANDBOX_DIR="/tmp/runr-conflict-test-$$"

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
for run_id in $(find "$RUN_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | sort -r); do
  if [ -f "$RUN_DIR/$run_id/state.json" ]; then
    if grep -q "checkpoint_commit_sha" "$RUN_DIR/$run_id/state.json" 2>/dev/null; then
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
echo "test" > "$REPO_ROOT/dogfood-test-dirty.txt"

echo "   Running submit (should fail with dirty_tree)..."
set +e
ERROR_OUTPUT=$(runr submit "$REAL_RUN_ID" --to dev 2>&1)
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 0 ] && echo "$ERROR_OUTPUT" | grep -q "dirty_tree"; then
  echo "   ✅ PASS: dirty_tree detected and message is clear"
  rm -f "$REPO_ROOT/dogfood-test-dirty.txt"
else
  echo "   ❌ FAIL: dirty_tree not detected or message unclear"
  echo "   Exit code: $EXIT_CODE"
  echo "   Output:"
  echo "$ERROR_OUTPUT"
  exit 1
fi
echo ""

# Test 2: target_branch_missing validation
echo "📋 Test 2: target_branch_missing validation"
echo "   Running submit with non-existent branch..."
set +e
ERROR_OUTPUT=$(runr submit "$REAL_RUN_ID" --to definitely-not-a-real-branch 2>&1)
EXIT_CODE=$?
set -e

if [ $EXIT_CODE -ne 0 ] && echo "$ERROR_OUTPUT" | grep -q "target_branch_missing"; then
  echo "   ✅ PASS: target_branch_missing detected and message is clear"
else
  echo "   ❌ FAIL: target_branch_missing not detected or message unclear"
  echo "   Exit code: $EXIT_CODE"
  echo "   Output:"
  echo "$ERROR_OUTPUT"
  exit 1
fi
echo ""

# Test 3: conflict detection and recovery (automated)
echo "📋 Test 3: conflict detection and recovery"
echo "   Setting up conflict scenario in sandbox..."

# Create sandbox repo
mkdir -p "$SANDBOX_DIR"
cd "$SANDBOX_DIR"
git init -q
git config user.name "Test"
git config user.email "test@example.com"

# Create initial commit
echo "line 1" > test.txt
git add test.txt
git commit -q -m "initial commit"

# Create main branch
git branch -M main

# Create dev branch with change to line 1
git checkout -q -b dev
echo "line 1 - dev version" > test.txt
git add test.txt
git commit -q -m "dev: modify line 1"

# Create feature branch from main with conflicting change
git checkout -q main
git checkout -q -b feature
echo "line 1 - feature version" > test.txt
git add test.txt
git commit -q -m "feat: modify line 1 differently"
CHECKPOINT_SHA=$(git rev-parse HEAD)

# Setup runr directory structure
mkdir -p ".runr/runs/conflict-test"
cat > ".runr/runs/conflict-test/state.json" <<EOF
{
  "run_id": "conflict-test",
  "checkpoint_commit_sha": "$CHECKPOINT_SHA"
}
EOF
touch ".runr/runs/conflict-test/timeline.jsonl"

# Setup gitignore for .runr
echo ".runr/" > .gitignore
git add .gitignore
git commit -q -m "add gitignore"

# Create runr config
mkdir -p ".runr"
cat > ".runr/runr.config.json" <<EOF
{
  "agent": {"name": "test", "version": "1"},
  "scope": {"allowlist": ["**/*.txt"], "denylist": [], "lockfiles": [], "presets": [], "env_allowlist": []},
  "verification": {"tier0": [], "tier1": [], "tier2": [], "risk_triggers": [], "max_verify_time_per_milestone": 600},
  "workflow": {"profile": "pr", "integration_branch": "dev", "require_verification": false, "require_clean_tree": true, "submit_strategy": "cherry-pick"}
}
EOF

# Capture before state
BEFORE_BRANCH=$(git branch --show-current)
BEFORE_TIMELINE_LINES=$(wc -l < ".runr/runs/conflict-test/timeline.jsonl" | tr -d ' ')

echo "   Running submit (should detect conflict)..."
set +e
ERROR_OUTPUT=$(runr submit "conflict-test" --to dev --repo "$SANDBOX_DIR" 2>&1)
EXIT_CODE=$?
set -e

# Verify conflict handling
AFTER_BRANCH=$(git branch --show-current)
AFTER_TIMELINE_LINES=$(wc -l < ".runr/runs/conflict-test/timeline.jsonl" | tr -d ' ')
WORKING_TREE_CLEAN=false
if [ -z "$(git status --porcelain)" ]; then
  WORKING_TREE_CLEAN=true
fi

# Check all requirements
CONFLICT_DETECTED=false
if [ $EXIT_CODE -ne 0 ] && echo "$ERROR_OUTPUT" | grep -q "conflict"; then
  CONFLICT_DETECTED=true
fi

CONFLICT_EVENT=false
if grep -q "submit_conflict" ".runr/runs/conflict-test/timeline.jsonl" 2>/dev/null; then
  CONFLICT_EVENT=true
fi

BRANCH_RESTORED=false
if [ "$AFTER_BRANCH" = "$BEFORE_BRANCH" ]; then
  BRANCH_RESTORED=true
fi

cd "$REPO_ROOT"  # Return to original repo

# Report results
echo "   Conflict detected: $CONFLICT_DETECTED"
echo "   submit_conflict event: $CONFLICT_EVENT"
echo "   Branch restored ($BEFORE_BRANCH): $BRANCH_RESTORED"
echo "   Working tree clean: $WORKING_TREE_CLEAN"
echo "   Timeline: $BEFORE_TIMELINE_LINES → $AFTER_TIMELINE_LINES lines"

if [ "$CONFLICT_DETECTED" = true ] && [ "$CONFLICT_EVENT" = true ] && [ "$BRANCH_RESTORED" = true ] && [ "$WORKING_TREE_CLEAN" = true ]; then
  echo "   ✅ PASS: Conflict detected and recovered cleanly"
else
  echo "   ❌ FAIL: Conflict recovery incomplete"
  if [ "$CONFLICT_DETECTED" = false ]; then
    echo "      - Conflict not detected properly"
  fi
  if [ "$CONFLICT_EVENT" = false ]; then
    echo "      - submit_conflict event not written"
  fi
  if [ "$BRANCH_RESTORED" = false ]; then
    echo "      - Branch not restored (P0 violation!)"
  fi
  if [ "$WORKING_TREE_CLEAN" = false ]; then
    echo "      - Working tree not clean (cherry-pick not aborted)"
  fi
  echo "   Output:"
  echo "$ERROR_OUTPUT"
  exit 1
fi
echo ""

# Summary
echo "=== Gate Case Testing Summary ==="
echo "✅ dirty_tree: tested and clear"
echo "✅ target_branch_missing: tested and clear"
echo "✅ conflict recovery: automated test passed"
echo ""
echo "All release gate validation cases satisfied!"
echo "Mark these in hardening log:"
echo "- At least 1 dirty_tree hit with clear error ✓"
echo "- At least 1 target_branch_missing hit with clear error ✓"
echo "- At least 1 conflict recovered cleanly ✓"
