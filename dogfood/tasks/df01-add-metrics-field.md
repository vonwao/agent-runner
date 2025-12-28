# Task: Add worker_errors field to metrics

## Goal
Add a `worker_errors` counter to the metrics output that tracks how many runs had worker-related errors.

## Requirements
1. Add `worker_errors: number` to the `AggregatedMetrics.runs` interface in `src/commands/metrics.ts`
2. Count runs where `stop_reason` contains 'worker' (e.g., worker_call_timeout, worker_parse_failed)
3. Display in human-readable format under RUNS section
4. Include in JSON output

## Scope
- `src/commands/metrics.ts` only

## Verification
- Build passes: `npm run build`
- Tests pass: `npm test`
