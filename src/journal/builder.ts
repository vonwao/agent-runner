/**
 * Journal builder - extracts all data for journal.json
 *
 * Every extraction function is wrapped in try-catch and appends warnings
 * on failure. Never crashes - always produces partial journal.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import crypto from 'node:crypto';
import readline from 'node:readline';
import type { JournalJson, Checkpoint, VerificationEvent } from './types.js';
import { getErrorExcerpt } from './redactor.js';
import { getRunsRoot } from '../store/runs-root.js';

/**
 * Build complete journal from run data
 */
export async function buildJournal(runId: string, repo: string): Promise<JournalJson> {
  const warnings: string[] = [];
  const runDir = path.join(getRunsRoot(repo), runId);

  // Extract all sections (each wrapped in try-catch)
  const identity = await extractIdentity(runDir, warnings);
  const status = await extractStatus(runDir, warnings);
  const milestones = await extractMilestones(runDir, warnings);
  const checkpoints = await extractCheckpoints(runDir, identity.base_sha, warnings);
  const verification = await extractVerification(runDir, warnings);
  const changes = await extractChanges(runDir, identity.base_sha, checkpoints.last_sha, warnings);
  const nextAction = await extractNextAction(runDir, runId, status.stop_reason, warnings);
  const notes = await extractNotes(runDir);

  // Determine extraction methods
  const extraction: JournalJson['extraction'] = {
    checkpoints: checkpoints.created > 0 ? 'git_log_v1' : 'none',
    verification: verification.summary.attempts_total > 0 ? 'timeline_v1' : 'none',
    next_action: nextAction ? (fs.existsSync(path.join(runDir, 'handoffs/stop.json')) ? 'stop_json' : 'derived') : 'none'
  };

  return {
    schema_version: '1.0',
    generated_by: `runr@${getVersion()}`,
    generated_at: new Date().toISOString(),
    run_id: runId,
    repo_root: identity.repo_root,
    base_sha: identity.base_sha,
    head_sha: checkpoints.last_sha || identity.base_sha,
    task: identity.task,
    status,
    milestones,
    checkpoints,
    verification,
    changes,
    next_action: nextAction,
    notes,
    resumed_from: null, // v1: not implemented yet
    extraction,
    warnings
  };
}

function getVersion(): string {
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf-8'));
    return packageJson.version || '0.4.0';
  } catch {
    return '0.4.0';
  }
}

/**
 * Extract run identity (repo, SHAs, task)
 */
