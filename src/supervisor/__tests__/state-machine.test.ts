import { describe, it, expect } from 'vitest';
import { createInitialState, updatePhase, stopRun, computeResumeTargetPhase, prepareForResume } from '../state-machine.js';

describe('createInitialState', () => {
  it('creates state with INIT phase', () => {
    const state = createInitialState({
      run_id: 'test-run-123',
      repo_path: '/test/repo',
      task_text: 'Test task',
      allowlist: ['src/**'],
      denylist: ['node_modules/**']
    });

    expect(state.run_id).toBe('test-run-123');
    expect(state.repo_path).toBe('/test/repo');
    expect(state.phase).toBe('INIT');
    expect(state.milestone_index).toBe(0);
    expect(state.scope_lock.allowlist).toEqual(['src/**']);
    expect(state.scope_lock.denylist).toEqual(['node_modules/**']);
    expect(state.risk_score).toBe(0);
    expect(state.retries).toBe(0);
  });

  it('parses task text into milestones', () => {
    const state = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Add a new feature\n\nMore details here',
      allowlist: [],
      denylist: []
    });

    expect(state.milestones.length).toBeGreaterThan(0);
    expect(state.milestones[0].goal).toBe('Add a new feature');
  });
});

describe('updatePhase', () => {
  it('updates phase and tracks last_successful_phase as previous phase', () => {
    const initial = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    const updated = updatePhase(initial, 'PLAN');

    expect(updated.phase).toBe('PLAN');
    // last_successful_phase tracks the previous phase (INIT in this case)
    expect(updated.last_successful_phase).toBe('INIT');
    // updated_at is set (may be same as initial if test runs in same ms)
    expect(typeof updated.updated_at).toBe('string');
    expect(updated.updated_at.length).toBeGreaterThan(0);
  });

  it('preserves other state properties', () => {
    const initial = createInitialState({
      run_id: 'preserve-test',
      repo_path: '/preserve',
      task_text: 'Preserve task',
      allowlist: ['src/**'],
      denylist: ['dist/**']
    });

    const updated = updatePhase(initial, 'IMPLEMENT');

    expect(updated.run_id).toBe('preserve-test');
    expect(updated.repo_path).toBe('/preserve');
    expect(updated.scope_lock.allowlist).toEqual(['src/**']);
  });
});

