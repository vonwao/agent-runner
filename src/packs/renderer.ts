/**
 * Simple template renderer for pack templates.
 * Supports basic variable substitution using {{variable}} syntax.
 */

export interface TemplateContext {
  project_name?: string;
  project_about?: string;
  verification_commands?: string;
  integration_branch?: string;
  release_branch?: string;
  pack_name?: string;
  checkpoint_id?: string;
  task_name?: string;
  timestamp?: string;
  changes_summary?: string;
  verification_evidence?: string;
  review_notes?: string;
  files_modified?: string;
  [key: string]: string | undefined;
}

/**
 * Render a template string with the provided context.
 * Variables are denoted with {{variable_name}} syntax.
 * Missing variables are replaced with empty string.
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = context[varName];
    return value !== undefined ? value : '';
  });
}

/**
 * Format verification commands as a bullet list for templates
 */
export function formatVerificationCommands(verification: {
  tier0?: string[];
  tier1?: string[];
  tier2?: string[];
}): string {
  const lines: string[] = [];

  if (verification.tier0 && verification.tier0.length > 0) {
    lines.push('**Tier 0 (fast checks)**:');
    for (const cmd of verification.tier0) {
      lines.push(`- \`${cmd}\``);
    }
    lines.push('');
  }

  if (verification.tier1 && verification.tier1.length > 0) {
    lines.push('**Tier 1 (build)**:');
    for (const cmd of verification.tier1) {
      lines.push(`- \`${cmd}\``);
    }
    lines.push('');
  }

  if (verification.tier2 && verification.tier2.length > 0) {
    lines.push('**Tier 2 (tests)**:');
    for (const cmd of verification.tier2) {
      lines.push(`- \`${cmd}\``);
    }
    lines.push('');
  }

  if (lines.length === 0) {
    return 'No verification commands configured yet. Edit `.runr/runr.config.json` to add them.';
  }

  return lines.join('\n').trim();
}
