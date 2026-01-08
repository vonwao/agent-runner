/**
 * Tests for checkpoint commit protection.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { isCheckpointCommit, checkAmendAllowed } from '../checkpoint.js';

describe('Checkpoint Guard', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'checkpoint-guard-'));
    repoPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoPath);

    // Initialize git repo
    execSync('git init', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: repoPath, stdio: 'pipe' });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('isCheckpointCommit', () => {
    it('detects checkpoint by subject prefix', () => {
      // Create a checkpoint-style commit
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "chore(runr): checkpoint 20260106120000 milestone 0"', {
        cwd: repoPath,
        stdio: 'pipe'
      });

      const result = isCheckpointCommit(repoPath);
      expect(result.isCheckpoint).toBe(true);
      expect(result.runId).toBe('20260106120000');
      expect(result.detectedBy).toBe('subject');
    });

    it('detects checkpoint by trailer', () => {
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      // Create commit with proper trailer format (blank line + trailers)
      const message = 'Some commit\n\nRunr-Checkpoint: true\nRunr-Run-Id: 20260106130000';
      execSync(`git commit -m "${message}"`, { cwd: repoPath, stdio: 'pipe' });

      const result = isCheckpointCommit(repoPath);
      expect(result.isCheckpoint).toBe(true);
      expect(result.runId).toBe('20260106130000');
      expect(result.detectedBy).toBe('trailer');
    });

    it('detects checkpoint by state.json', () => {
      // Create a regular commit
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "Regular commit"', { cwd: repoPath, stdio: 'pipe' });

      // Get the SHA
      const sha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();

      // Create .runr/runs directory with state.json that references this SHA
      const runDir = path.join(repoPath, '.runr', 'runs', '20260106140000');
      fs.mkdirSync(runDir, { recursive: true });
      fs.writeFileSync(
        path.join(runDir, 'state.json'),
        JSON.stringify({ checkpoint_commit_sha: sha })
      );

      const result = isCheckpointCommit(repoPath);
      expect(result.isCheckpoint).toBe(true);
      expect(result.runId).toBe('20260106140000');
      expect(result.detectedBy).toBe('state');
    });

    it('returns false for non-checkpoint commit', () => {
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "feat: regular feature"', { cwd: repoPath, stdio: 'pipe' });

      const result = isCheckpointCommit(repoPath);
      expect(result.isCheckpoint).toBe(false);
    });
  });

  describe('checkAmendAllowed', () => {
    it('blocks amend on checkpoint commit', () => {
      // Create a checkpoint commit
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "chore(runr): checkpoint 20260106120000 milestone 0"', {
        cwd: repoPath,
        stdio: 'pipe'
      });

      const result = checkAmendAllowed(repoPath, false, false);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Refusing to amend');
      expect(result.error).toContain('checkpoint commit');
      expect(result.error).toContain('verified work');
    });

    it('allows amend on checkpoint with --force', () => {
      // Create a checkpoint commit
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "chore(runr): checkpoint 20260106120000 milestone 0"', {
        cwd: repoPath,
        stdio: 'pipe'
      });

      const result = checkAmendAllowed(repoPath, true, false);
      expect(result.allowed).toBe(true);
      // Should include warning
      expect(result.error).toContain('Warning');
      expect(result.error).toContain('audited history');
    });

    it('does not block amend on non-checkpoint commit', () => {
      // Create a regular commit
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "feat: regular feature"', { cwd: repoPath, stdio: 'pipe' });

      const result = checkAmendAllowed(repoPath, false, false);
      expect(result.allowed).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('includes Ledger mode message when in ledger mode', () => {
      // Create a checkpoint commit
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add .', { cwd: repoPath, stdio: 'pipe' });
      execSync('git commit -m "chore(runr): checkpoint 20260106120000 milestone 0"', {
        cwd: repoPath,
        stdio: 'pipe'
      });

      const result = checkAmendAllowed(repoPath, false, true);
      expect(result.allowed).toBe(false);
      expect(result.error).toContain('Ledger mode');
      expect(result.error).toContain('immutable');
    });
  });
});
