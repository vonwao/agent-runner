# Benchmark Results

Generated: 2025-12-25T20:01:32.294Z

## Summary

| Scenario | Run ID | Outcome | Stop Reason | Duration | Milestones | Workers (C/X) | Verify (A/R) | Ticks | Reliability |
|----------|--------|---------|-------------|----------|------------|---------------|--------------|-------|-------------|
| noop-worktree | 20251225195936 | running | - | - | 0/2 | unknown/unknown | 2/0 | 10 | ✓ |
| noop-no-worktree | 20251225200118 | running | - | - | 0/1 | unknown/unknown | 0/0 | 0 | ✓ |

## Detailed Results

### noop-worktree

- **Run ID**: 20251225195936
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/2
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 2 attempts, 0 retries, 16s
- **Ticks Used**: 10 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### noop-no-worktree

- **Run ID**: 20251225200118
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
noop-worktree,20251225195936,running,,,0,2,unknown,unknown,2,0,16,10,false,0,0,0
noop-no-worktree,20251225200118,running,,,0,1,unknown,unknown,0,0,0,0,false,0,0,0
```