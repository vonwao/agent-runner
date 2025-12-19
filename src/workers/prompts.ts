import fs from 'node:fs';
import path from 'node:path';
import { Milestone } from '../types/schemas.js';

function loadTemplate(name: string): string {
  const target = path.resolve('templates', 'prompts', name);
  return fs.readFileSync(target, 'utf-8');
}

export function buildPlanPrompt(taskText: string): string {
  const template = loadTemplate('planner.md');
  return [
    template,
    '',
    'Task:',
    taskText,
    '',
    'Output JSON between markers:',
    'BEGIN_JSON',
    '{"milestones": [{"goal": "...", "done_checks": ["..."], "risk_level": "medium"}], "risk_map": ["..."], "do_not_touch": ["..."]}',
    'END_JSON'
  ].join('\n');
}

export function buildImplementPrompt(input: {
  milestone: Milestone;
  scopeAllowlist: string[];
  scopeDenylist: string[];
  allowDeps: boolean;
}): string {
  const template = loadTemplate('implementer.md');
  return [
    template,
    '',
    `Milestone goal: ${input.milestone.goal}`,
    `Done checks: ${input.milestone.done_checks.join('; ')}`,
    `Scope allowlist: ${input.scopeAllowlist.join(', ') || 'none'}`,
    `Scope denylist: ${input.scopeDenylist.join(', ') || 'none'}`,
    `Allow deps: ${input.allowDeps ? 'yes' : 'no'}`,
    '',
    'Output JSON between markers:',
    'BEGIN_JSON',
    '{"status": "ok", "handoff_memo": "...", "commands_run": [], "observations": []}',
    'END_JSON'
  ].join('\n');
}

export function buildReviewPrompt(input: {
  milestone: Milestone;
  diffSummary: string;
  verificationOutput: string;
}): string {
  const template = loadTemplate('reviewer.md');
  return [
    template,
    '',
    `Milestone goal: ${input.milestone.goal}`,
    `Done checks: ${input.milestone.done_checks.join('; ')}`,
    '',
    'Diff summary:',
    input.diffSummary || '(no diff)',
    '',
    'Verification output:',
    input.verificationOutput || '(none)',
    '',
    'Output JSON between markers:',
    'BEGIN_JSON',
    '{"status": "approve", "changes": []}',
    'END_JSON'
  ].join('\n');
}
