/**
 * Acceptance tests for submit conflict handling.
 *
 * These tests verify:
 * - Clean state restoration after conflict
 * - Recovery commands in output
 * - Conflicted files are listed
 * - Timeline event has all required fields
 * - Branch is always restored
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';

function git(args: string, cwd: string): string {
  return execSync(`git ${args}`, { cwd, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function gitSafe(args: string, cwd: string): string {
  try {
    return git(args, cwd);
  } catch {
    return '';
  }
}

describe('Submit Conflict Handling', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'submit-conflict-'));
    repoPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoPath);

    // Initialize git repo
    git('init', repoPath);
    git('config user.email "test@test.com"', repoPath);
    git('config user.name "Test"', repoPath);

    // Create initial commit on main with gitignore
    fs.writeFileSync(path.join(repoPath, '.gitignore'), '.runr/\n');
    fs.writeFileSync(path.join(repoPath, 'file.txt'), 'initial');
    git('add .', repoPath);
    git('commit -m "initial"', repoPath);

    // Create dev branch
    git('checkout -b dev', repoPath);
    fs.writeFileSync(path.join(repoPath, 'file.txt'), 'dev version');
    git('add .', repoPath);
    git('commit -m "dev changes"', repoPath);

    // Go back to main and create conflicting change
    git('checkout main', repoPath);
    fs.writeFileSync(path.join(repoPath, 'file.txt'), 'main version');
    git('add .', repoPath);
    git('commit -m "main changes"', repoPath);

    // Create checkpoint branch with conflicting changes
    git('checkout -b checkpoint-branch', repoPath);
    fs.writeFileSync(path.join(repoPath, 'file.txt'), 'checkpoint version');
    git('add .', repoPath);
    git('commit -m "checkpoint commit"', repoPath);

    // Get checkpoint SHA
    const checkpointSha = git('rev-parse HEAD', repoPath);

    // Setup runr directory structure (after gitignore is set)
    fs.mkdirSync(path.join(repoPath, '.runr', 'runs', '20260107120000'), { recursive: true });
    fs.writeFileSync(
      path.join(repoPath, '.runr', 'runs', '20260107120000', 'state.json'),
      JSON.stringify({
        run_id: '20260107120000',
        checkpoint_commit_sha: checkpointSha,
        last_verification_evidence: { commands_run: [] }
      })
    );
    fs.writeFileSync(
      path.join(repoPath, '.runr', 'runs', '20260107120000', 'timeline.jsonl'),
      ''
    );

    // Create valid config with all required fields
    fs.writeFileSync(
      path.join(repoPath, '.runr', 'runr.config.json'),
      JSON.stringify({
        agent: {
          name: 'test-agent',
          model: 'claude-sonnet'
        },
        scope: {
          allowlist: ['**/*']
        },
        verification: {
          tier: 'tier0',
          commands: []
        },
        workflow: {
          mode: 'flow',
          profile: 'solo',
          integration_branch: 'dev',
          release_branch: 'main',
          require_verification: false,
          require_clean_tree: false
        }
      })
    );

    // Go back to main for tests
    git('checkout main', repoPath);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('restores branch after conflict', async () => {
    const startBranch = git('rev-parse --abbrev-ref HEAD', repoPath);
    expect(startBranch).toBe('main');

    // Run submit (will fail due to conflict)
    try {
      execSync(`npx runr submit 20260107120000 --to dev --repo "${repoPath}"`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {
      // Expected to fail
    }

    // Verify branch restored (most important invariant)
    const currentBranch = git('rev-parse --abbrev-ref HEAD', repoPath);
    expect(currentBranch).toBe('main');

    // Verify no conflict markers in working tree (file should be restored)
    const fileContent = fs.readFileSync(path.join(repoPath, 'file.txt'), 'utf-8');
    expect(fileContent).not.toContain('<<<<<<<');
    expect(fileContent).not.toContain('>>>>>>>');
  });

  it('includes recovery commands in output', async () => {
    let output = '';
    try {
      output = execSync(`npx runr submit 20260107120000 --to dev --repo "${repoPath}"`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error: any) {
      output = error.stderr || error.stdout || '';
    }

    // Check for recovery commands
    expect(output).toContain('git checkout dev');
    expect(output).toContain('git cherry-pick');
  });

  it('lists conflicted files', async () => {
    let output = '';
    try {
      execSync(`npx runr submit 20260107120000 --to dev --repo "${repoPath}"`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error: any) {
      output = error.stderr || error.stdout || '';
    }

    expect(output).toContain('file.txt');
  });

  it('timeline event has required fields', async () => {
    try {
      execSync(`npx runr submit 20260107120000 --to dev --repo "${repoPath}"`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch {
      // Expected
    }

    // Read timeline
    const timelinePath = path.join(repoPath, '.runr', 'runs', '20260107120000', 'timeline.jsonl');
    const timeline = fs.readFileSync(timelinePath, 'utf-8');
    const events = timeline.trim().split('\n').filter(Boolean).map(l => JSON.parse(l));

    const conflictEvent = events.find(e => e.type === 'submit_conflict');
    expect(conflictEvent).toBeDefined();
    expect(conflictEvent.payload.target_branch).toBe('dev');
    expect(conflictEvent.payload.conflicted_files).toContain('file.txt');
    expect(conflictEvent.payload.recovery_branch).toBeDefined();
    expect(conflictEvent.payload.recovery_state).toBeDefined();
    expect(conflictEvent.payload.suggested_commands).toBeDefined();
  });

  it('shows checkmarks for recovery state', async () => {
    let output = '';
    try {
      execSync(`npx runr submit 20260107120000 --to dev --repo "${repoPath}"`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });
    } catch (error: any) {
      output = error.stderr || error.stdout || '';
    }

    // Check for recovery state output with status indicators
    expect(output).toContain('Recovery state:');
    expect(output).toContain('Branch restored');
    // Check for either clean (✓) or not clean (✗) indicator
    expect(output).toMatch(/[✓✗] (Branch restored|Working tree)/);
  });
});
