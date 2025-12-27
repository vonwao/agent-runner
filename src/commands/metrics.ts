/**
 * Metrics aggregation command.
 *
 * Collects and aggregates metrics across all runs and orchestrations.
 * Designed for fast collection with O(n) file reads.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRunsRoot, getOrchestrationsRoot, getAgentPaths, AgentPaths } from '../store/runs-root.js';
import { RunState } from '../types/schemas.js';
import { OrchestratorState } from '../orchestrator/types.js';

// Get agent version from package.json
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJsonPath = path.resolve(__dirname, '../../package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
const AGENT_VERSION = packageJson.version as string;

export interface MetricsOptions {
  repo: string;
  json: boolean;
  days?: number;
  window?: number;  // Max runs/orchestrations to consider (default: 50 runs, 20 orchestrations)
}

/**
 * Aggregated metrics output.
 */
/**
 * Duration percentiles.
 */
export interface DurationPercentiles {
  p50: number | null;
  p90: number | null;
  max: number | null;
}

/**
 * Stop reason entry for top reasons list.
 */
export interface StopReasonEntry {
  reason: string;
  count: number;
}

export interface AggregatedMetrics {
  schema_version: 1;
  agent_version: string;
  repo_root: string;
  collected_at: string;
  period: {
    days: number;
    from: string | null;
    to: string;
    runs_considered: number;
    runs_filtered_out: number;
    window: number | null;  // Max runs/orchestrations if --window was used
  };
  paths: AgentPaths;
  runs: {
    total: number;
    complete: number;
    stopped: number;
    running: number;
    success_rate: number;
    by_stop_reason: Record<string, number>;
    top_stop_reasons: StopReasonEntry[];
    avg_duration_ms: number | null;
    durations_ms: DurationPercentiles;
  };
  orchestrations: {
    total: number;
    complete: number;
    stopped: number;
    failed: number;
    running: number;
    success_rate: number;
    by_collision_policy: Record<string, number>;
    top_stop_reasons: StopReasonEntry[];
    durations_ms: DurationPercentiles;
  };
  collisions: {
    total: number;
    by_stage: Record<string, number>;
  };
  workers: {
    total_calls: number;
    claude: number;
    codex: number;
  };
  auto_resume: {
    total_attempts: number;
    successful_recoveries: number;
  };
  milestones: {
    total_completed: number;
    avg_per_run: number;
  };
}

/**
 * Parse a run ID to get its timestamp.
 * Run IDs are in format YYYYMMDDHHmmss.
 */
function parseRunTimestamp(runId: string): Date | null {
  const match = runId.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  );
}

/**
 * Parse an orchestrator ID to get its timestamp.
 * Orchestrator IDs are in format orch-YYYYMMDD-HHmmss-XXX.
 */
function parseOrchTimestamp(orchId: string): Date | null {
  const match = orchId.match(/^orch-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  return new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(minute, 10),
    parseInt(second, 10)
  );
}

/**
 * Compute percentiles from a sorted array of numbers.
 */
function computePercentiles(sortedDurations: number[]): DurationPercentiles {
  if (sortedDurations.length === 0) {
    return { p50: null, p90: null, max: null };
  }

  const p50Index = Math.floor(sortedDurations.length * 0.5);
  const p90Index = Math.floor(sortedDurations.length * 0.9);

  return {
    p50: Math.round(sortedDurations[p50Index]),
    p90: Math.round(sortedDurations[p90Index]),
    max: Math.round(sortedDurations[sortedDurations.length - 1])
  };
}

/**
 * Get top N stop reasons sorted by count descending.
 */
