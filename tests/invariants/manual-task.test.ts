/**
 * Invariant Test: Manual Task Behavior
 *
 * Core promise: runr run --task manual.md exits 0, prints recipe,
 * does NOT try to spawn worker.
 *
 * This protects the "Runr doesn't waste your time" contract.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';

// Use local build instead of globally installed runr
const PROJECT_ROOT = path.resolve(__dirname, '../..');
const CLI_PATH = path.join(PROJECT_ROOT, 'dist', 'cli.js');

describe('Manual Task Behavior Invariant', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manual-task-test-'));
    repoPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoPath);

    // Initialize git repo
    execSync('git init', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.email "test@test.com"', { cwd: repoPath, stdio: 'pipe' });
    execSync('git config user.name "Test"', { cwd: repoPath, stdio: 'pipe' });

    // Create initial commit
    fs.writeFileSync(path.join(repoPath, 'README.md'), '# Test Repo');
    execSync('git add . && git commit -m "Initial commit"', { cwd: repoPath, stdio: 'pipe' });

    // Create .runr directory structure
    fs.mkdirSync(path.join(repoPath, '.runr', 'tasks'), { recursive: true });

    // Create runr.config.json
    const config = {
      scope: { allowlist: ['**/*'] },
      workers: { default: 'echo' },
      phases: { plan: 'echo', implement: 'echo', review: 'echo' }
    };
    fs.writeFileSync(
      path.join(repoPath, '.runr', 'runr.config.json'),
      JSON.stringify(config, null, 2)
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('manual task exits 0 without spawning worker', () => {
    // Create a manual task
    const manualTask = `---
type: manual
---

# Manual Setup Task

Please complete these steps manually:

1. Open the configuration file
2. Update the API key
3. Restart the service

When done, run: runr tasks mark-complete manual-setup.md
`;
    fs.writeFileSync(path.join(repoPath, '.runr', 'tasks', 'manual-setup.md'), manualTask);

    // Run the manual task using local build
    const result = spawnSync('node', [
      CLI_PATH, 'run',
      '--task', '.runr/tasks/manual-setup.md',
      '--repo', repoPath
    ], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 30000
    });

    // INVARIANT 1: Exit code is 0
    expect(result.status).toBe(0);

    // INVARIANT 2: Output contains recipe (task body)
    const output = result.stdout + result.stderr;
    expect(output).toContain('Manual Setup Task');
    expect(output).toContain('Open the configuration file');
    expect(output).toContain('Update the API key');

    // INVARIANT 3: Output does NOT contain worker-related messages
    // (no "Starting worker", no "PLAN phase", etc.)
    expect(output).not.toContain('Starting worker');
    expect(output).not.toContain('PLAN phase');
    expect(output).not.toContain('supervisor');

    // INVARIANT 4: No run directory was created (no worker ran)
    const runsDir = path.join(repoPath, '.runr', 'runs');
    if (fs.existsSync(runsDir)) {
      const runs = fs.readdirSync(runsDir);
      expect(runs.length).toBe(0);
    }
  });

  it('manual task shows mark-complete hint', () => {
    const manualTask = `---
type: manual
---

# Deploy Task

Deploy to production.
`;
    fs.writeFileSync(path.join(repoPath, '.runr', 'tasks', 'deploy.md'), manualTask);

    const result = spawnSync('node', [
      CLI_PATH, 'run',
      '--task', '.runr/tasks/deploy.md',
      '--repo', repoPath
    ], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 30000
    });

    expect(result.status).toBe(0);

    // Should show how to mark complete
    const output = result.stdout + result.stderr;
    expect(output).toContain('mark-complete');
  });

  it('automated task type does NOT exit early', () => {
    // Create an automated task (this will fail because no real worker, but should try)
    const automatedTask = `---
type: automated
---

# Automated Task

Add a comment to the README.
`;
    fs.writeFileSync(path.join(repoPath, '.runr', 'tasks', 'auto.md'), automatedTask);

    const result = spawnSync('node', [
      CLI_PATH, 'run',
      '--task', '.runr/tasks/auto.md',
      '--repo', repoPath,
      '--skip-doctor'
    ], {
      cwd: repoPath,
      encoding: 'utf-8',
      timeout: 30000
    });

    // Automated task should NOT exit 0 immediately like manual tasks
    // (it either proceeds or fails for other reasons like missing worker)
    const output = result.stdout + result.stderr;

    // Key check: automated tasks should NOT show the "Manual Task Recipe" header
    expect(output).not.toContain('Manual Task Recipe');
  });
});
