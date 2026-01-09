/**
 * Tests for task metadata parsing (depends_on, type).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadTaskMetadata } from '../../src/tasks/task-metadata.js';

describe('Task Metadata', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-metadata-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('depends_on parsing', () => {
    it('should return empty array when no depends_on', () => {
      const taskPath = path.join(tmpDir, 'task.md');
      fs.writeFileSync(taskPath, '# Task\n\nDo something.');

      const metadata = loadTaskMetadata(taskPath);

      expect(metadata.depends_on).toEqual([]);
    });

    it('should parse single dependency', () => {
      const taskPath = path.join(tmpDir, 'task.md');
      fs.writeFileSync(taskPath, `---
depends_on: .runr/tasks/other.md
---

# Task

Do something.`);

      const metadata = loadTaskMetadata(taskPath);

      expect(metadata.depends_on).toEqual(['.runr/tasks/other.md']);
    });

    it('should parse multiple dependencies as array', () => {
      const taskPath = path.join(tmpDir, 'task.md');
      fs.writeFileSync(taskPath, `---
depends_on:
  - .runr/tasks/first.md
  - .runr/tasks/second.md
  - .runr/tasks/third.md
---

# Task

Do something.`);

      const metadata = loadTaskMetadata(taskPath);

      expect(metadata.depends_on).toHaveLength(3);
      expect(metadata.depends_on).toContain('.runr/tasks/first.md');
      expect(metadata.depends_on).toContain('.runr/tasks/second.md');
      expect(metadata.depends_on).toContain('.runr/tasks/third.md');
    });
  });

  describe('type parsing', () => {
    it('should default to automated when no type specified', () => {
      const taskPath = path.join(tmpDir, 'task.md');
      fs.writeFileSync(taskPath, '# Task\n\nDo something.');

      const metadata = loadTaskMetadata(taskPath);

      expect(metadata.type).toBe('automated');
    });

    it('should parse type: manual', () => {
      const taskPath = path.join(tmpDir, 'task.md');
      fs.writeFileSync(taskPath, `---
type: manual
---

# Manual Task

Steps for human to follow.`);

      const metadata = loadTaskMetadata(taskPath);

      expect(metadata.type).toBe('manual');
    });

    it('should parse type: hybrid', () => {
      const taskPath = path.join(tmpDir, 'task.md');
      fs.writeFileSync(taskPath, `---
type: hybrid
---

# Hybrid Task

Some automated, some manual.`);

      const metadata = loadTaskMetadata(taskPath);

      expect(metadata.type).toBe('hybrid');
    });

    it('should default to automated for invalid type', () => {
      const taskPath = path.join(tmpDir, 'task.md');
      fs.writeFileSync(taskPath, `---
type: unknown_type
---

# Task

Do something.`);

      const metadata = loadTaskMetadata(taskPath);

      expect(metadata.type).toBe('automated');
    });
  });

  describe('combined metadata', () => {
    it('should parse both depends_on and type together', () => {
      const taskPath = path.join(tmpDir, 'task.md');
      fs.writeFileSync(taskPath, `---
type: hybrid
depends_on:
  - .runr/tasks/setup.md
  - .runr/tasks/prepare.md
owns:
  - src/feature/
---

# Feature Task

Implementation details.`);

      const metadata = loadTaskMetadata(taskPath);

      expect(metadata.type).toBe('hybrid');
      expect(metadata.depends_on).toEqual(['.runr/tasks/setup.md', '.runr/tasks/prepare.md']);
      expect(metadata.owns_raw).toEqual(['src/feature/']);
    });
  });
});
