# Benchmark Results

Generated: 2025-12-25T19:14:45.655Z

## Summary

| Scenario | Run ID | Outcome | Stop Reason | Duration | Milestones | Workers (C/X) | Verify (A/R) | Ticks | Reliability |
|----------|--------|---------|-------------|----------|------------|---------------|--------------|-------|-------------|
| noop-worktree | 20251225183721 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| noop-no-worktree | 20251225183937 | running | - | - | 0/1 | unknown/unknown | 0/0 | 0 | ✓ |
| engine-bootstrap-ctx-off | 20251225183949 | running | - | - | 0/4 | unknown/unknown | 5/0 | 20 | ✓ |
| engine-bootstrap-ctx-on | 20251225184721 | running | - | - | 0/4 | unknown/unknown | 4/0 | 18 | ✓ |
| verify-stress-deckbuilder | 20251225185314 | running | - | - | 0/1 | unknown/unknown | 1/0 | 6 | ✓ |
| impl-churn-engine | 20251225185507 | running | - | - | 0/4 | unknown/unknown | 4/0 | 18 | ✓ |
| noop-strict | 20251225190349 | running | - | - | 0/2 | unknown/unknown | 1/0 | 5 | ⏱️ |
| engine-short-budget | 20251225190538 | running | - | - | 0/4 | unknown/unknown | 4/0 | 15 | ⏱️ |
| noop-high-ticks | 20251225191154 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| engine-no-worktree | 20251225191436 | running | - | - | 0/1 | unknown/unknown | 0/0 | 0 | ✓ |

## Detailed Results

### noop-worktree

- **Run ID**: 20251225183721
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 12s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### noop-no-worktree

- **Run ID**: 20251225183937
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/1
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 0 attempts, 0 retries, 0s
- **Ticks Used**: 0 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### engine-bootstrap-ctx-off

- **Run ID**: 20251225183949
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 5 attempts, 0 retries, 11s
- **Ticks Used**: 20 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### engine-bootstrap-ctx-on

- **Run ID**: 20251225184721
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 4 attempts, 0 retries, 8s
- **Ticks Used**: 18 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### verify-stress-deckbuilder

- **Run ID**: 20251225185314
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/1
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 1 attempts, 0 retries, 5s
- **Ticks Used**: 6 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### impl-churn-engine

- **Run ID**: 20251225185507
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 4 attempts, 0 retries, 24s
- **Ticks Used**: 18 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### noop-strict

- **Run ID**: 20251225190349
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 1 attempts, 0 retries, 7s
- **Ticks Used**: 5 (max hit: true)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### engine-short-budget

- **Run ID**: 20251225190538
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 4 attempts, 0 retries, 21s
- **Ticks Used**: 15 (max hit: true)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### noop-high-ticks

- **Run ID**: 20251225191154
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 11s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### engine-no-worktree

- **Run ID**: 20251225191436
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/1
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 0 attempts, 0 retries, 0s
- **Ticks Used**: 0 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

## CSV Export

```csv
scenario,run_id,outcome,stop_reason,duration_s,milestones_done,milestones_total,claude_calls,codex_calls,verify_attempts,verify_retries,verify_duration_s,ticks_used,max_ticks_hit,infra_retries,fallback_count,stalls
noop-worktree,20251225183721,running,,,0,2,unknown,unknown,2,0,12,10,false,0,0,0
noop-no-worktree,20251225183937,running,,,0,1,unknown,unknown,0,0,0,0,false,0,0,0
engine-bootstrap-ctx-off,20251225183949,running,,,0,4,unknown,unknown,5,0,11,20,false,0,0,0
engine-bootstrap-ctx-on,20251225184721,running,,,0,4,unknown,unknown,4,0,8,18,false,0,0,0
verify-stress-deckbuilder,20251225185314,running,,,0,1,unknown,unknown,1,0,5,6,false,0,0,0
impl-churn-engine,20251225185507,running,,,0,4,unknown,unknown,4,0,24,18,false,0,0,0
noop-strict,20251225190349,running,,,0,2,unknown,unknown,1,0,7,5,true,0,0,0
engine-short-budget,20251225190538,running,,,0,4,unknown,unknown,4,0,21,15,true,0,0,0
noop-high-ticks,20251225191154,running,,,0,2,unknown,unknown,2,0,11,10,false,0,0,0
engine-no-worktree,20251225191436,running,,,0,1,unknown,unknown,0,0,0,0,false,0,0,0
```