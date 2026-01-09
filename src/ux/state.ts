/**
 * Repo state resolution for the UX layer.
 *
 * This module gathers signals from the filesystem to determine the current
 * state of the repository: what's running, what's stopped, what orchestration
 * is in progress, etc.
 *
 * All functions here do I/O. The brain module is pure and consumes this data.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getRunsRoot, getRunrPaths } from '../store/runs-root.js';
import { findLatestRunId, listRecentRunIds } from '../store/run-utils.js';
import { getCurrentMode, WorkflowMode } from '../commands/mode.js';
import { findLatestOrchestrationId, loadOrchestratorState } from '../orchestrator/state-machine.js';
import { git } from '../repo/git.js';
import { getAllTaskStatuses, type TaskStatusEntry } from '../store/task-status.js';
import { loadTaskMetadata } from '../tasks/task-metadata.js';

/**
 * Minimal info about a run (for display).
 */
export interface RunInfo {
  runId: string;
  phase: string;
  stopReason: string | null;
  taskPath: string | null;
  startedAt: string | null;
  updatedAt: string | null;
}

/**
 * Info about a stopped run with diagnostics.
 */
export interface StoppedRunInfo extends RunInfo {
  stopReason: string;
  /** Path to stop.json if it exists */
  stopJsonPath: string | null;
  /** Path to stop_diagnostics.json if it exists */
  diagnosticsPath: string | null;
}

/**
 * Orchestration cursor info.
 */
export interface OrchCursor {
  orchestratorId: string;
  status: string;
  tracksTotal: number;
  tracksComplete: number;
  tracksStopped: number;
  configPath: string | null;
}

/**
 * Summary of task status for the UX layer.
 */
export interface TaskSummary {
  /** Total task count */
  total: number;
  /** Count by status */
  completed: number;
  stopped: number;
  inProgress: number;
  failed: number;
  pendingAutomated: number;
  pendingManual: number;
  /** Next suggested task (first pending with deps met, automated preferred) */
  nextTask: {
    path: string;
    type: 'automated' | 'manual' | 'hybrid';
    title: string;
  } | null;
  /** First stopped task (for action suggestion) */
  stoppedTask: {
    path: string;
    title: string;
    lastRunId: string | null;
  } | null;
  /** First pending manual task */
  pendingManualTask: {
    path: string;
    title: string;
  } | null;
}

/**
 * Complete repo state for the UX layer.
 */
export interface RepoState {
  /** Currently running run, if any */
  activeRun: RunInfo | null;
  /** Most recent run (any state) */
  latestRun: RunInfo | null;
  /** Most recent stopped run, if any */
  latestStopped: StoppedRunInfo | null;
  /** Orchestration in progress, if any */
  orchestration: OrchCursor | null;
  /** Task summary (if .runr/tasks/ exists) */
  taskSummary: TaskSummary | null;
  /** Working tree status */
  treeStatus: 'clean' | 'dirty';
  /** Current workflow mode */
  mode: WorkflowMode;
  /** Repo path used for resolution */
  repoPath: string;
}

/**
 * Read minimal run info from state.json.
 * Returns null if file doesn't exist or is unparseable.
 */
