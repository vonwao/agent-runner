/**
 * Focused tests for Run Receipt v1
 *
 * These tests verify the core receipt functionality without
 * depending on the full run machinery.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import {
  writeReceipt,
  printRunReceipt,
  deriveTerminalState,
  extractBaseSha,
  ReceiptJson
} from '../writer.js';
import type { RunStore } from '../../store/run-store.js';

// Test constants matching spec thresholds
const COMPRESSION_SIZE_BYTES = 50 * 1024; // 50KB
const COMPRESSION_LINES = 2000;
const COMPRESSION_FILES = 100;

describe('Run Receipt v1', () => {
  let tmpDir: string;
  let repoPath: string;
  let runStorePath: string;

  beforeEach(() => {
    // Create temp directory structure
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'receipt-test-'));
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

  function getBaseSha(): string {
    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  }

  function makeChange(filename: string, content: string): string {
    fs.writeFileSync(path.join(repoPath, filename), content);
    execSync('git add .', { cwd: repoPath });
    execSync(`git commit -m "Add ${filename}"`, { cwd: repoPath });
    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  }

  function createMockRunStore(): RunStore {
    return {
      path: runStorePath,
      readState: () => ({}),
      writeState: () => {},
      appendEvent: () => {},
      writeSummary: () => {},
      readEvents: () => []
    } as unknown as RunStore;
  }

  describe('receipt.json structure', () => {
    it('includes all required fields', async () => {
      const baseSha = getBaseSha();
      const checkpointSha = makeChange('test.txt', 'test content');

      const result = await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha,
        verificationTier: 'tier1',
        terminalState: 'complete',
        runId: 'test-run-001'
      });

      expect(result).not.toBeNull();
      const receipt = result!.receipt;

      // Required baseline fields per spec
      expect(receipt.base_sha).toBe(baseSha);
      expect(receipt.checkpoint_sha).toBe(checkpointSha);
      expect(receipt.verification_tier).toBe('tier1');
      expect(receipt.terminal_state).toBe('complete');
      expect(typeof receipt.files_changed).toBe('number');
      expect(typeof receipt.lines_added).toBe('number');
      expect(typeof receipt.lines_deleted).toBe('number');

      // Artifacts tracking - never points to missing files
      expect(receipt.artifacts_written).toBeDefined();
      expect(receipt.artifacts_written.diffstat).toBe(true);
      expect(receipt.artifacts_written.files).toBe(true);
      // Either diff_patch or diff_patch_gz, not both
      expect(
        receipt.artifacts_written.diff_patch !== receipt.artifacts_written.diff_patch_gz
      ).toBe(true);
    });

    it('receipt.json is written to disk and parseable', async () => {
      const baseSha = getBaseSha();
      makeChange('test.txt', 'test');

      await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'stopped',
        runId: 'test-run-002'
      });

      const receiptPath = path.join(runStorePath, 'receipt.json');
      expect(fs.existsSync(receiptPath)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(receiptPath, 'utf-8')) as ReceiptJson;
      expect(parsed.base_sha).toBe(baseSha);
    });
  });

  describe('diff artifacts', () => {
    it('creates diff.patch with correct git flags (--binary --find-renames)', async () => {
      // Create a file first
      fs.writeFileSync(path.join(repoPath, 'original.txt'), 'content');
      execSync('git add .', { cwd: repoPath });
      execSync('git commit -m "Add original"', { cwd: repoPath });

      // Capture base AFTER original exists, then rename
      const baseSha = getBaseSha();

      execSync('git mv original.txt renamed.txt', { cwd: repoPath });
      execSync('git commit -m "Rename file"', { cwd: repoPath });

      await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-003'
      });

      const patchPath = path.join(runStorePath, 'diff.patch');
      expect(fs.existsSync(patchPath)).toBe(true);

      const patchContent = fs.readFileSync(patchPath, 'utf-8');
      // Should detect rename with --find-renames flag
      expect(patchContent).toContain('rename from original.txt');
      expect(patchContent).toContain('rename to renamed.txt');
    });

    it('creates diffstat.txt always (even when patch is compressed)', async () => {
      const baseSha = getBaseSha();
      makeChange('test.txt', 'x'.repeat(100));

      await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-004'
      });

      expect(fs.existsSync(path.join(runStorePath, 'diffstat.txt'))).toBe(true);
    });

    it('creates files.txt with changed file list', async () => {
      const baseSha = getBaseSha();
      makeChange('file1.txt', 'content1');
      makeChange('file2.txt', 'content2');

      await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-005'
      });

      const filesPath = path.join(runStorePath, 'files.txt');
      expect(fs.existsSync(filesPath)).toBe(true);

      const files = fs.readFileSync(filesPath, 'utf-8');
      expect(files).toContain('file1.txt');
      expect(files).toContain('file2.txt');
    });
  });

  describe('compression thresholds', () => {
    it('compresses when diff size > 50KB', async () => {
      const baseSha = getBaseSha();

      // Create content larger than 50KB
      const largeContent = 'x'.repeat(60 * 1024);
      makeChange('large.txt', largeContent);

      const result = await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-006'
      });

      expect(result!.compressed).toBe(true);
      expect(fs.existsSync(path.join(runStorePath, 'diff.patch.gz'))).toBe(true);
      expect(fs.existsSync(path.join(runStorePath, 'diff.patch'))).toBe(false);
    });

    it('compresses when changed lines > 2000', async () => {
      const baseSha = getBaseSha();

      // Create content with many lines
      const manyLines = Array(2500).fill('line content').join('\n');
      makeChange('lines.txt', manyLines);

      const result = await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-007'
      });

      expect(result!.compressed).toBe(true);
    });

    it('compresses when changed files > 100', async () => {
      const baseSha = getBaseSha();

      // Create many files
      for (let i = 0; i < 105; i++) {
        fs.writeFileSync(path.join(repoPath, `file${i}.txt`), `content ${i}`);
      }
      execSync('git add .', { cwd: repoPath });
      execSync('git commit -m "Add many files"', { cwd: repoPath });

      const result = await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-008'
      });

      expect(result!.compressed).toBe(true);
    });

    it('does not compress small diffs', async () => {
      const baseSha = getBaseSha();
      makeChange('small.txt', 'small content');

      const result = await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-009'
      });

      expect(result!.compressed).toBe(false);
      expect(fs.existsSync(path.join(runStorePath, 'diff.patch'))).toBe(true);
      expect(fs.existsSync(path.join(runStorePath, 'diff.patch.gz'))).toBe(false);
    });
  });

  describe('transcript handling', () => {
    it('creates transcript.meta.json when transcript.log missing', async () => {
      const baseSha = getBaseSha();
      makeChange('test.txt', 'content');

      await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-010'
      });

      const metaPath = path.join(runStorePath, 'transcript.meta.json');
      expect(fs.existsSync(metaPath)).toBe(true);

      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      expect(meta.captured_by).toBe('claude_code');
      expect(meta.session_id).toBe('test-run-010');
      expect(meta.note).toBe('Transcript captured by operator');
    });

    it('does not overwrite existing transcript.log', async () => {
      const baseSha = getBaseSha();
      makeChange('test.txt', 'content');

      // Pre-create transcript.log
      fs.writeFileSync(path.join(runStorePath, 'transcript.log'), 'existing log');

      const result = await writeReceipt({
        runStore: createMockRunStore(),
        repoPath,
        baseSha,
        checkpointSha: null,
        verificationTier: null,
        terminalState: 'complete',
        runId: 'test-run-011'
      });

      // transcript.log should be tracked, not meta
      expect(result!.receipt.artifacts_written.transcript_log).toBe(true);
      expect(result!.receipt.artifacts_written.transcript_meta).toBe(false);
      expect(fs.existsSync(path.join(runStorePath, 'transcript.meta.json'))).toBe(false);
    });
  });

  describe('deriveTerminalState', () => {
    it('returns complete for stop_reason=complete', () => {
      expect(deriveTerminalState('complete')).toBe('complete');
    });

    it('returns failed for verification failures', () => {
      expect(deriveTerminalState('verification_failed_max_retries')).toBe('failed');
      expect(deriveTerminalState('guard_violation')).toBe('failed');
    });

    it('returns stopped for other reasons (resumable)', () => {
      expect(deriveTerminalState('budget_exceeded')).toBe('stopped');
      expect(deriveTerminalState('stall_timeout')).toBe('stopped');
      expect(deriveTerminalState(undefined)).toBe('stopped');
    });
  });

  describe('console output format', () => {
    it('includes checkpoint and next action', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        printRunReceipt({
          runId: '20260106123456',
          terminalState: 'complete',
          stopReason: 'complete',
          receipt: {
            base_sha: 'abc123',
            checkpoint_sha: 'def456789',
            verification_tier: 'tier1',
            terminal_state: 'complete',
            files_changed: 3,
            lines_added: 50,
            lines_deleted: 10,
            artifacts_written: {
              diff_patch: true,
              diff_patch_gz: false,
              diffstat: true,
              files: true,
              transcript_log: false,
              transcript_meta: true
            }
          },
          patchPath: 'diff.patch',
          compressed: false,
          diffstat: ' file1.txt | 10 ++++\n file2.txt | 5 ++---',
          integrationBranch: 'main'
        });

        const output = logs.join('\n');

        // Check required elements
        expect(output).toContain('Run 20260106123456');
        expect(output).toContain('[complete]');
        expect(output).toContain('✓');
        expect(output).toContain('Checkpoint: def4567');
        expect(output).toContain('verified: tier1');
        expect(output).toContain('.runr/runs/20260106123456/diff.patch');
        expect(output).toContain('runr submit 20260106123456 --to main --dry-run');
      } finally {
        console.log = originalLog;
      }
    });

    it('shows Resume action for stopped runs', () => {
      const logs: string[] = [];
      const originalLog = console.log;
      console.log = (msg: string) => logs.push(msg);

      try {
        printRunReceipt({
          runId: '20260106123456',
          terminalState: 'stopped',
          stopReason: 'budget_exceeded',
          receipt: {
            base_sha: 'abc123',
            checkpoint_sha: null,
            verification_tier: null,
            terminal_state: 'stopped',
            files_changed: 0,
            lines_added: 0,
            lines_deleted: 0,
            artifacts_written: {
              diff_patch: true,
              diff_patch_gz: false,
              diffstat: true,
              files: true,
              transcript_log: false,
              transcript_meta: true
            }
          },
          patchPath: 'diff.patch',
          compressed: false,
          diffstat: '',
          integrationBranch: 'main'
        });

        const output = logs.join('\n');
        expect(output).toContain('[stopped: budget_exceeded]');
        expect(output).toContain('⏸');
        expect(output).toContain('runr resume 20260106123456');
      } finally {
        console.log = originalLog;
      }
    });
  });
});
