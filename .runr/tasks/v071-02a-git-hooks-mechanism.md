# 02a: Git Hooks - Mechanism + Install/Uninstall

## Goal
Provide the infrastructure for git hooks without complex detection logic. Ship the plumbing first.

## Requirements

### 1. Hook Management Commands

```bash
runr hooks install
# Creates hook scripts in .git/hooks/
# Writes .runr/hooks.json config
# Output: "Runr hooks installed. Use 'runr hooks status' to check."

runr hooks uninstall
# Removes Runr hooks, restores any backups
# Output: "Runr hooks removed."

runr hooks status
# Shows: installed/not installed, which hooks, mode
```

### 2. Sentinel File for Run State

Instead of scanning runs on every commit, maintain a lightweight sentinel:

`.runr/active.json`:
```json
{
  "run_id": "20260107120000",
  "status": "STOPPED",
  "stop_reason": "review_loop_detected",
  "updated_at": "2026-01-07T12:30:00Z"
}
```

Or when no active run:
```json
{
  "run_id": null,
  "status": "NONE",
  "updated_at": "2026-01-07T12:00:00Z"
}
```

**Sentinel updates:**
- Written by supervisor when run starts → `status: "RUNNING"`
- Written by supervisor when run stops → `status: "STOPPED"` + reason
- Written by supervisor when run finishes → `status: "NONE"`
- Written by `runr submit` on success → `status: "NONE"`

### 3. Hook Scripts

Create minimal shell scripts that delegate to `runr hooks check-*`:

`.git/hooks/commit-msg`:
```bash
#!/bin/bash
# Runr provenance hook - installed by 'runr hooks install'
if command -v runr &> /dev/null; then
  runr hooks check-commit "$1"
fi
# Always allow commit if runr not available
exit 0
```

### 4. Hooks Config File

`.runr/hooks.json`:
```json
{
  "installed_at": "2026-01-07T12:00:00Z",
  "hooks": ["commit-msg"],
  "backup_suffix": ".runr-backup"
}
```

### 5. Backup Existing Hooks

On install:
- If `.git/hooks/commit-msg` exists, rename to `commit-msg.runr-backup`
- Record backup in hooks.json

On uninstall:
- Remove Runr hook
- Restore backup if exists

### 6. Basic Check Command (placeholder)

`runr hooks check-commit <msg-file>`:
- Read `.runr/active.json`
- If status is "STOPPED", print warning
- Exit 0 (always allow for now - 02b adds enforcement)

## Tests
- `runr hooks install` creates hook file
- `runr hooks status` shows installed state
- `runr hooks uninstall` removes hook and restores backup
- Sentinel file is written on run start/stop/finish
- Hook script is executable

## Scope
allowlist_add:
  - src/commands/hooks.ts
  - src/hooks/**
  - src/supervisor/runner.ts (sentinel writes)

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test

# Manual test
cd /tmp && mkdir hook-test && cd hook-test && git init
runr init --pack solo
runr hooks install
runr hooks status  # should show installed
ls -la .git/hooks/commit-msg  # should exist and be executable
runr hooks uninstall
runr hooks status  # should show not installed
```
