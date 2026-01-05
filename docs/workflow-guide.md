# Workflow Guide

Runr's workflow system provides a structured path from task execution to code integration using verified checkpoints.

## Core Concepts

### Checkpoints

When a run completes successfully, Runr creates a **checkpoint** — a git commit containing verified changes:

```
Run → Milestones → Verification → Checkpoint (git commit SHA)
```

Checkpoints are:
- **Verified**: Passed all configured verification tiers
- **Provable**: Includes verification evidence in timeline.jsonl
- **Resumable**: If run stops, progress up to last checkpoint is saved

### Bundle

A **bundle** is a deterministic markdown evidence packet for a run:

```bash
runr bundle <run_id> --output /tmp/bundle.md
```

Bundles contain:
- Run metadata (status, duration, stop reason)
- Milestone checklist (completed/total)
- Verification results (tier, commands, pass/fail)
- Checkpoint SHA and git diffstat
- Timeline event summary

**Key property:** Same run_id → identical bundle output (sorted data, no absolute paths)

### Submit

**Submit** integrates a verified checkpoint into a target branch via cherry-pick:

```bash
runr submit <run_id> --to <branch>
```

Submit workflow:
1. Validate (checkpoint exists, tree clean, verification present)
2. Cherry-pick checkpoint to target branch
3. Optionally push (with `--push` flag)
4. Restore original branch

**Always preview first:**
```bash
runr submit <run_id> --to main --dry-run
```

## Workflow Profiles

Runr provides three workflow profiles:

### Solo Workflow (dev → main)

**Use case:** Solo development with integration branch

```
Feature work → dev branch → Verified checkpoints → Submit to main
```

**Configuration:**
```json
{
  "workflow": {
    "profile": "solo",
    "integration_branch": "dev",
    "require_verification": true
  }
}
```

**Typical flow:**
```bash
# Initialize with solo pack
runr init --pack solo

# Work on dev branch
git checkout dev
runr run --task .runr/tasks/add-feature.md --worktree

# Bundle evidence
runr bundle <run_id>

# Submit to main
runr submit <run_id> --to main --dry-run  # Preview
runr submit <run_id> --to main            # Execute
git push origin main
```

**When to use:**
- Solo developer or small team
- Want integration branch for experiments
- Main branch is production/release branch

### Trunk Workflow (main only)

**Use case:** Trunk-based development on main branch

```
Feature work → main branch → Verified checkpoints → Submit to main
```

**Configuration:**
```json
{
  "workflow": {
    "profile": "trunk",
    "integration_branch": "main",
    "require_verification": true
  }
}
```

**Typical flow:**
```bash
# Initialize with trunk pack
runr init --pack trunk

# Work directly on main
git checkout main
runr run --task .runr/tasks/add-feature.md --worktree

# Submit (simplified - same branch)
runr submit <run_id>  # Uses integration_branch from config
git push origin main
```

**When to use:**
- Team practicing trunk-based development
- Fast iteration cycle
- Main is always deployable

### PR Workflow (feature → main)

**Use case:** Pull request workflow with feature branches

```
Feature branch → Verified checkpoint → PR to main → Review → Merge
```

**Configuration:**
```json
{
  "workflow": {
    "profile": "pr",
    "integration_branch": "main",
    "require_verification": true
  }
}
```

**Typical flow:**
```bash
# Work on feature branch
git checkout -b feature/add-auth
runr run --task .runr/tasks/add-auth.md --worktree

# Push feature branch and create PR
runr bundle <run_id>  # Attach to PR description
git push origin feature/add-auth

# After PR approval, merge via GitHub/GitLab UI
```

**When to use:**
- Team workflow with code review
- Multiple developers
- External contributors

## Bundle → Dry-Run → Submit → Push Pattern

**Best practice for all workflows:**

```bash
# 1. Generate bundle (evidence packet)
runr bundle <run_id> --output /tmp/bundle-<run_id>.md

# 2. Preview submit (no changes)
runr submit <run_id> --to main --dry-run

# 3. Execute submit (cherry-pick)
runr submit <run_id> --to main

# 4. Push (Git owns push)
git push origin main
```

**Why this order:**
1. **Bundle first**: Review what will be submitted
2. **Dry-run second**: Verify submit will succeed
3. **Submit third**: Apply verified checkpoint
4. **Push last**: Git handles remote sync (cleaner separation)

## Submit Validation

Submit performs fail-fast validation with actionable errors:

| Validation | Check | Error Message |
|------------|-------|---------------|
| `no_checkpoint` | Checkpoint SHA exists | "Run has no checkpoint SHA" |
| `run_not_ready` | Run is in terminal state | "Run not in terminal state" |
| `verification_missing` | Evidence exists (if required) | "Missing verification evidence" |
| `dirty_tree` | Working tree clean | "Working tree is dirty" |
| `target_branch_missing` | Branch exists | "Target branch 'X' not found" |

**All validation happens BEFORE any git mutations.**

## Conflict Handling

If cherry-pick conflicts occur:

1. Submit writes `submit_conflict` event with conflicted files list
2. Aborts cherry-pick (clean state)
3. Restores starting branch
4. Exits with error

**Resolution options:**

