/**
 * runr tasks - List and inspect tasks with status, dependencies, and type.
 *
 * Commands:
 *   runr tasks           - List all tasks with status
 *   runr tasks show <t>  - Show detailed task info
 */

import fs from 'node:fs';
import path from 'node:path';
import { getRunrPaths } from '../store/runs-root.js';
import { loadTaskStatus, getAllTaskStatuses, markTaskManuallyCompleted, type TaskStatusEntry, type TaskStatus } from '../store/task-status.js';
import { loadTaskMetadata, type TaskMetadata, type TaskType } from '../tasks/task-metadata.js';

export interface TaskInfo {
  /** Relative path from repo root */
  path: string;
  /** Absolute path */
  absolutePath: string;
  /** Task title (first # heading) */
  title: string;
  /** Task type */
  type: TaskType;
  /** Dependencies */
  depends_on: string[];
  /** Current status */
  status: TaskStatus;
  /** Status entry (if exists) */
  statusEntry: TaskStatusEntry | null;
  /** Whether all dependencies are met (completed) */
  depsComplete: boolean;
  /** Unmet dependencies */
  unmetDeps: string[];
}

export interface TasksOptions {
  repo: string;
  json?: boolean;
}

export interface TaskShowOptions {
  repo: string;
  task: string;
  json?: boolean;
}

export interface TaskMarkCompleteOptions {
  repo: string;
  task: string;
  json?: boolean;
}

/**
 * Extract title from task markdown body.
 */
function extractTitle(body: string): string {
  const match = body.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : 'Untitled';
}

/**
 * Scan for all task files in .runr/tasks/.
 */
function scanTaskFiles(repoPath: string): string[] {
  const paths = getRunrPaths(repoPath);
  const tasksDir = path.join(paths.runr_root, 'tasks');

  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  const files: string[] = [];

  function scan(dir: string, prefix: string = ''): void {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        scan(path.join(dir, entry.name), relPath);
      } else if (entry.name.endsWith('.md')) {
        files.push(relPath);
      }
    }
  }

  scan(tasksDir);
  return files.sort();
}

/**
 * Load full task info including status and deps check.
 */
function loadTaskInfo(repoPath: string, taskRelPath: string, allStatuses: Record<string, TaskStatusEntry>): TaskInfo {
  const paths = getRunrPaths(repoPath);
  const absolutePath = path.join(paths.runr_root, 'tasks', taskRelPath);
  const taskPath = `.runr/tasks/${taskRelPath}`;

  // Load metadata
  let metadata: TaskMetadata;
  try {
    metadata = loadTaskMetadata(absolutePath);
  } catch (err) {
    // Return minimal info if we can't parse
    return {
      path: taskPath,
      absolutePath,
      title: `Error: ${err instanceof Error ? err.message : String(err)}`,
      type: 'automated',
      depends_on: [],
      status: 'pending',
      statusEntry: null,
      depsComplete: true,
      unmetDeps: [],
    };
  }

  const title = extractTitle(metadata.body);
  const statusEntry = allStatuses[taskPath] || null;
  const status = statusEntry?.status || 'pending';

  // Check dependencies
  const unmetDeps: string[] = [];
  for (const dep of metadata.depends_on) {
    const depStatus = allStatuses[dep];
    if (!depStatus || depStatus.status !== 'completed') {
      unmetDeps.push(dep);
    }
  }

  return {
    path: taskPath,
    absolutePath,
    title,
    type: metadata.type,
    depends_on: metadata.depends_on,
    status,
    statusEntry,
    depsComplete: unmetDeps.length === 0,
    unmetDeps,
  };
}

/**
 * Format status with symbol.
 */
function formatStatus(status: TaskStatus): string {
  const symbols: Record<TaskStatus, string> = {
    pending: '\x1b[90m○\x1b[0m',     // dim circle
    in_progress: '\x1b[33m◐\x1b[0m', // yellow half
    stopped: '\x1b[31m◌\x1b[0m',     // red dotted
    completed: '\x1b[32m●\x1b[0m',   // green filled
    failed: '\x1b[31m✗\x1b[0m',      // red x
  };
  return symbols[status] || '?';
}

/**
 * Format task type.
 */
function formatType(type: TaskType): string {
  const colors: Record<TaskType, string> = {
    automated: '',
    manual: '\x1b[36m[manual]\x1b[0m ',
    hybrid: '\x1b[35m[hybrid]\x1b[0m ',
  };
  return colors[type] || '';
}

