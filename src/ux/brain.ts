/**
 * Brain module - pure policy decisions for the UX layer.
 *
 * This module contains NO I/O. It takes state and diagnosis data as input
 * and returns actions and continue strategy as output.
 *
 * "One brain, three consumers" - this module is used by:
 * - runr (no args) front door
 * - runr continue command
 * - stop footer generation
 */

import type { RepoState, StoppedRunInfo, OrchCursor } from './state.js';
import type { StopDiagnosisJson, NextAction } from '../diagnosis/types.js';
import type { StopDiagnostics, SuggestedAction } from '../diagnosis/stop-explainer.js';
import { filterSafeCommands, type CanonicalCommand } from './safe-commands.js';

/**
 * Display status for the front door.
 */
export type DisplayStatus = 'running' | 'stopped_auto' | 'stopped_manual' | 'orch_ready' | 'clean';

/**
 * An action to present to the user.
 */
export interface Action {
  /** Short label for the action */
  label: string;
  /** The command to run */
  command: string;
  /** Optional explanation */
  rationale?: string;
  /** Whether this is the primary action */
  primary: boolean;
}

/**
 * Strategy for the continue command.
 */
export type ContinueStrategy =
  | { type: 'auto_resume'; runId: string }
  | { type: 'auto_fix'; runId: string; commands: CanonicalCommand[] }
  | { type: 'continue_orch'; orchestratorId: string }
  | { type: 'manual'; runId?: string; blockedReason: string }
  | { type: 'nothing' };

/**
 * Analysis of a stopped run - computed booleans for decision making.
 * These fields are also used for telemetry.
 */
export interface StoppedAnalysis {
  /** Stop reason allows auto-fix AND we have safe commands */
  autoFixAvailable: boolean;
  /** autoFixAvailable AND mode permits (flow OR ledger+force) */
  autoFixPermitted: boolean;
  /** Working tree has uncommitted changes */
  treeDirty: boolean;
  /** Current mode */
  mode: 'flow' | 'ledger';
  /** Safe commands available (empty if none) */
  safeCommands: CanonicalCommand[];
  /** Reason auto-fix is blocked (if autoFixAvailable but not permitted) */
  blockReason?: 'ledger_mode' | 'dirty_tree_ledger' | 'unsafe_commands' | 'no_commands';
}

/**
 * Input to the brain - all the data needed to make decisions.
 */
export interface BrainInput {
  state: RepoState;
  /** Primary diagnosis source (from stop.json) */
  stopDiagnosis: StopDiagnosisJson | null;
  /** Fallback diagnosis source (from stop-explainer) */
  stopExplainer: StopDiagnostics | null;
}

/**
 * Output from the brain - decisions made.
 */
export interface BrainOutput {
  /** Display status for rendering */
  status: DisplayStatus;
  /** One-line headline */
  headline: string;
  /** Summary lines (2-4 key facts) */
  summaryLines: string[];
  /** Exactly 3 actions */
  actions: Action[];
  /** Strategy for continue command */
  continueStrategy: ContinueStrategy;
  /** Analysis of stopped run (for telemetry/debugging) */
  stoppedAnalysis?: StoppedAnalysis;
}

// ============================================================================
// Stop reason classification
// ============================================================================

/**
 * Stop reasons that can be auto-resumed (just resume, no fix needed).
 */
const AUTO_RESUME_REASONS = new Set([
  'stalled_timeout',
  'max_ticks_reached',
  'time_budget_exceeded',
]);

/**
 * Stop reasons that might be auto-fixable if we have commands.
 */
const POTENTIALLY_AUTO_FIXABLE_REASONS = new Set([
  'review_loop_detected',
  'verification_failed',
  'verification_failed_max_retries',
]);

/**
 * Stop reasons that always require manual intervention.
 */
const MANUAL_REASONS = new Set([
  'guard_violation',
  'plan_scope_violation',
  'scope_violation',
  'ownership_violation',
  'parallel_file_collision',
  'submit_conflict',
  'plan_parse_failed',
  'implement_parse_failed',
  'review_parse_failed',
  'implement_blocked', // conservative - could be auto-resume in some cases
]);

