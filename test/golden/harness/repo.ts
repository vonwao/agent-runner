/**
 * Test repository management for golden scenarios.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCommand } from './proc.js';
import { MINI_REPO_FIXTURE, getScenarioPaths } from './paths.js';

/**
 * Create a temporary test repository from the mini-repo fixture.
 */
export async function createTestRepo(scenarioId: string): Promise<string> {
  // Create temp directory
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `golden-${scenarioId}-`));

  // Copy mini-repo fixture
  copyDirRecursive(MINI_REPO_FIXTURE, tmpDir);

  // Copy scenario-specific files
  const scenarioPaths = getScenarioPaths(scenarioId);

  // Copy tracks.yaml
  if (fs.existsSync(scenarioPaths.tracks)) {
    fs.copyFileSync(scenarioPaths.tracks, path.join(tmpDir, 'tracks.yaml'));
  }

  // Copy tasks directory
  if (fs.existsSync(scenarioPaths.tasks)) {
    const tasksDir = path.join(tmpDir, 'tasks');
    fs.mkdirSync(tasksDir, { recursive: true });
    copyDirRecursive(scenarioPaths.tasks, tasksDir);
  }

  // Initialize git repo (use quoted strings for shell mode)
  await runCommand('git', ['init'], { cwd: tmpDir });
  await runCommand('git', ['config', 'user.email', 'test@golden.local'], { cwd: tmpDir });
  await runCommand('git', ['config', 'user.name', '"Golden Test"'], { cwd: tmpDir });
  await runCommand('git', ['add', '.'], { cwd: tmpDir });
  await runCommand('git', ['commit', '-m', '"Initial commit"'], { cwd: tmpDir });

  return tmpDir;
}

/**
 * Clean up a test repository.
 */
export function cleanupTestRepo(repoPath: string): void {
  try {
    fs.rmSync(repoPath, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

/**
 * Copy directory recursively.
 */
function copyDirRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });

  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * Get agent paths via CLI (canonical source of truth).
 */
export async function getAgentPathsViaCLI(repoPath: string): Promise<{
  repo_root: string;
  agent_root: string;
  runs_dir: string;
  orchestrations_dir: string;
} | null> {
  const result = await runCommand('npx', ['agent', 'paths', '--json'], {
    cwd: repoPath,
    timeout: 10000
  });

  if (result.exitCode !== 0) {
    return null;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/**
 * Read the latest orchestration ID from a test repo.
 * Checks both new path (.agent/orchestrations/) and legacy path (.agent/runs/orchestrations/).
 */
export function getLatestOrchestrationId(repoPath: string): string | null {
  const ids: string[] = [];

  // Check new canonical path: .agent/orchestrations/
  const newOrchDir = path.join(repoPath, '.agent', 'orchestrations');
  if (fs.existsSync(newOrchDir)) {
    for (const e of fs.readdirSync(newOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch')) {
        ids.push(e.name);
      }
    }
  }

  // Check legacy path: .agent/runs/orchestrations/
  const legacyOrchDir = path.join(repoPath, '.agent', 'runs', 'orchestrations');
  if (fs.existsSync(legacyOrchDir)) {
    for (const e of fs.readdirSync(legacyOrchDir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name.startsWith('orch') && !ids.includes(e.name)) {
        ids.push(e.name);
      }
    }
  }

  if (ids.length === 0) {
    return null;
  }

  ids.sort().reverse();
  return ids[0];
}

/**
 * Read orchestration state from a test repo.
 * Checks both new and legacy paths.
 */
export function readOrchestrationState(repoPath: string, orchId: string): unknown | null {
  // Try new canonical path first
  const newStatePath = path.join(repoPath, '.agent', 'orchestrations', orchId, 'state.json');
  if (fs.existsSync(newStatePath)) {
    try {
      return JSON.parse(fs.readFileSync(newStatePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  // Fall back to legacy path
  const legacyStatePath = path.join(repoPath, '.agent', 'runs', 'orchestrations', orchId, 'state.json');
  if (fs.existsSync(legacyStatePath)) {
    try {
      return JSON.parse(fs.readFileSync(legacyStatePath, 'utf-8'));
    } catch {
      return null;
    }
  }

  return null;
}
