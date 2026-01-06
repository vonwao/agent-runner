/**
 * runr intervene - Record manual work done outside Runr's normal flow.
 *
 * When the meta-agent (or you) routes around friction, this command
 * creates a structured intervention receipt so the audit trail stays intact.
 *
 * Usage:
 *   runr intervene <run_id> --reason review_loop --note "Fixed TS errors" --cmd "npm test"
 *   runr intervene --latest --reason manual_fix --note "Added missing import"
 */

import { RunStore } from '../store/run-store.js';
import { resolveRunId } from '../store/run-utils.js';
import {
  writeIntervention,
  printInterventionReceipt,
  type InterventionReason
} from '../receipt/intervention.js';

export interface InterveneOptions {
  repo: string;
  runId: string;
  reason: InterventionReason;
  note: string;
  commands: string[];
  json?: boolean;
}

const VALID_REASONS: InterventionReason[] = [
  'review_loop',
  'stalled_timeout',
  'verification_failed',
  'scope_violation',
  'manual_fix',
  'other'
];

export async function interveneCommand(options: InterveneOptions): Promise<void> {
  const { repo, reason, note, commands, json } = options;

  // Validate reason
  if (!VALID_REASONS.includes(reason)) {
    console.error(`Error: Invalid reason '${reason}'`);
    console.error(`Valid reasons: ${VALID_REASONS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  // Resolve run ID (supports 'latest')
  let runId: string;
  try {
    runId = resolveRunId(options.runId, repo);
  } catch (err) {
    console.error((err as Error).message);
    process.exitCode = 1;
    return;
  }

  // Get run store
  const runStore = RunStore.init(runId, repo);

  // Write intervention receipt
  try {
    const result = await writeIntervention({
      runStorePath: runStore.path,
      repoPath: repo,
      runId,
      reason,
      note,
      commands
    });

    if (json) {
      // JSON output for programmatic use
      console.log(JSON.stringify({
        success: true,
        run_id: runId,
        receipt_path: result.receiptPath,
        trailers: result.trailers,
        commands_run: result.receipt.commands.length,
        all_passed: result.receipt.commands.every(c => c.exit_code === 0),
        files_changed: result.receipt.files_changed.length
      }, null, 2));
    } else {
      // Human-readable output
      printInterventionReceipt(result);
    }

  } catch (err) {
    console.error(`Error writing intervention: ${(err as Error).message}`);
    process.exitCode = 1;
  }
}