async function extractIdentity(
  runDir: string,
  warnings: string[]
): Promise<{
  repo_root: string;
  base_sha: string | null;
  task: JournalJson['task'];
}> {
  let repo_root = process.cwd();
  let base_sha: string | null = null;
  let task: JournalJson['task'] = {
    path: null,
    sha256: null,
    title: null,
    goal: null
  };

  // Read config.snapshot.json for repo_root and base_sha
  try {
    const configPath = path.join(runDir, 'config.snapshot.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (config._worktree?.original_repo_path) {
        repo_root = config._worktree.original_repo_path;
      }
      if (config._worktree?.base_sha) {
        base_sha = config._worktree.base_sha;
      }
    } else {
      warnings.push('config.snapshot.json not found');
    }
  } catch (err) {
    warnings.push(`Failed to read config.snapshot.json: ${(err as Error).message}`);
  }

  // Read task metadata
  try {
    const taskMetaPath = path.join(runDir, 'artifacts/task.meta.json');
    if (fs.existsSync(taskMetaPath)) {
      const taskMeta = JSON.parse(fs.readFileSync(taskMetaPath, 'utf-8'));
      task.path = taskMeta.task_path || null;
    }
  } catch (err) {
    warnings.push(`Failed to read task.meta.json: ${(err as Error).message}`);
  }

  // Read and hash task file
  try {
    const taskMdPath = path.join(runDir, 'artifacts/task.md');
    if (fs.existsSync(taskMdPath)) {
      const taskContent = fs.readFileSync(taskMdPath, 'utf-8');

      // Compute SHA256
      task.sha256 = crypto.createHash('sha256').update(taskContent).digest('hex');

      // Parse title (first H1)
      const titleMatch = taskContent.match(/^#\s+(.+)$/m);
      task.title = titleMatch ? titleMatch[1].trim() : null;

      // Parse goal (## Goal section)
      const goalMatch = taskContent.match(/##\s+Goal\s*\n([\s\S]+?)(?=\n##|\n$)/);
      task.goal = goalMatch ? goalMatch[1].trim() : null;
    }
  } catch (err) {
    warnings.push(`Failed to read/parse task.md: ${(err as Error).message}`);
  }

  return { repo_root, base_sha, task };
}

/**
 * Extract status (phase, stop_reason, timestamps, duration)
 */
async function extractStatus(
  runDir: string,
  warnings: string[]
): Promise<JournalJson['status']> {
  let phase = 'unknown';
  let terminal_state: JournalJson['status']['terminal_state'] = 'unknown';
  let stop_reason: string | null = null;
  let started_at: string | null = null;
  let ended_at: string | null = null;
  let duration_seconds: number | null = null;

  // Read state.json
  try {
    const statePath = path.join(runDir, 'state.json');
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      phase = state.phase || 'unknown';
      stop_reason = state.stop_reason || null;

      // Derive terminal_state from phase
      if (phase === 'STOPPED') {
        terminal_state = stop_reason === 'complete' ? 'complete' : 'stopped';
      } else {
        terminal_state = 'running';
      }
    }
  } catch (err) {
    warnings.push(`Failed to read state.json: ${(err as Error).message}`);
  }

  // Read timestamps from timeline
  try {
    const timelinePath = path.join(runDir, 'timeline.jsonl');
    if (fs.existsSync(timelinePath)) {
      const events = await readTimelineEvents(timelinePath);

      // Find first run_started
      const startEvent = events.find(e => e.type === 'run_started');
      if (startEvent) {
        started_at = startEvent.timestamp as string;
      }

      // Find last stop event
      const stopEvents = events.filter(e => e.type === 'stop');
      if (stopEvents.length > 0) {
        ended_at = stopEvents[stopEvents.length - 1].timestamp as string;
      }

      // Compute duration (ONCE from stored timestamps)
      if (started_at && ended_at) {
        const start = new Date(started_at).getTime();
        const end = new Date(ended_at).getTime();
        duration_seconds = Math.round((end - start) / 1000);
      }
    }
  } catch (err) {
    warnings.push(`Failed to read timeline.jsonl: ${(err as Error).message}`);
  }

  return {
    phase,
    terminal_state,
    stop_reason,
    duration_seconds,
    timestamps: {
      started_at,
      ended_at
    }
  };
}

/**
 * Extract milestones info
 */
async function extractMilestones(
  runDir: string,
  warnings: string[]
): Promise<JournalJson['milestones']> {
  let attempted = 0;
  let total = 0;
  const verified = 0; // Always 0 for stopped runs in v1

  try {
    const statePath = path.join(runDir, 'state.json');
    if (fs.existsSync(statePath)) {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));

      // milestone_index is 0-based, represents last milestone entered
      // If -1, no milestones attempted yet
      const milestoneIndex = state.milestone_index ?? -1;
      attempted = milestoneIndex >= 0 ? milestoneIndex + 1 : 0;

      // Total from milestones array
      total = state.milestones?.length ?? 0;
    }
  } catch (err) {
    warnings.push(`Failed to extract milestones: ${(err as Error).message}`);
  }

  return { attempted, total, verified };
}

/**
 * Extract checkpoints from git log
 */
