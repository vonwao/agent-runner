import { getRunsRoot } from '../store/runs-root.js';
import fs from 'node:fs';
import path from 'node:path';

interface NextCommandOptions {
  repo?: string;
}

/**
 * Print the suggested next command from stop.json handoff
 */
export async function nextCommand(runId: string, options: NextCommandOptions = {}): Promise<void> {
  const repoPath = options.repo || process.cwd();
  const runsRoot = getRunsRoot(repoPath);

  // Read stop.json directly (no need to resolve - CLI already handles "latest")
  const stopJsonPath = path.join(runsRoot, runId, 'handoffs', 'stop.json');

  if (!fs.existsSync(stopJsonPath)) {
    console.error(`No stop handoff found for run ${runId}`);
    console.error(`Expected: ${stopJsonPath}`);
    process.exit(1);
  }

  const stopData = JSON.parse(fs.readFileSync(stopJsonPath, 'utf-8'));

  if (!stopData.next_actions || stopData.next_actions.length === 0) {
    console.error(`No next actions available for run ${runId}`);
    process.exit(1);
  }

  // Print the first suggested command
  const nextAction = stopData.next_actions[0];
  console.log(nextAction.command);
}