// ============================================================================
// Command extraction
// ============================================================================

/**
 * Extract commands from diagnosis sources.
 * Normalizes from both StopDiagnosisJson and StopDiagnostics formats.
 */
function extractSuggestedCommands(
  stopDiagnosis: StopDiagnosisJson | null,
  stopExplainer: StopDiagnostics | null
): string[] {
  const commands: string[] = [];

  // Primary: StopDiagnosisJson.next_actions
  if (stopDiagnosis?.next_actions) {
    for (const action of stopDiagnosis.next_actions) {
      if (action.command) {
        commands.push(action.command);
      }
    }
  }

  // Also include resume_command if present
  if (stopDiagnosis?.resume_command) {
    commands.push(stopDiagnosis.resume_command);
  }

  // Fallback: StopDiagnostics.suggested_actions
  if (stopExplainer?.suggested_actions) {
    for (const action of stopExplainer.suggested_actions) {
      if (action.command) {
        commands.push(action.command);
      }
    }
  }

  return commands;
}

// ============================================================================
// Stopped run analysis
// ============================================================================

/**
 * Analyze a stopped run to determine auto-fix availability and permissions.
 * This is the "two boolean" approach that ensures consistent headlines/actions.
 */
function analyzeStoppedRun(
  stopped: StoppedRunInfo,
  stopDiagnosis: StopDiagnosisJson | null,
  stopExplainer: StopDiagnostics | null,
  state: RepoState
): StoppedAnalysis {
  const { stopReason } = stopped;
  const mode = state.mode;
  const treeDirty = state.treeStatus === 'dirty';

  // Check if stop reason is potentially auto-fixable
  const isPotentiallyFixable = POTENTIALLY_AUTO_FIXABLE_REASONS.has(stopReason);

  // Extract and filter commands
  const suggestedCommands = isPotentiallyFixable
    ? extractSuggestedCommands(stopDiagnosis, stopExplainer)
    : [];
  const safeCommands = filterSafeCommands(suggestedCommands);

  // Determine if auto-fix is available (have safe commands for a fixable reason)
  const autoFixAvailable = isPotentiallyFixable && safeCommands.length > 0;

  // Determine block reason and permission
  let blockReason: StoppedAnalysis['blockReason'];
  let autoFixPermitted = false;

  if (autoFixAvailable) {
    // Flow mode: auto-fix permitted, dirty tree is just informational
    // Ledger mode: requires clean tree (dirty blocks unless --force, but brain doesn't know --force)
    if (mode === 'flow') {
      autoFixPermitted = true;
    } else {
      // Ledger mode - blocked (user must use --force to override)
      autoFixPermitted = false;
      blockReason = treeDirty ? 'dirty_tree_ledger' : 'ledger_mode';
    }
  } else if (isPotentiallyFixable) {
    // Fixable reason but no safe commands
    if (suggestedCommands.length > 0) {
      blockReason = 'unsafe_commands';
    } else {
      blockReason = 'no_commands';
    }
  }

  return {
    autoFixAvailable,
    autoFixPermitted,
    treeDirty,
    mode,
    safeCommands,
    blockReason,
  };
}

// ============================================================================
// Strategy determination
// ============================================================================

/**
 * Determine continue strategy for a stopped run.
 */
