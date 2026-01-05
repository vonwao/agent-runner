# Safety Guide

Runr prioritizes safety over convenience. This guide documents all safety mechanisms and best practices.

## Core Safety Principles

1. **Warnings get ignored** - Hard guards are better than soft warnings
2. **Users blame the system** - Even if deletion was Claude/agent, it's a product issue
3. **Dirty tree = danger** - Uncommitted changes + automation = data loss risk
4. **Explicit is better than implicit** - Require `--force` for dangerous operations

## Technical Guards (Code-Level)

### Dirty Tree Protection

**runr run:**
- **Default:** Blocks if working tree is dirty (uncommitted changes)
- **Override:** `--allow-dirty` flag (use with extreme caution)
- **Check location:** `src/commands/preflight.ts:144-146`
- **Enforcement:** Run stops with `guard_failed` status before any work begins

**runr submit:**
- **Default:** Blocks if working tree is dirty
- **Override:** None (submit always requires clean tree for safety)
- **Check location:** `src/commands/submit.ts:55-58`
- **Validation reason:** `dirty_tree`

**runr resume:**
- **Default:** Checks environment fingerprint (warns on mismatch)
- **Override:** `--force` to bypass fingerprint mismatch
- **Purpose:** Prevent resume on different machine/state

### Scope Guards

**runr run:**
- **Allowlist enforcement:** Worker can only touch files matching `scope.allowlist`
- **Denylist enforcement:** Worker blocked from touching files matching `scope.denylist`
- **Lockfile protection:** Protected lockfiles cannot be changed unless `--allow-deps`
- **Check location:** `src/supervisor/scope-guard.ts`

See [Guards and Scope](guards-and-scope.md) for details.

### Verification Gates

**runr run:**
- **Checkpoint gate:** Only verified milestones become checkpoints (git commits)
- **Tier selection:** Risk-based verification (tier0/tier1/tier2)
- **Auto-retry:** If verification fails, IMPLEMENT phase retries (max 3 attempts per milestone)

See [Verification](verification.md) for details.

### Submit Validation Chain

**runr submit** performs fail-fast validation (all checks before any git mutations):

1. **Checkpoint exists:** Run must have checkpoint SHA
2. **Terminal state:** Run must be complete or stopped
3. **Clean tree:** No uncommitted changes (no override)
4. **Target branch exists:** Integration branch must exist locally
5. **Verification evidence:** Required if `workflow.require_verification: true`

**Conflict handling:**
- On cherry-pick conflict: writes `submit_conflict` event, aborts, restores branch
- No partial state left behind
- Branch restoration in `finally` block (best-effort even on errors)

## Process Guards (Documentation)

### Agent Templates (AGENTS.md / CLAUDE.md)

Every project initialized with `runr init --pack <name>` gets deletion safety rules:

**Deletion Safety Rules (in CLAUDE.md):**
```markdown
**Never delete files outside `.runr/` unless:**
1. File is explicitly listed in task requirements
2. Working tree is clean (no uncommitted changes)
3. You have verified the file is safe to delete

**If asked to "clean up" or "remove files":**
- Respond: "I can only safely delete files within `.runr/` directory"
- Suggest: "Would you like me to run `runr gc --dry-run` to preview worktree cleanup?"
- Never assume what "cleanup" means - always ask for explicit file list

**Hard rule:** If `git status --porcelain` shows uncommitted changes,
refuse all deletion operations until tree is clean.
```

**Purpose:** Behavioral seatbelt for Claude/agents to prevent accidental deletion

### Worktree Isolation

**runr run --worktree:**
- Creates isolated git worktree in `.runr-worktrees/<run_id>/`
- Changes happen in isolated directory, not main working tree
- Original working tree untouched during run
- Merge/cherry-pick after verification passes

**Cleanup:**
- `runr gc` only deletes worktrees, not source code
- Default: clean worktrees older than 7 days
- Safety: `--dry-run` to preview before deletion

See [Worktrees](worktrees.md) for details.

## Behavioral Guards (Agent Instructions)

### What Agents Should Do

**Before any file deletion:**
```bash
# 1. Check tree status
git status --porcelain

# 2. If output is non-empty, refuse deletion
echo "ERROR: Working tree has uncommitted changes. Commit or stash before deletion."
exit 1
```

**When asked to "clean up":**
```markdown
Agent response:
"I can safely clean up Runr-owned artifacts:
- `runr gc --dry-run` - Preview worktree cleanup
- `runr gc` - Delete old worktrees (>7 days)

If you want to delete project files, please provide explicit file list.
I cannot assume what 'cleanup' means to avoid accidental deletion."
```

**When task requires file deletion:**
```markdown
Agent response:
"Task requires deleting: [explicit list]
Current tree status: [clean/dirty]

If dirty: I'll commit pending changes first, then delete.
If clean: Proceeding with deletion.

Confirmation: Should I delete these files?"
```

## Commit Policy (.gitignore)

### Recommended (Default for User Projects)

**Commit these (configuration/tasks are project assets):**
- `.runr/runr.config.json` - Workflow configuration
- `.runr/tasks/**/*.md` - Task definitions
- `.runr/packs/**` - Custom workflow packs (if used)
- `AGENTS.md` - Agent guidelines
- `CLAUDE.md` - Claude Code integration guide

