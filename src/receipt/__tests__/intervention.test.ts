/**
 * Tests for Intervention Receipt
 *
 * These tests verify the intervention receipt functionality
 * that captures manual work done outside Runr's normal flow.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  writeIntervention,
  type InterventionReceipt,
  type InterventionReason
} from '../intervention.js';

describe('Intervention Receipt', () => {
  let tmpDir: string;
  let repoPath: string;
  let runStorePath: string;

  beforeEach(() => {
    // Create temp directory structure
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'intervention-test-'));
    repoPath = path.join(tmpDir, 'repo');
    runStorePath = path.join(tmpDir, 'run-store');

    fs.mkdirSync(repoPath);
    fs.mkdirSync(runStorePath);

    // Initialize git repo
    execSync('git init', { cwd: repoPath });
    execSync('git config user.email "test@test.com"', { cwd: repoPath });
    execSync('git config user.name "Test"', { cwd: repoPath });

    // Create initial commit
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test');
    execSync('git add .', { cwd: repoPath });
    execSync('git commit -m "Initial commit"', { cwd: repoPath });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('writeIntervention', () => {
    it('creates intervention receipt with required fields', async () => {
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'review_loop',
        note: 'Fixed TS errors manually',
        commands: []
      });

      expect(result.receipt).toBeDefined();
      expect(result.receipt.version).toBe('1');
      expect(result.receipt.run_id).toBe('20260106120000');
      expect(result.receipt.reason).toBe('review_loop');
      expect(result.receipt.note).toBe('Fixed TS errors manually');
      expect(result.receipt.timestamp).toBeDefined();
      expect(result.receipt.base_sha).toBeDefined();
      expect(result.receipt.branch).toBeDefined();
    });

    it('creates interventions directory if missing', async () => {
      const interventionsDir = path.join(runStorePath, 'interventions');
      expect(fs.existsSync(interventionsDir)).toBe(false);

      await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: []
      });

      expect(fs.existsSync(interventionsDir)).toBe(true);
    });

    it('writes receipt JSON file', async () => {
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'stalled_timeout',
        note: 'Completed task after timeout',
        commands: []
      });

      expect(fs.existsSync(result.receiptPath)).toBe(true);

      const written = JSON.parse(fs.readFileSync(result.receiptPath, 'utf-8')) as InterventionReceipt;
      expect(written.reason).toBe('stalled_timeout');
      expect(written.note).toBe('Completed task after timeout');
    });

    it('captures command execution results', async () => {
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'verification_failed',
        note: 'Ran verification manually',
        commands: ['echo "hello"', 'echo "world"']
      });

      expect(result.receipt.commands).toHaveLength(2);
      expect(result.receipt.commands[0].command).toBe('echo "hello"');
      expect(result.receipt.commands[0].exit_code).toBe(0);
      expect(result.receipt.commands[0].duration_ms).toBeGreaterThanOrEqual(0);
      expect(result.receipt.commands[1].command).toBe('echo "world"');
      expect(result.receipt.commands[1].exit_code).toBe(0);
    });

    it('captures failed command exit codes', async () => {
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Testing failed command',
        commands: ['exit 1']
      });

      expect(result.receipt.commands[0].exit_code).toBe(1);
    });

    it('detects uncommitted file changes', async () => {
      // Create an uncommitted change
      fs.writeFileSync(path.join(repoPath, 'new-file.txt'), 'new content');

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Added new file',
        commands: []
      });

      expect(result.receipt.files_changed).toContain('new-file.txt');
    });

    it('generates commit trailers', async () => {
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'review_loop',
        note: 'Fixed issues',
        commands: []
      });

      expect(result.trailers).toContain('Runr-Intervention: true');
      expect(result.trailers).toContain('Runr-Run-Id: 20260106120000');
      expect(result.trailers).toContain('Runr-Reason: review_loop');
    });

    it('receipt filename includes timestamp and reason', async () => {
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'scope_violation',
        note: 'Worked around scope guard',
        commands: []
      });

      const filename = path.basename(result.receiptPath);
      expect(filename).toMatch(/^\d{8}-\d{6}-scope_violation\.json$/);
    });
  });

  describe('reason validation', () => {
    const validReasons: InterventionReason[] = [
      'review_loop',
      'stalled_timeout',
      'verification_failed',
      'scope_violation',
      'manual_fix',
      'other'
    ];

    for (const reason of validReasons) {
      it(`accepts valid reason: ${reason}`, async () => {
        const result = await writeIntervention({
          runStorePath,
          repoPath,
          runId: '20260106120000',
          reason,
          note: 'Test',
          commands: []
        });

        expect(result.receipt.reason).toBe(reason);
      });
    }
  });

  describe('large output handling', () => {
    it('writes large command output to separate file', async () => {
      // Generate a command with large output (> 10KB or > 50 lines)
      const largeOutputCmd = 'for i in $(seq 1 100); do echo "Line $i with some content to make it longer"; done';

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Command with large output',
        commands: [largeOutputCmd]
      });

      // Should have output_file reference
      expect(result.receipt.commands[0].output_file).toBeDefined();

      // Output file should exist
      const outputPath = path.join(runStorePath, 'interventions', result.receipt.commands[0].output_file!);
      expect(fs.existsSync(outputPath)).toBe(true);

      // Output file should contain the command output
      const content = fs.readFileSync(outputPath, 'utf-8');
      expect(content).toContain('Line 1');
      expect(content).toContain('Line 100');
    });
  });

  describe('git state capture', () => {
    it('captures current HEAD sha', async () => {
      const expectedSha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: []
      });

      expect(result.receipt.base_sha).toBe(expectedSha);
    });

    it('captures current branch name', async () => {
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: []
      });

      // Default branch after git init
      expect(['master', 'main']).toContain(result.receipt.branch);
    });

    it('captures head_sha after commands', async () => {
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: []
      });

      expect(result.receipt.head_sha).toBeDefined();
      expect(result.receipt.head_sha.length).toBe(40);
    });

    it('detects dirty_before when tree is dirty', async () => {
      // Make tree dirty before intervention
      fs.writeFileSync(path.join(repoPath, 'dirty.txt'), 'dirty');

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: []
      });

      expect(result.receipt.dirty_before).toBe(true);
    });

    it('detects clean tree correctly', async () => {
      // No uncommitted changes
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: []
      });

      expect(result.receipt.dirty_before).toBe(false);
    });

    it('captures commits_in_range when commands create commits', async () => {
      const baseSha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test with commit',
        commands: [
          'echo "new" > new.txt',
          'git add new.txt',
          'git commit -m "Test commit"'
        ]
      });

      // base_sha should be the original HEAD
      expect(result.receipt.base_sha).toBe(baseSha);
      // head_sha should be different (new commit)
      expect(result.receipt.head_sha).not.toBe(baseSha);
      // commits_in_range should have the new commit
      expect(result.receipt.commits_in_range.length).toBeGreaterThan(0);
    });
  });

  describe('SHA anchor --since flag', () => {
    it('uses --since SHA as base_sha', async () => {
      // Create two commits
      fs.writeFileSync(path.join(repoPath, 'file1.txt'), 'one');
      execSync('git add . && git commit -m "commit 1"', { cwd: repoPath });
      const commit1 = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();

      fs.writeFileSync(path.join(repoPath, 'file2.txt'), 'two');
      execSync('git add . && git commit -m "commit 2"', { cwd: repoPath });

      // Intervene with --since pointing to commit1
      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Retroactive attribution',
        commands: [],
        sinceSha: commit1
      });

      // base_sha should be commit1
      expect(result.receipt.base_sha).toBe(commit1);
      // commits_in_range should include commit2
      expect(result.receipt.commits_in_range.length).toBe(1);
    });

    it('supports ref syntax like HEAD~1', async () => {
      // Create a second commit
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add . && git commit -m "Second commit"', { cwd: repoPath });
      const head = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
      const headMinus1 = execSync('git rev-parse HEAD~1', { cwd: repoPath, encoding: 'utf-8' }).trim();

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Using HEAD~1',
        commands: [],
        sinceSha: 'HEAD~1'
      });

      expect(result.receipt.base_sha).toBe(headMinus1);
      expect(result.receipt.head_sha).toBe(head);
    });

    it('throws error for invalid --since SHA', async () => {
      await expect(writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Invalid SHA',
        commands: [],
        sinceSha: 'invalid-sha-that-does-not-exist'
      })).rejects.toThrow('Could not resolve');
    });
  });

  describe('commit linking', () => {
    it('--commit creates commit with trailers', async () => {
      // Create uncommitted change
      fs.writeFileSync(path.join(repoPath, 'change.txt'), 'content');

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test commit',
        commands: [],
        commitMessage: 'Test commit with trailers'
      });

      // Should have commit SHA
      expect(result.commitSha).toBeDefined();
      expect(result.commitSha!.length).toBe(40);

      // Verify commit message has trailers
      const commitMsg = execSync('git log -1 --format=%B', { cwd: repoPath, encoding: 'utf-8' });
      expect(commitMsg).toContain('Test commit with trailers');
      expect(commitMsg).toContain('Runr-Run-Id: 20260106120000');
      expect(commitMsg).toContain('Runr-Intervention: true');
      expect(commitMsg).toContain('Runr-Reason: manual_fix');
    });

    it('--amend-last adds trailers to existing commit', async () => {
      // Create a commit to amend
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add . && git commit -m "Original message"', { cwd: repoPath });

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'review_loop',
        note: 'Amending test',
        commands: [],
        amendLast: true
      });

      // Should be marked as amended
      expect(result.amended).toBe(true);
      expect(result.commitSha).toBeDefined();

      // Verify commit message has original message + trailers
      const commitMsg = execSync('git log -1 --format=%B', { cwd: repoPath, encoding: 'utf-8' });
      expect(commitMsg).toContain('Original message');
      expect(commitMsg).toContain('Runr-Run-Id: 20260106120000');
      expect(commitMsg).toContain('Runr-Intervention: true');
    });

    it('throws error when --commit and --amend-last are both used', async () => {
      await expect(writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: [],
        commitMessage: 'message',
        amendLast: true
      })).rejects.toThrow('Cannot use both --commit and --amend-last');
    });

    it('--amend-last blocked in Ledger mode', async () => {
      // Create a commit to amend
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');
      execSync('git add . && git commit -m "Test"', { cwd: repoPath });

      await expect(writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: [],
        amendLast: true,
        workflowMode: 'ledger'
      })).rejects.toThrow('not allowed in Ledger mode');
    });

    it('--stage-only stages changes without committing', async () => {
      // Create uncommitted change
      fs.writeFileSync(path.join(repoPath, 'unstaged.txt'), 'content');

      // Verify it's untracked
      const statusBefore = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' });
      expect(statusBefore).toContain('??');

      await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: [],
        stageOnly: true
      });

      // Verify it's now staged
      const statusAfter = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' });
      expect(statusAfter).toContain('A ');
    });

    it('hasUncommittedChanges is true when changes exist and no commit', async () => {
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: []
      });

      expect(result.hasUncommittedChanges).toBe(true);
    });

    it('hasUncommittedChanges is false after --commit', async () => {
      fs.writeFileSync(path.join(repoPath, 'file.txt'), 'content');

      const result = await writeIntervention({
        runStorePath,
        repoPath,
        runId: '20260106120000',
        reason: 'manual_fix',
        note: 'Test',
        commands: [],
        commitMessage: 'Commit the changes'
      });

      expect(result.hasUncommittedChanges).toBe(false);
    });
  });
});
