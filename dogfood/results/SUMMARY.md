# Dogfood Results Summary

**Date:** 2025-12-28
**Stable Version:** v0.1.0
**Success Rate:** 4/5 (80%)

## Results by Task

| Task | Status | Duration | Milestones | Claude Calls | Branch |
|------|--------|----------|------------|--------------|--------|
| df01 | SUCCESS | ~4 min | 3/3 | 7 | agent/20251228040248/df01-add-metrics-field |
| df02 | SUCCESS | ~3 min | 2/2 | 5 | agent/20251228041003/df02-add-version-flag |
| df03 | SUCCESS | ~7 min | 5/5 | 11 | agent/20251228041445/df03-format-duration-helper |
| df04 | SUCCESS | ~2 min | 1/1 | 3 | agent/20251228042723/df04-document-timeout-env-vars |
| df05 | LOOP BUG | 7+ min | 0/1 | 12+ | agent/20251228043055/df05-validate-window-option |

## Total Worker Stats
- **Claude calls:** ~38+
- **Codex calls:** 0
- **Successful milestones:** 11/12
- **Failed/stuck milestones:** 1

## Bugs Discovered

### Critical: Review Loop (df05)
- `request_changes` status creates infinite loop
- Not counted as retry, no max limit
- Wastes API calls indefinitely until max_ticks
- **Fix needed for v0.2.0**

### Medium: Orchestrator State Sync
- `active_runs: {}` while runs actually running
- State doesn't reflect actual run progress

### Medium: ESM/CJS Bug
- `orchestrate wait --json` fails with `require is not defined`
- Affects monitoring and tooling

### Low: Verification Scope Gap
- Done checks can mention CLI behavior tests
- But tier0 only runs `npm run build`
- Causes reviewer/implementer mismatch

## Performance Observations

| Task Complexity | Duration | Claude Calls |
|----------------|----------|--------------|
| Simple (1 milestone) | ~2-3 min | 3 |
| Medium (2-3 milestones) | ~3-4 min | 5-7 |
| Complex (5 milestones) | ~7 min | 11 |

Formula: ~3 claude calls per milestone (plan + implement + review)

## Positive Findings

1. **Correct code generation** - All implementations were functionally correct
2. **Good scope awareness** - Agent ignored unrelated test failures (jsx-dev-runtime)
3. **Clear handoff memos** - Each milestone had descriptive handoff notes
4. **Clean milestone progression** - 4/5 tasks completed all milestones cleanly

## Recommendations for v0.2.0

1. **Add review loop detection** - Count consecutive `request_changes` and fail after N (3-5)
2. **Fix orchestrator state sync** - Track active runs accurately
3. **Fix ESM/CJS in wait command** - Use `await import()` instead of `require()`
4. **Consider tier1 verification** - Run specific CLI tests for done_checks that mention them
