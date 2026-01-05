import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { executeAction, executeActions, ActionContext } from '../actions.js';
import { InitAction } from '../loader.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('Init Actions', () => {
  let tmpDir: string;
  let actionContext: ActionContext;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'actions-test-'));
    actionContext = {
      repoPath: tmpDir,
      packDir: tmpDir,
      templates: {
        'test': 'test.tmpl'
      },
      templateContext: {
        project_name: 'TestProject',
        project_about: 'A test project'
      },
      flags: {},
      dryRun: false
    };
  });

  afterEach(() => {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  describe('ensure_gitignore_entry', () => {
    it('adds entry to new .gitignore', async () => {
      const action: InitAction = {
        type: 'ensure_gitignore_entry',
        path: '.gitignore',
        line: '.runr/'
      };

      const result = await executeAction(action, actionContext);

      expect(result.executed).toBe(true);
      expect(result.message).toContain('Added ".runr/" to .gitignore');

      const gitignorePath = path.join(tmpDir, '.gitignore');
      const content = fs.readFileSync(gitignorePath, 'utf-8');
      expect(content).toContain('.runr/');
    });

    it('does not duplicate entry in existing .gitignore', async () => {
      const gitignorePath = path.join(tmpDir, '.gitignore');
      fs.writeFileSync(gitignorePath, '.runr/\nnode_modules/\n');

      const action: InitAction = {
        type: 'ensure_gitignore_entry',
        path: '.gitignore',
        line: '.runr/'
      };

      const result = await executeAction(action, actionContext);

      expect(result.executed).toBe(false);
      expect(result.message).toContain('already in .gitignore');

      const content = fs.readFileSync(gitignorePath, 'utf-8');
      const matches = content.match(/\.runr\//g);
      expect(matches?.length).toBe(1); // Should only appear once
    });

    it('handles dry-run mode', async () => {
      const dryRunContext = { ...actionContext, dryRun: true };
      const action: InitAction = {
        type: 'ensure_gitignore_entry',
        path: '.gitignore',
        line: '.runr/'
      };

      const result = await executeAction(action, dryRunContext);

      expect(result.executed).toBe(false);
      expect(result.message).toContain('[DRY RUN]');
      expect(result.message).toContain('Would add ".runr/"');

      const gitignorePath = path.join(tmpDir, '.gitignore');
      expect(fs.existsSync(gitignorePath)).toBe(false); // Should not create file
    });
  });

  describe('create_file_if_missing', () => {
    it('creates file from template', async () => {
      // Create a template file
      const templatePath = path.join(tmpDir, 'test.tmpl');
      fs.writeFileSync(templatePath, 'Project: {{project_name}}\n{{project_about}}');

      const action: InitAction = {
        type: 'create_file_if_missing',
        path: 'README.md',
        template: 'test'
      };

      const result = await executeAction(action, actionContext);

      expect(result.executed).toBe(true);
      expect(result.message).toContain('Created README.md from template test');

      const readmePath = path.join(tmpDir, 'README.md');
      const content = fs.readFileSync(readmePath, 'utf-8');
      expect(content).toContain('Project: TestProject');
      expect(content).toContain('A test project');
    });

    it('does not overwrite existing file', async () => {
      const readmePath = path.join(tmpDir, 'README.md');
      fs.writeFileSync(readmePath, 'Existing content');

      const templatePath = path.join(tmpDir, 'test.tmpl');
      fs.writeFileSync(templatePath, 'New content');

      const action: InitAction = {
        type: 'create_file_if_missing',
        path: 'README.md',
        template: 'test'
      };

      const result = await executeAction(action, actionContext);

      expect(result.executed).toBe(false);
      expect(result.message).toContain('already exists');

      const content = fs.readFileSync(readmePath, 'utf-8');
      expect(content).toBe('Existing content'); // Should not change
    });

    it('respects when condition with flag', async () => {
      const templatePath = path.join(tmpDir, 'test.tmpl');
      fs.writeFileSync(templatePath, 'Content');

      const action: InitAction = {
        type: 'create_file_if_missing',
        path: 'OPTIONAL.md',
        template: 'test',
        when: { flag: 'with_optional' }
      };

      // Test without flag
      const resultWithoutFlag = await executeAction(action, actionContext);
      expect(resultWithoutFlag.executed).toBe(false);
      expect(resultWithoutFlag.message).toContain('flag "with_optional" not set');

      // Test with flag
      const contextWithFlag = { ...actionContext, flags: { with_optional: true } };
      const resultWithFlag = await executeAction(action, contextWithFlag);
      expect(resultWithFlag.executed).toBe(true);
    });

    it('handles dry-run mode', async () => {
      const templatePath = path.join(tmpDir, 'test.tmpl');
      fs.writeFileSync(templatePath, 'Content');

      const dryRunContext = { ...actionContext, dryRun: true };
      const action: InitAction = {
        type: 'create_file_if_missing',
        path: 'README.md',
        template: 'test'
      };

      const result = await executeAction(action, dryRunContext);

      expect(result.executed).toBe(false);
      expect(result.message).toContain('[DRY RUN]');
      expect(result.message).toContain('Would create README.md');

      const readmePath = path.join(tmpDir, 'README.md');
      expect(fs.existsSync(readmePath)).toBe(false); // Should not create file
    });

    it('creates parent directories if needed', async () => {
      const templatePath = path.join(tmpDir, 'test.tmpl');
      fs.writeFileSync(templatePath, 'Content');

      const action: InitAction = {
        type: 'create_file_if_missing',
        path: 'docs/guide/README.md',
        template: 'test'
      };

      const result = await executeAction(action, actionContext);

      expect(result.executed).toBe(true);

      const filePath = path.join(tmpDir, 'docs/guide/README.md');
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('handles missing template error', async () => {
      const action: InitAction = {
        type: 'create_file_if_missing',
        path: 'README.md',
        template: 'nonexistent'
      };

      const result = await executeAction(action, actionContext);

      expect(result.executed).toBe(false);
      expect(result.error).toBeTruthy();
      expect(result.message).toContain('not found');
    });
  });

  describe('executeActions', () => {
    it('executes multiple actions in sequence', async () => {
      const templatePath = path.join(tmpDir, 'test.tmpl');
      fs.writeFileSync(templatePath, 'Content');

      const actions: InitAction[] = [
        {
          type: 'ensure_gitignore_entry',
          path: '.gitignore',
          line: '.runr/'
        },
        {
          type: 'create_file_if_missing',
          path: 'README.md',
          template: 'test'
        }
      ];

      const results = await executeActions(actions, actionContext);

      expect(results).toHaveLength(2);
      expect(results[0].executed).toBe(true);
      expect(results[1].executed).toBe(true);

      expect(fs.existsSync(path.join(tmpDir, '.gitignore'))).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'README.md'))).toBe(true);
    });

    it('continues executing after non-critical failures', async () => {
      const actions: InitAction[] = [
        {
          type: 'create_file_if_missing',
          path: 'file1.md',
          template: 'nonexistent' // This will fail
        },
        {
          type: 'ensure_gitignore_entry',
          path: '.gitignore',
          line: '.runr/' // This should still execute
        }
      ];

      const results = await executeActions(actions, actionContext);

      expect(results).toHaveLength(2);
      expect(results[0].executed).toBe(false);
      expect(results[0].error).toBeTruthy();
      expect(results[1].executed).toBe(true); // Should still execute
    });
  });
});
