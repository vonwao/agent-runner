# Task: Runtime Profiler + KPI Scoreboard

## Goal
Get hard numbers per phase and per worker call. You can't optimize blind.

## North Star Metric
**Time-to-Verified-Checkpoint (TVc)** = minutes from start → verified commit

## Self-Hosting Safety
✅ **SAFE for self-hosting** (Phase 1 only)
- Phase 1: Read-only, derives KPIs from existing artifacts
- Phase 2: Runtime collection - requires manual implementation after Phase 1 validated

## Success Contract

- [ ] `report` command shows 10-line KPI summary at top (computed from timeline)
- [ ] New `compare` subcommand: diff two runs to see where time went
- [ ] Optionally writes `kpi.json` from report command (not runtime)
- [ ] Phase 2: Runtime emits richer metrics (after Phase 1 validated)

## Implementation Approach

### Key Insight
The timeline already has everything we need:
- `phase_start` events with timestamps
- `worker_stats` event at finalize (already implemented!)
- `verification` events with durations
- `run_started` / `stop` events for total duration

**No boot chain changes needed for Phase 1.**

---

## Phase 1: Read-Only KPIs (Self-Hostable)

### Milestone 1: KPI Computation in Report
**Goal:** Compute KPIs from existing timeline.jsonl and state.json

**Files expected:**
- `src/commands/report.ts` - add `computeKpi()` and KPI summary section

**Done checks:**
- Report shows: total duration, phase durations, worker call counts
- Computed from existing events (no runtime changes)
- Works on any existing run

### Milestone 2: Compare Command
**Goal:** Diff two runs to see where time went

**Files expected:**
- `src/commands/compare.ts` - new command

**Done checks:**
- `agent-run compare <run-a> <run-b>` shows side-by-side
- Highlights which phases took longer
- Shows worker call diff

**Allowlist for self-hosting:**
```json
{
  "allowlist": ["src/commands/report.ts", "src/commands/compare.ts"],
  "denylist": ["src/supervisor/**", "src/store/**", "src/workers/**", "src/cli.ts"]
}
```

---

## Phase 2: Runtime KPI Collection (Manual Implementation)

Only after Phase 1 is validated with 3+ clean runs.

### Milestone 3: Enhanced Timeline Events
**Goal:** Emit richer events with token estimates

**Files expected:**
- `src/types/schemas.ts` - extend WorkerStats with token counts
- `src/supervisor/runner.ts` - emit token estimates in events
- `src/workers/claude.ts` - return byte counts
- `src/workers/codex.ts` - return byte counts

**Done checks:**
- Worker calls emit input/output byte counts
- Token estimates (chars/4) in worker_stats event
- Phase timing more granular

**⚠️ DO NOT self-host this milestone - touches boot chain.**

## KPI Schema (draft)

```typescript
interface RunKpi {
  run_id: string;
  started_at: string;
  ended_at: string;
  total_duration_ms: number;
  outcome: 'complete' | 'stopped' | 'error';

  phases: {
    [phase: string]: {
      duration_ms: number;
      attempts: number;
    };
  };

  workers: {
    claude: WorkerMetrics;
    codex: WorkerMetrics;
  };

  verification: {
    commands_run: number;
    retries: number;
    tiers_executed: string[];
  };

  changes: {
    files_touched: number;
    lines_added: number;
    lines_removed: number;
  };

  milestones: {
    planned: number;
    completed: number;
  };
}

interface WorkerMetrics {
  calls: number;
  tokens_in: number;
  tokens_out: number;
  avg_latency_ms: number;
  by_phase: {
    plan: { calls: number; tokens_in: number; tokens_out: number };
    implement: { calls: number; tokens_in: number; tokens_out: number };
    review: { calls: number; tokens_in: number; tokens_out: number };
  };
}
```

## Guardrails
- No new dependencies for basic timing
- KPI collection must not affect run outcome
- Graceful degradation if metrics unavailable

## Risk Level
Low - purely additive, no changes to core execution flow
