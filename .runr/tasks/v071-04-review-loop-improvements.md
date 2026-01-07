# 04: Review Loop Improvements - Actionable Diagnostics

## Goal
When `review_loop_detected` stops a run, show exactly what wasn't satisfied and how to fix it.

## Scope (Intentionally Limited)
- NO `--after` flag (deferred to future release)
- NO automatic command execution
- Just better diagnostics and copy-paste commands

## Requirements

### 1. Extract Unmet Checks from Review

When STOPPED with `review_loop_detected`:
- Parse the last review response for specific requests
- Identify which `done_checks` weren't satisfied
- Show the verification commands that would satisfy them

### 2. Enhanced Stop Output

```
─────────────────────────────────────────────────
STOPPED: review_loop_detected (round 3/2)

Last checkpoint: abc1234 (milestone 2/3)

Reviewer requested:
  1. Fix type errors
  2. Add test coverage for new function

Commands to satisfy:
  npm run typecheck     # was: 3 errors
  npm test -- --coverage  # was: 65%, need 80%

Suggested intervention:
  runr intervene 20260107120000 --reason review_loop \
    --note "Fixed type errors and added tests" \
    --cmd "npm run typecheck" --cmd "npm test"

Next steps:
  runr resume 20260107120000
  runr intervene 20260107120000 --reason review_loop --note "..."
  runr audit --run 20260107120000
─────────────────────────────────────────────────
```

### 3. Parse Review Requests

Extract from review response:
- Bullet points or numbered lists
- "Please fix/add/update" patterns
- Done check names that are marked incomplete

Store in timeline event:
```json
{
  "type": "review_loop_detected",
  "payload": {
    "round": 3,
    "max_rounds": 2,
    "unmet_requests": [
      "Fix type errors",
      "Add test coverage for new function"
    ],
    "suggested_commands": [
      "npm run typecheck",
      "npm test -- --coverage"
    ]
  }
}
```

### 4. Map Requests to Verification Commands

Use verification config to suggest commands:
- "type errors" → `npm run typecheck` or `npx tsc`
- "test coverage" → `npm test -- --coverage`
- "lint errors" → `npm run lint`
- "build fails" → `npm run build`

Heuristic matching is fine. If no match, omit command suggestion.

### 5. Include in review_digest.md

Update the existing `review_digest.md` artifact to include:
- Extracted requests
- Suggested commands
- Copy-paste intervention command

## Tests
- Unmet requests are extracted from review
- Commands are suggested based on request type
- Timeline event includes structured data
- review_digest.md includes suggestions

## Scope
allowlist_add:
  - src/review/check-parser.ts
  - src/supervisor/runner.ts
  - src/artifacts/review-digest.ts

## Verification
tier: tier1

## Acceptance Checks
```bash
npm run build
npm test

# Manual: trigger review loop, verify enhanced output
# Verify: suggested commands match unmet checks
```
