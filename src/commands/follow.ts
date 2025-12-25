import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';

export interface FollowOptions {
  runId: string;
}

interface TimelineEvent {
  type: string;
  source: string;
  payload: Record<string, unknown>;
  seq: number;
  timestamp: string;
}

interface RunState {
  phase: string;
  milestone_index: number;
  stop_reason?: string;
  last_progress_at?: string;
}

interface LastWorkerCall {
  worker: string;
  stage: string;
  at: string;
}

const TERMINAL_PHASES = ['STOPPED', 'DONE'];
const POLL_INTERVAL_MS = 1000;

/**
 * Find the best run to follow: prefer running runs, else latest.
 * Returns { runId, wasRunning } so caller can inform user.
 */
export function findBestRunToFollow(): { runId: string; wasRunning: boolean } | null {
  const runsDir = path.resolve('runs');
  if (!fs.existsSync(runsDir)) {
    return null;
  }

  const runIds = fs
    .readdirSync(runsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();

  if (runIds.length === 0) {
    return null;
  }

  // Check for a running run (newest first)
  for (const runId of runIds) {
    const statePath = path.join(runsDir, runId, 'state.json');
    if (!fs.existsSync(statePath)) continue;
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as RunState;
      if (!TERMINAL_PHASES.includes(state.phase)) {
        return { runId, wasRunning: true };
      }
    } catch {
      continue;
    }
  }

  // No running run, return latest
  return { runId: runIds[0], wasRunning: false };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h${remainingMinutes}m` : `${hours}h`;
}

function readLastWorkerCall(runDir: string): LastWorkerCall | null {
  const statePath = path.join(runDir, 'state.json');
  if (!fs.existsSync(statePath)) return null;
  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content) as Record<string, unknown>;
    if (state.last_worker_call && typeof state.last_worker_call === 'object') {
      return state.last_worker_call as LastWorkerCall;
    }
  } catch {
    // ignore
  }
  return null;
}

function formatEvent(event: TimelineEvent): string {
  const time = new Date(event.timestamp).toLocaleTimeString();
  const prefix = `[${time}] ${event.type}`;

  switch (event.type) {
    case 'run_started':
      return `${prefix} - task: ${event.payload.task}`;

    case 'preflight': {
      const pf = event.payload as {
        guard?: { ok: boolean };
        ping?: { ok: boolean; skipped: boolean };
      };
      const guardStatus = pf.guard?.ok ? 'pass' : 'FAIL';
      const pingStatus = pf.ping?.skipped ? 'skipped' : pf.ping?.ok ? 'pass' : 'FAIL';
      return `${prefix} - guard: ${guardStatus}, ping: ${pingStatus}`;
    }

    case 'phase_start':
      return `${prefix} → ${event.payload.phase}`;

    case 'plan_generated': {
      const plan = event.payload as { milestones?: unknown[] };
      const count = plan.milestones?.length ?? 0;
      return `${prefix} - ${count} milestones`;
    }

    case 'implement_complete': {
      const impl = event.payload as { changed_files?: string[] };
      const files = impl.changed_files?.length ?? 0;
      return `${prefix} - ${files} files changed`;
    }

    case 'review_complete': {
      const review = event.payload as { verdict?: string };
      return `${prefix} - verdict: ${review.verdict}`;
    }

    case 'tier_passed':
    case 'tier_failed': {
      const tier = event.payload as { tier?: string; passed?: number; failed?: number };
      return `${prefix} - ${tier.tier} (${tier.passed ?? 0} passed, ${tier.failed ?? 0} failed)`;
    }

    case 'worker_fallback': {
      const fb = event.payload as { from?: string; to?: string; reason?: string };
      return `${prefix} - ${fb.from} → ${fb.to} (${fb.reason})`;
    }

    case 'parse_failed': {
      const pf = event.payload as { stage?: string; retry_count?: number };
      return `${prefix} - stage: ${pf.stage}, retry: ${pf.retry_count}`;
    }

    case 'late_worker_result_ignored': {
      const late = event.payload as { stage?: string; worker?: string };
      return `${prefix} - ${late.stage} from ${late.worker}`;
    }

    case 'stop': {
      const stop = event.payload as {
        reason?: string;
        worker_in_flight?: boolean;
        elapsed_ms?: number;
      };
      const suffix = stop.worker_in_flight ? ' (worker was in-flight)' : '';
      return `${prefix} - reason: ${stop.reason}${suffix}`;
    }

    case 'run_complete': {
      const rc = event.payload as { outcome?: string };
      return `${prefix} - outcome: ${rc.outcome}`;
    }

    case 'milestone_complete':
      return `${prefix} - milestone ${event.payload.milestone_index}`;

    case 'stalled_timeout': {
      const st = event.payload as { elapsed_ms?: number };
      const sec = st.elapsed_ms ? Math.round(st.elapsed_ms / 1000) : '?';
      return `${prefix} - after ${sec}s`;
    }

    default:
      return prefix;
  }
}

async function tailTimeline(
  timelinePath: string,
  fromLine: number
): Promise<{ events: TimelineEvent[]; newLineCount: number }> {
  if (!fs.existsSync(timelinePath)) {
    return { events: [], newLineCount: 0 };
  }

  const events: TimelineEvent[] = [];
  const fileStream = fs.createReadStream(timelinePath);
  const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

  let lineNum = 0;
  for await (const line of rl) {
    lineNum++;
    if (lineNum <= fromLine) continue;
    if (!line.trim()) continue;

    try {
      const event = JSON.parse(line) as TimelineEvent;
      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  return { events, newLineCount: lineNum };
}

function readState(statePath: string): RunState | null {
  if (!fs.existsSync(statePath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(content) as RunState;
  } catch {
    return null;
  }
}

export async function followCommand(options: FollowOptions): Promise<void> {
  const runDir = path.resolve('runs', options.runId);

  if (!fs.existsSync(runDir)) {
    console.error(`Run directory not found: ${runDir}`);
    process.exitCode = 1;
    return;
  }

  const timelinePath = path.join(runDir, 'timeline.jsonl');
  const statePath = path.join(runDir, 'state.json');

  console.log(`Following run ${options.runId}...`);
  console.log('---');

  let lastLineCount = 0;
  let terminated = false;

  // Initial read of existing events
  const initial = await tailTimeline(timelinePath, 0);
  for (const event of initial.events) {
    console.log(formatEvent(event));
  }
  lastLineCount = initial.newLineCount;

  // Check if already terminated
  const initialState = readState(statePath);
  if (initialState && TERMINAL_PHASES.includes(initialState.phase)) {
    console.log('---');
    console.log(`Run already terminated: ${initialState.phase}`);
    if (initialState.stop_reason) {
      console.log(`Reason: ${initialState.stop_reason}`);
    }
    return;
  }

  // Poll for new events with progress age display
  let lastStatusLine = '';
  while (!terminated) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const update = await tailTimeline(timelinePath, lastLineCount);
    for (const event of update.events) {
      // Clear status line before printing event
      if (lastStatusLine) {
        process.stdout.write('\r' + ' '.repeat(lastStatusLine.length) + '\r');
        lastStatusLine = '';
      }
      console.log(formatEvent(event));
    }
    lastLineCount = update.newLineCount;

    // Check for termination
    const state = readState(statePath);
    if (state && TERMINAL_PHASES.includes(state.phase)) {
      terminated = true;
      if (lastStatusLine) {
        process.stdout.write('\r' + ' '.repeat(lastStatusLine.length) + '\r');
      }
      console.log('---');
      console.log(`Run terminated: ${state.phase}`);
      if (state.stop_reason) {
        console.log(`Reason: ${state.stop_reason}`);
      }
    } else if (state) {
      // Show progress age status line
      const progressAge = state.last_progress_at
        ? formatDuration(Date.now() - new Date(state.last_progress_at).getTime())
        : '?';
      const workerCall = readLastWorkerCall(runDir);
      const workerStatus = workerCall
        ? `worker_in_flight=${workerCall.worker}:${workerCall.stage}`
        : 'idle';
      const statusLine = `  [${state.phase}] last progress ${progressAge} ago, ${workerStatus}`;

      // Only update if changed
      if (statusLine !== lastStatusLine) {
        if (lastStatusLine) {
          process.stdout.write('\r' + ' '.repeat(lastStatusLine.length) + '\r');
        }
        process.stdout.write(statusLine);
        lastStatusLine = statusLine;
      }
    }
  }
}
