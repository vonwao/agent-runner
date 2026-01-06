import fs from 'node:fs';
import yaml from 'yaml';
import { normalizeOwnsPatterns } from '../ownership/normalize.js';

// Re-export for backward compatibility
export { normalizeOwnsPatterns } from '../ownership/normalize.js';

export interface TaskMetadata {
  raw: string;
  body: string;
  owns_raw: string[];
  owns_normalized: string[];
  frontmatter: Record<string, unknown> | null;
  /** Task-local additions to scope allowlist (additive only) */
  allowlist_add: string[];
  /** Task-local verification tier override */
  verification_tier: 'tier0' | 'tier1' | 'tier2' | null;
}

function hasFrontmatter(raw: string): boolean {
  const trimmed = raw.startsWith('\ufeff') ? raw.slice(1) : raw;
  return trimmed.startsWith('---');
}

function splitFrontmatter(raw: string): { frontmatterText: string | null; body: string } {
  const trimmed = raw.startsWith('\ufeff') ? raw.slice(1) : raw;
  if (!hasFrontmatter(trimmed)) {
    return { frontmatterText: null, body: raw };
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines[0].trim() !== '---') {
    return { frontmatterText: null, body: raw };
  }

  const endIdx = lines.findIndex((line, idx) => idx > 0 && line.trim() === '---');
  if (endIdx === -1) {
    return { frontmatterText: null, body: raw };
  }

  const frontmatterText = lines.slice(1, endIdx).join('\n');
  const body = lines.slice(endIdx + 1).join('\n');
  return { frontmatterText, body };
}

function coerceOwns(value: unknown, taskPath: string): string[] {
  if (value === undefined || value === null) {
    return [];
  }

  if (typeof value === 'string') {
    return [value];
  }

  if (Array.isArray(value)) {
    const nonStrings = value.filter((item) => typeof item !== 'string');
    if (nonStrings.length > 0) {
      throw new Error(`Invalid owns entry in ${taskPath}: must be string or string[]`);
    }
    return value as string[];
  }

  throw new Error(`Invalid owns entry in ${taskPath}: must be string or string[]`);
}

/**
 * Parse allowlist_add from frontmatter or body.
 * Accepts both frontmatter field and markdown section.
 */
function parseAllowlistAdd(frontmatter: Record<string, unknown> | null, body: string): string[] {
  // Check frontmatter first
  if (frontmatter?.allowlist_add) {
    const value = frontmatter.allowlist_add;
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string');
    }
    if (typeof value === 'string') {
      return [value];
    }
  }

  // Check for Scope section in markdown body (YAML-like format)
  // Format:
  // ## Scope
  // allowlist_add:
  //   - pattern1
  //   - pattern2
  const scopeMatch = body.match(/##\s*Scope\s*\n([\s\S]*?)(?=\n##|\n$|$)/i);
  if (scopeMatch) {
    const scopeContent = scopeMatch[1];
    const allowlistMatch = scopeContent.match(/allowlist_add:\s*\n((?:\s*-\s*.+\n?)+)/);
    if (allowlistMatch) {
      const items = allowlistMatch[1].match(/-\s*(.+)/g);
      if (items) {
        return items.map(item => item.replace(/^-\s*/, '').trim());
      }
    }
  }

  return [];
}

/**
 * Parse verification tier from frontmatter or body.
 * Enforces minimum tier0.
 */
function parseVerificationTier(frontmatter: Record<string, unknown> | null, body: string): 'tier0' | 'tier1' | 'tier2' | null {
  let tier: string | null = null;

  // Check frontmatter first
  if (frontmatter?.verification && typeof frontmatter.verification === 'object') {
    const verification = frontmatter.verification as Record<string, unknown>;
    if (verification.tier) {
      tier = String(verification.tier);
    }
  } else if (frontmatter?.tier) {
    tier = String(frontmatter.tier);
  }

  // Check for Verification section in markdown body
  if (!tier) {
    const verifyMatch = body.match(/##\s*Verification\s*\n([\s\S]*?)(?=\n##|\n$|$)/i);
    if (verifyMatch) {
      const tierMatch = verifyMatch[1].match(/tier:\s*(tier[012])/i);
      if (tierMatch) {
        tier = tierMatch[1].toLowerCase();
      }
    }
  }

  // Validate and enforce minimum tier0
  if (tier === 'tier0' || tier === 'tier1' || tier === 'tier2') {
    return tier;
  }

  return null; // Use config default
}

export function loadTaskMetadata(taskPath: string): TaskMetadata {
  const raw = fs.readFileSync(taskPath, 'utf-8');
  const { frontmatterText, body } = splitFrontmatter(raw);

  let frontmatter: Record<string, unknown> | null = null;
  let ownsRaw: string[] = [];

  if (frontmatterText !== null) {
    try {
      const parsed = yaml.parse(frontmatterText);
      if (parsed && typeof parsed === 'object') {
        frontmatter = parsed as Record<string, unknown>;
      } else {
        frontmatter = {};
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to parse task frontmatter in ${taskPath}: ${message}`);
    }

    ownsRaw = coerceOwns(frontmatter.owns, taskPath);
  }

  const ownsNormalized = normalizeOwnsPatterns(ownsRaw);
  const allowlistAdd = parseAllowlistAdd(frontmatter, body);
  const verificationTier = parseVerificationTier(frontmatter, body);

  return {
    raw,
    body,
    owns_raw: ownsRaw,
    owns_normalized: ownsNormalized,
    frontmatter,
    allowlist_add: allowlistAdd,
    verification_tier: verificationTier
  };
}