function readRunInfo(runDir: string, runId: string): RunInfo | null {
  const statePath = path.join(runDir, 'state.json');

  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statePath, 'utf-8');
    const state = JSON.parse(content);

    return {
      runId,
      phase: state.phase ?? 'unknown',
      stopReason: state.stop_reason ?? null,
      taskPath: null, // Could read from config.snapshot.json if needed
      startedAt: state.started_at ?? null,
      updatedAt: state.updated_at ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Read task path from config snapshot.
 */
function readTaskPath(runDir: string): string | null {
  const snapshotPath = path.join(runDir, 'config.snapshot.json');

  if (!fs.existsSync(snapshotPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(snapshotPath, 'utf-8');
    const snapshot = JSON.parse(content);
    return snapshot.task_path ?? snapshot.taskPath ?? null;
  } catch {
    return null;
  }
}

/**
 * Find the most recent stopped run.
 * Scans runs newest→oldest, returns first with phase=STOPPED.
 */
export function findLatestStoppedRun(repoPath: string): StoppedRunInfo | null {
  const runsRoot = getRunsRoot(repoPath);
  const runIds = listRecentRunIds(repoPath, 20); // Check last 20 runs

  for (const runId of runIds) {
    const runDir = path.join(runsRoot, runId);
    const info = readRunInfo(runDir, runId);

    if (info && info.phase === 'STOPPED' && info.stopReason) {
      // Check for stop.json
      const stopJsonPath = path.join(runDir, 'handoffs', 'stop.json');
      const diagnosticsPath = path.join(runDir, 'stop_diagnostics.json');

      return {
        ...info,
        stopReason: info.stopReason,
        taskPath: readTaskPath(runDir),
        stopJsonPath: fs.existsSync(stopJsonPath) ? stopJsonPath : null,
        diagnosticsPath: fs.existsSync(diagnosticsPath) ? diagnosticsPath : null,
      };
    }
  }

  return null;
}

/**
 * Find any currently running run.
 * A run is "running" if phase is not STOPPED.
 */
export function findActiveRun(repoPath: string): RunInfo | null {
  const runsRoot = getRunsRoot(repoPath);
  const runIds = listRecentRunIds(repoPath, 10); // Check last 10 runs

  for (const runId of runIds) {
    const runDir = path.join(runsRoot, runId);
    const info = readRunInfo(runDir, runId);

    if (info && info.phase !== 'STOPPED') {
      return {
        ...info,
        taskPath: readTaskPath(runDir),
      };
    }
  }

  return null;
}

/**
 * Get orchestration cursor if one exists and is not complete.
 */
export function getOrchestrationCursor(repoPath: string): OrchCursor | null {
  const orchId = findLatestOrchestrationId(repoPath);

  if (!orchId) {
    return null;
  }

  const state = loadOrchestratorState(orchId, repoPath);

  if (!state) {
    return null;
  }

  // Only return cursor if orchestration is still running or has stopped tasks
  if (state.status === 'complete') {
    return null;
  }

  const complete = state.tracks.filter(t => t.status === 'complete').length;
  const stopped = state.tracks.filter(t => t.status === 'stopped' || t.status === 'failed').length;

  return {
    orchestratorId: orchId,
    status: state.status,
    tracksTotal: state.tracks.length,
    tracksComplete: complete,
    tracksStopped: stopped,
    configPath: null, // Could be read from state if stored
  };
}

/**
 * Extract title from task markdown body.
 */
function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled';
}

/**
 * Get task summary for the UX layer.
 * Returns null if no .runr/tasks/ directory exists.
 */
export function getTaskSummary(repoPath: string): TaskSummary | null {
  const paths = getRunrPaths(repoPath);
  const tasksDir = path.join(paths.runr_root, 'tasks');

  if (!fs.existsSync(tasksDir)) {
    return null;
  }

  // Scan task files
  const taskFiles: string[] = [];
  function scan(dir: string, prefix: string = ''): void {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), relPath);
      } else if (entry.name.endsWith('.md')) {
        taskFiles.push(relPath);
      }
    }
  }
  scan(tasksDir);

  if (taskFiles.length === 0) {
    return null;
  }

  // Get all statuses
  const allStatuses = getAllTaskStatuses(repoPath);

  // Build summary
  const summary: TaskSummary = {
    total: taskFiles.length,
    completed: 0,
    stopped: 0,
    inProgress: 0,
    failed: 0,
    pendingAutomated: 0,
    pendingManual: 0,
    nextTask: null,
    stoppedTask: null,
    pendingManualTask: null,
  };

  // First pass: count and find candidates
  const candidates: Array<{
    path: string;
    type: 'automated' | 'manual' | 'hybrid';
    title: string;
    depsComplete: boolean;
  }> = [];

  for (const taskFile of taskFiles.sort()) {
    const taskPath = `.runr/tasks/${taskFile}`;
    const absolutePath = path.join(tasksDir, taskFile);

    // Load metadata
    let metadata;
    try {
      metadata = loadTaskMetadata(absolutePath);
    } catch {
      continue;
    }

    const title = extractTitle(metadata.body);
    const statusEntry = allStatuses[taskPath];
    const status = statusEntry?.status ?? 'pending';

    // Count by status
    switch (status) {
      case 'completed':
        summary.completed++;
        break;
      case 'stopped':
        summary.stopped++;
        if (!summary.stoppedTask) {
          summary.stoppedTask = {
            path: taskPath,
            title,
            lastRunId: statusEntry?.last_run_id ?? null,
          };
        }
        break;
      case 'in_progress':
        summary.inProgress++;
        break;
      case 'failed':
        summary.failed++;
        break;
      case 'pending':
        if (metadata.type === 'manual') {
          summary.pendingManual++;
          if (!summary.pendingManualTask) {
            summary.pendingManualTask = { path: taskPath, title };
          }
        } else {
          summary.pendingAutomated++;
        }
        // Check deps for next task candidate
        let depsComplete = true;
        for (const dep of metadata.depends_on) {
          const depStatus = allStatuses[dep];
          if (!depStatus || depStatus.status !== 'completed') {
            depsComplete = false;
            break;
          }
        }
        candidates.push({
          path: taskPath,
          type: metadata.type,
          title,
          depsComplete,
        });
        break;
    }
  }

  // Find next task: prefer automated with deps complete
  const automatedReady = candidates.find(c => c.type === 'automated' && c.depsComplete);
  const hybridReady = candidates.find(c => c.type === 'hybrid' && c.depsComplete);
  const anyReady = candidates.find(c => c.depsComplete);

  const next = automatedReady ?? hybridReady ?? anyReady;
  if (next) {
    summary.nextTask = {
      path: next.path,
      type: next.type,
      title: next.title,
    };
  }

  return summary;
}

