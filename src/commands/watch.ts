import fs from 'node:fs';
import path from 'node:path';
import { RunState } from '../types/schemas.js';
import { getRunsRoot } from '../store/runs-root.js';
import { resumeCommand } from './resume.js';

export interface WatchOptions {
  runId: string;
  repo: string;
  autoResume?: boolean;
  maxAttempts?: number;
  interval?: number;
  json?: boolean;
}

interface WatchEvent {
  timestamp: string;
  run_id: string;
  event: 'watching' | 'failed' | 'resumed' | 'succeeded' | 'max_attempts' | 'non_resumable';
  phase?: string;
  stop_reason?: string;
  attempt?: number;
  max_attempts?: number;
  checkpoint?: string;
}

/**
 * Check if a failure is resumable (transient or recoverable)
 */
function isResumable(state: RunState): boolean {
  if (state.phase !== 'STOPPED') {
    return false;
  }

  const resumableReasons = [
    'verification_failed_max_retries',
    'stalled_timeout',
    'max_ticks_reached',
    'time_budget_exceeded',
    'implement_blocked'
  ];

  const nonResumableReasons = [
    'guard_violation',
    'plan_scope_violation',
    'ownership_violation',
    'review_loop_detected',
    'parallel_file_collision'
  ];

  if (!state.stop_reason) {
    return false;
  }

  if (resumableReasons.includes(state.stop_reason)) {
    return true;
  }

  if (nonResumableReasons.includes(state.stop_reason)) {
    return false;
  }

  // Unknown stop reason: default to non-resumable (safe)
  return false;
}

/**
 * Read current run state
 */
function readState(repo: string, runId: string): RunState | null {
  const statePath = path.join(getRunsRoot(repo), runId, 'state.json');
  if (!fs.existsSync(statePath)) {
    return null;
  }

  try {
    const raw = fs.readFileSync(statePath, 'utf-8');
    return JSON.parse(raw) as RunState;
  } catch {
    return null;
  }
}

/**
 * Emit watch event
 */
function emitEvent(event: WatchEvent, json: boolean): void {
  if (json) {
    console.log(JSON.stringify(event));
  } else {
    switch (event.event) {
      case 'watching':
        console.log(`[${event.timestamp}] Watching run ${event.run_id} (phase: ${event.phase})`);
        break;
      case 'failed':
        console.log(`[${event.timestamp}] Run ${event.run_id} failed: ${event.stop_reason}`);
        break;
      case 'resumed':
        console.log(`[${event.timestamp}] Auto-resuming (attempt ${event.attempt}/${event.max_attempts}) from checkpoint ${event.checkpoint || 'unknown'}`);
        break;
      case 'succeeded':
        console.log(`[${event.timestamp}] Run ${event.run_id} completed successfully!`);
        break;
      case 'max_attempts':
        console.log(`[${event.timestamp}] Max auto-resume attempts (${event.max_attempts}) reached. Stopped.`);
        break;
      case 'non_resumable':
        console.log(`[${event.timestamp}] Run ${event.run_id} stopped with non-resumable reason: ${event.stop_reason}`);
        break;
    }
  }
}

/**
 * Sleep for N milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Watch a run and optionally auto-resume on failure
 */
export async function watchCommand(options: WatchOptions): Promise<void> {
  const interval = options.interval || 5000; // 5 seconds default
  const maxAttempts = options.maxAttempts ?? (options.autoResume ? 3 : 0);
  let attemptCount = 0;

  while (true) {
    const state = readState(options.repo, options.runId);

    if (!state) {
      console.error(`Error: Run ${options.runId} not found`);
      process.exit(1);
    }

    const timestamp = new Date().toISOString();

    // Check if terminal
    if (state.phase === 'STOPPED') {
      if (state.stop_reason === 'complete') {
        // Success
        emitEvent({
          timestamp,
          run_id: options.runId,
          event: 'succeeded'
        }, options.json || false);
        process.exit(0);
      }

      // Failed
      emitEvent({
        timestamp,
        run_id: options.runId,
        event: 'failed',
        stop_reason: state.stop_reason,
        checkpoint: state.checkpoint_commit_sha
      }, options.json || false);

      // Check if auto-resume
      if (options.autoResume && isResumable(state)) {
        if (attemptCount >= maxAttempts) {
          emitEvent({
            timestamp,
            run_id: options.runId,
            event: 'max_attempts',
            max_attempts: maxAttempts
          }, options.json || false);
          process.exit(1);
        }

        attemptCount++;

        emitEvent({
          timestamp,
          run_id: options.runId,
          event: 'resumed',
          attempt: attemptCount,
          max_attempts: maxAttempts,
          checkpoint: state.checkpoint_commit_sha
        }, options.json || false);

        // Cooldown before resume (10 seconds)
        await sleep(10000);

        // Resume (don't await, let it run in background)
        try {
          await resumeCommand({
            runId: options.runId,
            repo: options.repo,
            time: 120,
            maxTicks: 50,
            allowDeps: false,
            force: false,
            autoResume: false
          });
        } catch (err) {
          console.error(`Resume failed: ${err}`);
          process.exit(1);
        }

        // Continue watching after resume
        await sleep(interval);
        continue;
      } else {
        // Non-resumable or auto-resume disabled
        if (!isResumable(state)) {
          emitEvent({
            timestamp,
            run_id: options.runId,
            event: 'non_resumable',
            stop_reason: state.stop_reason
          }, options.json || false);
        }
        process.exit(1);
      }
    }

    // Still running
    emitEvent({
      timestamp,
      run_id: options.runId,
      event: 'watching',
      phase: state.phase
    }, options.json || false);

    await sleep(interval);
  }
}
