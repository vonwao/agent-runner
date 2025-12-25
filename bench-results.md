# Benchmark Results

Generated: 2025-12-25T15:49:46.197Z

## Summary

| Scenario | Run ID | Outcome | Stop Reason | Duration | Milestones | Workers (C/X) | Verify (A/R) | Ticks | Reliability |
|----------|--------|---------|-------------|----------|------------|---------------|--------------|-------|-------------|
| engine-bootstrap-ctx-off | 20251225153714 | stopped | implement_blocked | 6m19s | 0/4 | unknown/unknown | 3/0 | 14 | ✓ |
| engine-bootstrap-ctx-on | 20251225154343 | stopped | implement_blocked | 5m49s | 0/4 | unknown/unknown | 3/0 | 14 | ✓ |

## Detailed Results

### engine-bootstrap-ctx-off

- **Run ID**: 20251225153714
- **Outcome**: stopped
- **Stop Reason**: implement_blocked
- **Duration**: 6m19s
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 3 attempts, 0 retries, 13s
- **Ticks Used**: 14 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### engine-bootstrap-ctx-on

- **Run ID**: 20251225154343
- **Outcome**: stopped
- **Stop Reason**: implement_blocked
- **Duration**: 5m49s
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 3 attempts, 0 retries, 15s
- **Ticks Used**: 14 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

## CSV Export

```csv
scenario,run_id,outcome,stop_reason,duration_s,milestones_done,milestones_total,claude_calls,codex_calls,verify_attempts,verify_retries,verify_duration_s,ticks_used,max_ticks_hit,infra_retries,fallback_count,stalls
engine-bootstrap-ctx-off,20251225153714,stopped,implement_blocked,379,0,4,unknown,unknown,3,0,13,14,false,0,0,0
engine-bootstrap-ctx-on,20251225154343,stopped,implement_blocked,349,0,4,unknown,unknown,3,0,15,14,false,0,0,0
```