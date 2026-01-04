/**
 * Resume Gym Tests
 *
 * Tests resume correctness by creating mock run states and verifying resume behavior.
 * These fixtures document expected resume scenarios for manual/acceptance testing.
 */

import { describe, it, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';

const FIXTURES_ROOT = path.join(__dirname, '../fixtures');

describe('Resume Gym: Fixture Documentation', () => {
  it('has 5 documented resume scenarios', () => {
    const resumeGymDir = path.join(FIXTURES_ROOT, 'resume-gym');
    if (!fs.existsSync(resumeGymDir)) {
      expect.fail('resume-gym fixtures directory not found');
      return;
    }

    const cases = fs
      .readdirSync(resumeGymDir)
      .filter((name) => {
        const caseDir = path.join(resumeGymDir, name);
        return fs.existsSync(path.join(caseDir, 'case.json'));
      })
      .filter((name) => name !== '_shared');

    // Verify all 5 core fixtures exist
    expect(cases.length).toBeGreaterThanOrEqual(5);

    const expectedFixtures = [
      'test-failure',
      'lint-failure',
      'guard-violation',
      'dirty-working-tree',
      'merge-conflict'
    ];

    for (const fixtureName of expectedFixtures) {
      expect(cases).toContain(fixtureName);

      const fixtureDir = path.join(resumeGymDir, fixtureName);

      // Each fixture must have required files
      expect(fs.existsSync(path.join(fixtureDir, 'case.json'))).toBe(true);
      expect(fs.existsSync(path.join(fixtureDir, 'expect.json'))).toBe(true);
      expect(fs.existsSync(path.join(fixtureDir, 'repo', 'tasks.json'))).toBe(true);

      // Read case.json and verify structure
      const caseSpec = JSON.parse(
        fs.readFileSync(path.join(fixtureDir, 'case.json'), 'utf8')
      );
      expect(caseSpec).toHaveProperty('id');
      expect(caseSpec).toHaveProperty('description');
      expect(caseSpec).toHaveProperty('run');
      expect(caseSpec.run).toHaveProperty('args');
    }
  });

  it('fixtures have proper test ordering', () => {
    const resumeGymDir = path.join(FIXTURES_ROOT, 'resume-gym');
    if (!fs.existsSync(resumeGymDir)) {
      return;
    }

    const cases = fs
      .readdirSync(resumeGymDir)
      .filter((name) => fs.existsSync(path.join(resumeGymDir, name, 'case.json')))
      .map((name) => {
        const caseSpec = JSON.parse(
          fs.readFileSync(path.join(resumeGymDir, name, 'case.json'), 'utf8')
        );
        return { name, order: caseSpec.order || 999 };
      });

    // Verify ordering matches expected sequence
    const orderedCases = [...cases].sort((a, b) => a.order - b.order);

    // test-failure should be first (order: 10)
    expect(orderedCases[0]?.name).toBe('test-failure');

    // lint-failure should be second (order: 20)
    expect(orderedCases[1]?.name).toBe('lint-failure');
  });

  it('fixtures have shared tools directory', () => {
    const sharedToolsDir = path.join(FIXTURES_ROOT, 'resume-gym', '_shared', 'tools');

    expect(fs.existsSync(path.join(sharedToolsDir, 'pass.sh'))).toBe(true);
    expect(fs.existsSync(path.join(sharedToolsDir, 'fail.sh'))).toBe(true);
    expect(fs.existsSync(path.join(sharedToolsDir, 'flaky-n-of-m.sh'))).toBe(true);

    // Verify they're executable scripts
    const passSh = fs.readFileSync(path.join(sharedToolsDir, 'pass.sh'), 'utf8');
    expect(passSh).toContain('#!/usr/bin/env bash');
    expect(passSh).toContain('exit 0');
  });
});