describe('stopRun', () => {
  it('sets phase to STOPPED and records reason', () => {
    const initial = createInitialState({
      run_id: 'stop-test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    const stopped = stopRun(initial, 'verification_failed');

    expect(stopped.phase).toBe('STOPPED');
    expect(stopped.stop_reason).toBe('verification_failed');
  });

  it('preserves state when stopping', () => {
    let state = createInitialState({
      run_id: 'stop-preserve',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: ['src/**'],
      denylist: []
    });

    state = updatePhase(state, 'IMPLEMENT');
    state = { ...state, milestone_index: 2 };

    const stopped = stopRun(state, 'complete');

    expect(stopped.milestone_index).toBe(2);
    expect(stopped.scope_lock.allowlist).toEqual(['src/**']);
  });
});

describe('phase ordering', () => {
  it('follows expected phase progression for success path', () => {
    const phases: string[] = [];

    let state = createInitialState({
      run_id: 'phase-order',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });
    phases.push(state.phase);

    state = updatePhase(state, 'PLAN');
    phases.push(state.phase);

    state = updatePhase(state, 'IMPLEMENT');
    phases.push(state.phase);

    state = updatePhase(state, 'VERIFY');
    phases.push(state.phase);

    state = updatePhase(state, 'REVIEW');
    phases.push(state.phase);

    state = updatePhase(state, 'CHECKPOINT');
    phases.push(state.phase);

    state = updatePhase(state, 'FINALIZE');
    phases.push(state.phase);

    expect(phases).toEqual([
      'INIT',
      'PLAN',
      'IMPLEMENT',
      'VERIFY',
      'REVIEW',
      'CHECKPOINT',
      'FINALIZE'
    ]);
  });

  it('can loop back to IMPLEMENT after CHECKPOINT for multiple milestones', () => {
    let state = createInitialState({
      run_id: 'loop-test',
      repo_path: '/test',
      task_text: 'Multi milestone task',
      allowlist: [],
      denylist: []
    });

    // First milestone
    state = updatePhase(state, 'PLAN');
    state = updatePhase(state, 'IMPLEMENT');
    state = updatePhase(state, 'VERIFY');
    state = updatePhase(state, 'REVIEW');
    state = updatePhase(state, 'CHECKPOINT');
    state = { ...state, milestone_index: 1 };

    // Second milestone - loops back to IMPLEMENT
    state = updatePhase(state, 'IMPLEMENT');
    expect(state.phase).toBe('IMPLEMENT');
    expect(state.milestone_index).toBe(1);

    state = updatePhase(state, 'VERIFY');
    state = updatePhase(state, 'REVIEW');
    state = updatePhase(state, 'CHECKPOINT');
    state = { ...state, milestone_index: 2 };

    // Finalize after all milestones
    state = updatePhase(state, 'FINALIZE');
    expect(state.phase).toBe('FINALIZE');
    expect(state.milestone_index).toBe(2);
  });

  it('stops on verification failure', () => {
    let state = createInitialState({
      run_id: 'verify-fail',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    state = updatePhase(state, 'PLAN');
    state = updatePhase(state, 'IMPLEMENT');
    state = updatePhase(state, 'VERIFY');

    // Verification fails - stop run
    state = stopRun(state, 'verification_failed');

    expect(state.phase).toBe('STOPPED');
    expect(state.stop_reason).toBe('verification_failed');
    // last_successful_phase is set by updatePhase (previous phase), not stopRun
    expect(state.last_successful_phase).toBe('IMPLEMENT');
  });
});

describe('computeResumeTargetPhase', () => {
  it('returns current phase if not STOPPED', () => {
    const state = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    const updated = updatePhase(state, 'IMPLEMENT');
    expect(computeResumeTargetPhase(updated)).toBe('IMPLEMENT');
  });

  it('returns next phase after last_successful_phase when STOPPED', () => {
    let state = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    state = updatePhase(state, 'PLAN');
    state = updatePhase(state, 'IMPLEMENT');
    state = updatePhase(state, 'VERIFY');
    state = stopRun(state, 'stalled_timeout');

    // last_successful_phase is IMPLEMENT (from the VERIFY transition)
    expect(state.last_successful_phase).toBe('IMPLEMENT');
    expect(computeResumeTargetPhase(state)).toBe('VERIFY');
  });

  it('returns INIT when STOPPED with no last_successful_phase', () => {
    const state = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    const stopped = stopRun(state, 'guard_violation');
    expect(computeResumeTargetPhase(stopped)).toBe('INIT');
  });
});

describe('prepareForResume', () => {
  it('clears stop state and sets resume phase', () => {
    let state = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    // Simulate normal phase progression: INIT -> PLAN -> IMPLEMENT -> VERIFY
    // Each updatePhase sets last_successful_phase to the PREVIOUS phase
    state = updatePhase(state, 'PLAN');       // last_successful_phase = 'INIT'
    state = updatePhase(state, 'IMPLEMENT');  // last_successful_phase = 'PLAN'
    state = updatePhase(state, 'VERIFY');     // last_successful_phase = 'IMPLEMENT'
    state = stopRun(state, 'stalled_timeout');
    state = { ...state, last_error: 'Some error' };

    const resumed = prepareForResume(state);

    // Resume from phase after last_successful_phase ('IMPLEMENT' -> 'VERIFY')
    expect(resumed.phase).toBe('VERIFY');
    expect(resumed.stop_reason).toBeUndefined();
    expect(resumed.last_error).toBeUndefined();
    expect(resumed.resume_token).toBe('test');
  });

  it('increments auto_resume_count when requested', () => {
    let state = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    state = stopRun(state, 'stalled_timeout');

    const resumed = prepareForResume(state, { incrementAutoResumeCount: true });
    expect(resumed.auto_resume_count).toBe(1);

    // Resume again
    const stoppedAgain = stopRun(resumed, 'worker_call_timeout');
    const resumedAgain = prepareForResume(stoppedAgain, { incrementAutoResumeCount: true });
    expect(resumedAgain.auto_resume_count).toBe(2);
  });

  it('preserves auto_resume_count when not incrementing', () => {
    let state = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    state = { ...state, auto_resume_count: 3 };
    state = stopRun(state, 'stalled_timeout');

    const resumed = prepareForResume(state);
    expect(resumed.auto_resume_count).toBe(3);
  });

  it('handles missing auto_resume_count (migration-safe)', () => {
    let state = createInitialState({
      run_id: 'test',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    // Simulate old state without auto_resume_count
    delete (state as any).auto_resume_count;
    state = stopRun(state, 'stalled_timeout');

    const resumed = prepareForResume(state, { incrementAutoResumeCount: true });
    expect(resumed.auto_resume_count).toBe(1);
  });

  it('uses custom resumeToken when provided', () => {
    let state = createInitialState({
      run_id: 'original-run',
      repo_path: '/test',
      task_text: 'Test',
      allowlist: [],
      denylist: []
    });

    state = stopRun(state, 'stalled_timeout');

    const resumed = prepareForResume(state, { resumeToken: 'custom-token' });
    expect(resumed.resume_token).toBe('custom-token');
  });
});
