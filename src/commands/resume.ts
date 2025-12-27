import fs from 'node:fs';
import path from 'node:path';
import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';
import { AgentConfig, agentConfigSchema } from '../config/schema.js';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { runSupervisorLoop } from '../supervisor/runner.js';
import { prepareForResume } from '../supervisor/state-machine.js';
import { captureFingerprint, compareFingerprints, FingerprintDiff } from '../env/fingerprint.js';
import { WorktreeInfo, validateWorktree, recreateWorktree, WorktreeRecreateResult } from '../repo/worktree.js';

export interface ResumeOptions {
  runId: string;
  time: number;
  maxTicks: number;
  allowDeps: boolean;
  config?: string;
  force: boolean;
  repo: string;
  autoResume: boolean;
}

/**
 * Format effective configuration for display at resume.
 */
function formatResumeConfig(options: ResumeOptions): string {
  const parts = [
    `run_id=${options.runId}`,
    `time=${options.time}min`,
    `ticks=${options.maxTicks}`,
    `auto_resume=${options.autoResume ? 'on' : 'off'}`,
    `allow_deps=${options.allowDeps ? 'yes' : 'no'}`,
    `force=${options.force ? 'yes' : 'no'}`
  ];
  return `Resume: ${parts.join(' | ')}`;
}

interface ConfigSnapshotWithWorktree extends AgentConfig {
  _worktree?: WorktreeInfo;
}

function readConfigSnapshot(runDir: string): { config: AgentConfig | null; worktree: WorktreeInfo | null } {
  const snapshotPath = path.join(runDir, 'config.snapshot.json');
  if (!fs.existsSync(snapshotPath)) {
    return { config: null, worktree: null };
  }
  const raw = fs.readFileSync(snapshotPath, 'utf-8');
  const parsed = JSON.parse(raw) as ConfigSnapshotWithWorktree;

  // Extract worktree info before parsing config
  const worktree = parsed._worktree ?? null;
  delete parsed._worktree;

  // Parse the config without worktree field
  const config = agentConfigSchema.parse(parsed);
  return { config, worktree };
}

function readTaskArtifact(runDir: string): string {
  const taskPath = path.join(runDir, 'artifacts', 'task.md');
  if (!fs.existsSync(taskPath)) {
    throw new Error(`Task artifact not found: ${taskPath}`);
  }
  return fs.readFileSync(taskPath, 'utf-8');
}

export async function resumeCommand(options: ResumeOptions): Promise<void> {
  // Log effective configuration for transparency
  console.log(formatResumeConfig(options));

  const runStore = RunStore.init(options.runId, options.repo);
  let state: RunState;
  try {
    state = runStore.readState();
  } catch {
    throw new Error(`Run state not found for ${options.runId}`);
  }

  const { config: configSnapshot, worktree: worktreeInfo } = readConfigSnapshot(runStore.path);
  const config =
    configSnapshot ??
    loadConfig(resolveConfigPath(state.repo_path, options.config));
  const taskText = readTaskArtifact(runStore.path);

  // Handle worktree reattachment if this run used a worktree
  let effectiveRepoPath = state.repo_path;
  if (worktreeInfo?.worktree_enabled) {
    try {
      const result = await recreateWorktree(worktreeInfo, options.force);

      if (result.recreated) {
        console.log(`Worktree recreated: ${worktreeInfo.effective_repo_path}`);
        runStore.appendEvent({
          type: 'worktree_recreated',
          source: 'cli',
          payload: {
            worktree_path: worktreeInfo.effective_repo_path,
            base_sha: worktreeInfo.base_sha
          }
        });
      }

      if (result.branchMismatch) {
        runStore.appendEvent({
          type: 'worktree_branch_mismatch',
          source: 'cli',
          payload: {
            expected_branch: worktreeInfo.run_branch,
            force_used: true
          }
        });
      }

      if (result.nodeModulesSymlinked) {
        runStore.appendEvent({
          type: 'node_modules_symlinked',
          source: 'cli',
          payload: {
            worktree_path: worktreeInfo.effective_repo_path
          }
        });
      }

      effectiveRepoPath = result.info.effective_repo_path;
      console.log(`Using worktree: ${effectiveRepoPath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to recreate worktree: ${message}`);
      console.error('Run with --force to override, or start fresh with: node dist/cli.js run --worktree ...');
      process.exitCode = 1;
      return;
    }
  }

  // Check environment fingerprint
  const originalFingerprint = runStore.readFingerprint();
  if (originalFingerprint) {
    const currentFingerprint = await captureFingerprint(config, effectiveRepoPath);
    const diffs = compareFingerprints(originalFingerprint, currentFingerprint);
    if (diffs.length > 0) {
      console.warn('Environment fingerprint mismatch:');
      for (const diff of diffs) {
        console.warn(`  ${diff.field}: ${diff.original ?? 'null'} -> ${diff.current ?? 'null'}`);
      }
      if (!options.force) {
        console.error('\nRun with --force to resume despite fingerprint mismatch.');
        process.exitCode = 1;
        return;
      }
      console.warn('\nWARNING: Forcing resume despite environment mismatch (--force)\n');
    }
  }

  // Use shared helper to prepare state for resume
  const updated = prepareForResume(state, { resumeToken: options.runId });

  runStore.writeState(updated);
  runStore.appendEvent({
    type: 'run_resumed',
    source: 'cli',
    payload: {
      run_id: options.runId,
      max_ticks: options.maxTicks,
      time: options.time,
      allow_deps: options.allowDeps,
      auto_resume: options.autoResume,
      resume_phase: updated.phase
    }
  });

  await runSupervisorLoop({
    runStore,
    repoPath: effectiveRepoPath,
    taskText,
    config,
    timeBudgetMinutes: options.time,
    maxTicks: options.maxTicks,
    allowDeps: options.allowDeps,
    autoResume: options.autoResume
  });
}