/**
 * Check if working tree is clean.
 */
export async function getTreeStatus(repoPath: string): Promise<'clean' | 'dirty'> {
  try {
    const result = await git(['status', '--porcelain'], repoPath);
    const lines = result.stdout.trim().split('\n').filter(l => l.trim());
    return lines.length === 0 ? 'clean' : 'dirty';
  } catch {
    // If git fails, assume clean (conservative)
    return 'clean';
  }
}

/**
 * Resolve complete repo state.
 * This is the main entry point for the UX layer.
 */
export async function resolveRepoState(repoPath: string = process.cwd()): Promise<RepoState> {
  // Find active run first (takes priority)
  const activeRun = findActiveRun(repoPath);

  // Find latest run (any state)
  const latestRunId = findLatestRunId(repoPath);
  let latestRun: RunInfo | null = null;
  if (latestRunId) {
    const runDir = path.join(getRunsRoot(repoPath), latestRunId);
    latestRun = readRunInfo(runDir, latestRunId);
    if (latestRun) {
      latestRun.taskPath = readTaskPath(runDir);
    }
  }

  // Find latest stopped run (for continue)
  const latestStopped = findLatestStoppedRun(repoPath);

  // Get orchestration cursor
  const orchestration = getOrchestrationCursor(repoPath);

  // Get task summary
  const taskSummary = getTaskSummary(repoPath);

  // Get tree status
  const treeStatus = await getTreeStatus(repoPath);

  // Get workflow mode
  const mode = getCurrentMode(repoPath);

  return {
    activeRun,
    latestRun,
    latestStopped,
    orchestration,
    taskSummary,
    treeStatus,
    mode,
    repoPath,
  };
}

/**
 * Derive display status from repo state.
 */
export function deriveDisplayStatus(state: RepoState): 'running' | 'stopped' | 'orch_ready' | 'clean' {
  if (state.activeRun) {
    return 'running';
  }
  if (state.latestStopped) {
    return 'stopped';
  }
  if (state.orchestration && state.orchestration.status !== 'complete') {
    return 'orch_ready';
  }
  return 'clean';
}
