import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, resolveConfigPath } from '../config/load.js';
import { RunStore } from '../store/run-store.js';
import { buildRepoContext } from '../repo/context.js';
import { git, gitOptional } from '../repo/git.js';
import { createInitialState, stopRun, updatePhase } from '../supervisor/state-machine.js';
import { checkLockfiles, checkScope } from '../supervisor/scope-guard.js';

export interface RunOptions {
  repo: string;
  task: string;
  time: number;
  config?: string;
  allowDeps: boolean;
  web: boolean;
  dryRun: boolean;
}

function makeRunId(): string {
  const now = new Date();
  const parts = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    String(now.getUTCDate()).padStart(2, '0'),
    String(now.getUTCHours()).padStart(2, '0'),
    String(now.getUTCMinutes()).padStart(2, '0'),
    String(now.getUTCSeconds()).padStart(2, '0')
  ];
  return parts.join('');
}

function slugFromTask(taskPath: string): string {
  const base = path.basename(taskPath, path.extname(taskPath));
  return base.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

async function ensureRunBranch(
  gitRoot: string,
  runBranch: string,
  defaultBranch: string
): Promise<void> {
  const existing = await gitOptional(['branch', '--list', runBranch], gitRoot);
  if (existing?.stdout?.trim()) {
    await git(['checkout', runBranch], gitRoot);
    return;
  }
  await git(['checkout', '-b', runBranch, defaultBranch], gitRoot);
}

export async function runCommand(options: RunOptions): Promise<void> {
  const repoPath = path.resolve(options.repo);
  const taskPath = path.resolve(options.task);
  const configPath = resolveConfigPath(repoPath, options.config);
  const config = loadConfig(configPath);
  const taskText = fs.readFileSync(taskPath, 'utf-8');

  const runId = makeRunId();
  const slug = slugFromTask(taskPath);
  const runStore = RunStore.init(runId);

  runStore.writeConfigSnapshot(config);
  runStore.writeArtifact('task.md', taskText);

  const repoContext = await buildRepoContext(
    repoPath,
    runId,
    slug,
    config.repo.default_branch ?? 'main'
  );

  runStore.appendEvent({
    type: 'run_started',
    source: 'cli',
    payload: {
      repo: repoContext,
      task: taskPath,
      time_budget_minutes: options.time,
      allow_deps: options.allowDeps,
      web: options.web
    }
  });

  const scopeCheck = checkScope(
    repoContext.changed_files,
    config.scope.allowlist,
    config.scope.denylist
  );
  const lockfileCheck = checkLockfiles(
    repoContext.changed_files,
    config.scope.lockfiles,
    options.allowDeps
  );

  if (!scopeCheck.ok || !lockfileCheck.ok) {
    let state = createInitialState({
      run_id: runId,
      repo_path: repoPath,
      task_text: taskText,
      allowlist: config.scope.allowlist,
      denylist: config.scope.denylist
    });
    state = stopRun(state, 'guard_violation');
    runStore.writeState(state);
    runStore.appendEvent({
      type: 'guard_violation',
      source: 'cli',
      payload: {
        scope_violations: scopeCheck.violations,
        lockfile_violations: lockfileCheck.violations
      }
    });
    const summary = [
      '# Summary',
      '',
      'Run stopped due to guard violations.',
      '',
      'Scope violations:',
      scopeCheck.violations.length ? `- ${scopeCheck.violations.join('\\n- ')}` : '- None',
      '',
      'Lockfile violations:',
      lockfileCheck.violations.length
        ? `- ${lockfileCheck.violations.join('\\n- ')}`
        : '- None'
    ].join('\\n');
    runStore.writeSummary(summary);
    return;
  }

  await ensureRunBranch(
    repoContext.git_root,
    repoContext.run_branch,
    repoContext.default_branch
  );

  let state = createInitialState({
    run_id: runId,
    repo_path: repoPath,
    task_text: taskText,
    allowlist: config.scope.allowlist,
    denylist: config.scope.denylist
  });
  state = updatePhase(state, 'PLAN');
  runStore.writeState(state);

  if (options.dryRun) {
    runStore.appendEvent({
      type: 'run_dry_stop',
      source: 'cli',
      payload: { reason: 'dry_run' }
    });
    runStore.writeSummary('# Summary\n\nRun initialized in dry-run mode.');
    return;
  }

  runStore.writeSummary('# Summary\n\nRun initialized. Supervisor loop not yet executed.');
}