function getTopStopReasons(byStopReason: Record<string, number>, limit: number = 5): StopReasonEntry[] {
  return Object.entries(byStopReason)
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Collect metrics from all runs and orchestrations.
 */
export function collectMetrics(repoPath: string, days: number = 30, windowLimit?: number): AggregatedMetrics {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const runsRoot = getRunsRoot(repoPath);
  const orchRoot = getOrchestrationsRoot(repoPath);
  const agentPaths = getAgentPaths(repoPath);

  // Track filtering
  let runsFilteredOut = 0;
  let orchsFilteredOut = 0;

  // Track durations for percentile calculation
  const runDurations: number[] = [];
  const orchDurations: number[] = [];

  // Track orchestration stop reasons
  const orchByStopReason: Record<string, number> = {};

  // Track collisions
  let totalCollisions = 0;
  const collisionsByStage: Record<string, number> = {};

  // Initialize counters
  const metrics: AggregatedMetrics = {
    schema_version: 1,
    agent_version: AGENT_VERSION,
    repo_root: path.resolve(repoPath),
    collected_at: now.toISOString(),
    period: {
      days,
      from: cutoffDate.toISOString(),
      to: now.toISOString(),
      runs_considered: 0,
      runs_filtered_out: 0,
      window: windowLimit ?? null
    },
    paths: agentPaths,
    runs: {
      total: 0,
      complete: 0,
      stopped: 0,
      running: 0,
      success_rate: 0,
      by_stop_reason: {},
      top_stop_reasons: [],
      avg_duration_ms: null,
      durations_ms: { p50: null, p90: null, max: null }
    },
    orchestrations: {
      total: 0,
      complete: 0,
      stopped: 0,
      failed: 0,
      running: 0,
      success_rate: 0,
      by_collision_policy: {},
      top_stop_reasons: [],
      durations_ms: { p50: null, p90: null, max: null }
    },
    collisions: {
      total: 0,
      by_stage: {}
    },
    workers: {
      total_calls: 0,
      claude: 0,
      codex: 0
    },
    auto_resume: {
      total_attempts: 0,
      successful_recoveries: 0
    },
    milestones: {
      total_completed: 0,
      avg_per_run: 0
    }
  };

  let totalDurationMs = 0;
  let durationCount = 0;
  let oldestRun: Date | null = null;

  // Collect run metrics (fast path: only read state.json, not timeline)
  if (fs.existsSync(runsRoot)) {
    // Get all run directories with their timestamps
    const runDirs = fs.readdirSync(runsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name, timestamp: parseRunTimestamp(d.name) }))
      .filter(r => r.timestamp !== null) as { name: string; timestamp: Date }[];

    // Sort by timestamp descending (newest first) for window limiting
    runDirs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply window limit (default 50 for runs)
    const runWindowLimit = windowLimit ?? 50;
    let runCount = 0;

    for (const { name: runId, timestamp } of runDirs) {
      // Filter by date cutoff
      if (timestamp < cutoffDate) {
        runsFilteredOut++;
        continue;
      }

      // Apply window limit
      if (runCount >= runWindowLimit) {
        runsFilteredOut++;
        continue;
      }
      runCount++;

      if (!oldestRun || timestamp < oldestRun) {
        oldestRun = timestamp;
      }

      const statePath = path.join(runsRoot, runId, 'state.json');
      if (!fs.existsSync(statePath)) continue;

      try {
        const state: RunState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        metrics.runs.total++;

        // Count by phase/outcome
        if (state.phase === 'STOPPED') {
          metrics.runs.stopped++;
          const reason = state.stop_reason ?? 'unknown';
          metrics.runs.by_stop_reason[reason] = (metrics.runs.by_stop_reason[reason] ?? 0) + 1;
        } else if (state.phase === 'FINALIZE') {
          metrics.runs.complete++;
        } else {
          metrics.runs.running++;
        }

        // Duration (use updated_at for ended runs)
        if (state.started_at && state.updated_at &&
            (state.phase === 'STOPPED' || state.phase === 'FINALIZE')) {
          const duration = new Date(state.updated_at).getTime() - new Date(state.started_at).getTime();
          if (duration > 0) {
            totalDurationMs += duration;
            durationCount++;
            runDurations.push(duration);
          }
        }

        // Auto-resume count
        if (state.auto_resume_count && state.auto_resume_count > 0) {
          metrics.auto_resume.total_attempts += state.auto_resume_count;
          // If completed after auto-resume, count as successful recovery
          if (state.phase === 'FINALIZE') {
            metrics.auto_resume.successful_recoveries++;
          }
        }

        // Milestones completed (milestone_index indicates progress)
        // If run is complete, all milestones are done; otherwise use milestone_index
        const milestonesComplete = state.phase === 'FINALIZE'
          ? state.milestones.length
          : state.milestone_index;
        metrics.milestones.total_completed += milestonesComplete;
      } catch {
        // Skip runs with invalid state
      }
    }
  }

  // Set period filtering counts
  metrics.period.runs_considered = metrics.runs.total;
  metrics.period.runs_filtered_out = runsFilteredOut;

  // Compute derived run metrics
  if (metrics.runs.total > 0) {
    // Use float with 1 decimal place for success_rate
    metrics.runs.success_rate = Math.round(
      (metrics.runs.complete / metrics.runs.total) * 1000
    ) / 10;
    metrics.milestones.avg_per_run = Math.round(
      (metrics.milestones.total_completed / metrics.runs.total) * 10
    ) / 10;
    // Top stop reasons
    metrics.runs.top_stop_reasons = getTopStopReasons(metrics.runs.by_stop_reason);
  }
  if (durationCount > 0) {
    metrics.runs.avg_duration_ms = Math.round(totalDurationMs / durationCount);
    // Duration percentiles
    runDurations.sort((a, b) => a - b);
    metrics.runs.durations_ms = computePercentiles(runDurations);
  }
  if (oldestRun) {
    metrics.period.from = oldestRun.toISOString();
  }

  // Collect orchestration metrics
  if (fs.existsSync(orchRoot)) {
    // Get all orchestration directories with their timestamps
    const orchDirs = fs.readdirSync(orchRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name, timestamp: parseOrchTimestamp(d.name) }))
      .filter(o => o.timestamp !== null) as { name: string; timestamp: Date }[];

    // Sort by timestamp descending (newest first) for window limiting
    orchDirs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply window limit (default 20 for orchestrations)
    const orchWindowLimit = windowLimit ? Math.ceil(windowLimit * 0.4) : 20;
    let orchCount = 0;

    for (const { name: orchId, timestamp } of orchDirs) {
      // Filter by date cutoff
      if (timestamp < cutoffDate) {
        orchsFilteredOut++;
        continue;
      }

      // Apply window limit
      if (orchCount >= orchWindowLimit) {
        orchsFilteredOut++;
        continue;
      }
      orchCount++;

      const statePath = path.join(orchRoot, orchId, 'state.json');
      if (!fs.existsSync(statePath)) continue;

      try {
        const state: OrchestratorState = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
        metrics.orchestrations.total++;

        // Count by status
        switch (state.status) {
          case 'complete':
            metrics.orchestrations.complete++;
            break;
          case 'stopped':
            metrics.orchestrations.stopped++;
            orchByStopReason['stopped'] = (orchByStopReason['stopped'] ?? 0) + 1;
            break;
          case 'failed':
            metrics.orchestrations.failed++;
            orchByStopReason['failed'] = (orchByStopReason['failed'] ?? 0) + 1;
            break;
          case 'running':
            metrics.orchestrations.running++;
            break;
        }

        // Count by collision policy
        const policy = state.policy?.collision_policy ?? state.collision_policy ?? 'serialize';
        metrics.orchestrations.by_collision_policy[policy] =
          (metrics.orchestrations.by_collision_policy[policy] ?? 0) + 1;

        // Duration (calculate from started_at to ended_at)
        if (state.started_at && state.ended_at &&
            (state.status === 'complete' || state.status === 'stopped' || state.status === 'failed')) {
          const duration = new Date(state.ended_at).getTime() - new Date(state.started_at).getTime();
          if (duration > 0) {
            orchDurations.push(duration);
          }
        }

        // Read summary.json for collision data if it exists
        const summaryPath = path.join(orchRoot, orchId, 'summary.json');
        if (fs.existsSync(summaryPath)) {
          try {
            const summary = JSON.parse(fs.readFileSync(summaryPath, 'utf-8'));
            if (summary.collisions && Array.isArray(summary.collisions)) {
              for (const collision of summary.collisions) {
                totalCollisions++;
                const stage = collision.stage ?? 'unknown';
                collisionsByStage[stage] = (collisionsByStage[stage] ?? 0) + 1;
              }
            }
          } catch {
            // Skip invalid summary
          }
        }
      } catch {
        // Skip orchestrations with invalid state
      }
    }
  }

  // Compute derived orchestration metrics
  if (metrics.orchestrations.total > 0) {
    // Use float with 1 decimal place for success_rate
    metrics.orchestrations.success_rate = Math.round(
      (metrics.orchestrations.complete / metrics.orchestrations.total) * 1000
    ) / 10;
    // Top stop reasons
    metrics.orchestrations.top_stop_reasons = getTopStopReasons(orchByStopReason);
  }

  // Duration percentiles for orchestrations
  if (orchDurations.length > 0) {
    orchDurations.sort((a, b) => a - b);
    metrics.orchestrations.durations_ms = computePercentiles(orchDurations);
  }

  // Collision stats
  metrics.collisions.total = totalCollisions;
  metrics.collisions.by_stage = collisionsByStage;

  return metrics;
}