function determineStoppedStrategy(
  stopped: StoppedRunInfo,
  analysis: StoppedAnalysis
): ContinueStrategy {
  const { runId, stopReason } = stopped;

  // Manual reasons always require intervention
  if (MANUAL_REASONS.has(stopReason)) {
    return {
      type: 'manual',
      runId,
      blockedReason: `Stop reason "${stopReason}" requires manual intervention`,
    };
  }

  // Auto-resume reasons - just resume
  if (AUTO_RESUME_REASONS.has(stopReason)) {
    return {
      type: 'auto_resume',
      runId,
    };
  }

  // Use analysis for potentially auto-fixable reasons
  if (analysis.autoFixAvailable && analysis.autoFixPermitted) {
    return {
      type: 'auto_fix',
      runId,
      commands: analysis.safeCommands,
    };
  }

  // Auto-fix available but blocked
  if (analysis.autoFixAvailable && !analysis.autoFixPermitted) {
    const reason = analysis.blockReason === 'dirty_tree_ledger'
      ? 'Ledger mode + dirty tree requires --force'
      : 'Ledger mode requires --force';
    return {
      type: 'manual',
      runId,
      blockedReason: reason,
    };
  }

  // Not auto-fixable - determine why
  if (analysis.blockReason === 'unsafe_commands') {
    return {
      type: 'manual',
      runId,
      blockedReason: 'Suggested commands are not in safe allowlist',
    };
  }

  if (analysis.blockReason === 'no_commands') {
    return {
      type: 'manual',
      runId,
      blockedReason: 'No safe commands found to auto-fix',
    };
  }

  // Unknown stop reason - be conservative
  return {
    type: 'manual',
    runId,
    blockedReason: `Unknown stop reason "${stopReason}"`,
  };
}

// ============================================================================
// Action generation
// ============================================================================

/**
 * Generate actions for a running state.
 */
function actionsForRunning(state: RepoState): Action[] {
  const runId = state.activeRun!.runId;

  return [
    {
      label: 'View status',
      command: `runr report ${runId}`,
      rationale: 'See what the run is doing',
      primary: true,
    },
    {
      label: 'Follow logs',
      command: `runr tools follow ${runId}`,
      rationale: 'Watch real-time progress',
      primary: false,
    },
    {
      label: 'Wait for completion',
      command: `runr tools wait ${runId}`,
      rationale: 'Block until run finishes',
      primary: false,
    },
  ];
}

/**
 * Generate actions for a stopped state (auto-resume/auto-fix).
 */
function actionsForStoppedAuto(
  stopped: StoppedRunInfo,
  strategy: ContinueStrategy
): Action[] {
  const runId = stopped.runId;

  return [
    {
      label: 'Continue',
      command: 'runr continue',
      rationale: strategy.type === 'auto_fix'
        ? 'Run suggested fixes, then resume'
        : 'Resume the stopped run',
      primary: true,
    },
    {
      label: 'View report',
      command: `runr report ${runId}`,
      rationale: 'See what happened',
      primary: false,
    },
    {
      label: 'Manual intervention',
      command: `runr intervene ${runId} --reason ${stopped.stopReason} --note "..."`,
      rationale: 'Record manual work',
      primary: false,
    },
  ];
}

/**
 * Generate actions for a stopped state (auto-fix blocked by ledger mode).
 * Primary action is `runr continue --force` to override the ledger restriction.
 */
function actionsForStoppedBlocked(stopped: StoppedRunInfo, analysis: StoppedAnalysis): Action[] {
  const runId = stopped.runId;
  const reason = analysis.blockReason === 'dirty_tree_ledger'
    ? 'Override ledger + dirty tree restriction'
    : 'Override ledger mode restriction';

  return [
    {
      label: 'Continue with force',
      command: 'runr continue --force',
      rationale: reason,
      primary: true,
    },
    {
      label: 'View report',
      command: `runr report ${runId}`,
      rationale: 'See what needs fixing',
      primary: false,
    },
    {
      label: 'Intervene manually',
      command: `runr intervene ${runId} --reason ${stopped.stopReason} --note "..."`,
      rationale: 'Fix manually and record it',
      primary: false,
    },
  ];
}

/**
 * Generate actions for a stopped state (manual intervention needed, no auto-fix available).
 */
function actionsForStoppedManual(stopped: StoppedRunInfo): Action[] {
  const runId = stopped.runId;

  return [
    {
      label: 'View report',
      command: `runr report ${runId}`,
      rationale: 'Understand what went wrong',
      primary: true,
    },
    {
      label: 'Intervene',
      command: `runr intervene ${runId} --reason ${stopped.stopReason} --note "..."`,
      rationale: 'Record manual fix and continue',
      primary: false,
    },
    {
      label: 'Resume anyway',
      command: `runr resume ${runId}`,
      rationale: 'Retry without fixing (may fail again)',
      primary: false,
    },
  ];
}

