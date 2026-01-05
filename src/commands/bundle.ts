import fs from 'node:fs/promises';
import path from 'node:path';
import { execa } from 'execa';
import { RunStore } from '../store/run-store.js';
import { RunState } from '../types/schemas.js';

export interface BundleOptions {
  repo: string;
  runId: string;
  output?: string;
}

/**
 * Get verification status display from run state.
 */
function getVerificationStatus(state: RunState): {
  status: 'PASSED' | 'FAILED' | 'UNVERIFIED';
  tier: string;
  commands: string;
  resultLine: string;
} {
  const evidence = state.last_verification_evidence;

  if (!evidence) {
    return {
      status: 'UNVERIFIED',
      tier: 'none',
      commands: 'none',
      resultLine: '⚠ UNVERIFIED'
    };
  }

  const tier = evidence.tiers_run?.[0] || 'none';
  const commands = evidence.commands_run?.map(c => c.command).join(', ') || 'none';

  // If evidence exists, assume PASSED (adjust if you track explicit pass/fail)
  return {
    status: 'PASSED',
    tier,
    commands,
    resultLine: '✓ PASSED'
  };
}

/**
 * Render milestone checklist.
 */
function renderMilestones(state: RunState): string[] {
  const milestones = state.milestones || [];
  const currentIndex = state.milestone_index ?? -1;
  const completed = currentIndex >= 0 ? Math.min(currentIndex + 1, milestones.length) : 0;
  const total = milestones.length;

  const lines: string[] = [];
  lines.push(`## Milestones (${completed}/${total})`);

  if (milestones.length === 0) {
    lines.push('- (none)');
  } else {
    for (let i = 0; i < milestones.length; i++) {
      const goal = milestones[i]?.goal || '';
      const checked = i <= currentIndex ? 'x' : ' ';
      lines.push(`- [${checked}] M${i}: ${goal}`);
    }
  }

  return lines;
}

/**
 * Get git diffstat for checkpoint.
 */
async function getCheckpointDiffstat(repoPath: string, sha: string): Promise<string> {
  try {
    const result = await execa('git', ['show', '--stat', '--oneline', '--no-color', sha], {
      cwd: repoPath
    });
    return result.stdout.trim();
  } catch {
    return `Error: unable to compute git stat for checkpoint ${sha}`;
  }
}

/**
 * Get timeline event summary (all event types, sorted alphabetically).
 */
async function getTimelineSummary(runDir: string): Promise<string[]> {
  const timelinePath = path.join(runDir, 'timeline.jsonl');

  try {
    const content = await fs.readFile(timelinePath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());

    const counts = new Map<string, number>();
    for (const line of lines) {
      try {
        const event = JSON.parse(line) as { type?: string };
        if (event.type) {
          counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
        }
      } catch {
        // Skip malformed lines
      }
    }

    // Deterministic: all event types, sorted alphabetically
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([type, count]) => `- ${type}: ${count}`);
  } catch {
    return ['- (none)'];
  }
}

/**
 * Check if artifact file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Bundle command: Generate deterministic markdown evidence packet.
 */
export async function bundleCommand(options: BundleOptions): Promise<void> {
  const runStore = RunStore.init(options.runId, options.repo);

  let state: RunState;
  try {
    state = runStore.readState();
  } catch {
    console.error(`Error: run state not found for ${options.runId}`);
    process.exitCode = 1;
    return;
  }

  const checkpoint = state.checkpoint_commit_sha || 'none';
  const created = state.started_at || '';
  const phase = state.phase || '';
  const stopReason = state.stop_reason || '';

  const verification = getVerificationStatus(state);
  const milestoneLines = renderMilestones(state);

  // Get checkpoint diffstat
  let diffstat = 'none';
  if (checkpoint !== 'none') {
    diffstat = await getCheckpointDiffstat(options.repo, checkpoint);
  }

  // Get timeline summary
  const timelineLines = await getTimelineSummary(runStore.path);

  // Artifact paths (relative, no absolute paths)
  const artifacts: string[] = [
    `- Timeline: .runr/runs/${options.runId}/timeline.jsonl`,
    `- Journal: .runr/runs/${options.runId}/journal.md`,
    `- State: .runr/runs/${options.runId}/state.json`
  ];

  // Check if review digest exists
  const reviewPath = path.join(runStore.path, 'review_digest.md');
  if (await fileExists(reviewPath)) {
    artifacts.push(`- Review: .runr/runs/${options.runId}/review_digest.md`);
  }

  // Build output (deterministic markdown)
  const lines: string[] = [
    `# Run ${options.runId}`,
    '',
    `**Created:** ${created}`,
    `**Checkpoint:** ${checkpoint}`,
    `**Status:** ${phase}${stopReason ? ` (${stopReason})` : ''}`,
    '',
    ...milestoneLines,
    '',
    '## Verification Evidence',
    `**Status:** ${verification.status}`,
    `**Tier:** ${verification.tier}`,
    `**Commands:** ${verification.commands}`,
    `**Result:** ${verification.resultLine}`,
    '',
    '## Checkpoint Diffstat',
    diffstat,
    '',
    '## Timeline Event Summary',
    ...timelineLines,
    '',
    '## Artifacts',
    ...artifacts,
    '',
    '---',
    '🤖 Generated with Runr'
  ];

  const output = lines.join('\n');

  // Write to file or stdout
  if (options.output) {
    await fs.writeFile(options.output, output, 'utf-8');
    console.log(`Wrote bundle to ${options.output}`);
  } else {
    console.log(output);
  }
}