**Ignore these (runtime artifacts, not semantic code):**
- `.runr/runs/` - Run state, timelines, logs
- `.runr-worktrees/` - Isolated git worktrees
- `.runr/orchestrations/` - Orchestration artifacts
- `.runr/tmp/` - Temporary files

**Why ignore runs?**
- Huge diff churn on every run
- Merge conflicts inevitable
- Repo bloat (timelines can be MB per run)
- Accidental leak risk (prompts, secrets in logs)

### Alternative: Bundle-Based Audit Trail

If you want "safe history" without committing raw state:

**Pattern:**
```bash
# After each successful run
runr bundle <run_id> --output docs/runr/bundles/<run_id>.md

# Commit bundle (human-readable, deterministic)
git add docs/runr/bundles/<run_id>.md
git commit -m "docs(runr): bundle for run <run_id>"
```

**Bundle contains:**
- Run metadata (status, duration, stop reason)
- Milestone checklist
- Verification results (tier, commands, status)
- Checkpoint SHA and git diffstat
- Timeline event summary

**Benefits:**
- Deterministic output (same run_id → identical bundle)
- Human-readable markdown
- Small size (KB not MB)
- No secrets (verification output is sanitized)
- Shareable with team

**Commit bundles in .gitignore:**
```gitignore
# Ignore run artifacts
.runr/runs/

# But commit curated bundles
!.runr/bundles/*.md
```

Or keep bundles in separate directory:
```bash
mkdir -p docs/runr/bundles/
runr bundle <run_id> --output docs/runr/bundles/<run_id>.md
```

### Advanced: Committed Artifacts (Power Users)

If you really want to commit `.runr/runs/`, understand the trade-offs:

**Pros:**
- Full provenance (every event, every milestone)
- Time-travel debugging (see exact state at any point)
- Team visibility into run history

**Cons:**
- Repo bloat (100MB+ over time)
- Merge conflicts (concurrent runs write to same space)
- Secret leak risk (timeline.jsonl may contain prompts)
- CI performance (larger checkouts)

**Recommended approach:** Use bundle audit trail instead.

## Safety Checklist (For Users)

**Before running Runr:**
- [ ] Working tree is clean (no uncommitted changes)
- [ ] OR use `runr run --worktree` for isolation
- [ ] Config has proper scope allowlist/denylist
- [ ] Verification commands are defined

**After running Runr:**
- [ ] Review changes with `git diff`
- [ ] Verify checkpoint with `runr bundle <run_id>`
- [ ] Test verification with `runr submit <run_id> --dry-run`
- [ ] Only then: `runr submit <run_id> --to <branch>`

**If something goes wrong:**
- [ ] Check `.runr/runs/<run_id>/timeline.jsonl` for events
- [ ] Check `.runr/runs/<run_id>/handoffs/stop.json` for diagnostics
- [ ] Report bug with run bundle: `runr bundle <run_id> --output /tmp/bug-<run_id>.md`

## Safety Violations (What to Do)

### P0 Invariants (Stop Immediately)

**P0-1 Determinism (bundle):**
- Same run_id → identical markdown output
- Check: `runr bundle <id> > /tmp/a && runr bundle <id> > /tmp/b && diff /tmp/a /tmp/b`
- If violated: File bug, add regression test

**P0-2 Dry-run safety (submit):**
- `submit --dry-run` changes nothing (no branch/file/timeline changes)
- Check: capture branch + status + timeline lines before/after
- If violated: Stop using submit, file critical bug

**P0-3 Recovery (submit):**
- Submit always restores starting branch, even on failure
- Check: run forced failure, confirm branch restored
- If violated: Stop using submit, file critical bug

### Data Loss Scenarios

**If files were deleted:**
1. Stop using Runr immediately
2. Check `git status` and `git log` for what happened
3. Recover from git: `git reflog` and `git checkout <sha> -- <file>`
4. File bug with full timeline: `runr bundle <run_id> --output /tmp/incident.md`
5. Include: timeline.jsonl, stop.json, git reflog

**If uncommitted changes were lost:**
1. Check if worktree still exists: `ls .runr-worktrees/<run_id>/`
2. If yes: `git -C .runr-worktrees/<run_id> diff > /tmp/recovery.patch`
3. Apply patch: `git apply /tmp/recovery.patch`
4. File bug with recovery details

## Hard Rules for Runr Development

**When adding new commands:**
1. [ ] Check if command mutates git state → add dirty tree check
2. [ ] Check if command deletes files → require explicit confirmation
3. [ ] Add `--dry-run` flag for preview (if applicable)
4. [ ] Add `--force` flag for dangerous overrides (never default)
5. [ ] Document safety trade-offs in CLI reference

**When changing existing commands:**
1. [ ] Don't remove safety checks without replacement
2. [ ] Don't change defaults to be less safe
3. [ ] Add new flags, don't change existing behavior
4. [ ] Update tests to verify safety checks still fire

## See Also

- [Guards and Scope](guards-and-scope.md) - Scope enforcement details
- [Verification](verification.md) - Verification gate details
- [Worktrees](worktrees.md) - Isolation mechanism
- [Workflow Guide](workflow-guide.md) - Bundle→submit→push pattern
