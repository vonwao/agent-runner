import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { RunStore, WorkerCallInfo } from '../store/run-store.js';
import { getRunsRoot } from '../store/runs-root.js';
import { RunState } from '../types/schemas.js';
import { getActiveRuns, getCollisionRisk } from '../supervisor/collision.js';

export interface StatusOptions {
  runId: string;
  repo: string;
}

export interface StatusAllOptions {
  repo: string;
}

interface RunSummary {
  runId: string;
  status: 'running' | 'stopped';
  phase: string;
  milestones: string;
  age: string;
  stopReason: string;
  autoResumeCount: number;
  inFlight: string;
  collisionRisk: 'none' | 'allowlist' | 'collision' | '-';
  updatedAt: Date;
}

/**
 * Extract ignored changes summary from timeline events.
 * Returns null if no ignored changes found.
 */
function getIgnoredChangesSummary(
  runId: string,
  repo: string
): { count: number; sample: string[] } | null {
  const runsRoot = getRunsRoot(repo);
  const timelinePath = path.join(runsRoot, runId, 'timeline.jsonl');

  if (!fs.existsSync(timelinePath)) {
    return null;
  }

  try {
    const lines = fs.readFileSync(timelinePath, 'utf-8').split('\n').filter(l => l.trim());
    const ignoredEvents = lines
      .map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(e => e && e.type === 'ignored_changes');

    if (ignoredEvents.length === 0) {
      return null;
    }

    // Take the last ignored_changes event (most recent)
    const lastEvent = ignoredEvents[ignoredEvents.length - 1];
    const payload = lastEvent.payload as {
      ignored_count: number;
      ignored_sample: string[];
      ignore_check_status: 'ok' | 'failed';
    };

    if (payload.ignored_count === 0) {
      return null;
    }

    return {
      count: payload.ignored_count,
      sample: payload.ignored_sample
    };
  } catch {
    return null;
  }
}

/**
 * Get status of a single run.
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  const runStore = RunStore.init(options.runId, options.repo);
  const state = runStore.readState();
  console.log(JSON.stringify(state, null, 2));

  // Show ignored tool noise summary for trust/forensics
  const ignoredSummary = getIgnoredChangesSummary(options.runId, options.repo);
  if (ignoredSummary) {
    const { count, sample } = ignoredSummary;
    const samplePaths = sample.slice(0, 3).join(', ');
    console.log(`\nIgnored tool noise: ${count} file${count === 1 ? '' : 's'} (sample: ${samplePaths}${sample.length > 3 ? ', ...' : ''})`);
  }
}

/**
 * Get status of all runs in the repo.
 * Displays a table sorted by: running runs first (most recent), then stopped runs (most recent).
 */
