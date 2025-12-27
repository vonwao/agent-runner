/**
 * Metrics aggregation command.
 *
 * Collects and aggregates metrics across all runs and orchestrations.
 * Designed for fast collection with O(n) file reads.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getRunsRoot, getOrchestrationsRoot } from '../store/runs-root.js';
import { RunState } from '../types/schemas.js';
import { OrchestratorState } from '../orchestrator/types.js';

export interface MetricsOptions {
  repo: string;
  json: boolean;
  days?: number;
}

/**
 * Aggregated metrics output.
 */
export interface AggregatedMetrics {
  version: 1;
  collected_at: string;
  period: {
    days: number;
    from: string | null;
    to: string;
  };
  runs: {
    total: number;
    complete: number;
    stopped: number;
    running: number;
    success_rate: number;
    by_stop_reason: Record<string, number>;
    avg_duration_ms: number | null;
  };
  orchestrations: {
    total: number;
    complete: number;
    stopped: number;
    failed: number;
    running: number;
    success_rate: number;
    by_collision_policy: Record<string, number>;
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
 * Collect metrics from all runs and orchestrations.
 */
export function collectMetrics(repoPath: string, days: number = 30): AggregatedMetrics {
  const now = new Date();
  const cutoffDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  const runsRoot = getRunsRoot(repoPath);
  const orchRoot = getOrchestrationsRoot(repoPath);

  // Initialize counters
  const metrics: AggregatedMetrics = {
    version: 1,
    collected_at: now.toISOString(),
    period: {
      days,
      from: cutoffDate.toISOString(),
      to: now.toISOString()
    },
    runs: {
      total: 0,
      complete: 0,
      stopped: 0,
      running: 0,
      success_rate: 0,
      by_stop_reason: {},
      avg_duration_ms: null
    },
    orchestrations: {
      total: 0,
      complete: 0,
      stopped: 0,
      failed: 0,
      running: 0,
      success_rate: 0,
      by_collision_policy: {}
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
    const runDirs = fs.readdirSync(runsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const runId of runDirs) {
      const timestamp = parseRunTimestamp(runId);
      if (!timestamp || timestamp < cutoffDate) continue;

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

  // Compute derived run metrics
  if (metrics.runs.total > 0) {
    metrics.runs.success_rate = Math.round(
      (metrics.runs.complete / metrics.runs.total) * 100
    );
    metrics.milestones.avg_per_run = Math.round(
      (metrics.milestones.total_completed / metrics.runs.total) * 10
    ) / 10;
  }
  if (durationCount > 0) {
    metrics.runs.avg_duration_ms = Math.round(totalDurationMs / durationCount);
  }
  if (oldestRun) {
    metrics.period.from = oldestRun.toISOString();
  }

  // Collect orchestration metrics
  if (fs.existsSync(orchRoot)) {
    const orchDirs = fs.readdirSync(orchRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const orchId of orchDirs) {
      const timestamp = parseOrchTimestamp(orchId);
      if (!timestamp || timestamp < cutoffDate) continue;

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
            break;
          case 'failed':
            metrics.orchestrations.failed++;
            break;
          case 'running':
            metrics.orchestrations.running++;
            break;
        }

        // Count by collision policy
        const policy = state.policy?.collision_policy ?? state.collision_policy ?? 'serialize';
        metrics.orchestrations.by_collision_policy[policy] =
          (metrics.orchestrations.by_collision_policy[policy] ?? 0) + 1;
      } catch {
        // Skip orchestrations with invalid state
      }
    }
  }

  // Compute derived orchestration metrics
  if (metrics.orchestrations.total > 0) {
    metrics.orchestrations.success_rate = Math.round(
      (metrics.orchestrations.complete / metrics.orchestrations.total) * 100
    );
  }

  return metrics;
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

  lines.push(`Period: ${metrics.period.days} days`);
  lines.push(`From: ${metrics.period.from ?? 'N/A'}`);
  lines.push(`To: ${metrics.period.to}`);
  lines.push('');

  lines.push('RUNS');
  lines.push('-'.repeat(30));
  lines.push(`Total: ${metrics.runs.total}`);
  lines.push(`Complete: ${metrics.runs.complete}`);
  lines.push(`Stopped: ${metrics.runs.stopped}`);
  lines.push(`Running: ${metrics.runs.running}`);
  lines.push(`Success rate: ${metrics.runs.success_rate}%`);
  if (metrics.runs.avg_duration_ms !== null) {
    lines.push(`Avg duration: ${Math.round(metrics.runs.avg_duration_ms / 1000)}s`);
  }
  lines.push('');

  if (Object.keys(metrics.runs.by_stop_reason).length > 0) {
    lines.push('Stop reasons:');
    for (const [reason, count] of Object.entries(metrics.runs.by_stop_reason)) {
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
  lines.push('');

  if (Object.keys(metrics.orchestrations.by_collision_policy).length > 0) {
    lines.push('By collision policy:');
    for (const [policy, count] of Object.entries(metrics.orchestrations.by_collision_policy)) {
      lines.push(`  ${policy}: ${count}`);
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

  const metrics = collectMetrics(repoPath, days);

  if (options.json) {
    console.log(JSON.stringify(metrics, null, 2));
  } else {
    console.log(formatMetrics(metrics));
  }
}
