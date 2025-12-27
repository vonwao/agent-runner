/**
 * Evidence gating for counter-evidence claims.
 *
 * When an implementer claims "no_changes_needed", it must provide
 * machine-checkable evidence to prove the claim. This prevents
 * false certainty and "it said it was done but wasn't" failures.
 */

import picomatch from 'picomatch';
import { NoChangesEvidence } from '../workers/schemas.js';

export interface EvidenceValidationResult {
  ok: boolean;
  errors: string[];
  satisfied_by?: 'files_checked' | 'grep_output' | 'commands_run';
}

/**
 * Validate that no_changes_needed claims have sufficient evidence.
 *
 * Requirements (at least one must be satisfied):
 * - files_checked: at least 1 file, all within scope allowlist
 * - grep_output: non-empty string (max 8KB enforced by schema)
 * - commands_run: at least 1 command with exit_code === 0
 *
 * @param evidence - The evidence object from implementer output
 * @param allowlist - Scope allowlist patterns for file validation
 * @returns Validation result with ok flag and any errors
 */
export function validateNoChangesEvidence(
  evidence: NoChangesEvidence | undefined,
  allowlist: string[]
): EvidenceValidationResult {
  const errors: string[] = [];

  if (!evidence) {
    return {
      ok: false,
      errors: ['No evidence provided for no_changes_needed claim']
    };
  }

  // Check files_checked
  const filesChecked = evidence.files_checked ?? [];
  if (filesChecked.length > 0) {
    // Validate all files are within scope
    const matchers = allowlist.map(pattern => picomatch(pattern));
    const outOfScope = filesChecked.filter(
      file => !matchers.some(match => match(file))
    );

    if (outOfScope.length > 0) {
      errors.push(`files_checked contains paths outside scope: ${outOfScope.slice(0, 3).join(', ')}${outOfScope.length > 3 ? ` (+${outOfScope.length - 3} more)` : ''}`);
    } else {
      return {
        ok: true,
        errors: [],
        satisfied_by: 'files_checked'
      };
    }
  }

  // Check grep_output
  const grepOutput = evidence.grep_output ?? '';
  if (grepOutput.trim().length > 0) {
    return {
      ok: true,
      errors: [],
      satisfied_by: 'grep_output'
    };
  }

  // Check commands_run
  const commandsRun = evidence.commands_run ?? [];
  if (commandsRun.length > 0) {
    const allPassed = commandsRun.every(cmd => cmd.exit_code === 0);
    if (allPassed) {
      return {
        ok: true,
        errors: [],
        satisfied_by: 'commands_run'
      };
    } else {
      const failedCommands = commandsRun.filter(cmd => cmd.exit_code !== 0);
      errors.push(`commands_run contains failed commands: ${failedCommands.map(c => `${c.command} (exit ${c.exit_code})`).slice(0, 2).join(', ')}`);
    }
  }

  // None of the evidence types were sufficient
  if (errors.length === 0) {
    errors.push('Evidence must include at least one of: files_checked (non-empty), grep_output (non-empty), or commands_run (with exit_code 0)');
  }

  return {
    ok: false,
    errors
  };
}

/**
 * Format evidence validation errors for stop memo.
 */
export function formatEvidenceErrors(result: EvidenceValidationResult): string {
  if (result.ok) return '';

  const lines = [
    'Insufficient evidence for "no_changes_needed" claim.',
    '',
    'Errors:',
    ...result.errors.map(e => `  - ${e}`),
    '',
    'Required: At least one of:',
    '  - files_checked: array of file paths that were inspected (must be within scope)',
    '  - grep_output: output from grep/search showing the feature already exists',
    '  - commands_run: commands executed with exit_code 0 proving no changes needed'
  ];

  return lines.join('\n');
}
