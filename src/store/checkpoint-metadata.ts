import fs from 'node:fs/promises';
import path from 'node:path';
import { Milestone, VerificationTier } from '../types/schemas.js';

export interface CheckpointMetadata {
  schema_version: number;
  sha: string;
  run_id: string;
  milestone_index: number;
  milestone_title: string;
  created_at: string;
  tier?: VerificationTier;
  verification_commands?: string[];
}

/**
 * Write checkpoint metadata sidecar file.
 * Best-effort: does not throw if write fails.
 */
export async function writeCheckpointMetadata(options: {
  repoPath: string;
  sha: string;
  runId: string;
  milestoneIndex: number;
  milestone: Milestone;
  tier?: VerificationTier;
  verificationCommands?: string[];
}): Promise<void> {
  const { repoPath, sha, runId, milestoneIndex, milestone, tier, verificationCommands } = options;

  const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
  await fs.mkdir(checkpointsDir, { recursive: true });

  const metadata: CheckpointMetadata = {
    schema_version: 1,
    sha,
    run_id: runId,
    milestone_index: milestoneIndex,
    milestone_title: milestone.goal,
    created_at: new Date().toISOString()
  };

  // Add optional fields only if available
  if (tier !== undefined) {
    metadata.tier = tier;
  }
  if (verificationCommands !== undefined && verificationCommands.length > 0) {
    metadata.verification_commands = verificationCommands;
  }

  const metadataPath = path.join(checkpointsDir, `${sha}.json`);
  const tempPath = `${metadataPath}.tmp`;

  // Atomic write with Windows safety
  await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf-8');

  // Windows-safe rename: unlink destination if exists
  try {
    await fs.unlink(metadataPath);
  } catch {
    // Ignore if doesn't exist
  }

  await fs.rename(tempPath, metadataPath);
}

interface CheckpointCandidate {
  sha: string;
  milestoneIndex: number;
  created_at: string;
  mtime: number;
}

/**
 * Find the latest checkpoint for a run by scanning sidecar files.
 * Returns null if no valid sidecars found.
 * Selection: highest milestone_index, then latest created_at, then latest mtime.
 */
export async function findLatestCheckpointBySidecar(
  repoPath: string,
  runId: string
): Promise<{ sha: string; milestoneIndex: number; created_at: string } | null> {
  const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');

  try {
    await fs.access(checkpointsDir);
  } catch {
    return null; // No sidecars yet
  }

  const files = await fs.readdir(checkpointsDir);
  const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');

  let latestCheckpoint: CheckpointCandidate | null = null;

  for (const file of jsonFiles) {
    try {
      const filePath = path.join(checkpointsDir, file);
      const content = await fs.readFile(filePath, 'utf-8');
      const metadata: CheckpointMetadata = JSON.parse(content);

      // Sanity checks
      if (metadata.schema_version !== 1) {
        continue; // Ignore unknown schema versions
      }

      // Required fields type checks
      if (typeof metadata.sha !== 'string' ||
          typeof metadata.run_id !== 'string' ||
          typeof metadata.milestone_title !== 'string' ||
          typeof metadata.created_at !== 'string') {
        continue; // Missing/invalid required fields
      }

      const expectedSha = file.replace('.json', '');
      if (metadata.sha !== expectedSha) {
        continue; // SHA mismatch = corruption
      }

      if (!Number.isFinite(metadata.milestone_index) || metadata.milestone_index < 0) {
        continue; // Invalid milestone index
      }

      if (metadata.run_id !== runId) {
        continue; // Wrong run
      }

      // Get file mtime as fallback for tie-breaking
      const stats = await fs.stat(filePath);
      const mtime = stats.mtimeMs;

      // Selection: higher milestone_index, then later created_at, then later mtime
      const shouldReplace =
        latestCheckpoint === null ||
        metadata.milestone_index > latestCheckpoint.milestoneIndex ||
        (metadata.milestone_index === latestCheckpoint.milestoneIndex && (
          // created_at comparison (handles missing/empty)
          (metadata.created_at || '') > (latestCheckpoint.created_at || '') ||
          // If created_at equal/both missing, use mtime fallback
          ((metadata.created_at || '') === (latestCheckpoint.created_at || '') &&
           mtime > latestCheckpoint.mtime)
        ));

      if (shouldReplace) {
        latestCheckpoint = {
          sha: metadata.sha,
          milestoneIndex: metadata.milestone_index,
          created_at: metadata.created_at || '',
          mtime
        };
      }
    } catch {
      continue; // Malformed JSON or other read error
    }
  }

  return latestCheckpoint ? {
    sha: latestCheckpoint.sha,
    milestoneIndex: latestCheckpoint.milestoneIndex,
    created_at: latestCheckpoint.created_at
  } : null;
}
