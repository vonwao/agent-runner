/**
 * Stop Footer - Consistent "Next Steps" block for stopped runs.
 *
 * Shows exactly 3 commands:
 * 1. resume - try again
 * 2. intervene - record manual fix
 * 3. audit - see what happened
 */

import { RunState } from '../types/schemas.js';

const SEPARATOR = '─'.repeat(50);

/**
 * Context info extracted from run state.
 */
export interface StopContext {
  runId: string;
  stopReason: string;
  checkpointSha?: string;
  milestoneIndex: number;
  milestonesTotal: number;
  lastError?: string;
  phase?: string;
}

/**
 * Next steps for JSON output.
 */
export interface NextSteps {
  resume: string;
  intervene: string;
  audit: string;
}

/**
 * Get context line based on stop reason.
 */
function getContextLine(ctx: StopContext): string | null {
  switch (ctx.stopReason) {
    case 'review_loop_detected':
      if (ctx.lastError) {
        // Extract first 2 items from error message if it contains a list
        const match = ctx.lastError.match(/(?:Unmet|Failed|Missing):\s*(.+)/i);
        if (match) {
          const items = match[1].split(/[,;]/).slice(0, 2).map(s => s.trim());
          return `Unmet: ${items.join(', ')}`;
        }
        return `Unmet: ${ctx.lastError.slice(0, 60)}...`;
      }
      return 'Unmet: review requirements not satisfied';

    case 'verification_failed':
      if (ctx.lastError) {
        const cmdMatch = ctx.lastError.match(/command.*failed|failed.*command/i);
        if (cmdMatch) {
          return `Failed: ${ctx.lastError.slice(0, 60)}`;
        }
        return `Failed: verification check`;
      }
      return 'Failed: verification check';

    case 'scope_violation':
      if (ctx.lastError) {
        // Extract file paths from error
        const files = ctx.lastError.match(/[\w./\-_]+\.\w+/g);
        if (files && files.length > 0) {
          return `Files: ${files.slice(0, 2).join(', ')}`;
        }
      }
      return 'Files: scope boundary exceeded';

    case 'stalled_timeout':
    case 'worker_call_timeout':
      return `Stalled at: ${ctx.phase || 'unknown phase'}`;

    case 'guard_fail':
    case 'preflight_failed':
      if (ctx.lastError) {
        const guardMatch = ctx.lastError.match(/guard.*failed|failed.*guard/i);
        if (guardMatch) {
          return `Guard: ${ctx.lastError.slice(0, 50)}`;
        }
      }
      return 'Guard: preflight check failed';

    default:
      // No context line for other reasons
      return null;
  }
}

/**
 * Build next steps commands.
 */
export function buildNextSteps(runId: string, stopReason: string): NextSteps {
  return {
    resume: `runr resume ${runId}`,
    intervene: `runr intervene ${runId} --reason ${stopReason || 'manual'} --note "..."`,
    audit: `runr audit --run ${runId}`
  };
}

/**
 * Format stop footer for console output.
 */
export function formatStopFooter(ctx: StopContext): string {
  const lines: string[] = [];

  lines.push(SEPARATOR);
  lines.push(`STOPPED: ${ctx.stopReason}`);
  lines.push('');

  // Last checkpoint line
  if (ctx.checkpointSha) {
    lines.push(`Last checkpoint: ${ctx.checkpointSha.slice(0, 7)} (milestone ${ctx.milestoneIndex + 1}/${ctx.milestonesTotal})`);
  } else {
    lines.push(`No checkpoint (milestone ${ctx.milestoneIndex + 1}/${ctx.milestonesTotal})`);
  }

  // Context line based on stop reason
  const contextLine = getContextLine(ctx);
  if (contextLine) {
    lines.push(contextLine);
  }

  lines.push('');
  lines.push('Next steps:');

  const steps = buildNextSteps(ctx.runId, ctx.stopReason);
  lines.push(`  ${steps.resume}`);
  lines.push(`  ${steps.intervene}`);
  lines.push(`  ${steps.audit}`);

  lines.push(SEPARATOR);

  return lines.join('\n');
}

/**
 * Build stop context from run state.
 */
export function buildStopContext(state: RunState): StopContext {
  return {
    runId: state.run_id,
    stopReason: state.stop_reason || 'unknown',
    checkpointSha: state.checkpoint_commit_sha,
    milestoneIndex: state.milestone_index,
    milestonesTotal: state.milestones.length,
    lastError: state.last_error,
    phase: state.phase
  };
}

/**
 * Print stop footer to console.
 */
export function printStopFooter(state: RunState): void {
  const ctx = buildStopContext(state);
  console.log('');
  console.log(formatStopFooter(ctx));
}
