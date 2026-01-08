/**
 * Checkpoint commit detection and protection.
 *
 * Prevents accidental amendment of checkpoint commits,
 * which would rewrite verified/audited history.
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { getRunsRoot } from '../store/runs-root.js';

export interface CheckpointInfo {
  isCheckpoint: boolean;
  sha: string;
  runId?: string;
  detectedBy?: 'subject' | 'trailer' | 'state';
}

/**
 * Detect if HEAD is a Runr checkpoint commit.
 *
 * Detection methods (in order):
 * 1. Subject prefix: "chore(runr): checkpoint"
 * 2. Trailer: "Runr-Checkpoint: true"
 * 3. SHA in any run's state.json checkpoint_commit_sha
 */
export function isCheckpointCommit(repoPath: string): CheckpointInfo {
  try {
    // Get HEAD commit info
    const format = '%H%x00%s%x00%(trailers:key=Runr-Checkpoint,valueonly)%x00%(trailers:key=Runr-Run-Id,valueonly)';
    const output = execSync(`git log -1 --format="${format}" HEAD`, {
      cwd: repoPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe']
    }).trim();

    const [sha, subject, checkpointTrailer, runIdTrailer] = output.split('\x00');

    // Method 1: Check subject prefix
    if (subject.startsWith('chore(runr): checkpoint')) {
      const runIdMatch = subject.match(/checkpoint (\d{14})/);
      return {
        isCheckpoint: true,
        sha,
        runId: runIdMatch?.[1] || runIdTrailer?.trim(),
        detectedBy: 'subject'
      };
    }

    // Method 2: Check trailer
    if (checkpointTrailer?.trim().toLowerCase() === 'true') {
      return {
        isCheckpoint: true,
        sha,
        runId: runIdTrailer?.trim(),
        detectedBy: 'trailer'
      };
    }

    // Method 3: Check state.json files
    const runsRoot = getRunsRoot(repoPath);
    if (fs.existsSync(runsRoot)) {
      try {
        const runDirs = fs.readdirSync(runsRoot, { withFileTypes: true })
          .filter(d => d.isDirectory() && /^\d{14}$/.test(d.name));

        for (const runDir of runDirs) {
          const statePath = path.join(runsRoot, runDir.name, 'state.json');
          if (fs.existsSync(statePath)) {
            try {
              const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
              if (state.checkpoint_commit_sha === sha) {
                return {
                  isCheckpoint: true,
                  sha,
                  runId: runDir.name,
                  detectedBy: 'state'
                };
              }
            } catch { /* ignore parse errors */ }
          }
        }
      } catch { /* ignore read errors */ }
    }

    // Not a checkpoint
    return { isCheckpoint: false, sha };

  } catch {
    // Git command failed (no commits, not a repo, etc.)
    return { isCheckpoint: false, sha: '' };
  }
}

export interface CheckpointGuardResult {
  allowed: boolean;
  error?: string;
  checkpointInfo?: CheckpointInfo;
}

/**
 * Check if amending HEAD is allowed.
 *
 * Blocks amendment if HEAD is a checkpoint commit,
 * unless --force is provided.
 */
export function checkAmendAllowed(
  repoPath: string,
  forceOverride = false,
  ledgerMode = false
): CheckpointGuardResult {
  const info = isCheckpointCommit(repoPath);

  if (!info.isCheckpoint) {
    return { allowed: true, checkpointInfo: info };
  }

  if (forceOverride) {
    // Force allowed, but emit warning
    return {
      allowed: true,
      checkpointInfo: info,
      error: `Warning: Amending checkpoint commit ${info.sha.slice(0, 7)} (run ${info.runId || 'unknown'}).
This rewrites audited history. Proceed with caution.`
    };
  }

  // Build error message
  let message = `Refusing to amend: HEAD is a Runr checkpoint commit (verified work).
This would rewrite audited history.`;

  if (ledgerMode) {
    message += `

Ledger mode: checkpoint history is immutable.`;
  }

  message += `

If you really mean it: re-run with --force.
Better alternative: create a follow-up commit with trailers instead.`;

  return {
    allowed: false,
    error: message,
    checkpointInfo: info
  };
}