```bash
# Option 1: Manual cherry-pick
git checkout main
git cherry-pick <checkpoint_sha>
# Resolve conflicts
git commit
git push origin main

# Option 2: Rebase checkpoint
git checkout <run_branch>
git rebase main
runr submit <run_id> --to main
```

## Wrapper Scripts

Projects can provide wrapper scripts for team-specific checks:

```bash
#!/usr/bin/env bash
# scripts/submit-wrapper.sh

set -euo pipefail

RUN_ID=$1
TARGET=${2:-main}

# Team-specific checks
./scripts/run-linters.sh
./scripts/check-dependencies.sh

# Run submit
runr submit "$RUN_ID" --to "$TARGET" --dry-run
runr submit "$RUN_ID" --to "$TARGET"

# Team-specific post-submit
./scripts/update-changelog.sh
git push origin "$TARGET"
```

**Usage:**
```bash
./scripts/submit-wrapper.sh <run_id> main
```

## Safety Invariants

Runr enforces three P0 invariants:

**P0-1 Determinism (bundle):**
- Same run_id → identical markdown output
- Quick check: `runr bundle <id> > /tmp/a && runr bundle <id> > /tmp/b && diff /tmp/a /tmp/b`

**P0-2 Dry-run safety (submit):**
- `submit --dry-run` changes **nothing**: no branch change, no file changes, no new timeline events
- Quick check: capture branch + status + timeline lines before/after

**P0-3 Recovery (submit):**
- Submit always restores starting branch, even on failure
- Quick check: run forced failure, confirm branch restored

**If anything violates P0 → stop and add regression test immediately.**

## Configuration Reference

**Minimal workflow config:**
```json
{
  "workflow": {
    "integration_branch": "main",
    "require_verification": true
  }
}
```

**All workflow fields:**
```json
{
  "workflow": {
    "profile": "solo",                    // Preset (solo/pr/trunk)
    "integration_branch": "dev",           // Target for runr submit
    "submit_strategy": "cherry-pick",      // Strategy (v1: cherry-pick only)
    "require_clean_tree": true,            // Require clean tree
    "require_verification": true           // Require verification evidence
  }
}
```

See [Configuration Reference](configuration.md#workflow) for full details.

## Examples

### Example 1: Solo workflow end-to-end

```bash
# Setup (once)
cd my-project
runr init --pack solo

# Create task
cat > .runr/tasks/add-login.md << 'EOF'
# Add user login

## Goal
Implement Google OAuth2 login

## Requirements
- Session management
- Protected routes
EOF

# Execute
runr run --task .runr/tasks/add-login.md --worktree

# Review and submit
runr bundle <run_id>
runr submit <run_id> --to main --dry-run
runr submit <run_id> --to main
git push origin main
```

### Example 2: Trunk workflow with rapid iteration

```bash
# Setup (once)
runr init --pack trunk

# Iterate quickly on main
runr run --task .runr/tasks/fix-bug.md --worktree
runr submit <run_id>  # Uses integration_branch from config
git push origin main

# Another task immediately
runr run --task .runr/tasks/add-metric.md --worktree
runr submit <run_id>
git push origin main
```

### Example 3: Handling conflicts

```bash
# Submit fails with conflict
runr submit <run_id> --to main
# ERROR: Cherry-pick conflict detected
# Conflicted files: src/auth.ts

# Check timeline for details
cat .runr/runs/<run_id>/timeline.jsonl | grep submit_conflict

# Resolve manually
git checkout main
git cherry-pick <checkpoint_sha>
# Fix conflicts in src/auth.ts
git add src/auth.ts
git commit
git push origin main
```

## Common Patterns

### Pattern 1: Always dry-run first

```bash
# Bad: Hope for the best
runr submit <run_id> --to main

# Good: Preview, then execute
runr submit <run_id> --to main --dry-run
runr submit <run_id> --to main
```

### Pattern 2: Bundle before submit

```bash
# Review evidence before integrating
runr bundle <run_id>
# Verify verification passed, check diffstat
runr submit <run_id> --to main
```

### Pattern 3: Separate push from submit

```bash
# Let Git handle push separately (cleaner debugging)
runr submit <run_id> --to main
git push origin main

# Avoid combined operation (harder to debug)
runr submit <run_id> --to main --push
```

## Troubleshooting

### "Working tree is dirty"

**Cause:** Uncommitted changes in working directory

**Fix:**
```bash
git status
git add . && git commit -m "WIP"
# or
git stash
```

### "Target branch 'dev' not found"

**Cause:** Integration branch doesn't exist locally

**Fix:**
```bash
git checkout -b dev
# or
git fetch origin dev:dev
```

### "Missing verification evidence"

**Cause:** Workflow requires verification but run has no evidence

**Fix:**
```bash
# Option 1: Re-run with verification
runr run --task .runr/tasks/your-task.md --worktree

# Option 2: Disable requirement temporarily
runr submit <run_id> --to main  # Requires config change
```

Edit config:
```json
{
  "workflow": {
    "require_verification": false
  }
}
```

## See Also

- [Configuration Reference](configuration.md) - Workflow config fields
- [CLI Reference](cli.md) - Bundle and submit commands
- [Packs User Guide](packs-user-guide.md) - Workflow packs (solo/trunk)
