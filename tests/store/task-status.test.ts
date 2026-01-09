/**
 * Tests for task status tracking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  loadTaskStatus,
  saveTaskStatus,
  getTaskStatusPath,
  markTaskInProgress,
  markTaskStopped,
  markTaskCompleted,
  markTaskFailed,
  markTaskManuallyCompleted,
  getTaskStatus,
  isTaskCompleted,
  getAllTaskStatuses,
  type TaskStatusFile
} from '../../src/store/task-status.js';

describe('Task Status Store', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-status-test-'));
    repoPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoPath);

    // Create .runr directory
    fs.mkdirSync(path.join(repoPath, '.runr'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('loadTaskStatus', () => {
    it('should return empty structure when file does not exist', () => {
      const status = loadTaskStatus(repoPath);

      expect(status.schema_version).toBe(1);
      expect(status.tasks).toEqual({});
    });

    it('should load existing status file', () => {
      const statusPath = getTaskStatusPath(repoPath);
      const existing: TaskStatusFile = {
        schema_version: 1,
        tasks: {
          '.runr/tasks/test.md': {
            status: 'completed',
            first_seen_at: '2024-01-01T00:00:00Z',
            last_updated_at: '2024-01-02T00:00:00Z',
            last_run_id: 'run-123',
            last_checkpoint_sha: 'abc123',
            last_error_summary: null,
            last_stop_reason: null
          }
        }
      };
      fs.writeFileSync(statusPath, JSON.stringify(existing));

      const status = loadTaskStatus(repoPath);

      expect(status.tasks['.runr/tasks/test.md'].status).toBe('completed');
      expect(status.tasks['.runr/tasks/test.md'].last_checkpoint_sha).toBe('abc123');
    });
  });

  describe('markTaskInProgress', () => {
    it('should create entry if not exists', () => {
      markTaskInProgress(repoPath, '.runr/tasks/new.md', 'run-001');

      const status = loadTaskStatus(repoPath);
      const entry = status.tasks['.runr/tasks/new.md'];

      expect(entry).toBeDefined();
      expect(entry.status).toBe('in_progress');
      expect(entry.last_run_id).toBe('run-001');
    });

    it('should update existing entry', () => {
      markTaskInProgress(repoPath, '.runr/tasks/test.md', 'run-001');
      markTaskInProgress(repoPath, '.runr/tasks/test.md', 'run-002');

      const status = loadTaskStatus(repoPath);
      const entry = status.tasks['.runr/tasks/test.md'];

      expect(entry.last_run_id).toBe('run-002');
      expect(entry.status).toBe('in_progress');
    });
  });

  describe('markTaskCompleted', () => {
    it('should mark task as completed with checkpoint', () => {
      markTaskInProgress(repoPath, '.runr/tasks/test.md', 'run-001');
      markTaskCompleted(repoPath, '.runr/tasks/test.md', 'run-001', 'sha-abc');

      const status = loadTaskStatus(repoPath);
      const entry = status.tasks['.runr/tasks/test.md'];

      expect(entry.status).toBe('completed');
      expect(entry.last_checkpoint_sha).toBe('sha-abc');
      expect(entry.last_error_summary).toBeNull();
      expect(entry.last_stop_reason).toBeNull();
    });
  });

  describe('markTaskStopped', () => {
    it('should mark task as stopped with reason', () => {
      markTaskInProgress(repoPath, '.runr/tasks/test.md', 'run-001');
      markTaskStopped(repoPath, '.runr/tasks/test.md', 'run-001', 'verification_failed', 'Tests failed');

      const status = loadTaskStatus(repoPath);
      const entry = status.tasks['.runr/tasks/test.md'];

      expect(entry.status).toBe('stopped');
      expect(entry.last_stop_reason).toBe('verification_failed');
      expect(entry.last_error_summary).toBe('Tests failed');
    });
  });

  describe('markTaskFailed', () => {
    it('should mark task as failed with error', () => {
      markTaskInProgress(repoPath, '.runr/tasks/test.md', 'run-001');
      markTaskFailed(repoPath, '.runr/tasks/test.md', 'run-001', 'Worker crashed');

      const status = loadTaskStatus(repoPath);
      const entry = status.tasks['.runr/tasks/test.md'];

      expect(entry.status).toBe('failed');
      expect(entry.last_error_summary).toBe('Worker crashed');
    });
  });

  describe('markTaskManuallyCompleted', () => {
    it('should mark task as completed with manual run_id', () => {
      markTaskManuallyCompleted(repoPath, '.runr/tasks/manual.md');

      const status = loadTaskStatus(repoPath);
      const entry = status.tasks['.runr/tasks/manual.md'];

      expect(entry.status).toBe('completed');
      expect(entry.last_run_id).toBe('manual');
      expect(entry.last_checkpoint_sha).toBeNull();
    });
  });

  describe('getTaskStatus', () => {
    it('should return null for unknown task', () => {
      const entry = getTaskStatus(repoPath, '.runr/tasks/unknown.md');
      expect(entry).toBeNull();
    });

    it('should return entry for known task', () => {
      markTaskCompleted(repoPath, '.runr/tasks/test.md', 'run-001', 'sha-xyz');

      const entry = getTaskStatus(repoPath, '.runr/tasks/test.md');
      expect(entry).not.toBeNull();
      expect(entry?.status).toBe('completed');
    });
  });

  describe('isTaskCompleted', () => {
    it('should return false for unknown task', () => {
      expect(isTaskCompleted(repoPath, '.runr/tasks/unknown.md')).toBe(false);
    });

    it('should return false for in_progress task', () => {
      markTaskInProgress(repoPath, '.runr/tasks/test.md', 'run-001');
      expect(isTaskCompleted(repoPath, '.runr/tasks/test.md')).toBe(false);
    });

    it('should return true for completed task', () => {
      markTaskCompleted(repoPath, '.runr/tasks/test.md', 'run-001', 'sha-abc');
      expect(isTaskCompleted(repoPath, '.runr/tasks/test.md')).toBe(true);
    });
  });

  describe('getAllTaskStatuses', () => {
    it('should return empty object when no tasks', () => {
      const all = getAllTaskStatuses(repoPath);
      expect(all).toEqual({});
    });

    it('should return all task statuses', () => {
      markTaskCompleted(repoPath, '.runr/tasks/task1.md', 'run-001', 'sha-1');
      markTaskInProgress(repoPath, '.runr/tasks/task2.md', 'run-002');
      markTaskFailed(repoPath, '.runr/tasks/task3.md', 'run-003', 'error');

      const all = getAllTaskStatuses(repoPath);

      expect(Object.keys(all)).toHaveLength(3);
      expect(all['.runr/tasks/task1.md'].status).toBe('completed');
      expect(all['.runr/tasks/task2.md'].status).toBe('in_progress');
      expect(all['.runr/tasks/task3.md'].status).toBe('failed');
    });
  });
});
