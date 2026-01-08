/**
 * Focused tests for task metadata parsing (Run Receipt v1 Phase 2)
 *
 * Tests allowlist_add and verification_tier parsing.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadTaskMetadata } from '../task-metadata.js';

describe('Task Metadata Parsing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeTask(filename: string, content: string): string {
    const taskPath = path.join(tmpDir, filename);
    fs.writeFileSync(taskPath, content);
    return taskPath;
  }

  describe('allowlist_add parsing', () => {
    it('parses allowlist_add from frontmatter array', () => {
      const taskPath = writeTask('task1.md', `---
allowlist_add:
  - CHANGELOG.md
  - docs/**
---

# Task

Do something.
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.allowlist_add).toEqual(['CHANGELOG.md', 'docs/**']);
    });

    it('parses allowlist_add from frontmatter single string', () => {
      const taskPath = writeTask('task2.md', `---
allowlist_add: CHANGELOG.md
---

# Task

Do something.
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.allowlist_add).toEqual(['CHANGELOG.md']);
    });

    it('parses allowlist_add from markdown Scope section', () => {
      const taskPath = writeTask('task3.md', `# Task

Do something.

## Scope
allowlist_add:
  - CHANGELOG.md
  - docs/**

## Other Section
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.allowlist_add).toEqual(['CHANGELOG.md', 'docs/**']);
    });

    it('returns empty array when no allowlist_add specified', () => {
      const taskPath = writeTask('task4.md', `---
owns:
  - src/**
---

# Task

Do something.
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.allowlist_add).toEqual([]);
    });

    it('frontmatter takes precedence over markdown section', () => {
      const taskPath = writeTask('task5.md', `---
allowlist_add:
  - from_frontmatter.md
---

# Task

## Scope
allowlist_add:
  - from_body.md
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.allowlist_add).toEqual(['from_frontmatter.md']);
    });

    it('allowlist_add is additive only (cannot remove config entries)', () => {
      // This is enforced in run.ts, but we test the parsing returns the additions
      const taskPath = writeTask('task6.md', `---
allowlist_add:
  - extra/path/**
---

# Task
`);

      const meta = loadTaskMetadata(taskPath);
      // Should only contain additions, no removal syntax
      expect(meta.allowlist_add).toEqual(['extra/path/**']);
      // No way to express removal - that's the point
    });
  });

  describe('verification_tier parsing', () => {
    it('parses tier from frontmatter verification.tier', () => {
      const taskPath = writeTask('task7.md', `---
verification:
  tier: tier2
---

# Task
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.verification_tier).toBe('tier2');
    });

    it('parses tier from frontmatter root tier field', () => {
      const taskPath = writeTask('task8.md', `---
tier: tier1
---

# Task
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.verification_tier).toBe('tier1');
    });

    it('parses tier from markdown Verification section', () => {
      const taskPath = writeTask('task9.md', `# Task

Do something.

## Verification
tier: tier0
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.verification_tier).toBe('tier0');
    });

    it('returns null for invalid tier values', () => {
      const taskPath = writeTask('task10.md', `---
tier: none
---

# Task
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.verification_tier).toBeNull();
    });

    it('returns null when no tier specified (use config default)', () => {
      const taskPath = writeTask('task11.md', `# Task

Do something.
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.verification_tier).toBeNull();
    });

    it('normalizes tier to lowercase', () => {
      const taskPath = writeTask('task12.md', `---
tier: TIER1
---

# Task
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.verification_tier).toBe('tier1');
    });

    it('validates tier is one of tier0, tier1, tier2', () => {
      const task0 = writeTask('t0.md', '---\ntier: tier0\n---\n# Task');
      const task1 = writeTask('t1.md', '---\ntier: tier1\n---\n# Task');
      const task2 = writeTask('t2.md', '---\ntier: tier2\n---\n# Task');
      const taskBad = writeTask('tb.md', '---\ntier: tier3\n---\n# Task');

      expect(loadTaskMetadata(task0).verification_tier).toBe('tier0');
      expect(loadTaskMetadata(task1).verification_tier).toBe('tier1');
      expect(loadTaskMetadata(task2).verification_tier).toBe('tier2');
      expect(loadTaskMetadata(taskBad).verification_tier).toBeNull();
    });
  });

  describe('combined parsing', () => {
    it('parses all task metadata fields together', () => {
      const taskPath = writeTask('full.md', `---
owns:
  - src/**
allowlist_add:
  - CHANGELOG.md
verification:
  tier: tier1
---

# Full Task

Do something comprehensive.

## Scope
allowlist_add:
  - should_be_ignored.md

## Verification
tier: tier2  # should be ignored, frontmatter wins
`);

      const meta = loadTaskMetadata(taskPath);
      expect(meta.owns_raw).toEqual(['src/**']);
      expect(meta.allowlist_add).toEqual(['CHANGELOG.md']);
      expect(meta.verification_tier).toBe('tier1');
      expect(meta.body).toContain('Full Task');
    });
  });
});
