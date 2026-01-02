# Runr Operator Guide (for Meta-Agents)

**Version:** 1.0
**Target:** Claude Code, Codex CLI, and other coding agents

## What Is Runr?

Runr is a **phase-gated execution layer** for coding tasks. It orchestrates AI workers (you!) through a structured workflow with verification gates, checkpoints, and scope guards.

Think of it as a safety harness. You do the coding — Runr prevents guard violations, enforces verification, and creates resumable checkpoints.

---

## When to Use Runr

Use Runr when the user asks for:

- **Multi-step features** that span multiple files/phases
- **Risky changes** in unfamiliar codebases
- **Tasks requiring verification** (tests, builds, type checks)
- **Resumable work** ("try this, if it fails we'll debug")
- Tasks where they explicitly mention "checkpoint", "safety", "verify", or "use runr"

**Don't use Runr for:**
- Single-file tweaks or trivial changes
- Exploratory work ("show me X", "explain Y")
- Tasks the user wants you to do directly

---

## How Runr Works (Mental Model)

```
PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → (next milestone)
         ↑___________|  (retry if tests fail)
```

**You control:** planning, implementation, fixes
**Runr controls:** verification gates, scope enforcement, checkpoints
**Your job:** execute phases, interpret results, resume on failures

---

## Command Reference

### 1. Start a Run

```bash
runr run --task <path-to-task-file> --worktree --json
```

