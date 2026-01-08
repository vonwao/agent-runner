/**
 * UX Telemetry - Breadcrumb tracking for debugging UX flows.
 *
 * Writes events to:
 * - Run's timeline.jsonl if a run is in-scope
 * - .runr/ux-breadcrumbs.jsonl otherwise
 */

import fs from 'node:fs';
import path from 'node:path';
import { getRunsRoot } from '../store/runs-root.js';
import type { ContinueStrategy, StoppedAnalysis } from './brain.js';

/**
 * UX event types for telemetry.
 */
export type UxEventType =
  | 'front_door_shown'
  | 'continue_attempted'
  | 'continue_strategy_resolved'
  | 'continue_auto_fix_step'
  | 'continue_failed'
  | 'continue_success';

/**
 * UX telemetry event.
 */
export interface UxEvent {
  type: UxEventType;
  timestamp: string;
  runId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Write a UX breadcrumb event.
 *
 * If runId is provided, writes to the run's timeline.
 * Otherwise writes to a general breadcrumb file.
 */
export function writeBreadcrumb(
  repoPath: string,
  event: Omit<UxEvent, 'timestamp'>
): void {
  const fullEvent: UxEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };

  try {
    if (event.runId) {
      // Write to run's timeline
      const runsRoot = getRunsRoot(repoPath);
      const timelinePath = path.join(runsRoot, event.runId, 'timeline.jsonl');
      if (fs.existsSync(path.dirname(timelinePath))) {
        fs.appendFileSync(timelinePath, JSON.stringify(fullEvent) + '\n');
        return;
      }
    }

    // Fallback: write to general breadcrumb file
    const breadcrumbPath = path.join(getRunsRoot(repoPath), 'ux-breadcrumbs.jsonl');
    fs.appendFileSync(breadcrumbPath, JSON.stringify(fullEvent) + '\n');
  } catch {
    // Silent fail - telemetry should never break the workflow
  }
}

/**
 * Record front door display.
 */
export function recordFrontDoor(repoPath: string, runId?: string): void {
  writeBreadcrumb(repoPath, {
    type: 'front_door_shown',
    runId,
  });
}

/**
 * Record continue command attempt.
 * Includes analysis fields for debugging "why did continue not run?" scenarios.
 */
export function recordContinueAttempt(
  repoPath: string,
  runId: string | undefined,
  strategy: ContinueStrategy,
  analysis?: StoppedAnalysis
): void {
  writeBreadcrumb(repoPath, {
    type: 'continue_attempted',
    runId,
    payload: {
      strategyType: strategy.type,
      ...(strategy.type === 'auto_fix' && { commandCount: strategy.commands.length }),
      ...(strategy.type === 'manual' && { blockedReason: strategy.blockedReason }),
      ...(strategy.type === 'continue_orch' && { orchestratorId: strategy.orchestratorId }),
      // Include analysis fields for debugging
      ...(analysis && {
        autoFixAvailable: analysis.autoFixAvailable,
        autoFixPermitted: analysis.autoFixPermitted,
        treeDirty: analysis.treeDirty,
        mode: analysis.mode,
        blockReason: analysis.blockReason,
      }),
    },
  });
}

/**
 * Record auto-fix step execution.
 */
export function recordAutoFixStep(
  repoPath: string,
  runId: string,
  stepIndex: number,
  command: string,
  exitCode: number
): void {
  writeBreadcrumb(repoPath, {
    type: 'continue_auto_fix_step',
    runId,
    payload: {
      stepIndex,
      command,
      exitCode,
      success: exitCode === 0,
    },
  });
}

/**
 * Record continue command failure.
 */
export function recordContinueFailed(
  repoPath: string,
  runId: string | undefined,
  reason: string,
  stepIndex?: number
): void {
  writeBreadcrumb(repoPath, {
    type: 'continue_failed',
    runId,
    payload: {
      reason,
      ...(stepIndex !== undefined && { failedAtStep: stepIndex }),
    },
  });
}

/**
 * Record continue command success.
 */
export function recordContinueSuccess(
  repoPath: string,
  runId: string | undefined,
  strategyType: string
): void {
  writeBreadcrumb(repoPath, {
    type: 'continue_success',
    runId,
    payload: { strategyType },
  });
}
