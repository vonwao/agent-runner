/**
 * Resume Gym Fixture Runner
 *
 * Runs resume-gym test cases with real git, deterministic tools, and temp dirs.
 * Fast, deterministic, easy to extend.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { execFileSync } from 'node:child_process';

export type CaseSpec = {
  id: string;
  order?: number;
  description?: string;
  run: { args: string[] };
  resume?: { args: string[] };
  env?: Record<string, string>;
};

export type ExpectSpec = {
  expect_stop?: {
    terminal_state?: string;
    stop_reason?: string;
  };
  expect_resume?: {
    terminal_state?: string;
    resumed_from_milestone_index?: number;
  };
  expect_invariants?: {
    no_duplicate_checkpoints?: boolean;
    milestone_1_not_rerun?: boolean;
    resume_event_appended?: boolean;
    journal_has_resume_section?: boolean;
  };
  expect_status_contains?: string[];
  expect_resume_refused?: boolean;
};

export type RunResult = {
  repoDir: string;
  runId: string | null;
  runStdout: string;
  runStderr: string;
  runExitCode: number;
  resumeStdout?: string;
  resumeStderr?: string;
  resumeExitCode?: number;
};

function readJson<T>(p: string): T {
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

function sh(
  cwd: string,
  cmd: string,
  args: string[],
  env?: Record<string, string>
): { stdout: string; stderr: string; exitCode: number } {
  try {
    const stdout = execFileSync(cmd, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: 'pipe',
      encoding: 'utf8'
    }) as unknown as string;

    return { stdout, stderr: '', exitCode: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString?.() ?? '',
      stderr: e.stderr?.toString?.() ?? '',
      exitCode: e.status ?? 1
    };
  }
}

function copyDir(src: string, dst: string) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

/**
 * Run a single resume-gym test case.
 *
 * @param caseDir - Path to case directory (e.g., fixtures/resume-gym/test-failure)
 * @param runrBin - Path to runr binary (e.g., "node" with args ["dist/cli.js"])
 * @returns Result with outputs, exit codes, and runId
 */
export function runResumeGymCase(caseDir: string, runrBin: string): RunResult {
  const caseSpec = readJson<CaseSpec>(path.join(caseDir, 'case.json'));

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runr-resume-gym-'));
  const repoTemplate = path.join(caseDir, 'repo');
  const repoDir = path.join(tmpRoot, 'repo');

  copyDir(repoTemplate, repoDir);

  // Optional setup step
  const setupSh = path.join(caseDir, 'steps', 'setup.sh');
  if (exists(setupSh)) {
    sh(repoDir, 'bash', [setupSh], caseSpec.env);
  }

  // Real git, minimal ops
  sh(repoDir, 'git', ['init']);
  sh(repoDir, 'git', ['config', 'user.email', 'runr@example.test']);
  sh(repoDir, 'git', ['config', 'user.name', 'runr-test']);
  sh(repoDir, 'git', ['add', '-A']);
  sh(repoDir, 'git', ['commit', '-m', 'fixture: baseline']);

  // Run: capture stdout/stderr/exitCode
  const runResult = sh(repoDir, runrBin, caseSpec.run.args, caseSpec.env);

  // Determine run_id (discover latest from .runr/runs)
  const runsDir = path.join(repoDir, '.runr', 'runs');
  let runId: string | null = null;
  if (exists(runsDir)) {
    const ids = fs
      .readdirSync(runsDir)
      .filter((x) => fs.statSync(path.join(runsDir, x)).isDirectory());
    ids.sort(); // IDs are timestamp-based, sortable
    runId = ids[ids.length - 1] ?? null;
  }

  // Optional mutation before resume
  const mutateSh = path.join(caseDir, 'steps', 'mutate-before-resume.sh');
  if (exists(mutateSh)) {
    sh(repoDir, 'bash', [mutateSh], { ...caseSpec.env, RUNR_RUN_ID: runId ?? '' });
  }

  // Resume if requested
  let resumeStdout: string | undefined;
  let resumeStderr: string | undefined;
  let resumeExitCode: number | undefined;

  if (caseSpec.resume) {
    const resumeArgs = [...caseSpec.resume.args];
    // If resume args don't include run_id, append it
    if (runId && !resumeArgs.includes(runId)) {
      resumeArgs.push(runId);
    }

    const resumeResult = sh(repoDir, runrBin, resumeArgs, caseSpec.env);
    resumeStdout = resumeResult.stdout;
    resumeStderr = resumeResult.stderr;
    resumeExitCode = resumeResult.exitCode;
  }

  return {
    repoDir,
    runId,
    runStdout: runResult.stdout,
    runStderr: runResult.stderr,
    runExitCode: runResult.exitCode,
    resumeStdout,
    resumeStderr,
    resumeExitCode
  };
}

/**
 * List all case directories in resume-gym.
 */
export function listResumeGymCases(fixturesRoot: string): string[] {
  const resumeGymDir = path.join(fixturesRoot, 'resume-gym');
  if (!exists(resumeGymDir)) {
    return [];
  }

  return fs
    .readdirSync(resumeGymDir)
    .map((n) => path.join(resumeGymDir, n))
    .filter((p) => exists(path.join(p, 'case.json')))
    .sort((a, b) => {
      // Sort by order field in case.json
      const aSpec = readJson<CaseSpec>(path.join(a, 'case.json'));
      const bSpec = readJson<CaseSpec>(path.join(b, 'case.json'));
      return (aSpec.order ?? 999) - (bSpec.order ?? 999);
    });
}
