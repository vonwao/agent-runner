import fs from 'node:fs';
import path from 'node:path';

// Context Pack v1 - reduces IMPLEMENT churn by providing:
// 1. Verification commands (what must pass)
// 2. Reference files (patterns to copy)
// 3. Scope constraints
// 4. Nearest working config patterns

export interface ContextPack {
  version: 1;
  generated_at: string;

  // What verification commands will run
  verification: {
    tier0: string[];
    tier1: string[];
    tier2: string[];
  };

  // Reference files with snippets (when task says "copy pattern from X")
  reference_files: Array<{
    path: string;
    reason: string;
    content: string;
  }>;

  // Scope constraints from config
  scope: {
    allowlist: string[];
    denylist: string[];
  };

  // Nearest working config patterns
  patterns: {
    tsconfig: { path: string; content: string } | null;
    eslint: { path: string; content: string } | null;
    package_json: { path: string; content: string } | null;
  };
}

export interface BuildContextPackOptions {
  repoRoot: string;
  targetRoot: string; // e.g., apps/tactical-grid
  config: {
    verification?: {
      tier0?: string[];
      tier1?: string[];
      tier2?: string[];
    };
    scope?: {
      allowlist?: string[];
      denylist?: string[];
    };
  };
  // Explicit references from task spec
  references?: Array<{
    pattern: string; // e.g., "RNG pattern", "deckbuilder config"
    hint?: string;   // e.g., "apps/deckbuilder/src/engine/rng.ts"
  }>;
}

// Known reference patterns - maps task descriptions to actual files
const KNOWN_PATTERNS: Record<string, { paths: string[]; reason: string }> = {
  'rng': {
    paths: ['apps/deckbuilder/src/engine/rng.ts'],
    reason: 'Deterministic RNG pattern (LCG algorithm)'
  },
  'rng pattern': {
    paths: ['apps/deckbuilder/src/engine/rng.ts'],
    reason: 'Deterministic RNG pattern (LCG algorithm)'
  },
  'deckbuilder rng': {
    paths: ['apps/deckbuilder/src/engine/rng.ts'],
    reason: 'Deterministic RNG pattern from deckbuilder'
  },
  'types pattern': {
    paths: ['apps/deckbuilder/src/engine/types.ts'],
    reason: 'Type definitions pattern'
  }
};

export function buildContextPack(options: BuildContextPackOptions): ContextPack {
  const { repoRoot, targetRoot, config, references } = options;

  // 1. Extract verification commands from config (source of truth)
  const verification = {
    tier0: config.verification?.tier0 ?? [],
    tier1: config.verification?.tier1 ?? [],
    tier2: config.verification?.tier2 ?? []
  };

  // 2. Resolve reference files
  const reference_files = resolveReferences(repoRoot, references ?? []);

  // 3. Extract scope from config
  const scope = {
    allowlist: config.scope?.allowlist ?? [],
    denylist: config.scope?.denylist ?? []
  };

  // 4. Find nearest config patterns
  const patterns = findNearestPatterns(repoRoot, targetRoot);

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    verification,
    reference_files,
    scope,
    patterns
  };
}

function resolveReferences(
  repoRoot: string,
  references: Array<{ pattern: string; hint?: string }>
): ContextPack['reference_files'] {
  const results: ContextPack['reference_files'] = [];
  const seen = new Set<string>();

  for (const ref of references) {
    // Try explicit hint first
    if (ref.hint) {
      const fullPath = path.join(repoRoot, ref.hint);
      if (fs.existsSync(fullPath) && !seen.has(ref.hint)) {
        seen.add(ref.hint);
        results.push({
          path: ref.hint,
          reason: ref.pattern,
          content: readSnippet(fullPath)
        });
        continue;
      }
    }

    // Try known patterns
    const key = ref.pattern.toLowerCase();
    for (const [patternKey, patternDef] of Object.entries(KNOWN_PATTERNS)) {
      if (key.includes(patternKey)) {
        for (const p of patternDef.paths) {
          if (seen.has(p)) continue;
          const fullPath = path.join(repoRoot, p);
          if (fs.existsSync(fullPath)) {
            seen.add(p);
            results.push({
              path: p,
              reason: patternDef.reason,
              content: readSnippet(fullPath)
            });
          }
        }
        break;
      }
    }
  }

  return results;
}

