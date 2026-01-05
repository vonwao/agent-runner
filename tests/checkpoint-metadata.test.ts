/**
 * Checkpoint Metadata Sidecar Tests
 *
 * Tests sidecar write/read functions for checkpoint metadata.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';
import {
  writeCheckpointMetadata,
  findLatestCheckpointBySidecar,
  type CheckpointMetadata
} from '../src/store/checkpoint-metadata.js';

describe('Checkpoint Metadata', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'checkpoint-meta-test-'));
    repoPath = tmpDir;
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe('writeCheckpointMetadata', () => {
    it('creates .runr/checkpoints/<sha>.json', async () => {
      const sha = 'abc123def456';
      const runId = '20260105000000';

      await writeCheckpointMetadata({
        repoPath,
        sha,
        runId,
        milestoneIndex: 0,
        milestone: { goal: 'Test milestone', done_checks: [], risk_level: 'low' }
      });

      const metadataPath = path.join(repoPath, '.runr', 'checkpoints', `${sha}.json`);
      const exists = await fs.access(metadataPath).then(() => true).catch(() => false);
      expect(exists).toBe(true);

      const content = await fs.readFile(metadataPath, 'utf-8');
      const metadata: CheckpointMetadata = JSON.parse(content);

      expect(metadata.schema_version).toBe(1);
      expect(metadata.sha).toBe(sha);
      expect(metadata.run_id).toBe(runId);
      expect(metadata.milestone_index).toBe(0);
      expect(metadata.milestone_title).toBe('Test milestone');
      expect(metadata.created_at).toBeTruthy();
    });

    it('creates directory if missing', async () => {
      const sha = 'xyz789';
      const runId = '20260105000001';

      // Checkpoints directory doesn't exist yet
      const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
      const existsBefore = await fs.access(checkpointsDir).then(() => true).catch(() => false);
      expect(existsBefore).toBe(false);

      await writeCheckpointMetadata({
        repoPath,
        sha,
        runId,
        milestoneIndex: 0,
        milestone: { goal: 'Test', done_checks: [], risk_level: 'low' }
      });

      const existsAfter = await fs.access(checkpointsDir).then(() => true).catch(() => false);
      expect(existsAfter).toBe(true);
    });

    it('handles optional tier/commands gracefully', async () => {
      const sha = 'optional123';
      const runId = '20260105000002';

      // Without optional fields
      await writeCheckpointMetadata({
        repoPath,
        sha,
        runId,
        milestoneIndex: 0,
        milestone: { goal: 'Test', done_checks: [], risk_level: 'low' }
      });

      const metadataPath = path.join(repoPath, '.runr', 'checkpoints', `${sha}.json`);
      const content1 = await fs.readFile(metadataPath, 'utf-8');
      const metadata1: CheckpointMetadata = JSON.parse(content1);

      expect(metadata1.tier).toBeUndefined();
      expect(metadata1.verification_commands).toBeUndefined();

      // With optional fields
      const sha2 = 'optional456';
      await writeCheckpointMetadata({
        repoPath,
        sha: sha2,
        runId,
        milestoneIndex: 1,
        milestone: { goal: 'Test 2', done_checks: [], risk_level: 'low' },
        tier: 'tier1',
        verificationCommands: ['npm test', 'npm run lint']
      });

      const metadataPath2 = path.join(repoPath, '.runr', 'checkpoints', `${sha2}.json`);
      const content2 = await fs.readFile(metadataPath2, 'utf-8');
      const metadata2: CheckpointMetadata = JSON.parse(content2);

      expect(metadata2.tier).toBe('tier1');
      expect(metadata2.verification_commands).toEqual(['npm test', 'npm run lint']);
    });

    it('uses atomic write (temp + rename)', async () => {
      const sha = 'atomic789';
      const runId = '20260105000003';

      await writeCheckpointMetadata({
        repoPath,
        sha,
        runId,
        milestoneIndex: 0,
        milestone: { goal: 'Test', done_checks: [], risk_level: 'low' }
      });

      // Temp file should not exist after write
      const tempPath = path.join(repoPath, '.runr', 'checkpoints', `${sha}.json.tmp`);
      const tempExists = await fs.access(tempPath).then(() => true).catch(() => false);
      expect(tempExists).toBe(false);

      // Final file should exist
      const finalPath = path.join(repoPath, '.runr', 'checkpoints', `${sha}.json`);
      const finalExists = await fs.access(finalPath).then(() => true).catch(() => false);
      expect(finalExists).toBe(true);
    });
  });

  describe('findLatestCheckpointBySidecar', () => {
    it('returns null if no checkpoints', async () => {
      const result = await findLatestCheckpointBySidecar(repoPath, '20260105000000');
      expect(result).toBeNull();
    });

    it('returns latest by milestone_index', async () => {
      const runId = '20260105000010';

      // Create multiple checkpoints with different milestone_index
      await writeCheckpointMetadata({
        repoPath,
        sha: 'sha0',
        runId,
        milestoneIndex: 0,
        milestone: { goal: 'M0', done_checks: [], risk_level: 'low' }
      });

      await writeCheckpointMetadata({
        repoPath,
        sha: 'sha1',
        runId,
        milestoneIndex: 1,
        milestone: { goal: 'M1', done_checks: [], risk_level: 'low' }
      });

      await writeCheckpointMetadata({
        repoPath,
        sha: 'sha2',
        runId,
        milestoneIndex: 2,
        milestone: { goal: 'M2', done_checks: [], risk_level: 'low' }
      });

      const result = await findLatestCheckpointBySidecar(repoPath, runId);
      expect(result).not.toBeNull();
      expect(result?.sha).toBe('sha2');
      expect(result?.milestoneIndex).toBe(2);
    });

    it('uses created_at as tie-breaker', async () => {
      const runId = '20260105000011';

      // Create two checkpoints with same milestone_index but different created_at
      const older = new Date('2026-01-05T00:00:00Z').toISOString();
      const newer = new Date('2026-01-05T01:00:00Z').toISOString();

      // Manually create metadata with specific created_at
      const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
      await fs.mkdir(checkpointsDir, { recursive: true });

      const metadata1: CheckpointMetadata = {
        schema_version: 1,
        sha: 'sha_older',
        run_id: runId,
        milestone_index: 0,
        milestone_title: 'M0 older',
        created_at: older
      };

      const metadata2: CheckpointMetadata = {
        schema_version: 1,
        sha: 'sha_newer',
        run_id: runId,
        milestone_index: 0,
        milestone_title: 'M0 newer',
        created_at: newer
      };

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_older.json'),
        JSON.stringify(metadata1, null, 2)
      );

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_newer.json'),
        JSON.stringify(metadata2, null, 2)
      );

      const result = await findLatestCheckpointBySidecar(repoPath, runId);
      expect(result).not.toBeNull();
      expect(result?.sha).toBe('sha_newer');
    });

    it('uses mtime as fallback if created_at missing', async () => {
      const runId = '20260105000012';
      const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
      await fs.mkdir(checkpointsDir, { recursive: true });

      // Create two checkpoints with same milestone_index and empty created_at
      const metadata1: CheckpointMetadata = {
        schema_version: 1,
        sha: 'sha_mtime1',
        run_id: runId,
        milestone_index: 0,
        milestone_title: 'M0',
        created_at: ''
      };

      const metadata2: CheckpointMetadata = {
        schema_version: 1,
        sha: 'sha_mtime2',
        run_id: runId,
        milestone_index: 0,
        milestone_title: 'M0',
        created_at: ''
      };

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_mtime1.json'),
        JSON.stringify(metadata1, null, 2)
      );

      // Wait a bit to ensure different mtime
      await new Promise(resolve => setTimeout(resolve, 10));

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_mtime2.json'),
        JSON.stringify(metadata2, null, 2)
      );

      const result = await findLatestCheckpointBySidecar(repoPath, runId);
      expect(result).not.toBeNull();
      // Should pick the one with later mtime (sha_mtime2)
      expect(result?.sha).toBe('sha_mtime2');
    });

    it('ignores wrong run_id', async () => {
      const runId1 = '20260105000013';
      const runId2 = '20260105000014';

      await writeCheckpointMetadata({
        repoPath,
        sha: 'sha_run1',
        runId: runId1,
        milestoneIndex: 0,
        milestone: { goal: 'M0', done_checks: [], risk_level: 'low' }
      });

      await writeCheckpointMetadata({
        repoPath,
        sha: 'sha_run2',
        runId: runId2,
        milestoneIndex: 0,
        milestone: { goal: 'M0', done_checks: [], risk_level: 'low' }
      });

      const result = await findLatestCheckpointBySidecar(repoPath, runId1);
      expect(result).not.toBeNull();
      expect(result?.sha).toBe('sha_run1');
    });

    it('ignores wrong schema_version', async () => {
      const runId = '20260105000015';
      const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
      await fs.mkdir(checkpointsDir, { recursive: true });

      // Create checkpoint with wrong schema_version
      const metadata = {
        schema_version: 999,
        sha: 'sha_wrong_version',
        run_id: runId,
        milestone_index: 0,
        milestone_title: 'M0',
        created_at: new Date().toISOString()
      };

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_wrong_version.json'),
        JSON.stringify(metadata, null, 2)
      );

      const result = await findLatestCheckpointBySidecar(repoPath, runId);
      expect(result).toBeNull();
    });

    it('ignores sha mismatch vs filename', async () => {
      const runId = '20260105000016';
      const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
      await fs.mkdir(checkpointsDir, { recursive: true });

      // Create file with mismatched SHA
      const metadata: CheckpointMetadata = {
        schema_version: 1,
        sha: 'sha_in_content',
        run_id: runId,
        milestone_index: 0,
        milestone_title: 'M0',
        created_at: new Date().toISOString()
      };

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_in_filename.json'),
        JSON.stringify(metadata, null, 2)
      );

      const result = await findLatestCheckpointBySidecar(repoPath, runId);
      expect(result).toBeNull();
    });

    it('ignores invalid milestone_index', async () => {
      const runId = '20260105000017';
      const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
      await fs.mkdir(checkpointsDir, { recursive: true });

      // Create checkpoint with invalid milestone_index
      const metadata = {
        schema_version: 1,
        sha: 'sha_invalid_index',
        run_id: runId,
        milestone_index: -1,
        milestone_title: 'M0',
        created_at: new Date().toISOString()
      };

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_invalid_index.json'),
        JSON.stringify(metadata, null, 2)
      );

      const result = await findLatestCheckpointBySidecar(repoPath, runId);
      expect(result).toBeNull();
    });

    it('ignores malformed JSON', async () => {
      const runId = '20260105000018';
      const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
      await fs.mkdir(checkpointsDir, { recursive: true });

      // Create file with invalid JSON
      await fs.writeFile(
        path.join(checkpointsDir, 'sha_malformed.json'),
        'not valid json {'
      );

      const result = await findLatestCheckpointBySidecar(repoPath, runId);
      expect(result).toBeNull();
    });

    it('ignores missing required fields', async () => {
      const runId = '20260105000019';
      const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
      await fs.mkdir(checkpointsDir, { recursive: true });

      // Missing milestone_title
      const metadata1 = {
        schema_version: 1,
        sha: 'sha_missing_title',
        run_id: runId,
        milestone_index: 0,
        created_at: new Date().toISOString()
      };

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_missing_title.json'),
        JSON.stringify(metadata1, null, 2)
      );

      // Non-string created_at
      const metadata2 = {
        schema_version: 1,
        sha: 'sha_bad_created_at',
        run_id: runId,
        milestone_index: 0,
        milestone_title: 'M0',
        created_at: 12345
      };

      await fs.writeFile(
        path.join(checkpointsDir, 'sha_bad_created_at.json'),
        JSON.stringify(metadata2, null, 2)
      );

      const result = await findLatestCheckpointBySidecar(repoPath, runId);
      expect(result).toBeNull();
    });
  });
});
