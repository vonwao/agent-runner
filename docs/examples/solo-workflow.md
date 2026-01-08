# Solo Workflow Example

**The canonical copy-paste reference for solo development with Runr.**

---

## ⚠️ CRITICAL SAFETY RULE ⚠️

**Do not run agents on uncommitted work. Commit or stash first.**

If `git status --porcelain` shows any output, **stop**. Commit your changes or stash them before running Runr tasks.

**Why:** Agents can delete files, "clean up" code, or make mistakes. Uncommitted work is not backed up by git. One ambiguous "cleanup" instruction can lose hours of work.

**The rule:** Always start clean. No exceptions.

---

This document answers:
- What commands do I run, in order?
- What files does Runr create, and what do I commit?
- How do I use this with a meta-agent without blowing up my repo?

---

## What Is Solo Workflow?

Solo workflow uses a **dev branch** for agent work, then submits verified checkpoints to **main** (your release branch).

```
dev branch → verified checkpoints → submit to main → push
```

**Key principle:** Main is always clean. Dev is your sandbox.

---

## .gitignore Policy (Lock This In)

**Commit these (configuration = project assets):**
- `.runr/runr.config.json` - Workflow configuration
- `.runr/tasks/**/*.md` - Task specifications
- `AGENTS.md` - Agent guidelines
- `CLAUDE.md` - Claude Code integration

**Ignore these (machine/run artifacts):**
- `.runr/runs/**` - Timeline events, state, logs (noisy, churn)
- `.runr-worktrees/**` - Isolated git worktrees
- `.runr/orchestrations/**` - Orchestration artifacts

**Optional (human audit trail):**
- Save `runr bundle` output to `docs/runr/bundles/<run_id>.md` if you want history without repo noise
- Commit these bundles for team visibility

**Add to your .gitignore:**
```gitignore
# Runr artifacts
.runr/runs/
.runr-worktrees/
.runr/orchestrations/

# Optional: commit curated bundles
!docs/runr/bundles/*.md
```

---

## One-Time Setup

```bash
# Create dev branch
git checkout -b dev

# Initialize with solo pack
runr init --pack solo

# Commit the config
git add .runr/ AGENTS.md CLAUDE.md .gitignore
git commit -m "chore: initialize Runr solo workflow"
```

**What this created:**
- `.runr/runr.config.json` - Auto-detected verification commands + workflow config
- `.runr/tasks/example-task.md` - Starter task template
- `AGENTS.md` - Agent guidelines for this project
- `CLAUDE.md` - Claude Code integration guide

---

## The Solo Workflow Loop (Copy-Paste)

### Manual Execution

```bash
# 1) Start clean (DO NOT do agent work on uncommitted changes)
git status --porcelain   # Should output nothing

# 2) Run a task
runr run --task .runr/tasks/add-feature.md --worktree

# 3) Create review packet (deterministic evidence)
runr bundle <run_id> --output /tmp/bundle-<run_id>.md

# 4) Preview integration (dry-run - changes nothing)
runr submit <run_id> --to dev --dry-run

# 5) Integrate verified checkpoint to dev
runr submit <run_id> --to dev

# 6) Push (Git owns push)
git push origin dev

# 7) When ready for release, submit to main
git checkout main
runr submit <run_id> --to main
git push origin main
```

### With Dogfood Wrapper (Muscle Memory)

```bash
# Replaces steps 3-6 above
./scripts/dogfood-submit.sh <run_id> --to dev
```

**What the wrapper does:**
1. Generates bundle → `/tmp/bundle-<run_id>.md`
2. Runs `submit --dry-run` (safety check)
3. Checks invariants (branch, status, timeline)
4. Runs real submit
5. Prompts for push

---

## How This Looks With a Meta-Agent

A meta-agent is just an operator that **drives the Runr workflow**. Two modes:

### Mode A: Meta-Agent Uses Runr Directly (Recommended)

**Meta-agents must obey the Safety Contract:**

1. **Never delete on dirty tree** - Check `git status --porcelain` first
2. **Never delete outside `.runr/` without explicit file list** - Don't assume "cleanup"
3. **Must end with bundle + dry-run** - Always generate review artifact

**You tell the meta-agent:**
```
"Implement user authentication. Use Runr solo workflow.
Follow the meta-agent safety contract in CLAUDE.md."
```

**Meta-agent does (automatically):**

1. **Check tree status:**
   ```bash
   git status --porcelain
   ```
   If dirty: tells you to commit/stash (DOES NOT proceed)

2. **Create task file:**
   ```bash
   cat > .runr/tasks/add-auth.md << 'EOF'
   # Add User Authentication

   ## Goal
   Implement OAuth2 login with Google

   ## Requirements
   - Session management
   - Protected routes
   EOF
   ```