async function extractCheckpoints(
  runDir: string,
  base_sha: string | null,
  warnings: string[]
): Promise<JournalJson['checkpoints']> {
  const list: Checkpoint[] = [];
  let last_sha: string | null = null;

  if (!base_sha) {
    warnings.push('Cannot extract checkpoints: base_sha missing');
    return { created: 0, list, last_sha };
  }

  try {
    // Get run branch from config
    const configPath = path.join(runDir, 'config.snapshot.json');
    if (!fs.existsSync(configPath)) {
      warnings.push('Cannot extract checkpoints: config.snapshot.json missing');
      return { created: 0, list, last_sha };
    }

    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const runBranch = config._worktree?.run_branch;
    if (!runBranch) {
      warnings.push('Cannot extract checkpoints: run_branch not found in config');
      return { created: 0, list, last_sha };
    }

    // Git log with committer time (%ct)
    const gitLog = execSync(
      `git log --format='%H|%ct|%s' ${base_sha}..${runBranch}`,
      {
        cwd: config._worktree?.original_repo_path || process.cwd(),
        encoding: 'utf-8'
      }
    );

    // Parse commits with checkpoint pattern
    const lines = gitLog.trim().split('\n').filter(l => l.trim());
    const checkpointPattern = /^([a-f0-9]+)\|(\d+)\|chore\(agent\): checkpoint milestone (\d+)$/i;

    for (const line of lines) {
      const match = line.match(checkpointPattern);
      if (match) {
        const [, sha, timestamp, milestoneStr] = match;
        const milestone_index = parseInt(milestoneStr, 10);
        const created_at = new Date(parseInt(timestamp, 10) * 1000).toISOString();

        list.push({
          milestone_index,
          title: `Milestone ${milestone_index}`, // Default title
          sha,
          created_at
        });
      }
    }

    // Sort by milestone index
    list.sort((a, b) => a.milestone_index - b.milestone_index);

    // Set last_sha
    if (list.length > 0) {
      last_sha = list[list.length - 1].sha;
    }
  } catch (err) {
    warnings.push(`Failed to extract checkpoints from git: ${(err as Error).message}`);
  }

  return {
    created: list.length,
    list,
    last_sha
  };
}

/**
 * Extract verification summary from timeline
 */
async function extractVerification(
  runDir: string,
  warnings: string[]
): Promise<JournalJson['verification']> {
  const summary = {
    attempts_total: 0,
    attempts_passed: 0,
    attempts_failed: 0,
    total_duration_seconds: 0
  };
  let last_failure: JournalJson['verification']['last_failure'] = null;

  try {
    const timelinePath = path.join(runDir, 'timeline.jsonl');
    if (!fs.existsSync(timelinePath)) {
      return { summary, last_failure };
    }

    const events = await readTimelineEvents(timelinePath);
    const verifyEvents = events.filter(e => e.type === 'verification') as unknown as VerificationEvent[];

    summary.attempts_total = verifyEvents.length;

    for (const event of verifyEvents) {
      if (event.payload.ok) {
        summary.attempts_passed++;
      } else {
        summary.attempts_failed++;
      }

      summary.total_duration_seconds += Math.round(event.payload.duration_ms / 1000);
    }

    // Get last failure
    const failedEvents = verifyEvents.filter(e => !e.payload.ok);
    if (failedEvents.length > 0) {
      const lastFailed = failedEvents[failedEvents.length - 1];
      const cmdResult = lastFailed.payload.command_results[0];

      // Determine log path
      const logPath = path.join(runDir, `artifacts/tests_${lastFailed.payload.tier}.log`);

      last_failure = {
        command: cmdResult.command,
        exit_code: cmdResult.exit_code,
        error_excerpt: getErrorExcerpt(logPath),
        log_path: `artifacts/tests_${lastFailed.payload.tier}.log`
      };
    }
  } catch (err) {
    warnings.push(`Failed to extract verification: ${(err as Error).message}`);
  }

  return { summary, last_failure };
}

/**
 * Extract changes from git diff
 */
