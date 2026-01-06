/**
 * Intervention Receipt - captures manual work done outside Runr's normal flow.
 *
 * When the meta-agent routes around friction (review loops, timeouts, etc.),
 * this creates a structured record so the audit trail remains intact.
 *
 * Writes to: .runr/runs/<run_id>/interventions/<ts>-<slug>.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';

// Intervention reasons (why agent took over)
export type InterventionReason =
  | 'review_loop'      // Review phase kept looping
  | 'stalled_timeout'  // Run stalled/timed out
  | 'verification_failed' // Verification failed, manual fix needed
  | 'scope_violation'  // Hit scope guard, worked around it
  | 'manual_fix'       // General manual fix
  | 'other';           // Catch-all

export interface CommandResult {
  command: string;
  exit_code: number;
  duration_ms: number;
  stdout_lines: number;
  stderr_lines: number;
  /** Path to full output file if truncated */
  output_file?: string;
}

export interface InterventionReceipt {
  version: '1';
  timestamp: string;
  run_id: string;
  reason: InterventionReason;
  note: string;
  base_sha: string;
  branch: string;
  commands: CommandResult[];
  files_changed: string[];
  diffstat: string;
  lines_added: number;
  lines_deleted: number;
}

export interface WriteInterventionOptions {
  runStorePath: string;
  repoPath: string;
  runId: string;
  reason: InterventionReason;
  note: string;
  commands: string[];
}

export interface WriteInterventionResult {
  receipt: InterventionReceipt;
  receiptPath: string;
  trailers: string;
}

// Max lines to store inline (full output goes to file)
const MAX_INLINE_OUTPUT_LINES = 50;
const MAX_INLINE_OUTPUT_BYTES = 10 * 1024; // 10KB

/**
 * Execute a command and capture results.
 */
function executeCommand(
  command: string,
  repoPath: string,
  interventionsDir: string,
  commandIndex: number
): CommandResult {
  const start = Date.now();

  const result = spawnSync(command, {
    cwd: repoPath,
    shell: true,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB
    timeout: 5 * 60 * 1000 // 5 minute timeout per command
  });

  const duration_ms = Date.now() - start;
  const stdout = result.stdout || '';
  const stderr = result.stderr || '';
  const exit_code = result.status ?? -1;

  const stdoutLines = stdout.split('\n').filter(l => l).length;
  const stderrLines = stderr.split('\n').filter(l => l).length;

  // If output is large, write to file
  let output_file: string | undefined;
  const combinedOutput = `$ ${command}\n\n--- STDOUT ---\n${stdout}\n--- STDERR ---\n${stderr}\n--- EXIT CODE: ${exit_code} ---`;

  if (combinedOutput.length > MAX_INLINE_OUTPUT_BYTES || stdoutLines + stderrLines > MAX_INLINE_OUTPUT_LINES) {
    const outputFileName = `cmd-${commandIndex}-output.txt`;
    output_file = outputFileName;
    fs.writeFileSync(path.join(interventionsDir, outputFileName), combinedOutput);
  }

  return {
    command,
    exit_code,
    duration_ms,
    stdout_lines: stdoutLines,
    stderr_lines: stderrLines,
    output_file
  };
}

/**
 * Get current git state.
 */
function getGitState(repoPath: string): { sha: string; branch: string } {
  let sha = 'unknown';
  let branch = 'unknown';

  try {
    sha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  } catch { /* ignore */ }

  try {
    branch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
  } catch { /* ignore */ }

  return { sha, branch };
}

/**
 * Get diff stats for uncommitted changes.
 */
function getDiffInfo(repoPath: string): { files: string[]; diffstat: string; added: number; deleted: number } {
  const files: string[] = [];
  let diffstat = '';
  let added = 0;
  let deleted = 0;

  try {
    // Get list of changed files (staged + unstaged)
    const statusOutput = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' });
    for (const line of statusOutput.split('\n')) {
      if (line.trim()) {
        // Format: "XY filename" where XY is status codes
        const filename = line.slice(3).trim();
        if (filename) files.push(filename);
      }
    }
  } catch { /* ignore */ }

  try {
    // Get diffstat for staged + unstaged
    diffstat = execSync('git diff --stat HEAD 2>/dev/null || git diff --stat', {
      cwd: repoPath,
      encoding: 'utf-8'
    }).trim();
  } catch {
    try {
      // Fallback: just staged changes
      diffstat = execSync('git diff --stat --cached', { cwd: repoPath, encoding: 'utf-8' }).trim();
    } catch { /* ignore */ }
  }

  try {
    // Get numstat for line counts
    const numstat = execSync('git diff --numstat HEAD 2>/dev/null || git diff --numstat', {
      cwd: repoPath,
      encoding: 'utf-8'
    });
    for (const line of numstat.split('\n')) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        added += parseInt(parts[0], 10) || 0;
        deleted += parseInt(parts[1], 10) || 0;
      }
    }
  } catch { /* ignore */ }

  return { files, diffstat, added, deleted };
}

