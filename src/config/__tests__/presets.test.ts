import { describe, it, expect } from 'vitest';
import { SCOPE_PRESETS, agentConfigSchema } from '../schema.js';
import { loadConfig } from '../load.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('SCOPE_PRESETS', () => {
  it('exports all expected presets', () => {
    const expectedPresets = [
      'nextjs', 'react', 'drizzle', 'prisma',
      'vitest', 'jest', 'playwright',
      'typescript', 'tailwind', 'eslint', 'env'
    ];

    for (const preset of expectedPresets) {
      expect(SCOPE_PRESETS[preset]).toBeDefined();
      expect(Array.isArray(SCOPE_PRESETS[preset])).toBe(true);
      expect(SCOPE_PRESETS[preset].length).toBeGreaterThan(0);
    }
  });

  it('vitest preset includes expected patterns', () => {
    const patterns = SCOPE_PRESETS.vitest;
    expect(patterns).toContain('vitest.config.*');
    expect(patterns).toContain('**/*.test.ts');
  });

  it('nextjs preset includes expected patterns', () => {
    const patterns = SCOPE_PRESETS.nextjs;
    expect(patterns).toContain('next.config.*');
    expect(patterns).toContain('middleware.ts');
  });
});

describe('preset expansion in loadConfig', () => {
  it('expands presets into allowlist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-test-'));
    const configPath = path.join(tmpDir, 'agent.config.json');

    const config = {
      agent: { name: 'test', version: '1' },
      scope: {
        allowlist: ['src/**'],
        denylist: [],
        presets: ['vitest']
      },
      verification: { tier0: [], tier1: [], tier2: [] }
    };

    fs.writeFileSync(configPath, JSON.stringify(config));

    try {
      const loaded = loadConfig(configPath);

      // Original patterns preserved
      expect(loaded.scope.allowlist).toContain('src/**');

      // Preset patterns expanded
      expect(loaded.scope.allowlist).toContain('vitest.config.*');
      expect(loaded.scope.allowlist).toContain('**/*.test.ts');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('deduplicates patterns when preset overlaps with allowlist', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-test-'));
    const configPath = path.join(tmpDir, 'agent.config.json');

    const config = {
      agent: { name: 'test', version: '1' },
      scope: {
        allowlist: ['src/**', 'vitest.config.*'], // Already has one pattern from vitest preset
        denylist: [],
        presets: ['vitest']
      },
      verification: { tier0: [], tier1: [], tier2: [] }
    };

    fs.writeFileSync(configPath, JSON.stringify(config));

    try {
      const loaded = loadConfig(configPath);

      // Count occurrences of vitest.config.*
      const count = loaded.scope.allowlist.filter(p => p === 'vitest.config.*').length;
      expect(count).toBe(1); // Should be deduplicated
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('handles multiple presets', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-config-test-'));
    const configPath = path.join(tmpDir, 'agent.config.json');

    const config = {
      agent: { name: 'test', version: '1' },
      scope: {
        allowlist: ['src/**'],
        denylist: [],
        presets: ['vitest', 'typescript', 'tailwind']
      },
      verification: { tier0: [], tier1: [], tier2: [] }
    };

    fs.writeFileSync(configPath, JSON.stringify(config));

    try {
      const loaded = loadConfig(configPath);

      // All preset patterns should be present
      expect(loaded.scope.allowlist).toContain('vitest.config.*');
      expect(loaded.scope.allowlist).toContain('tsconfig*.json');
      expect(loaded.scope.allowlist).toContain('tailwind.config.*');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
