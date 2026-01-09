/**
 * Tests for brain module
 */

import { describe, it, expect } from 'vitest';
import { computeBrain, type BrainOutput } from '../brain.js';
import type { RepoState, StoppedRunInfo, OrchCursor } from '../state.js';

// Helper to create minimal RepoState
function createState(overrides: Partial<RepoState> = {}): RepoState {
  return {
    activeRun: null,
    latestRun: null,
    latestStopped: null,
    orchestration: null,
    taskSummary: null,
    treeStatus: 'clean',
    mode: 'flow',
    repoPath: '/test/repo',
    ...overrides,
  };
}

// Helper to create StoppedRunInfo
function createStopped(stopReason: string, overrides: Partial<StoppedRunInfo> = {}): StoppedRunInfo {
  return {
    runId: 'test-run-123',
    phase: 'STOPPED',
    stopReason,
    taskPath: '/test/task.md',
    startedAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T01:00:00Z',
    stopJsonPath: null,
    diagnosticsPath: null,
    ...overrides,
  };
}

// Helper to create OrchCursor
function createOrch(overrides: Partial<OrchCursor> = {}): OrchCursor {
  return {
    orchestratorId: 'orch-123',
    status: 'running',
    tracksTotal: 3,
    tracksComplete: 1,
    tracksStopped: 0,
    configPath: null,
    ...overrides,
  };
}

