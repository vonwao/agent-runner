import { describe, it, expect } from 'vitest';
import {
  validateNoChangesEvidence,
  formatEvidenceErrors
} from '../evidence-gate.js';

describe('validateNoChangesEvidence', () => {
  const allowlist = ['src/game/**', 'src/utils/**'];

  describe('when no evidence provided', () => {
    it('should fail with no evidence', () => {
      const result = validateNoChangesEvidence(undefined, allowlist);
      expect(result.ok).toBe(false);
      expect(result.errors).toContain('No evidence provided for no_changes_needed claim');
    });

    it('should fail with empty evidence object', () => {
      const result = validateNoChangesEvidence({}, allowlist);
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('files_checked evidence', () => {
    it('should pass with files_checked in scope', () => {
      const result = validateNoChangesEvidence(
        { files_checked: ['src/game/combat.ts', 'src/game/utils.ts'] },
        allowlist
      );
      expect(result.ok).toBe(true);
      expect(result.satisfied_by).toBe('files_checked');
    });

    it('should fail with files_checked out of scope', () => {
      const result = validateNoChangesEvidence(
        { files_checked: ['package.json', 'src/game/combat.ts'] },
        allowlist
      );
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('outside scope'))).toBe(true);
    });

    it('should fail with empty files_checked array', () => {
      const result = validateNoChangesEvidence(
        { files_checked: [] },
        allowlist
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('grep_output evidence', () => {
    it('should pass with non-empty grep_output', () => {
      const result = validateNoChangesEvidence(
        { grep_output: 'src/game/combat.ts:42: function alreadyImplemented()' },
        allowlist
      );
      expect(result.ok).toBe(true);
      expect(result.satisfied_by).toBe('grep_output');
    });

    it('should fail with empty grep_output', () => {
      const result = validateNoChangesEvidence(
        { grep_output: '' },
        allowlist
      );
      expect(result.ok).toBe(false);
    });

    it('should fail with whitespace-only grep_output', () => {
      const result = validateNoChangesEvidence(
        { grep_output: '   \n\t  ' },
        allowlist
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('commands_run evidence', () => {
    it('should pass with commands_run all exit_code 0', () => {
      const result = validateNoChangesEvidence(
        {
          commands_run: [
            { command: 'grep -r "feature" src/', exit_code: 0 },
            { command: 'test -f src/feature.ts', exit_code: 0 }
          ]
        },
        allowlist
      );
      expect(result.ok).toBe(true);
      expect(result.satisfied_by).toBe('commands_run');
    });

    it('should fail with commands_run containing non-zero exit_code', () => {
      const result = validateNoChangesEvidence(
        {
          commands_run: [
            { command: 'grep -r "feature" src/', exit_code: 1 }
          ]
        },
        allowlist
      );
      expect(result.ok).toBe(false);
      expect(result.errors.some(e => e.includes('failed commands'))).toBe(true);
    });

    it('should fail with empty commands_run array', () => {
      const result = validateNoChangesEvidence(
        { commands_run: [] },
        allowlist
      );
      expect(result.ok).toBe(false);
    });
  });

  describe('priority order', () => {
    it('should prefer files_checked over grep_output', () => {
      const result = validateNoChangesEvidence(
        {
          files_checked: ['src/game/combat.ts'],
          grep_output: 'some output'
        },
        allowlist
      );
      expect(result.ok).toBe(true);
      expect(result.satisfied_by).toBe('files_checked');
    });

    it('should fall back to grep_output if files_checked is out of scope', () => {
      const result = validateNoChangesEvidence(
        {
          files_checked: ['package.json'],
          grep_output: 'some valid output'
        },
        allowlist
      );
      expect(result.ok).toBe(true);
      expect(result.satisfied_by).toBe('grep_output');
    });
  });
});

describe('formatEvidenceErrors', () => {
  it('should return empty string for ok result', () => {
    const result = formatEvidenceErrors({
      ok: true,
      errors: [],
      satisfied_by: 'files_checked'
    });
    expect(result).toBe('');
  });

  it('should format errors for failed result', () => {
    const result = formatEvidenceErrors({
      ok: false,
      errors: ['No evidence provided', 'files_checked is empty']
    });
    expect(result).toContain('Insufficient evidence');
    expect(result).toContain('No evidence provided');
    expect(result).toContain('files_checked is empty');
    expect(result).toContain('Required:');
  });
});
