/**
 * Task Status Store
 *
 * Tracks task execution status in .runr/task-status.json (gitignored).
 * This provides visibility into which tasks have been run and their outcomes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { getRunrPaths } from './runs-root.js';

/**
 * Task status enum.
 * - pending: Task exists but has never been run
 * - in_progress: Task is currently running
 * - stopped: Task run stopped (recoverable - verification failed, timeout, etc.)
 * - completed: Task run succeeded with verified checkpoint
 * - failed: Task run failed with hard error
 */
export type TaskStatus = 'pending' | 'in_progress' | 'stopped' | 'completed' | 'failed';

/**
 * Status entry for a single task.
 */
export interface TaskStatusEntry {
  /** Current status */
  status: TaskStatus;
  /** First time this task was seen */
  first_seen_at: string;
  /** Last time status was updated */
  last_updated_at: string;
  /** ID of the last run that touched this task */
  last_run_id: string | null;
  /** Checkpoint SHA (only for completed) */
  last_checkpoint_sha: string | null;
  /** Error summary (only for stopped/failed) */
  last_error_summary: string | null;
  /** Stop reason (only for stopped) */
  last_stop_reason: string | null;
}

/**
 * Full task status file schema.
 */
export interface TaskStatusFile {
  schema_version: 1;
  tasks: Record<string, TaskStatusEntry>;
}

/**
 * Get the path to task-status.json for a repository.
 */
export function getTaskStatusPath(repoPath: string): string {
  const paths = getRunrPaths(repoPath);
  return path.join(paths.runr_root, 'task-status.json');
}

/**
 * Load task status file, returning empty structure if not exists.
 */
export function loadTaskStatus(repoPath: string): TaskStatusFile {
  const statusPath = getTaskStatusPath(repoPath);

  if (!fs.existsSync(statusPath)) {
    return { schema_version: 1, tasks: {} };
  }

  try {
    const content = fs.readFileSync(statusPath, 'utf-8');
    const parsed = JSON.parse(content);

    // Validate schema version
    if (parsed.schema_version !== 1) {
      console.warn(`Unknown task-status.json schema version: ${parsed.schema_version}`);
    }

    return parsed as TaskStatusFile;
  } catch (err) {
    console.warn(`Failed to load task-status.json: ${err}`);
    return { schema_version: 1, tasks: {} };
  }
}

/**
 * Save task status file.
 */
export function saveTaskStatus(repoPath: string, status: TaskStatusFile): void {
  const statusPath = getTaskStatusPath(repoPath);
  const dir = path.dirname(statusPath);

  // Ensure directory exists
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2) + '\n');
}

/**
 * Get or create a task status entry.
 */
function getOrCreateEntry(status: TaskStatusFile, taskPath: string): TaskStatusEntry {
  if (!status.tasks[taskPath]) {
    status.tasks[taskPath] = {
      status: 'pending',
      first_seen_at: new Date().toISOString(),
      last_updated_at: new Date().toISOString(),
      last_run_id: null,
      last_checkpoint_sha: null,
      last_error_summary: null,
      last_stop_reason: null,
    };
  }
  return status.tasks[taskPath];
}

/**
 * Update task status when a run starts.
 */
export function markTaskInProgress(repoPath: string, taskPath: string, runId: string): void {
  const status = loadTaskStatus(repoPath);
  const entry = getOrCreateEntry(status, taskPath);

  entry.status = 'in_progress';
  entry.last_updated_at = new Date().toISOString();
  entry.last_run_id = runId;
  entry.last_error_summary = null;
  entry.last_stop_reason = null;

  saveTaskStatus(repoPath, status);
}

/**
 * Update task status when a run stops (recoverable).
 */
export function markTaskStopped(
  repoPath: string,
  taskPath: string,
  runId: string,
  stopReason: string,
  errorSummary?: string
): void {
  const status = loadTaskStatus(repoPath);
  const entry = getOrCreateEntry(status, taskPath);

  entry.status = 'stopped';
  entry.last_updated_at = new Date().toISOString();
  entry.last_run_id = runId;
  entry.last_stop_reason = stopReason;
  entry.last_error_summary = errorSummary || null;
  entry.last_checkpoint_sha = null;

  saveTaskStatus(repoPath, status);
}

/**
 * Update task status when a run completes successfully with checkpoint.
 */
export function markTaskCompleted(
  repoPath: string,
  taskPath: string,
  runId: string,
  checkpointSha: string
): void {
  const status = loadTaskStatus(repoPath);
  const entry = getOrCreateEntry(status, taskPath);

  entry.status = 'completed';
  entry.last_updated_at = new Date().toISOString();
  entry.last_run_id = runId;
  entry.last_checkpoint_sha = checkpointSha;
  entry.last_error_summary = null;
  entry.last_stop_reason = null;

  saveTaskStatus(repoPath, status);
}

/**
 * Update task status when a run fails with hard error.
 */
export function markTaskFailed(
  repoPath: string,
  taskPath: string,
  runId: string,
  errorSummary: string
): void {
  const status = loadTaskStatus(repoPath);
  const entry = getOrCreateEntry(status, taskPath);

  entry.status = 'failed';
  entry.last_updated_at = new Date().toISOString();
  entry.last_run_id = runId;
  entry.last_error_summary = errorSummary;
  entry.last_stop_reason = null;
  entry.last_checkpoint_sha = null;

  saveTaskStatus(repoPath, status);
}

/**
 * Get status for a specific task.
 */
export function getTaskStatus(repoPath: string, taskPath: string): TaskStatusEntry | null {
  const status = loadTaskStatus(repoPath);
  return status.tasks[taskPath] || null;
}

/**
 * Check if a task is completed.
 */
export function isTaskCompleted(repoPath: string, taskPath: string): boolean {
  const entry = getTaskStatus(repoPath, taskPath);
  return entry?.status === 'completed';
}

/**
 * Get all task statuses.
 */
export function getAllTaskStatuses(repoPath: string): Record<string, TaskStatusEntry> {
  const status = loadTaskStatus(repoPath);
  return status.tasks;
}

/**
 * Manually mark a task as completed (for manual tasks).
 * Does not require a run_id or checkpoint_sha.
 */
export function markTaskManuallyCompleted(repoPath: string, taskPath: string): void {
  const status = loadTaskStatus(repoPath);
  const entry = getOrCreateEntry(status, taskPath);

  entry.status = 'completed';
  entry.last_updated_at = new Date().toISOString();
  entry.last_run_id = 'manual';
  entry.last_checkpoint_sha = null;
  entry.last_error_summary = null;
  entry.last_stop_reason = null;

  saveTaskStatus(repoPath, status);
}
