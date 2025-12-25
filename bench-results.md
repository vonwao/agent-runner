# Benchmark Results

Generated: 2025-12-25T17:27:44.273Z

## Summary

| Scenario | Run ID | Outcome | Stop Reason | Duration | Milestones | Workers (C/X) | Verify (A/R) | Ticks | Reliability |
|----------|--------|---------|-------------|----------|------------|---------------|--------------|-------|-------------|
| engine-bootstrap-ctx-off | 20251225171118 | running | - | - | 0/4 | unknown/unknown | 4/0 | 18 | ✓ |
| engine-bootstrap-ctx-on | 20251225171938 | running | - | - | 0/4 | unknown/unknown | 4/0 | 18 | ✓ |

## Detailed Results

### engine-bootstrap-ctx-off

- **Run ID**: 20251225171118
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 4 attempts, 0 retries, 7s
- **Ticks Used**: 18 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

### engine-bootstrap-ctx-on

- **Run ID**: 20251225171938
- **Outcome**: running
- **Stop Reason**: N/A
- **Duration**: N/A
- **Milestones**: 0/4
- **Worker Calls**: Claude=unknown, Codex=unknown
- **Verification**: 4 attempts, 0 retries, 8s
- **Ticks Used**: 18 (max hit: false)
- **Reliability**: infra_retries=0, fallbacks=0, stalls=0

## CSV Export

```csv
scenario,run_id,outcome,stop_reason,duration_s,milestones_done,milestones_total,claude_calls,codex_calls,verify_attempts,verify_retries,verify_duration_s,ticks_used,max_ticks_hit,infra_retries,fallback_count,stalls
engine-bootstrap-ctx-off,20251225171118,running,,,0,4,unknown,unknown,4,0,7,18,false,0,0,0
engine-bootstrap-ctx-on,20251225171938,running,,,0,4,unknown,unknown,4,0,8,18,false,0,0,0
```