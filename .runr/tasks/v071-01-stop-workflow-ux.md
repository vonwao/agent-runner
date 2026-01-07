# 01: Stop Workflow UX - Clear Next Steps

## Goal
When a run stops, the user knows exactly what to do. Three commands max.

## Problem
STOP output shows diagnostics but no clear action. Users get stuck choosing between resume, intervene, or audit.

## Requirements

### 1. Consistent STOP Footer

When any run stops, append a compact "Next Steps" block:

```
─────────────────────────────────────────────────
STOPPED: review_loop_detected

Last checkpoint: abc1234 (milestone 2/3)
Unmet: type errors (npm run typecheck), test coverage

Next steps:
  runr resume 20260107120000
  runr intervene 20260107120000 --reason review_loop --note "..."
  runr audit --run 20260107120000
─────────────────────────────────────────────────
```

### 2. Three Commands Only

Always show exactly three options:
1. `runr resume <id>` - try again
2. `runr intervene <id> --reason <stop_reason> --note "..."` - record manual fix
3. `runr audit --run <id>` - see what happened

### 3. Reason-Aware Context Line

Add one line of context based on stop reason:

| Reason | Context Line |
|--------|--------------|
| `review_loop_detected` | "Unmet: <first 2 checks from review>" |
| `verification_failed` | "Failed: <command that failed>" |
| `scope_violation` | "Files: <first 2 violating files>" |
| `stalled_timeout` | "Stalled at: <phase>" |
| `guard_fail` | "Guard: <guard type>" |
| other | (no context line) |

### 4. Locations to Add Footer

- `src/supervisor/runner.ts` - when transitioning to terminal STOPPED state
- `src/commands/status.ts` - when showing a stopped run
- `src/commands/run.ts` - after run completes with STOPPED

### 5. JSON Output

When `--json` is used, include structured next steps:

```json
{
  "next_steps": {
    "resume": "runr resume 20260107120000",
    "intervene": "runr intervene 20260107120000 --reason review_loop --note \"...\"",
    "audit": "runr audit --run 20260107120000"
  }
}
```

### 6. Keep It Compact

- No boxes or heavy formatting
- Single horizontal line separator
- Max 6 lines total
- Commands must be copy-paste ready with actual values

## Tests
- Footer appears on all STOPPED runs
- Three commands always present with correct run_id
- Context line matches stop reason
- --json includes next_steps object

## Scope
allowlist_add:
  - src/supervisor/runner.ts
  - src/commands/status.ts
  - src/commands/run.ts
  - src/output/stop-footer.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test

# Manual: trigger a stop, verify footer appears
# Verify: commands include actual run_id
# Verify: context line matches reason
```
