/**
 * runr mode - View or set workflow mode
 *
 * Mode determines how strictly Runr enforces audit trail requirements:
 * - flow: Productivity-first, interventions allowed freely
 * - ledger: Audit-first, stricter controls on interventions
 *
 * Usage:
 *   runr mode             # Show current mode
 *   runr mode flow        # Set mode to flow
 *   runr mode ledger      # Set mode to ledger
 */

import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, resolveConfigPath } from '../config/load.js';

export type WorkflowMode = 'flow' | 'ledger';

const VALID_MODES: WorkflowMode[] = ['flow', 'ledger'];

export interface ModeOptions {
  repo: string;
  newMode?: WorkflowMode;
}

/**
 * Get current mode from config.
 */
export function getCurrentMode(repoPath: string): WorkflowMode {
  try {
    const configPath = resolveConfigPath(repoPath);
    if (!fs.existsSync(configPath)) {
      return 'flow';
    }
    const config = loadConfig(configPath);
    return config.workflow?.mode || 'flow';
  } catch {
    return 'flow';
  }
}

/**
 * Print mode banner (called at start of commands).
 */
export function printModeBanner(repoPath: string): void {
  const mode = getCurrentMode(repoPath);
  const version = '0.7.0'; // TODO: Read from package.json
  console.log(`Runr v${version} | Mode: ${mode}`);
}

/**
 * Check if a mode-restricted operation is allowed.
 */
export function checkModeRestriction(
  repoPath: string,
  operation: 'amend_last',
  forceOverride?: boolean
): { allowed: boolean; error?: string } {
  const mode = getCurrentMode(repoPath);

  if (forceOverride) {
    return { allowed: true };
  }

  if (mode === 'ledger') {
    switch (operation) {
      case 'amend_last':
        return {
          allowed: false,
          error: `Error: --amend-last is not allowed in Ledger mode.
In Ledger mode, use explicit commits:
  runr intervene <run_id> --commit "message" --reason <reason>
Or switch to Flow mode with: runr mode flow`
        };
    }
  }

  return { allowed: true };
}

/**
 * Set mode in config file.
 */
function setMode(repoPath: string, newMode: WorkflowMode): void {
  const configPath = resolveConfigPath(repoPath);
  const configExists = fs.existsSync(configPath);

  if (!configExists) {
    // Create new config
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const newConfig = {
      workflow: {
        mode: newMode,
        profile: 'solo',
        integration_branch: 'dev',
        release_branch: 'main'
      }
    };
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    return;
  }

  // Update existing config
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const config = JSON.parse(content);

    if (!config.workflow) {
      config.workflow = {};
    }
    config.workflow.mode = newMode;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (err) {
    throw new Error(`Failed to update config: ${(err as Error).message}`);
  }
}

/**
 * Mode command: View or set workflow mode.
 */
export async function modeCommand(options: ModeOptions): Promise<void> {
  const { repo, newMode } = options;

  if (newMode) {
    // Validate mode
    if (!VALID_MODES.includes(newMode)) {
      console.error(`Error: Invalid mode '${newMode}'`);
      console.error(`Valid modes: ${VALID_MODES.join(', ')}`);
      process.exitCode = 1;
      return;
    }

    // Set mode
    try {
      setMode(repo, newMode);
      console.log(`Mode set to: ${newMode}`);

      if (newMode === 'ledger') {
        console.log('');
        console.log('Ledger mode restrictions:');
        console.log('  - --amend-last is not allowed');
        console.log('  - All merges should go through runr submit');
        console.log('  - Higher audit coverage expectations');
      } else {
        console.log('');
        console.log('Flow mode enabled:');
        console.log('  - Interventions allowed freely');
        console.log('  - --amend-last allowed');
        console.log('  - Flexible workflow for productivity');
      }
    } catch (err) {
      console.error((err as Error).message);
      process.exitCode = 1;
    }
  } else {
    // Show current mode
    const mode = getCurrentMode(repo);
    console.log(`Current mode: ${mode}`);
    console.log('');

    if (mode === 'flow') {
      console.log('Flow mode (productivity-first):');
      console.log('  - Interventions allowed freely');
      console.log('  - --amend-last allowed');
      console.log('  - Flexible workflow');
    } else {
      console.log('Ledger mode (audit-first):');
      console.log('  - --amend-last not allowed');
      console.log('  - Strict audit trail');
      console.log('  - All changes through runr submit');
    }

    console.log('');
    console.log('To change mode: runr mode <flow|ledger>');
  }
}