/**
 * Generate actions for orchestration ready state.
 */
function actionsForOrchReady(orch: OrchCursor, state: RepoState): Action[] {
  // Show concrete orchestration command
  const orchCommand = `runr orchestrate resume ${orch.orchestratorId}`;

  return [
    {
      label: 'Continue orchestration',
      command: orchCommand,
      rationale: `Resume orchestration (${orch.tracksComplete}/${orch.tracksTotal} complete)`,
      primary: true,
    },
    {
      label: 'View orchestration',
      command: `runr orchestrate receipt ${orch.orchestratorId}`,
      rationale: 'See orchestration status',
      primary: false,
    },
    {
      label: 'View latest report',
      command: 'runr report latest',
      rationale: 'See last run details',
      primary: false,
    },
  ];
}

/**
 * Generate actions for clean state (nothing happening).
 */
function actionsForClean(state: RepoState): Action[] {
  const hasLatestRun = state.latestRun !== null;

  return [
    {
      label: 'Run a task',
      command: 'runr run --task <task.md>',
      rationale: 'Start a new agent task',
      primary: true,
    },
    hasLatestRun
      ? {
          label: 'View last run',
          command: 'runr report latest',
          rationale: 'See what happened last time',
          primary: false,
        }
      : {
          label: 'Initialize',
          command: 'runr init',
          rationale: 'Set up Runr for this project',
          primary: false,
        },
    {
      label: 'Help',
      command: 'runr help',
      rationale: 'See all available commands',
      primary: false,
    },
  ];
}

// ============================================================================
// Headline and summary generation
// ============================================================================

/**
 * Generate headline for display.
 * Uses analysis to provide accurate messaging about what's possible.
 */
function generateHeadline(
  status: DisplayStatus,
  state: RepoState,
  strategy: ContinueStrategy,
  analysis?: StoppedAnalysis
): string {
  switch (status) {
    case 'running':
      return `RUNNING: ${state.activeRun!.runId}`;
    case 'stopped_auto':
      return `STOPPED (${state.latestStopped!.stopReason}) - auto-${strategy.type === 'auto_fix' ? 'fix' : 'resume'} available`;
    case 'stopped_manual': {
      // Map blockReason to user-facing message
      // "blocked" implies there IS a safe fix but policy won't allow it
      // "unavailable" implies there's no safe fix to run
      if (analysis?.blockReason) {
        let blockMsg: string;
        switch (analysis.blockReason) {
          case 'ledger_mode':
            blockMsg = 'auto-fix blocked (ledger mode)';
            break;
          case 'dirty_tree_ledger':
            blockMsg = 'auto-fix blocked (ledger + dirty tree)';
            break;
          case 'unsafe_commands':
            blockMsg = 'auto-fix blocked (unsafe commands)';
            break;
          case 'no_commands':
            blockMsg = 'auto-fix unavailable (no safe commands)';
            break;
          default:
            blockMsg = 'manual intervention needed';
        }
        return `STOPPED (${state.latestStopped!.stopReason}) - ${blockMsg}`;
      }
      return `STOPPED (${state.latestStopped!.stopReason}) - manual intervention needed`;
    }
    case 'orch_ready':
      return `Orchestration ready (${state.orchestration!.tracksComplete}/${state.orchestration!.tracksTotal} tracks complete)`;
    case 'clean':
      return 'Ready';
  }
}

/**
 * Generate summary lines for display.
 */
