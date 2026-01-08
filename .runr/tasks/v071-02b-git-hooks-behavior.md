# 02b: Git Hooks - Mode-Aware Behavior

## Goal
Make the commit hook enforce provenance based on workflow mode. Flow warns, Ledger blocks.

## Prerequisites
- v071-02a completed (hook mechanism + sentinel file)

## Requirements

### 1. Check Logic

`runr hooks check-commit <msg-file>`:

1. Read `.runr/active.json` sentinel
2. If `status !== "STOPPED"` → exit 0 (allow)
3. Read commit message from file
4. Check for Runr trailers (`Runr-Run-Id:`, `Runr-Intervention:`)
5. If trailers present → exit 0 (allow)
6. Otherwise → apply mode policy

### 2. Flow Mode Behavior

Print warning to stderr, allow commit:

```
⚠️  Provenance gap detected

Run 20260107120000 is STOPPED (review_loop_detected).
This commit has no Runr attribution.

To add attribution:
  runr intervene 20260107120000 --reason review_loop \
    --note "description" --commit "your message"

Proceeding anyway (Flow mode).
```

Exit 0.

### 3. Ledger Mode Behavior

Print error to stderr, block commit:

```
❌ Provenance required (Ledger mode)

Run 20260107120000 is STOPPED (review_loop_detected).
This commit has no Runr attribution.

To add attribution:
  runr intervene 20260107120000 --reason review_loop \
    --note "description" --commit "your message"

To override (not recommended):
  RUNR_ALLOW_GAP=1 git commit ...
  # or: git commit --no-verify
```

Exit 1 (blocks commit).

### 4. Override Mechanisms

Allow bypass for edge cases:
- `RUNR_ALLOW_GAP=1` environment variable → warn but allow
- `git commit --no-verify` → skips hook entirely (git native)

### 5. Trailer Detection

Check for any of:
- `Runr-Run-Id: <value>`
- `Runr-Intervention: true`
- `Runr-Checkpoint: true`

Simple regex match on commit message content.

### 6. Edge Cases

- Merge commits: skip check (detected via `MERGE_MSG` or merge parents)
- Empty sentinel file: skip check
- Corrupt sentinel: skip check (fail open)
- No .runr directory: skip check

## Tests
- Flow mode: warning printed, exit 0
- Ledger mode: error printed, exit 1
- With trailers: no warning, exit 0
- With RUNR_ALLOW_GAP=1: warning printed, exit 0
- Merge commit: skip check
- No sentinel: skip check

## Scope
allowlist_add:
  - src/commands/hooks.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test

# Manual test in Flow mode
runr hooks install
runr mode flow
# Start and stop a run
runr run --task .runr/tasks/example.md
# (wait for it to stop)
git commit -m "test"  # should warn but allow

# Manual test in Ledger mode
runr mode ledger
git commit -m "test"  # should block
RUNR_ALLOW_GAP=1 git commit -m "test"  # should warn but allow
```