3. **Run task:**
   ```bash
   runr run --task .runr/tasks/add-auth.md --worktree
   ```

4. **Generate bundle:**
   ```bash
   runr bundle <run_id> --output /tmp/bundle-<run_id>.md
   ```

5. **Submit (using wrapper if available):**
   ```bash
   ./scripts/dogfood-submit.sh <run_id> --to dev
   # or
   runr submit <run_id> --to dev --dry-run
   runr submit <run_id> --to dev
   git push origin dev
   ```

6. **Report results:**
   ```
   ✓ Task completed
   ✓ Checkpoint: abc1234
   ✓ Submitted to dev
   ✓ Bundle: /tmp/bundle-<run_id>.md
   ```

**Why this is ideal:**
- Runr becomes source of truth for progress
- Checkpoints provide resume points on failure
- Safety gates enforced (dirty tree check, verification)
- Deterministic review artifacts (bundles)

### Mode B: Meta-Agent Codes Manually (Acceptable, Riskier)

Meta-agent edits files directly, runs tests, commits.

**Rules you MUST enforce:**
1. **Never delete/cleanup on dirty tree** - Always check `git status` first
2. **Still produce review artifact** - Run `runr bundle` after manual work
3. **Finish via Runr** - Even if coding manually, end with:
   ```bash
   runr bundle <run_id>
   runr submit <run_id> --to dev
   ```

**Problem with Mode B:**
- Slowly drifts away from Runr discipline
- Loses checkpoint/resume benefits
- Harder to audit what changed

**Recommendation:** Use Mode A. If meta-agent insists on Mode B, ensure it follows the 3 rules above.

---

## Example: Complete Task With Meta-Agent

### You (to meta-agent):

```
Add a /health endpoint that returns {"status": "ok"}.
Use Runr solo workflow. Work on dev branch.
```

### Meta-agent response (Mode A):

```bash
# Checking tree status...
git status --porcelain
# Tree is clean ✓

# Creating task...
cat > .runr/tasks/add-health-endpoint.md << 'EOF'
# Add Health Check Endpoint

## Goal
Add GET /health endpoint

## Requirements
- Returns JSON: {"status": "ok"}
- HTTP 200 status code

## Success Criteria
- Endpoint responds with correct JSON
- TypeScript types are correct
EOF

# Running task...
runr run --task .runr/tasks/add-health-endpoint.md --worktree

# Task completed: run_20260105_143000
# Generating bundle...
runr bundle run_20260105_143000 --output /tmp/bundle-run_20260105_143000.md

# Submitting to dev...
runr submit run_20260105_143000 --to dev --dry-run
# Dry-run passed ✓
runr submit run_20260105_143000 --to dev
# Checkpoint abc1234 cherry-picked to dev ✓

# Push?
git push origin dev
# Pushed ✓

✓ Task completed successfully
  Checkpoint: abc1234
  Branch: dev
  Bundle: /tmp/bundle-run_20260105_143000.md

Review bundle for verification evidence and changes.
```

---

## What Files Does Runr Create?

After running a task, you'll see:

```
.runr/
├── runr.config.json          # Config (commit this)
├── tasks/
│   ├── example-task.md       # Task specs (commit these)
│   └── add-feature.md
└── runs/
    └── run_20260105_143000/  # Run artifacts (IGNORE these)
        ├── state.json        # Run state
        ├── timeline.jsonl    # Event log
        ├── handoffs/
        │   ├── stop.json     # Stop diagnostics
        │   └── stop.md
        └── verification/
            └── evidence.json  # Verification results

.runr-worktrees/
└── run_20260105_143000/      # Isolated worktree (IGNORE)
    └── <your project files>  # Changes happen here
```

**What to commit:**
- `.runr/runr.config.json` ✓
- `.runr/tasks/*.md` ✓
- `AGENTS.md`, `CLAUDE.md` ✓

**What to ignore:**
- `.runr/runs/**` ✗ (machine artifacts, churn)
- `.runr-worktrees/**` ✗ (isolated work areas)

**Optional (bundle audit trail):**
```bash
# After each run
mkdir -p docs/runr/bundles
runr bundle <run_id> --output docs/runr/bundles/<run_id>.md

# Commit bundle
git add docs/runr/bundles/
git commit -m "docs(runr): bundle for <run_id>"
```

---

## Troubleshooting

### "Working tree is dirty"

**Symptom:**
```
ERROR: Validation failed
Reason: dirty_tree
Working tree has uncommitted changes
```

**Cause:** You have uncommitted changes in your working directory.

**Fix:**
```bash
# Option 1: Commit changes
git add .
git commit -m "WIP: current work"

# Option 2: Stash changes
git stash

# Then retry
runr submit <run_id> --to dev
```

**Prevention:** Always start clean. Check `git status --porcelain` before running tasks.