export async function statusAllCommand(options: StatusAllOptions): Promise<void> {
  const runsRoot = getRunsRoot(options.repo);

  if (!fs.existsSync(runsRoot)) {
    console.log('No runs found.');
    return;
  }

  const runDirs = fs.readdirSync(runsRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  if (runDirs.length === 0) {
    console.log('No runs found.');
    return;
  }

  const summaries: RunSummary[] = [];

  // Pre-compute active runs for collision detection
  const allActiveRuns = getActiveRuns(options.repo);

  for (const runId of runDirs) {
    const statePath = path.join(runsRoot, runId, 'state.json');
    if (!fs.existsSync(statePath)) {
      continue;
    }

    try {
      const stateRaw = fs.readFileSync(statePath, 'utf-8');
      const state: RunState = JSON.parse(stateRaw);

      // Get last worker call info
      const workerCallPath = path.join(runsRoot, runId, 'last_worker_call.json');
      let workerCall: WorkerCallInfo | null = null;
      if (fs.existsSync(workerCallPath)) {
        try {
          workerCall = JSON.parse(fs.readFileSync(workerCallPath, 'utf-8'));
        } catch {
          // Ignore parse errors
        }
      }

      const isRunning = state.phase !== 'STOPPED';
      const updatedAt = state.updated_at ? new Date(state.updated_at) : new Date(0);
      const age = formatAge(updatedAt);

      // In-flight worker info
      let inFlight = '-';
      if (isRunning && workerCall) {
        const elapsed = Math.floor((Date.now() - new Date(workerCall.at).getTime()) / 1000);
        inFlight = `${workerCall.worker}/${workerCall.stage} (${elapsed}s)`;
      }

      // Compute collision risk with other active runs (excluding this run)
      // Only show risk for running runs; stopped runs show '-'
      let collisionRisk: 'none' | 'allowlist' | 'collision' | '-' = '-';
      if (isRunning) {
        collisionRisk = 'none';
        const otherActiveRuns = allActiveRuns.filter(r => r.runId !== runId);
        if (otherActiveRuns.length > 0) {
          // Extract files_expected from milestones
          const touchFiles: string[] = [];
          for (const milestone of state.milestones) {
            if (milestone.files_expected) {
              touchFiles.push(...milestone.files_expected);
            }
          }
          collisionRisk = getCollisionRisk(
            state.scope_lock?.allowlist ?? [],
            touchFiles,
            otherActiveRuns
          );
        }
      }

      summaries.push({
        runId,
        status: isRunning ? 'running' : 'stopped',
        phase: state.phase,
        milestones: `${state.milestone_index + 1}/${state.milestones.length}`,
        age,
        stopReason: state.stop_reason ?? '-',
        autoResumeCount: state.auto_resume_count ?? 0,
        inFlight,
        collisionRisk,
        updatedAt
      });
    } catch {
      // Skip runs with invalid state
    }
  }

  if (summaries.length === 0) {
    console.log('No valid runs found.');
    return;
  }

  // Sort: running first (most recent), then stopped (most recent)
  summaries.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'running' ? -1 : 1;
    }
    return b.updatedAt.getTime() - a.updatedAt.getTime();
  });

  // Print table
  printTable(summaries);
}

/**
 * Format age as human-readable string.
 */
function formatAge(date: Date): string {
  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) return 'future';

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Print formatted table of run summaries.
 */
function printTable(summaries: RunSummary[]): void {
  // Column headers
  const headers = ['RUN ID', 'STATUS', 'PHASE', 'PROGRESS', 'AGE', 'STOP REASON', 'RESUMES', 'RISK', 'IN-FLIGHT'];

  // Calculate column widths
  const widths = headers.map((h, i) => {
    const values = summaries.map(s => {
      switch (i) {
        case 0: return s.runId;
        case 1: return s.status;
        case 2: return s.phase;
        case 3: return s.milestones;
        case 4: return s.age;
        case 5: return s.stopReason;
        case 6: return String(s.autoResumeCount);
        case 7: return s.collisionRisk;
        case 8: return s.inFlight;
        default: return '';
      }
    });
    return Math.max(h.length, ...values.map(v => v.length));
  });

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(headerLine);
  console.log('-'.repeat(headerLine.length));

  // Print rows
  for (const s of summaries) {
    const row = [
      s.runId.padEnd(widths[0]),
      s.status.padEnd(widths[1]),
      s.phase.padEnd(widths[2]),
      s.milestones.padEnd(widths[3]),
      s.age.padEnd(widths[4]),
      s.stopReason.padEnd(widths[5]),
      String(s.autoResumeCount).padEnd(widths[6]),
      s.collisionRisk.padEnd(widths[7]),
      s.inFlight.padEnd(widths[8])
    ];
    console.log(row.join('  '));
  }

  // Print summary
  const running = summaries.filter(s => s.status === 'running').length;
  const stopped = summaries.filter(s => s.status === 'stopped').length;
  const allowlistRisk = summaries.filter(s => s.collisionRisk === 'allowlist').length;
  const collisionRisk = summaries.filter(s => s.collisionRisk === 'collision').length;
  console.log('');
  let summaryLine = `Total: ${summaries.length} runs (${running} running, ${stopped} stopped)`;
  if (allowlistRisk > 0 || collisionRisk > 0) {
    const riskParts: string[] = [];
    if (allowlistRisk > 0) riskParts.push(`${allowlistRisk} allowlist`);
    if (collisionRisk > 0) riskParts.push(`${collisionRisk} collision`);
    summaryLine += ` — risk: ${riskParts.join(', ')}`;
  }
  console.log(summaryLine);
}
