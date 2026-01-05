# Workflow v1 Hardening Log

**Status:** Active dogfooding (started 2026-01-05)
**Goal:** Collect real-world friction points from 10+ uses of bundle + submit
**Action threshold:** Fix only what shows up repeatedly or breaks invariants

---

## How to Use This Log

When you hit friction using `runr bundle` or `runr submit`:

1. Add entry below with: command, what happened, expected, proposed fix
2. No debates, just signal
3. After ~10 uses, review for patterns
4. Fix top 3 pain points only

---

## Log Entries

### Entry Template

```
Date: YYYY-MM-DD
Command: runr <command> <args>
What happened: [actual behavior]
Expected: [what you wanted]
Proposed fix: [1 sentence]
Priority: [P0 invariant break | P1 blocks workflow | P2 annoying | P3 nice-to-have]
```

---

## Collected Entries

<!-- Add entries below as you encounter friction -->

---

## Must-Not-Break Invariants

These are checked on every use. If any break, stop and fix immediately:

### 1. Determinism
**Rule:** `bundle` output must be identical for same run_id
**Test:** Run `runr bundle <run_id>` twice, diff the output
**Status:** ✅ Verified in tests (bundle.test.ts)

### 2. Safety
**Rule:** `submit --dry-run` leaves repo completely untouched
**Test:** Check branch, SHA, timeline.jsonl before/after dry-run
**Status:** ✅ Verified in tests (submit.test.ts)
**Implementation:** Dry-run exits at line 202 before any events or git ops

### 3. Recovery
**Rule:** `submit` always restores starting branch, even on failure
**Test:** Run submit with conflict/error, verify branch restored
**Status:** ✅ Verified in tests (submit.test.ts)
**Implementation:** `finally` block at lines 281-290 with best-effort restore

---

## Patterns Observed

<!-- After ~10 uses, summarize patterns here -->

---

## Fixes Applied

<!-- Track fixes that came from this log -->

---

## Notes

- Validation failures write `submit_validation_failed` event but never touch git state
- All validations complete before any git operations (lines 138-192 in submit.ts)
- Branch restoration uses best-effort (catches errors, never hides real failure)