/**
 * Get sort priority for task status (lower = first).
 * Order: stopped, in_progress, failed, pending (automated), pending (manual), completed
 */
function getStatusPriority(task: TaskInfo): number {
  switch (task.status) {
    case 'stopped': return 0;
    case 'in_progress': return 1;
    case 'failed': return 2;
    case 'pending':
      // Automated/hybrid ready (deps met) before blocked/manual
      if (task.type !== 'manual' && task.depsComplete) return 3;
      if (task.type !== 'manual') return 4;  // deps unmet
      if (task.depsComplete) return 5;  // manual ready
      return 6;  // manual deps unmet
    case 'completed': return 7;
    default: return 8;
  }
}

/**
 * Format next command hint for a task.
 */
function formatNextHint(task: TaskInfo): string {
  switch (task.status) {
    case 'stopped':
      if (task.statusEntry?.last_run_id) {
        return `\x1b[90m→ runr continue\x1b[0m`;
      }
      return '';
    case 'in_progress':
      return `\x1b[90m→ runr report ${task.statusEntry?.last_run_id || 'latest'}\x1b[0m`;
    case 'failed':
      return `\x1b[90m→ runr report ${task.statusEntry?.last_run_id || 'latest'}\x1b[0m`;
    case 'pending':
      if (!task.depsComplete) {
        const firstUnmet = path.basename(task.unmetDeps[0] || '');
        return `\x1b[90m→ complete ${firstUnmet} first\x1b[0m`;
      }
      if (task.type === 'manual') {
        return `\x1b[90m→ runr run --task ... then mark-complete\x1b[0m`;
      }
      return `\x1b[90m→ runr run --task ${task.path}\x1b[0m`;
    case 'completed':
      return '';
    default:
      return '';
  }
}

/**
 * Main tasks list command.
 */
export async function tasksCommand(options: TasksOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const paths = getRunrPaths(repoPath);

  // Check if initialized
  if (!fs.existsSync(paths.runr_root)) {
    console.log('No .runr/ directory found. Run `runr init` first.');
    return;
  }

  // Scan task files
  const taskFiles = scanTaskFiles(repoPath);

  if (taskFiles.length === 0) {
    console.log('No tasks found in .runr/tasks/');
    return;
  }

  // Load all statuses
  const allStatuses = getAllTaskStatuses(repoPath);

  // Load all task info
  const tasks = taskFiles.map(f => loadTaskInfo(repoPath, f, allStatuses));

  if (options.json) {
    console.log(JSON.stringify(tasks, null, 2));
    return;
  }

  // Sort by priority: stopped, in_progress, failed, pending (ready), pending (blocked/manual), completed
  tasks.sort((a, b) => getStatusPriority(a) - getStatusPriority(b));

  // Print header
  console.log(`\n\x1b[1mTasks\x1b[0m\n`);

  // Count by status
  const counts = {
    completed: 0,
    in_progress: 0,
    stopped: 0,
    pending: 0,
    failed: 0,
  };

  for (const task of tasks) {
    counts[task.status]++;

    const symbol = formatStatus(task.status);
    const typeLabel = formatType(task.type);
    const filename = path.basename(task.path);

    // Deps indicator - more informative
    let depsIndicator = '';
    if (task.depends_on.length > 0) {
      const metCount = task.depends_on.length - task.unmetDeps.length;
      if (task.depsComplete) {
        depsIndicator = `\x1b[90m deps:${metCount}/${task.depends_on.length}\x1b[0m`;
      } else {
        const firstUnmet = path.basename(task.unmetDeps[0] || '');
        depsIndicator = `\x1b[33m deps:${metCount}/${task.depends_on.length} (${firstUnmet})\x1b[0m`;
      }
    }

    // Format line
    const parts = [symbol, typeLabel + filename];
    if (depsIndicator) parts.push(depsIndicator);

    console.log(`  ${parts.join(' ')}`);

    // Title + next hint on same line
    const hint = formatNextHint(task);
    if (hint) {
      console.log(`    \x1b[90m${task.title}\x1b[0m  ${hint}`);
    } else {
      console.log(`    \x1b[90m${task.title}\x1b[0m`);
    }
  }

  // Summary
  console.log('');
  const parts: string[] = [];
  if (counts.stopped > 0) parts.push(`\x1b[31m${counts.stopped} stopped\x1b[0m`);
  if (counts.in_progress > 0) parts.push(`\x1b[33m${counts.in_progress} in progress\x1b[0m`);
  if (counts.failed > 0) parts.push(`\x1b[31m${counts.failed} failed\x1b[0m`);
  if (counts.pending > 0) parts.push(`\x1b[90m${counts.pending} pending\x1b[0m`);
  if (counts.completed > 0) parts.push(`\x1b[32m${counts.completed} completed\x1b[0m`);

  console.log(`${tasks.length} tasks: ${parts.join(', ')}`);
  console.log('');
}

