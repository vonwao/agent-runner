import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { RunState } from '../types/schemas.js';

export interface ReportOptions {
  runId: string;
  tail: number;
}

interface TimelineScanResult {
  runStarted?: Record<string, unknown>;
  tailEvents: Array<Record<string, unknown>>;
}

export async function reportCommand(options: ReportOptions): Promise<void> {
  const runDir = path.resolve('runs', options.runId);
  if (!fs.existsSync(runDir)) {
    throw new Error(`${missingRunMessage(runDir)}`);
  }

  const statePath = path.join(runDir, 'state.json');
  if (!fs.existsSync(statePath)) {
    throw new Error(`State not found: ${statePath}`);
  }
  const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as RunState;

  const timelinePath = path.join(runDir, 'timeline.jsonl');
  const scan = fs.existsSync(timelinePath)
    ? await scanTimeline(timelinePath, options.tail)
    : { tailEvents: [] };

  const flags = readFlags(scan.runStarted);
  const header = [
    'Run',
    `run_id: ${options.runId}`,
    `repo: ${state.repo_path}`,
    `run_dir: ${runDir}`,
    `current_phase: ${state.phase}`,
    `milestone_index: ${state.milestone_index}`,
    `phase_attempt: ${state.phase_attempt ?? 0}`,
    `last_error: ${state.last_error ?? 'none'}`,
    `dry_run: ${flags.dry_run ?? 'unknown'}`,
    `no_branch: ${flags.no_branch ?? 'unknown'}`,
    `allow_dirty: ${flags.allow_dirty ?? 'unknown'}`,
    `allow_deps: ${flags.allow_deps ?? 'unknown'}`
  ].join('\n');

  const events = formatEvents(scan.tailEvents);
  const pointers = formatPointers({
    statePath,
    timelinePath,
    runDir,
    checkpoint: state.checkpoint_commit_sha
  });

  console.log([header, '', 'Last events', events, '', 'Pointers', pointers].join('\n'));
}

function missingRunMessage(runDir: string): string {
  const runsRoot = path.dirname(runDir);
  if (!fs.existsSync(runsRoot)) {
    return `Run not found: ${runDir}. Known runs: none.`;
  }
  const candidates = fs
    .readdirSync(runsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse()
    .slice(0, 5);
  const hint = candidates.length ? candidates.join(', ') : 'none';
  return `Run not found: ${runDir}. Known runs: ${hint}.`;
}

function readFlags(runStarted?: Record<string, unknown>): {
  dry_run?: boolean;
  no_branch?: boolean;
  allow_dirty?: boolean;
  allow_deps?: boolean;
} {
  if (!runStarted?.payload || typeof runStarted.payload !== 'object') {
    return {};
  }
  const payload = runStarted.payload as Record<string, unknown>;
  return {
    dry_run: payload.dry_run as boolean | undefined,
    no_branch: payload.no_branch as boolean | undefined,
    allow_dirty: payload.allow_dirty as boolean | undefined,
    allow_deps: payload.allow_deps as boolean | undefined
  };
}

async function scanTimeline(
  timelinePath: string,
  tailCount: number
): Promise<TimelineScanResult> {
  const tailEvents: Array<Record<string, unknown>> = [];
  let runStarted: Record<string, unknown> | undefined;

  const stream = fs.createReadStream(timelinePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      if (!runStarted && event.type === 'run_started') {
        runStarted = event;
      }
      tailEvents.push(event);
      if (tailEvents.length > tailCount) {
        tailEvents.shift();
      }
    } catch {
      continue;
    }
  }

  return { runStarted, tailEvents };
}

function formatEvents(events: Array<Record<string, unknown>>): string {
  if (events.length === 0) {
    return '(no events)';
  }
  const lines = events.map((event) => {
    const seq = event.seq ?? '?';
    const ts = event.timestamp ?? '?';
    const type = event.type ?? 'unknown';
    const source = event.source ?? 'unknown';
    const summary = summarizeEvent(event);
    return `${seq} ${ts} ${type} ${source} ${summary}`.trim();
  });
  return lines.join('\n');
}

function summarizeEvent(event: Record<string, unknown>): string {
  const payload =
    event.payload && typeof event.payload === 'object'
      ? (event.payload as Record<string, unknown>)
      : {};

  if (event.type === 'phase_start' && payload.phase) {
    return `phase=${payload.phase}`;
  }

  if (event.type === 'verification' && payload.tier) {
    return `tier=${payload.tier} ok=${payload.ok}`;
  }

  if (event.type === 'verify_complete' && Array.isArray(payload.results)) {
    return `results=${payload.results.join('; ')}`;
  }

  if (event.type === 'guard_violation') {
    if (payload.guard && typeof payload.guard === 'object') {
      const guard = payload.guard as Record<string, unknown>;
      const reasons = Array.isArray(guard.reasons) ? guard.reasons.join(',') : '';
      return `guard=${reasons || 'violation'}`;
    }
    return 'guard_violation';
  }

  if (event.type === 'stop' && payload.reason) {
    return `reason=${payload.reason}`;
  }

  if (event.type === 'parse_failed') {
    const context = payload.parser_context ?? 'unknown';
    const retry = payload.retry_count ?? 0;
    const snippet = payload.output_snippet ? clip(String(payload.output_snippet), 120) : '';
    return `context=${context} retry=${retry} ${snippet ? `snippet="${snippet}"` : ''}`.trim();
  }

  if (event.type === 'run_started') {
    const flags = [
      `dry_run=${payload.dry_run}`,
      `no_branch=${payload.no_branch}`,
      `allow_dirty=${payload.allow_dirty}`,
      `allow_deps=${payload.allow_deps}`
    ].join(' ');
    return flags;
  }

  if (event.type === 'run_resumed') {
    return `max_ticks=${payload.max_ticks ?? '?'} time=${payload.time ?? '?'}`;
  }

  const keys = Object.keys(payload);
  if (keys.length) {
    return `keys=${keys.slice(0, 4).join(',')}`;
  }

  return '';
}

function formatPointers(input: {
  statePath: string;
  timelinePath: string;
  runDir: string;
  checkpoint?: string;
}): string {
  const artifactsDir = path.join(input.runDir, 'artifacts');
  const lastVerifyLog = findLatestVerifyLog(artifactsDir);
  const lines = [
    `state: ${input.statePath}`,
    `timeline: ${input.timelinePath}`,
    `last_verification_log: ${lastVerifyLog ?? 'none'}`,
    `checkpoint_sha: ${input.checkpoint ?? 'none'}`
  ];
  return lines.join('\n');
}

function findLatestVerifyLog(artifactsDir: string): string | null {
  if (!fs.existsSync(artifactsDir)) {
    return null;
  }
  const logs = fs
    .readdirSync(artifactsDir)
    .filter((file) => file.startsWith('tests_') && file.endsWith('.log'))
    .map((file) => path.join(artifactsDir, file));
  if (logs.length === 0) {
    return null;
  }
  const withTimes = logs
    .map((file) => ({ file, mtime: fs.statSync(file).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  return withTimes[0]?.file ?? null;
}

function clip(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}...`;
}