async function extractChanges(
  runDir: string,
  base_sha: string | null,
  head_sha: string | null,
  warnings: string[]
): Promise<JournalJson['changes']> {
  // If SHAs missing, can't compute diff
  if (!base_sha || !head_sha) {
    warnings.push('Cannot compute changes: base_sha or head_sha missing');
    return {
      base_sha,
      head_sha,
      files_changed: null,
      insertions: null,
      deletions: null,
      top_files: null,
      diff_stat: null
    };
  }

  try {
    const configPath = path.join(runDir, 'config.snapshot.json');
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const repoPath = config._worktree?.original_repo_path || process.cwd();

    // Get numstat for detailed file-level stats
    const numstat = execSync(`git diff --numstat ${base_sha}..${head_sha}`, {
      cwd: repoPath,
      encoding: 'utf-8'
    });

    const lines = numstat.trim().split('\n').filter(l => l.trim());
    const fileStats: Array<{ path: string; insertions: number; deletions: number }> = [];
    let totalInsertions = 0;
    let totalDeletions = 0;

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length >= 3) {
        const ins = parseInt(parts[0], 10) || 0;
        const del = parseInt(parts[1], 10) || 0;
        const filePath = parts[2];

        fileStats.push({ path: filePath, insertions: ins, deletions: del });
        totalInsertions += ins;
        totalDeletions += del;
      }
    }

    // Sort by total changes, take top 10
    const topFiles = fileStats
      .sort((a, b) => (b.insertions + b.deletions) - (a.insertions + a.deletions))
      .slice(0, 10);

    // Get diff stat summary
    const diffStat = execSync(`git diff --stat ${base_sha}..${head_sha}`, {
      cwd: repoPath,
      encoding: 'utf-8'
    });

    return {
      base_sha,
      head_sha,
      files_changed: fileStats.length,
      insertions: totalInsertions,
      deletions: totalDeletions,
      top_files: topFiles.length > 0 ? topFiles : null,
      diff_stat: diffStat.trim()
    };
  } catch (err) {
    warnings.push(`Git diff failed: ${(err as Error).message}. Changes unavailable.`);
    return {
      base_sha,
      head_sha,
      files_changed: null,
      insertions: null,
      deletions: null,
      top_files: null,
      diff_stat: null
    };
  }
}

/**
 * Extract next action from stop.json or derive
 */
async function extractNextAction(
  runDir: string,
  runId: string,
  stop_reason: string | null,
  warnings: string[]
): Promise<JournalJson['next_action']> {
  // Try stop.json first
  try {
    const stopJsonPath = path.join(runDir, 'handoffs/stop.json');
    if (fs.existsSync(stopJsonPath)) {
      const stopData = JSON.parse(fs.readFileSync(stopJsonPath, 'utf-8'));
      if (stopData.next_actions && stopData.next_actions.length > 0) {
        return stopData.next_actions[0];
      }
    }
  } catch (err) {
    warnings.push(`Failed to read stop.json: ${(err as Error).message}`);
  }

  // Derive from stop_reason
  if (stop_reason === 'verification_failed_max_retries') {
    return {
      title: 'View verification logs',
      command: `cat runs/${runId}/artifacts/tests_tier*.log`,
      why: 'See full error output from failing tests/lint'
    };
  }

  return null;
}

/**
 * Extract notes metadata
 */
async function extractNotes(runDir: string): Promise<JournalJson['notes']> {
  const notesPath = path.join(runDir, 'notes.jsonl');
  let count = 0;

  if (fs.existsSync(notesPath)) {
    const content = fs.readFileSync(notesPath, 'utf-8');
    count = content.split('\n').filter(l => l.trim()).length;
  }

  return {
    count,
    path: 'notes.jsonl'
  };
}

/**
 * Read timeline events from JSONL file
 */
async function readTimelineEvents(timelinePath: string): Promise<Array<Record<string, unknown>>> {
  const events: Array<Record<string, unknown>> = [];

  if (!fs.existsSync(timelinePath)) {
    return events;
  }

  const stream = fs.createReadStream(timelinePath, { encoding: 'utf-8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const event = JSON.parse(trimmed) as Record<string, unknown>;
      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  return events;
}
