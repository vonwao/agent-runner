/**
 * Tests for Mode Command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getCurrentMode, checkModeRestriction } from '../mode.js';

// Minimal valid config for testing
function createValidConfig(mode: 'flow' | 'ledger'): object {
  return {
    agent: {
      name: 'test-agent',
      model: 'claude-sonnet'
    },
    scope: {
      allowlist: ['src/**/*.ts']
    },
    verification: {
      tier: 'tier1',
      commands: []
    },
    workflow: {
      mode,
      profile: 'solo',
      integration_branch: 'dev',
      release_branch: 'main'
    }
  };
}

describe('Mode Command', () => {
  let tmpDir: string;
  let repoPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mode-test-'));
    repoPath = path.join(tmpDir, 'repo');
    fs.mkdirSync(repoPath);
    fs.mkdirSync(path.join(repoPath, '.runr'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('getCurrentMode', () => {
    it('returns flow as default when no config', () => {
      const mode = getCurrentMode(repoPath);
      expect(mode).toBe('flow');
    });

    it('reads mode from config', () => {
      fs.writeFileSync(
        path.join(repoPath, '.runr', 'runr.config.json'),
        JSON.stringify(createValidConfig('ledger'), null, 2)
      );

      const mode = getCurrentMode(repoPath);
      expect(mode).toBe('ledger');
    });

    it('returns flow when config exists but mode not set', () => {
      // Create a config without explicit mode (will default to flow)
      const config = createValidConfig('flow');
      // Remove mode to test default
      delete (config as any).workflow.mode;
      fs.writeFileSync(
        path.join(repoPath, '.runr', 'runr.config.json'),
        JSON.stringify(config, null, 2)
      );

      const mode = getCurrentMode(repoPath);
      expect(mode).toBe('flow');
    });
  });

  describe('checkModeRestriction', () => {
    it('allows amend_last in flow mode', () => {
      fs.writeFileSync(
        path.join(repoPath, '.runr', 'runr.config.json'),
        JSON.stringify(createValidConfig('flow'), null, 2)
      );

      const check = checkModeRestriction(repoPath, 'amend_last');
      expect(check.allowed).toBe(true);
      expect(check.error).toBeUndefined();
    });

    it('blocks amend_last in ledger mode', () => {
      fs.writeFileSync(
        path.join(repoPath, '.runr', 'runr.config.json'),
        JSON.stringify(createValidConfig('ledger'), null, 2)
      );

      const check = checkModeRestriction(repoPath, 'amend_last');
      expect(check.allowed).toBe(false);
      expect(check.error).toContain('--amend-last is not allowed in Ledger mode');
    });

    it('allows amend_last in ledger mode with force override', () => {
      fs.writeFileSync(
        path.join(repoPath, '.runr', 'runr.config.json'),
        JSON.stringify(createValidConfig('ledger'), null, 2)
      );

      const check = checkModeRestriction(repoPath, 'amend_last', true);
      expect(check.allowed).toBe(true);
    });

    it('defaults to flow mode (allows amend_last) when no config', () => {
      const check = checkModeRestriction(repoPath, 'amend_last');
      expect(check.allowed).toBe(true);
    });
  });
});
