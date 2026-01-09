/**
 * Invariant Test: Orchestrator Dependency Gating
 *
 * Core promise: A plan with track B depending on task A must not
 * launch B until A is completed in task-status.json.
 *
 * This protects the "Runr doesn't waste your time" contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { makeScheduleDecision, createInitialOrchestratorState } from '../../src/orchestrator/state-machine.js';
import { markTaskCompleted } from '../../src/store/task-status.js';
import type { OrchestrationConfig, OrchestratorState, Step, CollisionPolicy } from '../../src/orchestrator/types.js';

/** Default options for createInitialOrchestratorState */
const defaultOptions = {
  timeBudgetMinutes: 60,
  maxTicks: 100,
  collisionPolicy: 'serialize' as CollisionPolicy,
  ownershipRequired: false,  // Don't require ownership for these tests
};

describe('Orchestrator Dependency Gating Invariant', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orch-deps-test-'));
    repoPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoPath);

    // Create .runr directory
    fs.mkdirSync(path.join(repoPath, '.runr', 'tasks'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * Helper to create orchestration config with dependency relationships.
   * Note: Config uses 'task' field, state machine converts to 'task_path'.
   * Track IDs are auto-generated as track-1, track-2, etc.
   */
  function createConfig(tracks: Array<{
    name: string;
    taskPath: string;
    dependsOn?: string[];
  }>): OrchestrationConfig {
    return {
      tracks: tracks.map(t => ({
        name: t.name,
        steps: [{
          task: t.taskPath,  // StepConfig uses 'task', not 'task_path'
        }]
      }))
    };
  }

  /**
   * Helper to create state with metadata applied to steps.
   */
  function createStateWithDeps(
    config: OrchestrationConfig,
    stepDeps: Record<string, string[]>
  ): OrchestratorState {
    const state = createInitialOrchestratorState(config, repoPath, defaultOptions);

    // Apply depends_on to steps (simulating what applyTaskMetadata does)
    for (const track of state.tracks) {
      for (const step of track.steps) {
        step.depends_on = stepDeps[step.task_path] ?? [];
        // Also add dummy ownership to avoid ownership blocks
        step.owns_normalized = [`${step.task_path}/**`];
        step.owns_raw = [`${step.task_path}/**`];
      }
    }

    return state;
  }

  it('does NOT launch track B when dependency task A is not completed', () => {
    // Setup: Track B depends on task A being completed
    // Note: state machine auto-generates IDs as track-1, track-2, etc.
    const config = createConfig([
      { name: 'Track A', taskPath: '.runr/tasks/task-a.md' },
      { name: 'Track B', taskPath: '.runr/tasks/task-b.md', dependsOn: ['.runr/tasks/task-a.md'] }
    ]);

    const state = createStateWithDeps(config, {
      '.runr/tasks/task-a.md': [],
      '.runr/tasks/task-b.md': ['.runr/tasks/task-a.md']
    });

    // Task A is NOT completed (no entry in task-status.json)
    // No need to do anything - default state has no completions

    // Make schedule decision
    const decision = makeScheduleDecision(state);

    // INVARIANT: Should launch Track A (track-1, no deps), NOT Track B
    expect(decision.action).toBe('launch');
    expect(decision.track_id).toBe('track-1');  // Auto-generated ID
  });

  it('launches track B only AFTER dependency task A is completed', () => {
    const config = createConfig([
      { name: 'Track A', taskPath: '.runr/tasks/task-a.md' },
      { name: 'Track B', taskPath: '.runr/tasks/task-b.md', dependsOn: ['.runr/tasks/task-a.md'] }
    ]);

    const state = createStateWithDeps(config, {
      '.runr/tasks/task-a.md': [],
      '.runr/tasks/task-b.md': ['.runr/tasks/task-a.md']
    });

    // Mark task A as completed
    markTaskCompleted(repoPath, '.runr/tasks/task-a.md', 'run-001', 'sha-abc');

    // Also mark track A as complete in state (simulating it finished)
    state.tracks[0].status = 'complete';
    state.tracks[0].steps[0].result = { status: 'complete', elapsed_ms: 1000 };

    // Make schedule decision
    const decision = makeScheduleDecision(state);

    // INVARIANT: Now should launch Track B (track-2) since task A is completed
    expect(decision.action).toBe('launch');
    expect(decision.track_id).toBe('track-2');  // Auto-generated ID
  });

  it('waits when all pending tracks have unmet dependencies', () => {
    const config = createConfig([
      { name: 'Track A', taskPath: '.runr/tasks/task-a.md', dependsOn: ['.runr/tasks/external.md'] },
    ]);

    const state = createStateWithDeps(config, {
      '.runr/tasks/task-a.md': ['.runr/tasks/external.md']
    });

    // External dependency is NOT completed
    // Make schedule decision
    const decision = makeScheduleDecision(state);

    // INVARIANT: Should wait, not launch
    expect(decision.action).toBe('wait');
    expect(decision.reason).toContain('dependencies');
  });

  it('handles chain of dependencies correctly', () => {
    // A -> B -> C (C depends on B, B depends on A)
    const config = createConfig([
      { name: 'Track A', taskPath: '.runr/tasks/a.md' },
      { name: 'Track B', taskPath: '.runr/tasks/b.md', dependsOn: ['.runr/tasks/a.md'] },
      { name: 'Track C', taskPath: '.runr/tasks/c.md', dependsOn: ['.runr/tasks/b.md'] }
    ]);

    const state = createStateWithDeps(config, {
      '.runr/tasks/a.md': [],
      '.runr/tasks/b.md': ['.runr/tasks/a.md'],
      '.runr/tasks/c.md': ['.runr/tasks/b.md']
    });

    // Initially: should launch A (track-1)
    let decision = makeScheduleDecision(state);
    expect(decision.action).toBe('launch');
    expect(decision.track_id).toBe('track-1');

    // Complete A
    markTaskCompleted(repoPath, '.runr/tasks/a.md', 'run-a', 'sha-a');
    state.tracks[0].status = 'complete';
    state.tracks[0].steps[0].result = { status: 'complete', elapsed_ms: 100 };

    // Now should launch B (track-2)
    decision = makeScheduleDecision(state);
    expect(decision.action).toBe('launch');
    expect(decision.track_id).toBe('track-2');

    // Complete B
    markTaskCompleted(repoPath, '.runr/tasks/b.md', 'run-b', 'sha-b');
    state.tracks[1].status = 'complete';
    state.tracks[1].steps[0].result = { status: 'complete', elapsed_ms: 100 };

    // Now should launch C (track-3)
    decision = makeScheduleDecision(state);
    expect(decision.action).toBe('launch');
    expect(decision.track_id).toBe('track-3');
  });
});