**What it does:**
- Creates isolated git worktree (safe sandbox)
- Outputs run_id immediately (you'll need this)
- Starts phase-gated execution

**Output (JSON):**
```json
{
  "run_id": "20260102143052",
  "run_dir": "/path/.runr/runs/20260102143052",
  "repo_root": "/path/repo",
  "status": "started"
}
```

**You must:**
- Capture the `run_id` from output
- Save it for status checks and resume operations

**Flags:**
- `--worktree`: Creates isolated sandbox (recommended)
- `--fast`: Skips PLAN/REVIEW phases for simple tasks
- `--json`: Machine-readable output (always use this)

---

### 2. Check Status

```bash
runr status <run_id>
```

**What it does:**
- Returns full run state as JSON
- Shows current phase, milestone progress, stop reason

**Output (example):**
```json
{
  "phase": "VERIFY",
  "milestone_index": 1,
  "milestones": [
    {"id": "m1", "status": "complete", ...},
    {"id": "m2", "status": "in_progress", ...}
  ],
  "stop_reason": null,
  "verification_failures": 2
}
```

**Key fields:**
- `phase`: Current phase (PLAN, IMPLEMENT, VERIFY, REVIEW, CHECKPOINT, STOPPED)
- `stop_reason`: Why it stopped (null if still running)
- `milestone_index`: Current milestone (0-indexed)
- `verification_failures`: Retry count for current milestone

---

### 3. Resume from Checkpoint

```bash
runr resume <run_id>
```

**What it does:**
- Continues from last checkpoint
- Retries failed verification
- Uses same config/scope as original run

**When to use:**
- Run stopped with `verification_failed_max_retries`
- User says "try again" or "resume"
- Transient failures (network, rate limits)

---

### 4. Monitor Progress (Optional)

```bash
# Tail live updates
runr follow <run_id>

# Block until completion (best for automation)
runr wait <run_id> --for terminal --json
```

**`wait` output:**
```json
{
  "run_id": "20260102143052",
  "phase": "STOPPED",
  "stop_reason": "complete",
  "milestones_completed": 3
}
```

---

### 5. Get Final Report

```bash
runr report <run_id> --kpi-only
```

**What it does:**
- Shows KPIs (duration, phase timings, verification attempts)
- Shows stop reason and diagnostics
- Shows which milestones completed

**Use for:**
- Summarizing results to user
- Debugging why a run failed

---

### 6. Health Check

```bash
runr doctor
```

**What it does:**
- Verifies Claude/Codex CLI are available
- Checks headless mode configuration
- Reports environment issues

**Use before first run** to catch setup problems.

---

## Typical Workflow

### Starting a Run

1. User asks for a task (e.g., "Add user authentication")
2. You create a task file `.runr/tasks/add-auth.md` with:
   ```markdown
   # Add User Authentication

   ## Goal
   Implement OAuth2 login with Google

   ## Requirements
   - Session management
   - Protected routes
   - Logout functionality

   ## Success Criteria
   - Users can log in with Google
   - Sessions persist across refreshes
   - Tests pass
   ```

3. Run it:
   ```bash
   runr run --task .runr/tasks/add-auth.md --worktree --json
   ```

4. Capture run_id from output:
   ```
   run_id=20260102143052
   ```

5. Report to user:
   ```
   Started run 20260102143052. Runr is executing the task in an isolated worktree.
   I'll monitor progress and report back when it completes or needs attention.
   ```

---

### Monitoring and Resume

6. Check status periodically:
   ```bash
   runr status 20260102143052
   ```

7. **If it completes** (`stop_reason: "complete"`):
   ```
   Task completed! Runr verified all tests pass. Changes are in branch runr/20260102143052.
   ```

8. **If it fails** (`stop_reason: "verification_failed_max_retries"`):
   ```bash
   # Check what failed
   runr report 20260102143052

   # Show user the failure reason
   # Ask if they want to resume or adjust approach

   # If resuming:
   runr resume 20260102143052
   ```

9. **If scope violation** (`stop_reason: "guard_violation"`):
   ```
   Run stopped - tried to modify files outside allowed scope.
   This usually means the task is broader than configured.

   Options:
   1. Adjust .runr/runr.config.json allowlist
   2. Break task into smaller pieces
   3. Use --allow-deps if it needs package changes
   ```

---

## Stop Reasons (What They Mean)

| Reason | What Happened | What To Do |
|--------|---------------|------------|
| `complete` | Task finished, all gates passed | Ship it! |
| `verification_failed_max_retries` | Tests failed too many times | Check report, fix issues, resume |
| `guard_violation` | Touched files outside scope | Adjust allowlist or break down task |
| `review_loop_detected` | Review kept rejecting same changes | Escalate to user, may need clearer requirements |
| `time_budget_exceeded` | Ran out of time | Resume with more time, or break into smaller tasks |
| `plan_rejection` | Planner rejected the approach | Task may be too vague/ambiguous |

---

## Interpreting Failures

### Verification Failures
```json
{
  "phase": "STOPPED",
  "stop_reason": "verification_failed_max_retries",
  "verification_failures": 3
}
```

**Action:**
1. Run `runr report <run_id>` to see test output
2. Identify the failing test/check
3. Explain to user what failed
4. Ask: "Should I resume and try fixing this, or adjust the approach?"

### Guard Violations
```json
{
  "phase": "STOPPED",
  "stop_reason": "guard_violation",
  "guard_violation_files": ["node_modules/foo/bar.js", ".env"]
}
```

**Action:**
1. Explain what files were blocked
2. If legitimate (e.g., needs to update package.json):
   - Suggest updating `.runr/runr.config.json` allowlist
   - Or use `--allow-deps` flag
3. If suspicious (e.g., tried to modify .env):
   - Explain this is a safety stop
   - Task may need refinement

---

## Task File Format

Task files are markdown. Keep them concise but clear:

```markdown
# [One-line description]

## Goal
[1-2 sentences: what are we building?]

## Requirements
- [Specific requirement]
- [Specific requirement]

## Success Criteria
- [How we know it's done]
- [Usually includes "tests pass"]

## Notes (optional)
- [Architecture preferences]
- [Files to modify]
```

**Good:**
```markdown
# Add dark mode toggle

## Goal
Users can switch between light/dark themes

## Requirements
- Toggle in settings page
- Persists in localStorage
- Updates CSS variables

## Success Criteria
- Clicking toggle switches theme
- Theme persists on refresh
- Existing tests still pass
```

**Bad (too vague):**
```markdown
# Make the app better

Add dark mode and other improvements as needed.
```

---

## Configuration (.runr/runr.config.json)

Users may already have this. If not, suggest creating it:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "presets": ["nextjs", "vitest", "typescript"]
  },
  "verification": {
    "tier0": ["npm run typecheck"],
    "tier1": ["npm run build"],
    "tier2": ["npm test"]
  }
}
```

**Scope presets** auto-configure common patterns:
- `nextjs`, `react`, `drizzle`, `prisma`, `vitest`, `jest`, `playwright`, `typescript`, `tailwind`, `eslint`, `env`

---

## Error Handling

### Run Not Found
```bash
runr status <run_id>
# Error: Run not found
```
**Action:** Check run_id for typos. Use `runr status --all` to list runs.

### Dirty Worktree
```
Error: Worktree is dirty
```
**Action:** Commit or stash changes first, or use `--allow-dirty` (not recommended).

### Worker Not Available
```
Error: claude-code not found
```
**Action:** Run `runr doctor` to diagnose. User may need to install Claude Code CLI.

---

## Advanced: Multiple Runs (Orchestration)

For parallel task execution:

```bash
runr orchestrate run --config tracks.yaml --worktree
```

**tracks.yaml:**
```yaml
tracks:
  - id: auth
    tasks:
      - path: tasks/auth-backend.md
      - path: tasks/auth-frontend.md
  - id: ui
    tasks:
      - path: tasks/dark-mode.md