---

### "Target branch 'dev' not found"

**Symptom:**
```
ERROR: Validation failed
Reason: target_branch_missing
Target branch 'dev' not found
```

**Cause:** Integration branch doesn't exist locally.

**Fix:**
```bash
# Create dev branch
git checkout -b dev

# Or fetch from remote
git fetch origin dev:dev
```

---

### Submit conflict

**Symptom:**
```
ERROR: Cherry-pick conflict detected
Conflicted files: src/auth.ts
Run aborted, starting branch restored
```

**What happened:**
- `submit` tried to cherry-pick checkpoint to dev
- Changes conflicted with current dev state
- `submit` wrote `submit_conflict` event, aborted cherry-pick, restored branch
- No partial state left behind

**Fix:**

**Option 1: Manual cherry-pick**
```bash
git checkout dev
git cherry-pick <checkpoint-sha>
# Resolve conflicts in src/auth.ts
git add src/auth.ts
git commit
git push origin dev
```

**Option 2: Rebase checkpoint**
```bash
git checkout <run-branch>
git rebase dev
# Resolve conflicts
runr submit <run_id> --to dev
```

---

### "I asked the agent to clean up and lost work"

**⚠️ THIS IS THE BIG WARNING ⚠️**

**Never run "cleanup" or file deletion instructions via an agent on uncommitted work.**

**Scenario:**
```
You: "Clean up the codebase"
Agent: *deletes files, thinking "cleanup" means removing dead code*
You: "Wait, I didn't mean that file!"
```

**Why this happens:**
- "Cleanup" is ambiguous (remove dead code? delete temp files? format code?)
- Agents can't read your mind
- Uncommitted work = not backed up by git

**How to prevent:**

1. **Always start clean:**
   ```bash
   git status --porcelain  # Should be empty
   ```

2. **Be explicit:**
   ```
   BAD:  "Clean up"
   GOOD: "Delete these specific files: test1.js, test2.js"
   ```

3. **Check tree first:**
   ```bash
   # Agent should always do this before deletion
   git status --porcelain
   # If output is non-empty, refuse deletion
   ```

4. **Use worktrees:**
   ```bash
   runr run --task task.md --worktree  # Changes isolated
   ```

**If you already lost work:**

1. **Stop immediately**
2. **Check if worktree exists:**
   ```bash
   ls .runr-worktrees/<run_id>/
   ```
3. **If yes, recover changes:**
   ```bash
   git -C .runr-worktrees/<run_id> diff > /tmp/recovery.patch
   git apply /tmp/recovery.patch
   ```
4. **Check git reflog:**
   ```bash
   git reflog
   git checkout <sha> -- <deleted-file>
   ```

**Prevention is better than recovery.** Make "always start clean" a habit.

---

### Missing verification evidence

**Symptom:**
```
ERROR: Validation failed
Reason: verification_missing
Run has no verification evidence
```

**Cause:** Workflow requires verification but run completed without it.

**Fix:**

**Option 1: Re-run with verification**
```bash
# Ensure config has verification commands
cat .runr/runr.config.json
# Should have tier0/tier1 verification commands

runr run --task .runr/tasks/your-task.md --worktree
```

**Option 2: Disable verification requirement (temporary)**
```bash
# Edit .runr/runr.config.json
{
  "workflow": {
    "require_verification": false  # Changed from true
  }
}

# Retry submit
runr submit <run_id> --to dev
```

---

## Quick Reference Card

### Daily Commands

```bash
# Check status (should be clean)
git status --porcelain

# Run task
runr run --task .runr/tasks/<task>.md --worktree

# Review bundle
runr bundle <run_id> --output /tmp/bundle-<run_id>.md

# Submit to dev
./scripts/dogfood-submit.sh <run_id> --to dev
# or manually:
runr submit <run_id> --to dev --dry-run
runr submit <run_id> --to dev
git push origin dev
```

### Weekly Commands

```bash
# Submit to main (release)
git checkout main
runr submit <run_id> --to main
git push origin main

# Clean up old worktrees
runr gc --dry-run
runr gc
```

### Emergency Commands

```bash
# Check what went wrong
runr report <run_id>
cat .runr/runs/<run_id>/handoffs/stop.json

# Recover from worktree
git -C .runr-worktrees/<run_id> diff > /tmp/recovery.patch
git apply /tmp/recovery.patch

# Restore deleted file
git reflog
git checkout <sha> -- <file>
```

---

## See Also

- [Workflow Guide](../workflow-guide.md) - Complete workflow reference
- [Packs User Guide](../packs-user-guide.md) - Workflow pack details
- [Safety Guide](../safety-guide.md) - All safety mechanisms
- [Troubleshooting](../troubleshooting.md) - General troubleshooting