/**
 * Generate timestamp slug for filename.
 */
function generateSlug(reason: InterventionReason): string {
  const ts = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  return `${ts}-${reason}`;
}

/**
 * Write an intervention receipt.
 *
 * Creates:
 * - .runr/runs/<run_id>/interventions/<ts>-<reason>.json
 * - .runr/runs/<run_id>/interventions/cmd-N-output.txt (if output is large)
 */
export async function writeIntervention(options: WriteInterventionOptions): Promise<WriteInterventionResult> {
  const { runStorePath, repoPath, runId, reason, note, commands } = options;

  // Ensure interventions directory exists
  const interventionsDir = path.join(runStorePath, 'interventions');
  fs.mkdirSync(interventionsDir, { recursive: true });

  // Get git state
  const gitState = getGitState(repoPath);

  // Execute commands and capture results
  const commandResults: CommandResult[] = [];
  for (let i = 0; i < commands.length; i++) {
    const result = executeCommand(commands[i], repoPath, interventionsDir, i);
    commandResults.push(result);
  }

  // Get diff info
  const diffInfo = getDiffInfo(repoPath);

  // Build receipt
  const timestamp = new Date().toISOString();
  const receipt: InterventionReceipt = {
    version: '1',
    timestamp,
    run_id: runId,
    reason,
    note,
    base_sha: gitState.sha,
    branch: gitState.branch,
    commands: commandResults,
    files_changed: diffInfo.files,
    diffstat: diffInfo.diffstat,
    lines_added: diffInfo.added,
    lines_deleted: diffInfo.deleted
  };

  // Write receipt
  const slug = generateSlug(reason);
  const receiptFileName = `${slug}.json`;
  const receiptPath = path.join(interventionsDir, receiptFileName);
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));

  // Generate commit trailers
  const trailers = [
    `Runr-Intervention: true`,
    `Runr-Run-Id: ${runId}`,
    `Runr-Reason: ${reason}`
  ].join('\n');

  return {
    receipt,
    receiptPath,
    trailers
  };
}

/**
 * Print intervention receipt to console.
 */
export function printInterventionReceipt(result: WriteInterventionResult): void {
  const { receipt, receiptPath } = result;

  console.log('');
  console.log(`Intervention recorded for run ${receipt.run_id}`);
  console.log('');

  // Commands summary
  if (receipt.commands.length > 0) {
    console.log('Commands:');
    for (const cmd of receipt.commands) {
      const status = cmd.exit_code === 0 ? '✓' : '✗';
      const outputNote = cmd.output_file ? ` (output: ${cmd.output_file})` : '';
      console.log(`  ${status} ${cmd.command} [${cmd.exit_code}] ${cmd.duration_ms}ms${outputNote}`);
    }
    console.log('');
  }

  // Changes summary
  if (receipt.files_changed.length > 0) {
    console.log(`Changes: ${receipt.files_changed.length} files (+${receipt.lines_added} -${receipt.lines_deleted})`);
    const displayFiles = receipt.files_changed.slice(0, 10);
    for (const f of displayFiles) {
      console.log(`  ${f}`);
    }
    if (receipt.files_changed.length > 10) {
      console.log(`  ...${receipt.files_changed.length - 10} more`);
    }
    console.log('');
  }

  // Receipt location
  const relPath = receiptPath.replace(process.cwd() + '/', '');
  console.log(`Receipt:  ${relPath}`);
  console.log('');

  // Trailers for commit
  console.log('Trailers (for commit message):');
  console.log('---');
  console.log(result.trailers);
  console.log('---');
  console.log('');
}