describe('brain', () => {
  describe('exactly 3 actions invariant', () => {
    it('returns exactly 3 actions for clean state', () => {
      const output = computeBrain({
        state: createState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions).toHaveLength(3);
    });

    it('returns exactly 3 actions for running state', () => {
      const output = computeBrain({
        state: createState({
          activeRun: {
            runId: 'run-123',
            phase: 'IMPLEMENT',
            stopReason: null,
            taskPath: '/test/task.md',
            startedAt: '2026-01-01T00:00:00Z',
            updatedAt: '2026-01-01T00:00:00Z',
          },
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions).toHaveLength(3);
    });

    it('returns exactly 3 actions for stopped state', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions).toHaveLength(3);
    });

    it('returns exactly 3 actions for orchestration state', () => {
      const output = computeBrain({
        state: createState({
          orchestration: createOrch(),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions).toHaveLength(3);
    });
  });

  describe('action[0] is primary', () => {
    it('first action is primary for clean state', () => {
      const output = computeBrain({
        state: createState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions[0].primary).toBe(true);
      expect(output.actions[1].primary).toBe(false);
      expect(output.actions[2].primary).toBe(false);
    });

    it('first action is primary for stopped state', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('stalled_timeout'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.actions[0].primary).toBe(true);
    });
  });

  describe('precedence: STOPPED over ORCH_READY', () => {
    it('chooses stopped when both stopped and orchestration exist', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('stalled_timeout'),
          orchestration: createOrch(),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      // Should show stopped status, not orch_ready
      expect(output.status).toBe('stopped_auto');
      expect(output.continueStrategy.type).toBe('auto_resume');
    });
  });

  describe('stop reason classification', () => {
    // Auto-resume reasons
    it('classifies stalled_timeout as auto_resume', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('stalled_timeout'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('auto_resume');
      expect(output.status).toBe('stopped_auto');
    });

    it('classifies max_ticks_reached as auto_resume', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('max_ticks_reached'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('auto_resume');
    });

    it('classifies time_budget_exceeded as auto_resume', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('time_budget_exceeded'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('auto_resume');
    });

    // Manual reasons
    it('classifies guard_violation as manual', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('guard_violation'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
    });

    it('classifies scope_violation as manual', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('scope_violation'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('manual');
    });

    it('classifies submit_conflict as manual', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('submit_conflict'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('manual');
    });

    // Potentially auto-fixable (without commands = manual)
    it('classifies review_loop_detected without commands as manual', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
    });

    // Auto-fixable with safe commands
    it('classifies review_loop_detected with safe commands as auto_fix', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Run tests', command: 'npm test', why: 'Run tests' },
            { title: 'Run typecheck', command: 'npm run typecheck', why: 'Run typecheck' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });
      expect(output.continueStrategy.type).toBe('auto_fix');
      expect(output.status).toBe('stopped_auto');
      if (output.continueStrategy.type === 'auto_fix') {
        expect(output.continueStrategy.commands).toHaveLength(2);
      }
    });

    // Auto-fixable with unsafe commands (filtered out)
    it('rejects unsafe commands in auto_fix', () => {
      const output = computeBrain({
        state: createState({
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Dangerous', command: 'npm test | tee log', why: 'Has pipe' },
            { title: 'Also dangerous', command: 'rm -rf /', why: 'Deletes everything' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });
      // No safe commands, so falls back to manual
      expect(output.continueStrategy.type).toBe('manual');
    });
  });

  describe('ledger mode restrictions', () => {
    it('requires manual intervention for auto_fix in ledger mode', () => {
      const output = computeBrain({
        state: createState({
          mode: 'ledger',
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Run tests', command: 'npm test', why: 'Run tests' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });
      // Ledger mode should make this manual
      expect(output.continueStrategy.type).toBe('manual');
      if (output.continueStrategy.type === 'manual') {
        expect(output.continueStrategy.blockedReason).toContain('Ledger');
      }
    });
  });

  describe('orchestration cursor', () => {
    it('suggests continue_orch when no stopped run', () => {
      const output = computeBrain({
        state: createState({
          orchestration: createOrch(),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.status).toBe('orch_ready');
      expect(output.continueStrategy.type).toBe('continue_orch');
    });
  });

  describe('clean state', () => {
    it('returns nothing strategy for clean state', () => {
      const output = computeBrain({
        state: createState(),
        stopDiagnosis: null,
        stopExplainer: null,
      });
      expect(output.status).toBe('clean');
      expect(output.continueStrategy.type).toBe('nothing');
    });
  });

  // ============================================================================
  // New tests for autoFixAvailable/autoFixPermitted logic
  // ============================================================================

  describe('autoFix analysis', () => {
    it('flow + clean + commands → auto_fix with correct headline', () => {
      const output = computeBrain({
        state: createState({
          mode: 'flow',
          treeStatus: 'clean',
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Run tests', command: 'npm test', why: 'Run tests' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });

      expect(output.continueStrategy.type).toBe('auto_fix');
      expect(output.status).toBe('stopped_auto');
      expect(output.headline).toContain('auto-fix available');
      expect(output.stoppedAnalysis?.autoFixAvailable).toBe(true);
      expect(output.stoppedAnalysis?.autoFixPermitted).toBe(true);
    });

    it('ledger + clean + commands → manual with blocked headline and --force action', () => {
      const output = computeBrain({
        state: createState({
          mode: 'ledger',
          treeStatus: 'clean',
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Run tests', command: 'npm test', why: 'Run tests' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });

      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
      expect(output.headline).toContain('blocked');
      expect(output.headline).toContain('ledger');
      // Primary action should be runr continue --force
      expect(output.actions[0].command).toBe('runr continue --force');
      expect(output.actions[0].primary).toBe(true);
      // Analysis should show available but not permitted
      expect(output.stoppedAnalysis?.autoFixAvailable).toBe(true);
      expect(output.stoppedAnalysis?.autoFixPermitted).toBe(false);
      expect(output.stoppedAnalysis?.blockReason).toBe('ledger_mode');
      // Summary should include hint about --force
      expect(output.summaryLines.some(line => line.includes('--force'))).toBe(true);
    });

    it('ledger + dirty + commands → manual with dirty+ledger in headline', () => {
      const output = computeBrain({
        state: createState({
          mode: 'ledger',
          treeStatus: 'dirty',
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Run tests', command: 'npm test', why: 'Run tests' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });

      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
      expect(output.headline).toContain('blocked');
      expect(output.headline).toContain('dirty');
      // Analysis should show dirty tree block reason
      expect(output.stoppedAnalysis?.autoFixAvailable).toBe(true);
      expect(output.stoppedAnalysis?.autoFixPermitted).toBe(false);
      expect(output.stoppedAnalysis?.blockReason).toBe('dirty_tree_ledger');
      expect(output.stoppedAnalysis?.treeDirty).toBe(true);
    });

    it('manual reason + flow + dirty → still manual, dirty is informational', () => {
      const output = computeBrain({
        state: createState({
          mode: 'flow',
          treeStatus: 'dirty',
          latestStopped: createStopped('guard_violation'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
      // Headline should say manual intervention, not blocked
      expect(output.headline).toContain('manual intervention needed');
      expect(output.headline).not.toContain('blocked');
      // Primary action should be view report (not --force)
      expect(output.actions[0].command).toContain('runr report');
      // Tree dirty doesn't change the bucket for manual reasons
      expect(output.summaryLines.some(line => line.includes('dirty'))).toBe(true);
    });

    it('unsafe_commands → headline shows blocked, primary is report (not --force)', () => {
      const output = computeBrain({
        state: createState({
          mode: 'flow',
          treeStatus: 'clean',
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            // Unsafe command (has pipe)
            { title: 'Dangerous', command: 'npm test | tee log', why: 'Has pipe' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });

      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
      expect(output.headline).toContain('unsafe commands');
      // Primary action should be report, not --force (force doesn't help here)
      expect(output.actions[0].command).toContain('runr report');
      expect(output.actions[0].command).not.toContain('--force');
      // Analysis should show blockReason
      expect(output.stoppedAnalysis?.blockReason).toBe('unsafe_commands');
      expect(output.stoppedAnalysis?.autoFixAvailable).toBe(false);
    });

    it('no_commands → headline shows unavailable, primary is report', () => {
      const output = computeBrain({
        state: createState({
          mode: 'flow',
          treeStatus: 'clean',
          latestStopped: createStopped('review_loop_detected'),
        }),
        // No commands at all
        stopDiagnosis: null,
        stopExplainer: null,
      });

      expect(output.continueStrategy.type).toBe('manual');
      expect(output.status).toBe('stopped_manual');
      expect(output.headline).toContain('unavailable');
      expect(output.headline).toContain('no safe commands');
      // Primary action should be report
      expect(output.actions[0].command).toContain('runr report');
      // Analysis should show blockReason
      expect(output.stoppedAnalysis?.blockReason).toBe('no_commands');
      expect(output.stoppedAnalysis?.autoFixAvailable).toBe(false);
    });
  });

  describe('invariants', () => {
    it('safeCommands.length > 0 iff autoFixAvailable', () => {
      // Test case 1: Has safe commands → autoFixAvailable = true
      const output1 = computeBrain({
        state: createState({
          mode: 'flow',
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: {
          run_id: 'test-run-123',
          outcome: 'stopped',
          stop_reason: 'review_loop_detected',
          stop_reason_family: 'review',
          primary_diagnosis: 'review_loop_detected',
          confidence: 1,
          signals: [],
          next_actions: [
            { title: 'Run tests', command: 'npm test', why: 'Run tests' },
          ],
          related_artifacts: {},
          diagnosed_at: '2026-01-01T00:00:00Z',
        },
        stopExplainer: null,
      });

      if (output1.stoppedAnalysis?.autoFixAvailable) {
        expect(output1.stoppedAnalysis.safeCommands.length).toBeGreaterThan(0);
      }

      // Test case 2: No safe commands → autoFixAvailable = false
      const output2 = computeBrain({
        state: createState({
          mode: 'flow',
          latestStopped: createStopped('review_loop_detected'),
        }),
        stopDiagnosis: null,
        stopExplainer: null,
      });

      if (output2.stoppedAnalysis?.safeCommands.length === 0) {
        expect(output2.stoppedAnalysis.autoFixAvailable).toBe(false);
      }

      // Verify the inverse: if autoFixAvailable is false, safeCommands should be empty
      // (for potentially fixable reasons)
      expect(output2.stoppedAnalysis?.autoFixAvailable).toBe(false);
      expect(output2.stoppedAnalysis?.safeCommands).toHaveLength(0);
    });
  });
});
