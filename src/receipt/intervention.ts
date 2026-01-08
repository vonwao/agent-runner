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
import { redact } from '../redaction/redactor.js';
import type { ReceiptsConfig } from '../config/schema.js';

// Output capture modes
export type CaptureMode = 'full' | 'truncated' | 'metadata_only';

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
  // Git state anchors
  base_sha: string;         // HEAD before intervention
  head_sha: string;         // HEAD after intervention
  branch: string;
  dirty_before: boolean;    // Was tree dirty before?
  dirty_after: boolean;     // Is tree dirty after?
  commits_in_range: string[]; // SHAs between base..head (if any)
  // Command results
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
  /** Output capture mode (default: truncated) */
  captureMode?: CaptureMode;
  /** Whether to redact secrets (default: true) */
  redactSecrets?: boolean;
  /** Max output bytes when truncating (default: 10KB) */
  maxOutputBytes?: number;
  /** Override base_sha for retroactive attribution */
  sinceSha?: string;
  /** Create commit with this message and trailers */
  commitMessage?: string;
  /** Amend last commit to add trailers (Flow mode only) */
  amendLast?: boolean;
  /** Stage changes but don't commit */
  stageOnly?: boolean;
  /** Current workflow mode */
  workflowMode?: 'flow' | 'ledger';
  /** Force amend even in Ledger mode */
  forceAmend?: boolean;
}

export interface WriteInterventionResult {
  receipt: InterventionReceipt;
  receiptPath: string;
  trailers: string;
  /** SHA of commit created (if --commit used) */
  commitSha?: string;
  /** Whether last commit was amended (if --amend-last used) */
  amended?: boolean;
  /** Whether there are uncommitted changes (for helper message) */
  hasUncommittedChanges?: boolean;
}

// Max lines to store inline (full output goes to file)
const MAX_INLINE_OUTPUT_LINES = 50;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024; // 10KB

interface ExecuteCommandOptions {
  command: string;
  repoPath: string;
  interventionsDir: string;
  commandIndex: number;
  captureMode: CaptureMode;
  redactSecrets: boolean;
  maxOutputBytes: number;
}

/**
 * Execute a command and capture results.
 */
