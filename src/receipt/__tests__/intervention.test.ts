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
  });
});