function findNearestPatterns(
  repoRoot: string,
  targetRoot: string
): ContextPack['patterns'] {
  const targetAbs = path.isAbsolute(targetRoot)
    ? targetRoot
    : path.join(repoRoot, targetRoot);

  return {
    tsconfig: findNearestFile(repoRoot, targetAbs, ['tsconfig.json']),
    eslint: findNearestFile(repoRoot, targetAbs, [
      'eslint.config.cjs',
      'eslint.config.js',
      'eslint.config.mjs',
      '.eslintrc.cjs',
      '.eslintrc.js',
      '.eslintrc.json'
    ]),
    package_json: findNearestFile(repoRoot, targetAbs, ['package.json'])
  };
}

function findNearestFile(
  repoRoot: string,
  startDir: string,
  fileNames: string[]
): { path: string; content: string } | null {
  // First: search upward from target directory
  let current = startDir;
  while (current.startsWith(repoRoot) || current === repoRoot) {
    for (const fileName of fileNames) {
      const candidate = path.join(current, fileName);
      if (fs.existsSync(candidate)) {
        const relativePath = path.relative(repoRoot, candidate);
        return {
          path: relativePath,
          content: readSnippet(candidate)
        };
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // Fallback: check known-good locations (deckbuilder)
  const fallbacks = [
    'apps/deckbuilder'
  ];

  for (const fallback of fallbacks) {
    for (const fileName of fileNames) {
      const candidate = path.join(repoRoot, fallback, fileName);
      if (fs.existsSync(candidate)) {
        const relativePath = path.relative(repoRoot, candidate);
        return {
          path: relativePath,
          content: readSnippet(candidate)
        };
      }
    }
  }

  return null;
}

function readSnippet(filePath: string, maxLines = 150): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');
    if (lines.length <= maxLines) {
      return content;
    }
    // Return first maxLines with truncation notice
    return lines.slice(0, maxLines).join('\n') + `\n// ... truncated (${lines.length - maxLines} more lines)`;
  } catch {
    return '// Error reading file';
  }
}

// Format pack as a compact string for prompt injection
export function formatContextPackForPrompt(pack: ContextPack): string {
  const sections: string[] = [];

  // Verification commands
  sections.push('## Verification Commands (must pass)');
  if (pack.verification.tier0.length > 0) {
    sections.push(`tier0: ${pack.verification.tier0.join(' && ')}`);
  }
  if (pack.verification.tier1.length > 0) {
    sections.push(`tier1: ${pack.verification.tier1.join(' && ')}`);
  }

  // Scope
  sections.push('\n## Scope Constraints');
  sections.push(`allowlist: ${pack.scope.allowlist.join(', ') || '(none)'}`);
  sections.push(`denylist: ${pack.scope.denylist.join(', ') || '(none)'}`);

  // Reference files
  if (pack.reference_files.length > 0) {
    sections.push('\n## Reference Files');
    for (const ref of pack.reference_files) {
      sections.push(`\n### ${ref.path}`);
      sections.push(`Reason: ${ref.reason}`);
      sections.push('```typescript');
      sections.push(ref.content);
      sections.push('```');
    }
  }

  // Config patterns
  sections.push('\n## Config Patterns (use as templates)');
  if (pack.patterns.tsconfig) {
    sections.push(`\n### tsconfig.json (from ${pack.patterns.tsconfig.path})`);
    sections.push('```json');
    sections.push(pack.patterns.tsconfig.content);
    sections.push('```');
  }
  if (pack.patterns.eslint) {
    sections.push(`\n### eslint config (from ${pack.patterns.eslint.path})`);
    sections.push('```javascript');
    sections.push(pack.patterns.eslint.content);
    sections.push('```');
  }
  if (pack.patterns.package_json) {
    sections.push(`\n### package.json scripts (from ${pack.patterns.package_json.path})`);
    // Extract just the scripts section for brevity
    try {
      const pkg = JSON.parse(pack.patterns.package_json.content);
      const relevant = {
        scripts: pkg.scripts,
        devDependencies: pkg.devDependencies
      };
      sections.push('```json');
      sections.push(JSON.stringify(relevant, null, 2));
      sections.push('```');
    } catch {
      sections.push('```json');
      sections.push(pack.patterns.package_json.content);
      sections.push('```');
    }
  }

  return sections.join('\n');
}

// Estimate token count (rough: chars/4)
export function estimatePackTokens(pack: ContextPack): number {
  const formatted = formatContextPackForPrompt(pack);
  return Math.ceil(formatted.length / 4);
}