function executeCommand(options: ExecuteCommandOptions): CommandResult {
  const {
    command,
    repoPath,
    interventionsDir,
    commandIndex,
    captureMode,
    redactSecrets,
    maxOutputBytes
  } = options;

  const start = Date.now();

  const result = spawnSync(command, {
    cwd: repoPath,
    shell: true,
    encoding: 'utf-8',
    maxBuffer: 10 * 1024 * 1024, // 10MB
    timeout: 5 * 60 * 1000 // 5 minute timeout per command
  });

  const duration_ms = Date.now() - start;
  let stdout = result.stdout || '';
  let stderr = result.stderr || '';
  const exit_code = result.status ?? -1;

  // Apply redaction if enabled
  if (redactSecrets) {
    stdout = redact(stdout);
    stderr = redact(stderr);
  }

  const stdoutLines = stdout.split('\n').filter(l => l).length;
  const stderrLines = stderr.split('\n').filter(l => l).length;

  // metadata_only: don't capture output at all
  if (captureMode === 'metadata_only') {
    return {
      command: redactSecrets ? redact(command) : command,
      exit_code,
      duration_ms,
      stdout_lines: stdoutLines,
      stderr_lines: stderrLines
    };
  }

  // Prepare combined output
  const redactedCommand = redactSecrets ? redact(command) : command;
  let combinedOutput = `$ ${redactedCommand}\n\n--- STDOUT ---\n${stdout}\n--- STDERR ---\n${stderr}\n--- EXIT CODE: ${exit_code} ---`;

  // Apply truncation if needed
  let output_file: string | undefined;
  const shouldTruncate = captureMode === 'truncated' && (
    combinedOutput.length > maxOutputBytes ||
    stdoutLines + stderrLines > MAX_INLINE_OUTPUT_LINES
  );

  if (captureMode === 'full' || shouldTruncate) {
    // Write to file (full mode always writes, truncated writes large outputs)
    const outputFileName = `cmd-${commandIndex}-output.txt`;
    output_file = outputFileName;
    fs.writeFileSync(path.join(interventionsDir, outputFileName), combinedOutput);
  }

  return {
    command: redactedCommand,
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
 * Check if working tree is dirty.
 */
function isDirty(repoPath: string): boolean {
  try {
    const status = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf-8' });
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Get commits between two SHAs (exclusive base, inclusive head).
 * Returns empty array if base == head or on error.
 */
function getCommitsInRange(repoPath: string, baseSha: string, headSha: string): string[] {
  if (baseSha === headSha || baseSha === 'unknown' || headSha === 'unknown') {
    return [];
  }

  try {
    const output = execSync(`git rev-list ${baseSha}..${headSha}`, {
      cwd: repoPath,
      encoding: 'utf-8'
    });
    return output.trim().split('\n').filter(line => line.trim());
  } catch {
    return [];
  }
}

/**
 * Validate that a SHA exists and is an ancestor of HEAD.
 * Returns { valid: true } or { valid: false, error: string }
 */
function validateSinceSha(repoPath: string, sinceSha: string): { valid: boolean; error?: string; resolvedSha?: string } {
  // Resolve the SHA (handles refs like HEAD~1)
  let resolvedSha: string;
  try {
    resolvedSha = execSync(`git rev-parse ${sinceSha}`, { cwd: repoPath, encoding: 'utf-8' }).trim();
  } catch {
    return { valid: false, error: `Could not resolve '${sinceSha}' - not a valid git reference` };
  }

  // Check if it's an ancestor of HEAD
  try {
    execSync(`git merge-base --is-ancestor ${resolvedSha} HEAD`, { cwd: repoPath, encoding: 'utf-8' });
    return { valid: true, resolvedSha };
  } catch {
    return { valid: false, error: `'${sinceSha}' (${resolvedSha.slice(0, 8)}) is not an ancestor of HEAD` };
  }
}

/**
 * Check if the last commit has been pushed to remote.
 */
function isLastCommitPushed(repoPath: string): boolean {
  try {
    // Get the tracking branch
    const trackingBranch = execSync('git rev-parse --abbrev-ref --symbolic-full-name @{u}', {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    // Check if HEAD is ahead of tracking branch
    const ahead = execSync(`git rev-list ${trackingBranch}..HEAD --count`, {
      cwd: repoPath,
      encoding: 'utf-8'
    }).trim();

    // If ahead count is 0, the last commit has been pushed
    return parseInt(ahead, 10) === 0;
  } catch {
    // No tracking branch or error - assume not pushed
    return false;
  }
}

/**
 * Create a commit with message and trailers.
 */
function createCommitWithTrailers(
  repoPath: string,
  message: string,
  runId: string,
  reason: InterventionReason
): string {
  // Stage all changes
  execSync('git add -A', { cwd: repoPath, encoding: 'utf-8' });

  // Build commit message with trailers
  const fullMessage = `${message}

Runr-Run-Id: ${runId}
Runr-Intervention: true
Runr-Reason: ${reason}`;

  // Create commit
  execSync(`git commit -m "${fullMessage.replace(/"/g, '\\"')}"`, {
    cwd: repoPath,
    encoding: 'utf-8'
  });

  // Return new commit SHA
  return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
}

/**
 * Amend the last commit to add Runr trailers.
 */
function amendLastCommitWithTrailers(
  repoPath: string,
  runId: string,
  reason: InterventionReason
): string {
  // Get existing commit message
  const existingMessage = execSync('git log -1 --format=%B', {
    cwd: repoPath,
    encoding: 'utf-8'
  }).trim();

  // Check if trailers already exist
  if (existingMessage.includes('Runr-Intervention:')) {
    throw new Error('Last commit already has Runr-Intervention trailer');
  }

  // Build new message with trailers
  const newMessage = `${existingMessage}

Runr-Run-Id: ${runId}
Runr-Intervention: true
Runr-Reason: ${reason}`;

  // Amend the commit
  execSync(`git commit --amend -m "${newMessage.replace(/"/g, '\\"')}"`, {
    cwd: repoPath,
    encoding: 'utf-8'
  });

  // Return amended commit SHA
  return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf-8' }).trim();
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
  const {
    runStorePath,
    repoPath,
    runId,
    reason,
    note,
    commands,
    captureMode = 'truncated',
    redactSecrets = true,
    maxOutputBytes = DEFAULT_MAX_OUTPUT_BYTES,
    sinceSha,
    commitMessage,
    amendLast,
    stageOnly,
    workflowMode = 'flow',
    forceAmend = false
  } = options;

  // Validate conflicting options
  if (commitMessage && amendLast) {
    throw new Error('Cannot use both --commit and --amend-last');
  }

  // Validate --amend-last requirements
  if (amendLast) {
    if (workflowMode === 'ledger' && !forceAmend) {
      throw new Error('--amend-last is not allowed in Ledger mode (use --force to override)');
    }
    if (isLastCommitPushed(repoPath)) {
      throw new Error('Cannot amend: last commit has already been pushed to remote');
    }
  }

  // Ensure interventions directory exists
  const interventionsDir = path.join(runStorePath, 'interventions');
  fs.mkdirSync(interventionsDir, { recursive: true });

  // Capture git state BEFORE commands
  const gitStateBefore = getGitState(repoPath);
  const dirtyBefore = isDirty(repoPath);

  // Determine base_sha (use --since if provided, otherwise current HEAD)
  let baseSha = gitStateBefore.sha;
  if (sinceSha) {
    const validation = validateSinceSha(repoPath, sinceSha);
    if (!validation.valid) {
      throw new Error(validation.error!);
    }
    baseSha = validation.resolvedSha!;
  }

  // Execute commands and capture results
  const commandResults: CommandResult[] = [];
  for (let i = 0; i < commands.length; i++) {
    const result = executeCommand({
      command: commands[i],
      repoPath,
      interventionsDir,
      commandIndex: i,
      captureMode,
      redactSecrets,
      maxOutputBytes
    });
    commandResults.push(result);
  }

  // Handle commit operations
  let commitSha: string | undefined;
  let amended = false;

  if (stageOnly) {
    // Just stage changes
    execSync('git add -A', { cwd: repoPath, encoding: 'utf-8' });
  } else if (commitMessage) {
    // Create new commit with trailers
    commitSha = createCommitWithTrailers(repoPath, commitMessage, runId, reason);
  } else if (amendLast) {
    // Amend last commit with trailers
    commitSha = amendLastCommitWithTrailers(repoPath, runId, reason);
    amended = true;
  }

  // Capture git state AFTER commands and commit operations
  const gitStateAfter = getGitState(repoPath);
  const dirtyAfter = isDirty(repoPath);
  const headSha = gitStateAfter.sha;

  // Get commits in range (if HEAD advanced or --since was used)
  const commitsInRange = getCommitsInRange(repoPath, baseSha, headSha);

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
    base_sha: baseSha,
    head_sha: headSha,
    branch: gitStateBefore.branch,
    dirty_before: dirtyBefore,
    dirty_after: dirtyAfter,
    commits_in_range: commitsInRange,
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

  // Check for uncommitted changes (for helper message)
  const hasUncommittedChanges = dirtyAfter && !commitMessage && !amendLast;

  return {
    receipt,
    receiptPath,
    trailers,
    commitSha,
    amended,
    hasUncommittedChanges
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

  // SHA anchors
  const baseShaShort = receipt.base_sha.slice(0, 8);
  const headShaShort = receipt.head_sha.slice(0, 8);
  if (receipt.base_sha === receipt.head_sha) {
    console.log(`SHA: ${baseShaShort} (no commits)`);
  } else {
    console.log(`SHA: ${baseShaShort}..${headShaShort} (${receipt.commits_in_range.length} commit${receipt.commits_in_range.length !== 1 ? 's' : ''})`);
  }
  const dirtyStatus = `dirty: ${receipt.dirty_before ? 'before' : ''}${receipt.dirty_before && receipt.dirty_after ? ',' : ''}${receipt.dirty_after ? 'after' : ''}${!receipt.dirty_before && !receipt.dirty_after ? 'clean' : ''}`;
  console.log(`Tree: ${dirtyStatus}`);
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

  // Commit info (if --commit or --amend-last was used)
  if (result.commitSha) {
    if (result.amended) {
      console.log(`Amended: ${result.commitSha.slice(0, 8)}`);
    } else {
      console.log(`Commit: ${result.commitSha.slice(0, 8)}`);
    }
    console.log('');
  }

  // Receipt location
  const relPath = receiptPath.replace(process.cwd() + '/', '');
  console.log(`Receipt:  ${relPath}`);
  console.log('');

  // Helper message for uncommitted changes
  if (result.hasUncommittedChanges) {
    console.log('Uncommitted changes detected. To commit with attribution:');
    console.log('');
    console.log(`  git commit -m "your message" \\`);
    console.log(`    --trailer "Runr-Run-Id: ${receipt.run_id}" \\`);
    console.log(`    --trailer "Runr-Intervention: true" \\`);
    console.log(`    --trailer "Runr-Reason: ${receipt.reason}"`);
    console.log('');
    console.log('Or use --commit with intervene:');
    console.log(`  runr intervene ${receipt.run_id} --commit "your message" --reason ${receipt.reason} --note "..."`);
    console.log('');
  } else {
    // Only show trailers if there are no uncommitted changes (less noisy)
    console.log('Trailers (for commit message):');
    console.log('---');
    console.log(result.trailers);
    console.log('---');
    console.log('');
  }
}
