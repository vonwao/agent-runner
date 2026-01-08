/**
 * Audit Classifier - Classifies commits by provenance
 *
 * Classifications:
 * - runr_checkpoint: Has checkpoint receipt or checkpoint commit
 * - runr_intervention: Has Runr-Intervention trailer or intervention receipt
 * - manual_attributed: Has Runr-Run-Id trailer but not checkpoint/intervention
 * - gap: No Runr attribution (audit gap)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { getRunsRoot } from '../store/runs-root.js';

export type CommitClassification =
  | 'runr_checkpoint'
  | 'runr_intervention'
  | 'runr_inferred'
  | 'manual_attributed'
  | 'gap';

export interface CommitTrailers {
  runrRunId?: string;
  runrIntervention?: boolean;
  runrReason?: string;
  runrCheckpoint?: string;
}

export interface ClassifiedCommit {
  sha: string;
  shortSha: string;
  subject: string;
  author: string;
  date: string;
  classification: CommitClassification;
  trailers: CommitTrailers;
  runId?: string;
  receiptPath?: string;
  inferenceSource?: 'intervention_range';  // How attribution was inferred
}

export interface AuditSummary {
  range: string;
  commits: ClassifiedCommit[];
  counts: {
    total: number;
    runr_checkpoint: number;
    runr_intervention: number;
    runr_inferred: number;
    manual_attributed: number;
    gap: number;
  };
  gaps: ClassifiedCommit[];
  runsReferenced: string[];
  /** Coverage excluding inferred attribution (checkpoint + intervention) */
  explicitCoverage: number;
  /** Coverage including inferred attribution (checkpoint + intervention + inferred) */
  inferredCoverage: number;
  /** Full coverage including all attribution (checkpoint + intervention + inferred + attributed) */
  fullCoverage: number;
}

/**
 * Parse git log output into commit objects.
 */
export function parseGitLog(repoPath: string, range: string): ClassifiedCommit[] {
  const commits: ClassifiedCommit[] = [];

  try {
    // Format: sha|short|subject|author|date|trailers
    // Use %x00 as delimiter to handle subjects with |
    const format = '%H%x00%h%x00%s%x00%an%x00%ai%x00%(trailers:key=Runr-Run-Id,valueonly)%x00%(trailers:key=Runr-Intervention,valueonly)%x00%(trailers:key=Runr-Reason,valueonly)%x00%(trailers:key=Runr-Checkpoint,valueonly)';

    const output = execSync(`git log --format="${format}" ${range}`, {
      cwd: repoPath,
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024
    });

    for (const line of output.trim().split('\n')) {
      if (!line.trim()) continue;

      const parts = line.split('\x00');
      if (parts.length < 5) continue;

      const [sha, shortSha, subject, author, date, runId, intervention, reason, checkpoint] = parts;

      const trailers: CommitTrailers = {};
      if (runId?.trim()) trailers.runrRunId = runId.trim();
      if (intervention?.trim().toLowerCase() === 'true') trailers.runrIntervention = true;
      if (reason?.trim()) trailers.runrReason = reason.trim();
      if (checkpoint?.trim()) trailers.runrCheckpoint = checkpoint.trim();

      commits.push({
        sha,
        shortSha,
        subject,
        author,
        date,
        classification: 'gap', // Will be classified later
        trailers
      });
    }
  } catch (err) {
    // Git log failed - return empty array
    console.error(`Warning: git log failed: ${(err as Error).message}`);
  }

  return commits;
}

/**
 * Check if a run has a checkpoint commit matching the given SHA.
 */
