import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
  buildContextPack,
  formatContextPackForPrompt,
  estimatePackTokens
} from '../pack.js';

// Use the actual repo root for integration-style tests
const REPO_ROOT = path.resolve(__dirname, '../../..');

describe('buildContextPack', () => {
  describe('verification commands', () => {
    it('extracts verification commands from config', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/tactical-grid',
        config: {
          verification: {
            tier0: ['pnpm lint', 'pnpm typecheck'],
            tier1: ['pnpm test'],
            tier2: []
          }
        }
      });

      expect(pack.verification.tier0).toEqual(['pnpm lint', 'pnpm typecheck']);
      expect(pack.verification.tier1).toEqual(['pnpm test']);
      expect(pack.verification.tier2).toEqual([]);
    });

    it('handles missing verification config', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/tactical-grid',
        config: {}
      });

      expect(pack.verification.tier0).toEqual([]);
      expect(pack.verification.tier1).toEqual([]);
    });
  });

  describe('reference files', () => {
    it('resolves RNG pattern reference', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/tactical-grid',
        config: {},
        references: [{ pattern: 'RNG pattern from deckbuilder' }]
      });

      expect(pack.reference_files.length).toBeGreaterThan(0);
      const rngRef = pack.reference_files.find((r) => r.path.includes('rng.ts'));
      expect(rngRef).toBeDefined();
      expect(rngRef?.content).toContain('nextInt');
      expect(rngRef?.content).toContain('1103515245'); // LCG constant
    });

    it('resolves explicit hint path', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/tactical-grid',
        config: {},
        references: [
          {
            pattern: 'custom reference',
            hint: 'apps/deckbuilder/src/engine/rng.ts'
          }
        ]
      });

      expect(pack.reference_files.length).toBe(1);
      expect(pack.reference_files[0].path).toBe('apps/deckbuilder/src/engine/rng.ts');
      expect(pack.reference_files[0].reason).toBe('custom reference');
    });

    it('handles unknown pattern gracefully', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/tactical-grid',
        config: {},
        references: [{ pattern: 'nonexistent magic pattern' }]
      });

      expect(pack.reference_files).toEqual([]);
    });
  });

  describe('scope constraints', () => {
    it('extracts scope from config', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/tactical-grid',
        config: {
          scope: {
            allowlist: ['apps/tactical-grid/**'],
            denylist: ['**/node_modules/**']
          }
        }
      });

      expect(pack.scope.allowlist).toEqual(['apps/tactical-grid/**']);
      expect(pack.scope.denylist).toEqual(['**/node_modules/**']);
    });
  });

  describe('config patterns', () => {
    it('finds nearest tsconfig.json', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/deckbuilder',
        config: {}
      });

      expect(pack.patterns.tsconfig).not.toBeNull();
      expect(pack.patterns.tsconfig?.path).toContain('tsconfig.json');
      expect(pack.patterns.tsconfig?.content).toContain('compilerOptions');
    });

    it('finds nearest eslint config', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/deckbuilder',
        config: {}
      });

      expect(pack.patterns.eslint).not.toBeNull();
      expect(pack.patterns.eslint?.path).toMatch(/eslint\.config/);
    });

    it('finds nearest package.json', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/deckbuilder',
        config: {}
      });

      expect(pack.patterns.package_json).not.toBeNull();
      expect(pack.patterns.package_json?.content).toContain('scripts');
    });

    it('finds config even for nonexistent target (upward search or fallback)', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/nonexistent-app',
        config: {}
      });

      // Should find config via upward search (repo root) or fallback to deckbuilder
      expect(pack.patterns.tsconfig).not.toBeNull();
      expect(pack.patterns.tsconfig?.content).toContain('compilerOptions');
    });
  });

  describe('version and metadata', () => {
    it('includes version 1', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/tactical-grid',
        config: {}
      });

      expect(pack.version).toBe(1);
    });

    it('includes generated_at timestamp', () => {
      const pack = buildContextPack({
        repoRoot: REPO_ROOT,
        targetRoot: 'apps/tactical-grid',
        config: {}
      });

      expect(pack.generated_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });
});

describe('formatContextPackForPrompt', () => {
  it('formats verification commands', () => {
    const pack = buildContextPack({
      repoRoot: REPO_ROOT,
      targetRoot: 'apps/tactical-grid',
      config: {
        verification: {
          tier0: ['pnpm lint', 'pnpm typecheck'],
          tier1: ['pnpm test']
        }
      }
    });

    const formatted = formatContextPackForPrompt(pack);
    expect(formatted).toContain('Verification Commands');
    expect(formatted).toContain('tier0: pnpm lint && pnpm typecheck');
    expect(formatted).toContain('tier1: pnpm test');
  });

  it('includes reference file content', () => {
    const pack = buildContextPack({
      repoRoot: REPO_ROOT,
      targetRoot: 'apps/tactical-grid',
      config: {},
      references: [{ pattern: 'RNG pattern' }]
    });

    const formatted = formatContextPackForPrompt(pack);
    expect(formatted).toContain('Reference Files');
    expect(formatted).toContain('nextInt');
  });
});

describe('estimatePackTokens', () => {
  it('estimates token count based on character length', () => {
    const pack = buildContextPack({
      repoRoot: REPO_ROOT,
      targetRoot: 'apps/tactical-grid',
      config: {
        verification: { tier0: ['pnpm lint'] }
      }
    });

    const tokens = estimatePackTokens(pack);
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10000); // Sanity check
  });
});
