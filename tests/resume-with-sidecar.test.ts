/**
 * Resume with Checkpoint Sidecar Tests
 *
 * Tests that resume correctly uses sidecar metadata and falls back to git log parsing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { _buildResumePlan } from '../src/commands/resume.js';
import { RunStore } from '../src/store/run-store.js';
import { agentConfigSchema } from '../src/config/schema.js';
import type { RunState } from '../src/types/schemas.js';
import type { CheckpointMetadata } from '../src/store/checkpoint-metadata.js';

// Helper to run git commands
function git(cmd: string, cwd: string): void {
  execSync(cmd, { cwd, stdio: 'pipe' });
}

describe('Resume with Sidecar', () => {
  let tmpDir: string;
  let repoPath: string;
  let runId: string;
  let runDir: string;
  let runStore: RunStore;

  beforeEach(async () => {
    // Create temp directory for test repo
    tmpDir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'resume-sidecar-test-'));
    repoPath = path.join(tmpDir, 'test-repo');
    fsSync.mkdirSync(repoPath);

    // Initialize git repo
    git('git init', repoPath);
    git('git config user.name "Test User"', repoPath);
    git('git config user.email "test@example.com"', repoPath);

    // Create initial commit
    fsSync.writeFileSync(path.join(repoPath, 'README.md'), '# Test\n');
    git('git add .', repoPath);
    git('git commit -m "Initial commit"', repoPath);

    // Setup run directory
    runId = '20260105000000';
    runDir = path.join(repoPath, '.runr', 'runs', runId);
    fsSync.mkdirSync(runDir, { recursive: true });
    runStore = new RunStore(runDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('prefers sidecar over git log', async () => {
    // Create a state with milestones
    const state: RunState = {
      schema_version: '1.0.0',
      run_id: runId,
      repo_path: repoPath,
      phase: 'IMPLEMENT',
      milestone_index: 1,
      milestones: [
        { goal: 'M0', done_checks: [], risk_level: 'low' },
        { goal: 'M1', done_checks: [], risk_level: 'low' },
        { goal: 'M2', done_checks: [], risk_level: 'low' }
      ],
      scope_lock: { allowlist: [], denylist: [] },
      risk_score: 0,
      retries: 0,
      milestone_retries: 0,
      phase_started_at: new Date().toISOString(),
      phase_attempt: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      worker_stats: {
        claude: 0,
        codex: 0,
        by_phase: {
          plan: { claude: 0, codex: 0 },
          implement: { claude: 0, codex: 0 },
          review: { claude: 0, codex: 0 }
        }
      }
    };

    // Create a checkpoint commit (git log method)
    fsSync.writeFileSync(path.join(repoPath, 'file1.txt'), 'content 1\n');
    git('git add .', repoPath);
    git(`git commit -m "chore(runr): checkpoint ${runId} milestone 0"`, repoPath);
    const gitSha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();

    // Create a sidecar with different SHA (to test that sidecar wins)
    const sidecarSha = 'sidecar123abc';
    const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
    await fs.mkdir(checkpointsDir, { recursive: true });

    const sidecarMetadata: CheckpointMetadata = {
      schema_version: 1,
      sha: sidecarSha,
      run_id: runId,
      milestone_index: 0,
      milestone_title: 'M0',
      created_at: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(checkpointsDir, `${sidecarSha}.json`),
      JSON.stringify(sidecarMetadata, null, 2)
    );

    // Build resume plan
    const config = agentConfigSchema.parse({
      agent: {},
      scope: {},
      verification: {}
    });
    const plan = await _buildResumePlan({ state, repoPath, runStore, config });

    // Should prefer sidecar
    expect(plan.checkpointSource).toBe('sidecar');
    expect(plan.checkpointSha).toBe(sidecarSha);
    expect(plan.lastCheckpointMilestoneIndex).toBe(0);
    expect(plan.resumeFromMilestoneIndex).toBe(1);
  });

  it('falls back to git log if sidecar missing', async () => {
    // Create a state with milestones
    const state: RunState = {
      schema_version: '1.0.0',
      run_id: runId,
      repo_path: repoPath,
      phase: 'IMPLEMENT',
      milestone_index: 1,
      milestones: [
        { goal: 'M0', done_checks: [], risk_level: 'low' },
        { goal: 'M1', done_checks: [], risk_level: 'low' }
      ],
      scope_lock: { allowlist: [], denylist: [] },
      risk_score: 0,
      retries: 0,
      milestone_retries: 0,
      phase_started_at: new Date().toISOString(),
      phase_attempt: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      worker_stats: {
        claude: 0,
        codex: 0,
        by_phase: {
          plan: { claude: 0, codex: 0 },
          implement: { claude: 0, codex: 0 },
          review: { claude: 0, codex: 0 }
        }
      }
    };

    // Create checkpoint commit (no sidecar)
    fsSync.writeFileSync(path.join(repoPath, 'file1.txt'), 'content 1\n');
    git('git add .', repoPath);
    git(`git commit -m "chore(runr): checkpoint ${runId} milestone 0"`, repoPath);
    const gitSha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();

    // Build resume plan (no sidecar exists)
    const config = agentConfigSchema.parse({
      agent: {},
      scope: {},
      verification: {}
    });
    const plan = await _buildResumePlan({ state, repoPath, runStore, config });

    // Should fall back to git log
    expect(plan.checkpointSource).toBe('git_log_run_specific');
    expect(plan.checkpointSha).toBe(gitSha);
    expect(plan.lastCheckpointMilestoneIndex).toBe(0);
  });

  it('falls back to git log if sidecar corrupt', async () => {
    // Create a state
    const state: RunState = {
      schema_version: '1.0.0',
      run_id: runId,
      repo_path: repoPath,
      phase: 'IMPLEMENT',
      milestone_index: 1,
      milestones: [
        { goal: 'M0', done_checks: [], risk_level: 'low' },
        { goal: 'M1', done_checks: [], risk_level: 'low' }
      ],
      scope_lock: { allowlist: [], denylist: [] },
      risk_score: 0,
      retries: 0,
      milestone_retries: 0,
      phase_started_at: new Date().toISOString(),
      phase_attempt: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      worker_stats: {
        claude: 0,
        codex: 0,
        by_phase: {
          plan: { claude: 0, codex: 0 },
          implement: { claude: 0, codex: 0 },
          review: { claude: 0, codex: 0 }
        }
      }
    };

    // Create checkpoint commit
    fsSync.writeFileSync(path.join(repoPath, 'file1.txt'), 'content 1\n');
    git('git add .', repoPath);
    git(`git commit -m "chore(runr): checkpoint ${runId} milestone 0"`, repoPath);
    const gitSha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();

    // Create corrupt sidecar
    const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
    await fs.mkdir(checkpointsDir, { recursive: true });
    await fs.writeFile(
      path.join(checkpointsDir, 'corrupt.json'),
      'not valid json {'
    );

    // Build resume plan
    const config = agentConfigSchema.parse({
      agent: {},
      scope: {},
      verification: {}
    });
    const plan = await _buildResumePlan({ state, repoPath, runStore, config });

    // Should fall back to git log
    expect(plan.checkpointSource).toBe('git_log_run_specific');
    expect(plan.checkpointSha).toBe(gitSha);
  });

  it('handles multiple checkpoints with same milestone_index', async () => {
    // Create a state
    const state: RunState = {
      schema_version: '1.0.0',
      run_id: runId,
      repo_path: repoPath,
      phase: 'IMPLEMENT',
      milestone_index: 1,
      milestones: [
        { goal: 'M0', done_checks: [], risk_level: 'low' },
        { goal: 'M1', done_checks: [], risk_level: 'low' }
      ],
      scope_lock: { allowlist: [], denylist: [] },
      risk_score: 0,
      retries: 0,
      milestone_retries: 0,
      phase_started_at: new Date().toISOString(),
      phase_attempt: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      worker_stats: {
        claude: 0,
        codex: 0,
        by_phase: {
          plan: { claude: 0, codex: 0 },
          implement: { claude: 0, codex: 0 },
          review: { claude: 0, codex: 0 }
        }
      }
    };

    // Create multiple sidecars with same milestone_index but different created_at
    const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
    await fs.mkdir(checkpointsDir, { recursive: true });

    const older = new Date('2026-01-05T00:00:00Z').toISOString();
    const newer = new Date('2026-01-05T01:00:00Z').toISOString();

    const sidecar1: CheckpointMetadata = {
      schema_version: 1,
      sha: 'sha_older',
      run_id: runId,
      milestone_index: 0,
      milestone_title: 'M0 older',
      created_at: older
    };

    const sidecar2: CheckpointMetadata = {
      schema_version: 1,
      sha: 'sha_newer',
      run_id: runId,
      milestone_index: 0,
      milestone_title: 'M0 newer',
      created_at: newer
    };

    await fs.writeFile(
      path.join(checkpointsDir, 'sha_older.json'),
      JSON.stringify(sidecar1, null, 2)
    );

    await fs.writeFile(
      path.join(checkpointsDir, 'sha_newer.json'),
      JSON.stringify(sidecar2, null, 2)
    );

    // Build resume plan
    const config = agentConfigSchema.parse({
      agent: {},
      scope: {},
      verification: {}
    });
    const plan = await _buildResumePlan({ state, repoPath, runStore, config });

    // Should pick the newer one
    expect(plan.checkpointSource).toBe('sidecar');
    expect(plan.checkpointSha).toBe('sha_newer');
    expect(plan.lastCheckpointMilestoneIndex).toBe(0);
  });

  it('emits resume_checkpoint_selected event', async () => {
    // Create a state
    const state: RunState = {
      schema_version: '1.0.0',
      run_id: runId,
      repo_path: repoPath,
      phase: 'IMPLEMENT',
      milestone_index: 1,
      milestones: [
        { goal: 'M0', done_checks: [], risk_level: 'low' },
        { goal: 'M1', done_checks: [], risk_level: 'low' }
      ],
      scope_lock: { allowlist: [], denylist: [] },
      risk_score: 0,
      retries: 0,
      milestone_retries: 0,
      phase_started_at: new Date().toISOString(),
      phase_attempt: 1,
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      worker_stats: {
        claude: 0,
        codex: 0,
        by_phase: {
          plan: { claude: 0, codex: 0 },
          implement: { claude: 0, codex: 0 },
          review: { claude: 0, codex: 0 }
        }
      }
    };

    // Create sidecar
    const sidecarSha = 'test_sha_123';
    const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
    await fs.mkdir(checkpointsDir, { recursive: true });

    const sidecarMetadata: CheckpointMetadata = {
      schema_version: 1,
      sha: sidecarSha,
      run_id: runId,
      milestone_index: 0,
      milestone_title: 'M0',
      created_at: new Date().toISOString()
    };

    await fs.writeFile(
      path.join(checkpointsDir, `${sidecarSha}.json`),
      JSON.stringify(sidecarMetadata, null, 2)
    );

    // Build resume plan
    const config = agentConfigSchema.parse({
      agent: {},
      scope: {},
      verification: {}
    });
    await _buildResumePlan({ state, repoPath, runStore, config });

    // Check that event was emitted
    const timelinePath = path.join(runDir, 'timeline.jsonl');
    const timeline = fsSync.readFileSync(timelinePath, 'utf-8');
    const events = timeline.trim().split('\n').map(line => JSON.parse(line));

    const resumeEvent = events.find(e => e.type === 'resume_checkpoint_selected');
    expect(resumeEvent).toBeDefined();
    expect(resumeEvent?.payload.source).toBe('sidecar');
    expect(resumeEvent?.payload.sha).toBe(sidecarSha);
    expect(resumeEvent?.payload.milestone_index).toBe(0);
  });
});
