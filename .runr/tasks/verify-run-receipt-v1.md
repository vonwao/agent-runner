# Verify Run Receipt v1

## Goal

Prove Run Receipt v1 artifacts + parsing invariants stay intact.

## Requirements

Run the focused test suite and confirm all tests pass.

## Success Criteria

- `npx vitest run src/receipt/__tests__ src/tasks/__tests__` exits 0
- Output shows "30 passed" (or current count)
- No regressions in:
  - receipt.json structure (base_sha, checkpoint_sha, artifacts_written)
  - Compression thresholds (50KB, 2000 lines, 100 files)
  - transcript.meta.json creation when transcript.log missing
  - Task allowlist_add parsing (frontmatter + body)
  - Verification tier normalization (TIER1 → tier1)
  - Console output format (checkpoint + next action)

## Scope

allowlist_add:
  - .runr/tasks/verify-run-receipt-v1.md

## Verification

tier: tier0