function generateSummaryLines(
  status: DisplayStatus,
  state: RepoState,
  stopDiagnosis: StopDiagnosisJson | null,
  stopExplainer: StopDiagnostics | null,
  analysis?: StoppedAnalysis
): string[] {
  const lines: string[] = [];

  // Add task info if available
  if (state.latestStopped?.taskPath) {
    lines.push(`Task: ${state.latestStopped.taskPath}`);
  } else if (state.activeRun?.taskPath) {
    lines.push(`Task: ${state.activeRun.taskPath}`);
  }

  // Add mode and tree status
  lines.push(`Mode: ${state.mode} | Tree: ${state.treeStatus}`);

  // Add stop-specific info
  if (status === 'stopped_auto' || status === 'stopped_manual') {
    // Add unmet checks from stop-explainer if available
    if (stopExplainer?.unmet_checks && stopExplainer.unmet_checks.length > 0) {
      lines.push(`Unmet: ${stopExplainer.unmet_checks.join(', ')}`);
    }

    // Add diagnosis category if available
    if (stopDiagnosis?.primary_diagnosis) {
      lines.push(`Diagnosis: ${stopDiagnosis.primary_diagnosis}`);
    }

    // Add hint for ledger-blocked cases
    if (analysis?.autoFixAvailable && !analysis.autoFixPermitted) {
      if (analysis.blockReason === 'ledger_mode' || analysis.blockReason === 'dirty_tree_ledger') {
        lines.push('Use `runr continue --force` to run safe verification commands.');
      }
    }
  }

  // Add orchestration info
  if (status === 'orch_ready' && state.orchestration) {
    const orch = state.orchestration;
    if (orch.tracksStopped > 0) {
      lines.push(`Stopped tracks: ${orch.tracksStopped}`);
    }
  }

  return lines.slice(0, 4); // Max 4 lines
}

// ============================================================================
// Main brain function
// ============================================================================

/**
 * Compute brain output from inputs.
 * This is a PURE function - no I/O, no side effects.
 */
export function computeBrain(input: BrainInput): BrainOutput {
  const { state, stopDiagnosis, stopExplainer } = input;

  // Priority 1: Active run (RUNNING)
  if (state.activeRun) {
    const actions = actionsForRunning(state);
    return {
      status: 'running',
      headline: generateHeadline('running', state, { type: 'nothing' }),
      summaryLines: generateSummaryLines('running', state, null, null),
      actions,
      continueStrategy: { type: 'nothing' },
    };
  }

  // Priority 2: Stopped run (takes priority over orchestration)
  if (state.latestStopped) {
    // Analyze the stopped run to get the two key booleans
    const analysis = analyzeStoppedRun(
      state.latestStopped,
      stopDiagnosis,
      stopExplainer,
      state
    );

    // Determine strategy based on analysis
    const strategy = determineStoppedStrategy(state.latestStopped, analysis);

    // Determine display status and actions
    const isAuto = strategy.type === 'auto_resume' || strategy.type === 'auto_fix';
    const isBlocked = analysis.autoFixAvailable && !analysis.autoFixPermitted;
    const status: DisplayStatus = isAuto ? 'stopped_auto' : 'stopped_manual';

    // Select appropriate action generator
    let actions: Action[];
    if (isAuto) {
      actions = actionsForStoppedAuto(state.latestStopped, strategy);
    } else if (isBlocked) {
      // Auto-fix available but blocked by ledger - show --force as primary
      actions = actionsForStoppedBlocked(state.latestStopped, analysis);
    } else {
      // Truly manual - no auto-fix path available
      actions = actionsForStoppedManual(state.latestStopped);
    }

    return {
      status,
      headline: generateHeadline(status, state, strategy, analysis),
      summaryLines: generateSummaryLines(status, state, stopDiagnosis, stopExplainer, analysis),
      actions,
      continueStrategy: strategy,
      stoppedAnalysis: analysis,
    };
  }

  // Priority 3: Orchestration cursor
  if (state.orchestration && state.orchestration.status !== 'complete') {
    const actions = actionsForOrchReady(state.orchestration, state);
    return {
      status: 'orch_ready',
      headline: generateHeadline('orch_ready', state, { type: 'continue_orch', orchestratorId: state.orchestration.orchestratorId }),
      summaryLines: generateSummaryLines('orch_ready', state, null, null),
      actions,
      continueStrategy: {
        type: 'continue_orch',
        orchestratorId: state.orchestration.orchestratorId,
      },
    };
  }

  // Priority 4: Clean state
  const actions = actionsForClean(state);
  return {
    status: 'clean',
    headline: generateHeadline('clean', state, { type: 'nothing' }),
    summaryLines: generateSummaryLines('clean', state, null, null),
    actions,
    continueStrategy: { type: 'nothing' },
  };
}
