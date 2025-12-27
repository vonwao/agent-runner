import fs from 'node:fs';
import path from 'node:path';
import { RunStore, WorkerCallInfo } from '../store/run-store.js';
import { getRunsRoot } from '../store/runs-root.js';
import { RunState } from '../types/schemas.js';

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
  updatedAt: Date;
}

/**
 * Get status of a single run.
 */
export async function statusCommand(options: StatusOptions): Promise<void> {
  const runStore = RunStore.init(options.runId, options.repo);
  const state = runStore.readState();
  console.log(JSON.stringify(state, null, 2));
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

      summaries.push({
        runId,
        status: isRunning ? 'running' : 'stopped',
        phase: state.phase,
        milestones: `${state.milestone_index + 1}/${state.milestones.length}`,
        age,
        stopReason: state.stop_reason ?? '-',
        autoResumeCount: state.auto_resume_count ?? 0,
        inFlight,
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
  const headers = ['RUN ID', 'STATUS', 'PHASE', 'PROGRESS', 'AGE', 'STOP REASON', 'RESUMES', 'IN-FLIGHT'];

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
        case 7: return s.inFlight;
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
      s.inFlight.padEnd(widths[7])
    ];
    console.log(row.join('  '));
  }

  // Print summary
  const running = summaries.filter(s => s.status === 'running').length;
  const stopped = summaries.filter(s => s.status === 'stopped').length;
  console.log('');
  console.log(`Total: ${summaries.length} runs (${running} running, ${stopped} stopped)`);
}