function hasCheckpointForSha(runsRoot: string, sha: string): { runId: string; receiptPath: string } | null {
  if (!fs.existsSync(runsRoot)) return null;

  try {
    const runDirs = fs.readdirSync(runsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d{14}$/.test(d.name));

    for (const runDir of runDirs) {
      // Check state.json for checkpoint_commit_sha
      const statePath = path.join(runsRoot, runDir.name, 'state.json');
      if (fs.existsSync(statePath)) {
        try {
          const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
          if (state.checkpoint_commit_sha === sha) {
            return {
              runId: runDir.name,
              receiptPath: path.join(runsRoot, runDir.name, 'receipt.json')
            };
          }
        } catch { /* ignore */ }
      }

      // Check receipt.json for checkpoint_sha
      const receiptPath = path.join(runsRoot, runDir.name, 'receipt.json');
      if (fs.existsSync(receiptPath)) {
        try {
          const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
          if (receipt.checkpoint_sha === sha) {
            return {
              runId: runDir.name,
              receiptPath
            };
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Check if a run has an intervention receipt for a given run ID.
 */
function hasInterventionReceipt(runsRoot: string, runId: string): string | null {
  const interventionsDir = path.join(runsRoot, runId, 'interventions');
  if (!fs.existsSync(interventionsDir)) return null;

  try {
    const files = fs.readdirSync(interventionsDir).filter(f => f.endsWith('.json'));
    if (files.length > 0) {
      return path.join(interventionsDir, files[0]);
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * Intervention range for SHA-based inference.
 */
interface InterventionRange {
  runId: string;
  baseSha: string;
  headSha: string;
  receiptPath: string;
}

/**
 * Load all intervention ranges from run stores.
 */
function loadInterventionRanges(runsRoot: string): InterventionRange[] {
  const ranges: InterventionRange[] = [];

  if (!fs.existsSync(runsRoot)) return ranges;

  try {
    const runDirs = fs.readdirSync(runsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory() && /^\d{14}$/.test(d.name));

    for (const runDir of runDirs) {
      const interventionsDir = path.join(runsRoot, runDir.name, 'interventions');
      if (!fs.existsSync(interventionsDir)) continue;

      try {
        const files = fs.readdirSync(interventionsDir).filter(f => f.endsWith('.json'));
        for (const file of files) {
          const receiptPath = path.join(interventionsDir, file);
          try {
            const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf-8'));
            // Only include receipts with both base_sha and head_sha
            if (receipt.base_sha && receipt.head_sha && receipt.base_sha !== receipt.head_sha) {
              ranges.push({
                runId: runDir.name,
                baseSha: receipt.base_sha,
                headSha: receipt.head_sha,
                receiptPath
              });
            }
          } catch { /* skip invalid receipts */ }
        }
      } catch { /* skip inaccessible dirs */ }
    }
  } catch { /* ignore */ }

  return ranges;
}

/**
 * Check if a commit SHA is within any intervention range.
 * Uses git merge-base --is-ancestor to check ancestry.
 */
function findInterventionRangeForCommit(
  repoPath: string,
  sha: string,
  ranges: InterventionRange[]
): InterventionRange | null {
  for (const range of ranges) {
    try {
      // Check if sha is a descendant of base_sha
      execSync(`git merge-base --is-ancestor ${range.baseSha} ${sha}`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Check if sha is an ancestor of (or equal to) head_sha
      execSync(`git merge-base --is-ancestor ${sha} ${range.headSha}`, {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Both checks passed - commit is within range
      return range;
    } catch {
      // Not in this range, continue checking
    }
  }

  return null;
}

/**
 * Classify commits based on trailers and receipt artifacts.
 */
export function classifyCommits(commits: ClassifiedCommit[], repoPath: string): ClassifiedCommit[] {
  const runsRoot = getRunsRoot(repoPath);

  // Load intervention ranges for SHA-based inference
  const interventionRanges = loadInterventionRanges(runsRoot);

  for (const commit of commits) {
    // Priority 1: Check if this is a checkpoint commit (by SHA match)
    const checkpointInfo = hasCheckpointForSha(runsRoot, commit.sha);
    if (checkpointInfo) {
      commit.classification = 'runr_checkpoint';
      commit.runId = checkpointInfo.runId;
      commit.receiptPath = checkpointInfo.receiptPath;
      continue;
    }

    // Priority 2: Has Runr-Checkpoint trailer
    if (commit.trailers.runrCheckpoint) {
      commit.classification = 'runr_checkpoint';
      commit.runId = commit.trailers.runrRunId;
      continue;
    }

    // Priority 3: Has Runr-Intervention trailer
    if (commit.trailers.runrIntervention) {
      commit.classification = 'runr_intervention';
      commit.runId = commit.trailers.runrRunId;
      if (commit.runId) {
        const receiptPath = hasInterventionReceipt(runsRoot, commit.runId);
        if (receiptPath) commit.receiptPath = receiptPath;
      }
      continue;
    }

    // Priority 4: Has Runr-Run-Id but not checkpoint/intervention
    if (commit.trailers.runrRunId) {
      // Check if there's an intervention receipt for this run
      const receiptPath = hasInterventionReceipt(runsRoot, commit.trailers.runrRunId);
      if (receiptPath) {
        commit.classification = 'runr_intervention';
        commit.runId = commit.trailers.runrRunId;
        commit.receiptPath = receiptPath;
      } else {
        commit.classification = 'manual_attributed';
        commit.runId = commit.trailers.runrRunId;
      }
      continue;
    }

    // Priority 5: Check if commit falls within intervention SHA range (inferred)
    const matchedRange = findInterventionRangeForCommit(repoPath, commit.sha, interventionRanges);
    if (matchedRange) {
      commit.classification = 'runr_inferred';
      commit.runId = matchedRange.runId;
      commit.receiptPath = matchedRange.receiptPath;
      commit.inferenceSource = 'intervention_range';
      continue;
    }

    // Priority 6: Check commit message for Task patterns (legacy)
    if (/Task \d+|task-\d+/i.test(commit.subject)) {
      // Try to find a matching run
      const runMatch = commit.subject.match(/(\d{14})/);
      if (runMatch) {
        commit.classification = 'manual_attributed';
        commit.runId = runMatch[1];
        continue;
      }
    }

    // Default: gap (no attribution)
    commit.classification = 'gap';
  }

  return commits;
}

/**
 * Generate audit summary from classified commits.
 * @param strict If true, treat runr_inferred as gaps
 */
export function generateSummary(commits: ClassifiedCommit[], range: string, strict = false): AuditSummary {
  const counts = {
    total: commits.length,
    runr_checkpoint: 0,
    runr_intervention: 0,
    runr_inferred: 0,
    manual_attributed: 0,
    gap: 0
  };

  const gaps: ClassifiedCommit[] = [];
  const runsReferenced = new Set<string>();

  for (const commit of commits) {
    counts[commit.classification]++;

    // In strict mode, treat inferred as gaps
    if (commit.classification === 'gap' || (strict && commit.classification === 'runr_inferred')) {
      gaps.push(commit);
    }

    if (commit.runId) {
      runsReferenced.add(commit.runId);
    }
  }

  // Calculate coverage percentages
  const explicitCount = counts.runr_checkpoint + counts.runr_intervention;
  const withInferredCount = explicitCount + counts.runr_inferred;
  const fullCount = withInferredCount + counts.manual_attributed;

  const explicitCoverage = counts.total > 0
    ? Math.round((explicitCount / counts.total) * 100)
    : 0;

  const inferredCoverage = counts.total > 0
    ? Math.round((withInferredCount / counts.total) * 100)
    : 0;

  const fullCoverage = counts.total > 0
    ? Math.round((fullCount / counts.total) * 100)
    : 0;

  return {
    range,
    commits,
    counts,
    gaps,
    runsReferenced: Array.from(runsReferenced).sort(),
    explicitCoverage,
    inferredCoverage,
    fullCoverage
  };
}

/**
 * Format classification for display.
 */
export function formatClassification(classification: CommitClassification): string {
  switch (classification) {
    case 'runr_checkpoint': return 'CHECKPOINT';
    case 'runr_intervention': return 'INTERVENTION';
    case 'runr_inferred': return 'INFERRED';
    case 'manual_attributed': return 'ATTRIBUTED';
    case 'gap': return 'GAP';
  }
}

/**
 * Get icon for classification.
 */
export function getClassificationIcon(classification: CommitClassification): string {
  switch (classification) {
    case 'runr_checkpoint': return '✓';
    case 'runr_intervention': return '⚡';
    case 'runr_inferred': return '~';
    case 'manual_attributed': return '○';
    case 'gap': return '?';
  }
}
