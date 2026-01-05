#!/bin/bash
set -e

# Manual test script for submit command
# Tests in sandbox repo (NOT real Runr repo)

SANDBOX_DIR="/tmp/runr-submit-test-$$"
CLI_PATH="/Users/vonwao/dev/agent-framework/dist/cli.js"

echo "=== Submit Command Sandbox Tests ==="
echo "Sandbox: $SANDBOX_DIR"
echo ""

# Setup sandbox repo
mkdir -p "$SANDBOX_DIR"
cd "$SANDBOX_DIR"

git init
git config user.name "Test User"
git config user.email "test@example.com"

# Create initial commit
echo "initial content" > README.md
git add README.md
git commit -m "initial commit"

# Setup Runr (creates .gitignore with .runr/)
node "$CLI_PATH" init --workflow solo --force

# Commit gitignore on main (but not .runr/ itself)
git add .gitignore
git commit -m "setup runr gitignore"

# Create dev branch from main
git checkout -b dev

# Make a change and create checkpoint commit
echo "feature content" > feature.txt
git add feature.txt
git commit -m "feat: add feature"
CHECKPOINT_SHA=$(git rev-parse HEAD)

# Now create fake run metadata (not committed, in .runr/)
RUN_ID="test-run-$(date +%s)"
RUN_DIR=".runr/runs/$RUN_ID"
mkdir -p "$RUN_DIR"

# Create state.json with checkpoint
cat > "$RUN_DIR/state.json" <<EOF
{
  "run_id": "$RUN_ID",
  "started_at": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "repo_path": "$SANDBOX_DIR",
  "phase": "STOPPED",
  "stop_reason": "completed",
  "milestone_index": 0,
  "milestones": [{"goal": "Test milestone"}],
  "checkpoint_commit_sha": "$CHECKPOINT_SHA",
  "last_verification_evidence": {
    "tiers_run": ["tier0"],
    "commands_run": [{"command": "echo test"}]
  }
}
EOF

# Create timeline.jsonl
touch "$RUN_DIR/timeline.jsonl"
echo '{"type":"run_started","source":"cli","payload":{}}' >> "$RUN_DIR/timeline.jsonl"

echo "✅ Sandbox setup complete"
echo "  Run ID: $RUN_ID"
echo "  Checkpoint: $CHECKPOINT_SHA"
echo ""

# Test 1: Dry-run (should show plan, make no changes)
echo "TEST 1: Dry-run (should show plan, no changes)"
git checkout main
BEFORE_SHA=$(git rev-parse HEAD)
node "$CLI_PATH" submit "$RUN_ID" --to dev --dry-run
AFTER_SHA=$(git rev-parse HEAD)
if [ "$BEFORE_SHA" = "$AFTER_SHA" ]; then
  echo "✅ Dry-run made no changes"
else
  echo "❌ Dry-run changed HEAD"
  exit 1
fi
echo ""

# Test 2: Validation - dirty tree
echo "TEST 2: Validation - dirty tree"
git checkout dev
echo "dirty change" > dirty.txt
RESULT=$(node "$CLI_PATH" submit "$RUN_ID" --to dev 2>&1 || true)
if echo "$RESULT" | grep -q "dirty_tree"; then
  echo "✅ Blocked submit on dirty tree"
else
  echo "❌ Should have blocked on dirty tree"
  echo "$RESULT"
  exit 1
fi
rm -f dirty.txt
echo ""

# Test 3: Successful cherry-pick
echo "TEST 3: Successful cherry-pick"
git checkout main
BEFORE_MAIN=$(git log --oneline | wc -l)
node "$CLI_PATH" submit "$RUN_ID" --to main
AFTER_MAIN=$(git log --oneline | wc -l)
if [ "$AFTER_MAIN" -gt "$BEFORE_MAIN" ]; then
  echo "✅ Cherry-pick succeeded (commit added to main)"
else
  echo "❌ Cherry-pick did not add commit"
  exit 1
fi

# Verify feature.txt is on main
if [ -f "feature.txt" ]; then
  echo "✅ Feature file present on main"
else
  echo "❌ Feature file missing on main"
  exit 1
fi

# Check timeline event
if grep -q "run_submitted" "$RUN_DIR/timeline.jsonl"; then
  echo "✅ run_submitted event written"
else
  echo "❌ run_submitted event missing"
  exit 1
fi
echo ""

# Test 4: Conflict detection
echo "TEST 4: Conflict detection"
# Create conflicting change on main
git checkout main
echo "conflicting content" > feature.txt
git add feature.txt
git commit -m "conflicting change"

# Create another run with conflicting checkpoint
RUN_ID_2="test-run-conflict-$(date +%s)"
RUN_DIR_2=".runr/runs/$RUN_ID_2"
mkdir -p "$RUN_DIR_2"

# Create conflicting checkpoint on dev
git checkout dev
echo "different content" > feature.txt
git add feature.txt
git commit -m "feat: different feature"
CHECKPOINT_SHA_2=$(git rev-parse HEAD)

# Create state.json for conflict test
cat > "$RUN_DIR_2/state.json" <<EOF
{
  "run_id": "$RUN_ID_2",
  "started_at": "$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")",
  "repo_path": "$SANDBOX_DIR",
  "phase": "STOPPED",
  "stop_reason": "completed",
  "milestone_index": 0,
  "milestones": [{"goal": "Test conflict"}],
  "checkpoint_commit_sha": "$CHECKPOINT_SHA_2",
  "last_verification_evidence": {
    "tiers_run": ["tier0"],
    "commands_run": [{"command": "echo test"}]
  }
}
EOF

touch "$RUN_DIR_2/timeline.jsonl"
echo '{"type":"run_started","source":"cli","payload":{}}' >> "$RUN_DIR_2/timeline.jsonl"

# Try to submit (should conflict and abort)
CONFLICT_RESULT=$(node "$CLI_PATH" submit "$RUN_ID_2" --to main 2>&1 || true)
if echo "$CONFLICT_RESULT" | grep -q "cherry-pick conflict"; then
  echo "✅ Conflict detected"
else
  echo "❌ Should have detected conflict"
  echo "$CONFLICT_RESULT"
  exit 1
fi

# Check timeline event
if grep -q "submit_conflict" "$RUN_DIR_2/timeline.jsonl"; then
  echo "✅ submit_conflict event written"
else
  echo "❌ submit_conflict event missing"
  exit 1
fi

# Verify clean state (conflict was aborted)
if git status --porcelain | grep -q .; then
  echo "❌ Working tree is dirty after conflict abort"
  git status
  exit 1
else
  echo "✅ Working tree clean after conflict abort"
fi
echo ""

# Test 5: Branch restoration
echo "TEST 5: Branch restoration"
git checkout dev
STARTING_BRANCH="dev"
node "$CLI_PATH" submit "$RUN_ID" --to main --dry-run
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" = "$STARTING_BRANCH" ]; then
  echo "✅ Branch restored after dry-run"
else
  echo "❌ Branch not restored (on $CURRENT_BRANCH, expected $STARTING_BRANCH)"
  exit 1
fi
echo ""

echo "=== All Submit Tests Passed ==="
echo ""
echo "Cleanup: rm -rf $SANDBOX_DIR"