```

Runr handles collision detection (won't edit same files simultaneously).

---

## Reporting Back to User

### On Start
```
Started run <run_id>. Runr is executing in an isolated worktree.
Monitoring progress...
```

### On Success
```
Run <run_id> completed successfully!
- All verifications passed (typecheck, build, tests)
- Created checkpoint commits
- Changes are in branch runr/<run_id>

Ready to merge or would you like me to review the changes first?
```

### On Failure (with actionable info)
```
Run <run_id> stopped: verification_failed_max_retries

The test "auth.test.ts > login redirects to dashboard" failed:
  Expected: /dashboard
  Actual: /login

This might be because the redirect logic in auth.ts uses the old route.
Should I resume and fix this, or would you like to adjust the requirements?
```

### On Guard Violation
```
Run <run_id> stopped: guard_violation

Runr blocked changes to:
- package-lock.json (dependency changes require --allow-deps)

This happened because the task tried to install 'bcrypt'.
Should I:
1. Resume with --allow-deps (if this is intentional)
2. Adjust the task to use existing libraries
```

---

## Best Practices

1. **Always use --worktree**: Isolates changes, prevents conflicts
2. **Always use --json**: Makes output parseable
3. **Capture run_id early**: You'll need it for all subsequent commands
4. **Check stop_reason before resuming**: Understand why it failed
5. **Use --fast for simple tasks**: Skips planning/review overhead
6. **Report stop reasons clearly**: Don't just say "it failed" — explain what and why
7. **Link to commits**: After completion, show user the checkpoint commits created

---

## One-Line Setup for Users

```bash
# Install Runr
npm install -g @weldr/runr

# Verify environment
runr doctor

# Create minimal config (if needed)
mkdir -p .runr/tasks
cat > .runr/runr.config.json << 'EOF'
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "presets": ["typescript", "vitest"]
  },
  "verification": {
    "tier0": ["npm run typecheck"],
    "tier1": ["npm test"]
  }
}
EOF
```

Then paste task files into `.runr/tasks/` and tell the agent to run them.

---

## Summary Checklist

When operating Runr:

- [ ] Create clear task file with Goal, Requirements, Success Criteria
- [ ] Run with `--worktree --json` flags
- [ ] Capture and save run_id
- [ ] Monitor status periodically
- [ ] On stop, check stop_reason before acting
- [ ] Use `report` to get failure details
- [ ] Explain failures clearly to user (don't just say "tests failed")
- [ ] Offer resume or alternative approaches
- [ ] Report final commits/branches on success

**Remember:** You're the operator. Runr is the execution harness. Your job is to interpret results, handle failures gracefully, and keep the user informed.