/**
 * Task show command - detailed view of a single task.
 */
export async function taskShowCommand(options: TaskShowOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const paths = getRunrPaths(repoPath);

  // Resolve task path
  let taskPath = options.task;

  // Handle relative paths
  if (!taskPath.startsWith('.runr/')) {
    taskPath = `.runr/tasks/${taskPath}`;
  }

  // Remove .runr/tasks/ prefix to get relative path for scanning
  const taskRelPath = taskPath.replace(/^\.runr\/tasks\//, '');
  const absolutePath = path.join(paths.runr_root, 'tasks', taskRelPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Task not found: ${absolutePath}`);
    process.exitCode = 1;
    return;
  }

  // Load all statuses and this task info
  const allStatuses = getAllTaskStatuses(repoPath);
  const task = loadTaskInfo(repoPath, taskRelPath, allStatuses);

  if (options.json) {
    console.log(JSON.stringify(task, null, 2));
    return;
  }

  // Print detailed view
  console.log('');
  console.log(`\x1b[1m${task.title}\x1b[0m`);
  console.log(`\x1b[90m${task.path}\x1b[0m`);
  console.log('');

  // Status line
  const statusLabel = task.status.toUpperCase();
  const statusColor = {
    pending: '\x1b[90m',
    in_progress: '\x1b[33m',
    stopped: '\x1b[31m',
    completed: '\x1b[32m',
    failed: '\x1b[31m',
  }[task.status];
  console.log(`Status:     ${statusColor}${statusLabel}\x1b[0m`);

  // Type
  console.log(`Type:       ${task.type}`);

  // Dependencies
  if (task.depends_on.length > 0) {
    console.log('');
    console.log('Dependencies:');
    for (const dep of task.depends_on) {
      const depStatus = allStatuses[dep];
      const isComplete = depStatus?.status === 'completed';
      const symbol = isComplete ? '\x1b[32m✓\x1b[0m' : '\x1b[33m○\x1b[0m';
      console.log(`  ${symbol} ${dep}`);
    }
    if (!task.depsComplete) {
      console.log(`\x1b[33m  ⚠ ${task.unmetDeps.length} dependencies not completed\x1b[0m`);
    }
  }

  // Last run info
  if (task.statusEntry) {
    console.log('');
    console.log('Last Run:');
    console.log(`  Run ID:   ${task.statusEntry.last_run_id || 'none'}`);
    console.log(`  Updated:  ${task.statusEntry.last_updated_at}`);
    if (task.statusEntry.last_checkpoint_sha) {
      console.log(`  Commit:   ${task.statusEntry.last_checkpoint_sha}`);
    }
    if (task.statusEntry.last_stop_reason) {
      console.log(`  Stopped:  ${task.statusEntry.last_stop_reason}`);
    }
    if (task.statusEntry.last_error_summary) {
      console.log(`  Error:    ${task.statusEntry.last_error_summary}`);
    }
  }

  console.log('');
}

/**
 * Mark a task as manually completed.
 */
export async function taskMarkCompleteCommand(options: TaskMarkCompleteOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const paths = getRunrPaths(repoPath);

  // Resolve task path
  let taskPath = options.task;

  // Handle relative paths
  if (!taskPath.startsWith('.runr/')) {
    // Could be just the filename or relative from tasks dir
    if (!taskPath.includes('/')) {
      taskPath = `.runr/tasks/${taskPath}`;
    } else {
      taskPath = `.runr/tasks/${taskPath}`;
    }
  }

  // Ensure .md extension
  if (!taskPath.endsWith('.md')) {
    taskPath += '.md';
  }

  const absolutePath = path.resolve(repoPath, taskPath);

  if (!fs.existsSync(absolutePath)) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'not_found', task_path: taskPath }));
    } else {
      console.error(`Task not found: ${taskPath}`);
    }
    process.exitCode = 1;
    return;
  }

  // Mark as completed
  markTaskManuallyCompleted(repoPath, taskPath);

  if (options.json) {
    console.log(JSON.stringify({
      status: 'marked_complete',
      task_path: taskPath,
    }));
  } else {
    console.log(`\x1b[32m✓\x1b[0m Marked \x1b[1m${taskPath}\x1b[0m as completed`);
  }
}