/**
 * Format duration in human-readable form.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  return `${Math.round(ms / 60000)}m`;
}

/**
 * Format metrics for human-readable output.
 */
function formatMetrics(metrics: AggregatedMetrics): string {
  const lines: string[] = [];

  lines.push('='.repeat(60));
  lines.push('METRICS SUMMARY');
  lines.push('='.repeat(60));
  lines.push('');

  lines.push(`Agent: v${metrics.agent_version} (schema v${metrics.schema_version})`);
  lines.push(`Repo: ${metrics.repo_root}`);
  lines.push('');

  lines.push(`Period: ${metrics.period.days} days`);
  if (metrics.period.window) {
    lines.push(`Window: ${metrics.period.window} runs`);
  }
  lines.push(`From: ${metrics.period.from ?? 'N/A'}`);
  lines.push(`To: ${metrics.period.to}`);
  lines.push(`Runs considered: ${metrics.period.runs_considered} (${metrics.period.runs_filtered_out} filtered out)`);
  lines.push('');

  lines.push('RUNS');
  lines.push('-'.repeat(30));
  lines.push(`Total: ${metrics.runs.total}`);
  lines.push(`Complete: ${metrics.runs.complete}`);
  lines.push(`Stopped: ${metrics.runs.stopped}`);
  lines.push(`Running: ${metrics.runs.running}`);
  lines.push(`Success rate: ${metrics.runs.success_rate}%`);
  if (metrics.runs.avg_duration_ms !== null) {
    lines.push(`Avg duration: ${formatDuration(metrics.runs.avg_duration_ms)}`);
  }
  if (metrics.runs.durations_ms.p50 !== null) {
    lines.push(`Duration p50/p90/max: ${formatDuration(metrics.runs.durations_ms.p50)}/${formatDuration(metrics.runs.durations_ms.p90!)}/${formatDuration(metrics.runs.durations_ms.max!)}`);
  }
  lines.push('');

  if (metrics.runs.top_stop_reasons.length > 0) {
    lines.push('Top stop reasons:');
    for (const { reason, count } of metrics.runs.top_stop_reasons) {
      lines.push(`  ${reason}: ${count}`);
    }
    lines.push('');
  }

  lines.push('ORCHESTRATIONS');
  lines.push('-'.repeat(30));
  lines.push(`Total: ${metrics.orchestrations.total}`);
  lines.push(`Complete: ${metrics.orchestrations.complete}`);
  lines.push(`Stopped: ${metrics.orchestrations.stopped}`);
  lines.push(`Failed: ${metrics.orchestrations.failed}`);
  lines.push(`Running: ${metrics.orchestrations.running}`);
  lines.push(`Success rate: ${metrics.orchestrations.success_rate}%`);
  if (metrics.orchestrations.durations_ms.p50 !== null) {
    lines.push(`Duration p50/p90/max: ${formatDuration(metrics.orchestrations.durations_ms.p50)}/${formatDuration(metrics.orchestrations.durations_ms.p90!)}/${formatDuration(metrics.orchestrations.durations_ms.max!)}`);
  }
  lines.push('');

  if (Object.keys(metrics.orchestrations.by_collision_policy).length > 0) {
    lines.push('By collision policy:');
    for (const [policy, count] of Object.entries(metrics.orchestrations.by_collision_policy)) {
      lines.push(`  ${policy}: ${count}`);
    }
    lines.push('');
  }

  if (metrics.collisions.total > 0) {
    lines.push('COLLISIONS');
    lines.push('-'.repeat(30));
    lines.push(`Total: ${metrics.collisions.total}`);
    for (const [stage, count] of Object.entries(metrics.collisions.by_stage)) {
      lines.push(`  ${stage}: ${count}`);
    }
    lines.push('');
  }

  lines.push('MILESTONES');
  lines.push('-'.repeat(30));
  lines.push(`Total completed: ${metrics.milestones.total_completed}`);
  lines.push(`Avg per run: ${metrics.milestones.avg_per_run}`);
  lines.push('');

  if (metrics.auto_resume.total_attempts > 0) {
    lines.push('AUTO-RESUME');
    lines.push('-'.repeat(30));
    lines.push(`Total attempts: ${metrics.auto_resume.total_attempts}`);
    lines.push(`Successful recoveries: ${metrics.auto_resume.successful_recoveries}`);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Run the metrics command.
 */
export async function metricsCommand(options: MetricsOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const days = options.days ?? 30;
  const windowLimit = options.window;

  const metrics = collectMetrics(repoPath, days, windowLimit);

  if (options.json) {
    console.log(JSON.stringify(metrics, null, 2));
  } else {
    console.log(formatMetrics(metrics));
  }
}
