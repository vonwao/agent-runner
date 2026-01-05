import { describe, it, expect } from 'vitest';
import { renderTemplate, formatVerificationCommands } from '../renderer.js';

describe('Template Renderer', () => {
  describe('renderTemplate', () => {
    it('renders simple variable substitution', () => {
      const template = 'Hello {{name}}!';
      const context = { name: 'World' };
      const result = renderTemplate(template, context);
      expect(result).toBe('Hello World!');
    });

    it('renders multiple variables', () => {
      const template = '{{greeting}} {{name}}, welcome to {{project}}!';
      const context = {
        greeting: 'Hello',
        name: 'Alice',
        project: 'Runr'
      };
      const result = renderTemplate(template, context);
      expect(result).toBe('Hello Alice, welcome to Runr!');
    });

    it('replaces missing variables with empty string', () => {
      const template = 'Hello {{name}}, age: {{age}}';
      const context = { name: 'Bob' };
      const result = renderTemplate(template, context);
      expect(result).toBe('Hello Bob, age: ');
    });

    it('handles templates with no variables', () => {
      const template = 'Static content';
      const context = {};
      const result = renderTemplate(template, context);
      expect(result).toBe('Static content');
    });

    it('handles multi-line templates', () => {
      const template = `# Project: {{name}}

Description: {{description}}

End.`;
      const context = {
        name: 'TestProject',
        description: 'A test project'
      };
      const result = renderTemplate(template, context);
      expect(result).toContain('# Project: TestProject');
      expect(result).toContain('Description: A test project');
    });

    it('does not replace malformed variable syntax', () => {
      const template = 'Test {name} and {name and name}';
      const context = { name: 'value' };
      const result = renderTemplate(template, context);
      expect(result).toBe('Test {name} and {name and name}');
    });

    it('handles underscore in variable names', () => {
      const template = '{{project_name}} - {{integration_branch}}';
      const context = {
        project_name: 'MyProject',
        integration_branch: 'dev'
      };
      const result = renderTemplate(template, context);
      expect(result).toBe('MyProject - dev');
    });
  });

  describe('formatVerificationCommands', () => {
    it('formats all three tiers', () => {
      const verification = {
        tier0: ['npm run lint', 'npm run typecheck'],
        tier1: ['npm run build'],
        tier2: ['npm run test']
      };

      const result = formatVerificationCommands(verification);

      expect(result).toContain('**Tier 0 (fast checks)**:');
      expect(result).toContain('- `npm run lint`');
      expect(result).toContain('- `npm run typecheck`');
      expect(result).toContain('**Tier 1 (build)**:');
      expect(result).toContain('- `npm run build`');
      expect(result).toContain('**Tier 2 (tests)**:');
      expect(result).toContain('- `npm run test`');
    });

    it('formats only tier0', () => {
      const verification = {
        tier0: ['npm run lint'],
        tier1: [],
        tier2: []
      };

      const result = formatVerificationCommands(verification);

      expect(result).toContain('**Tier 0 (fast checks)**:');
      expect(result).toContain('- `npm run lint`');
      expect(result).not.toContain('Tier 1');
      expect(result).not.toContain('Tier 2');
    });

    it('returns fallback message when no commands', () => {
      const verification = {
        tier0: [],
        tier1: [],
        tier2: []
      };

      const result = formatVerificationCommands(verification);

      expect(result).toBe('No verification commands configured yet. Edit `.runr/runr.config.json` to add them.');
    });

    it('handles undefined tier arrays', () => {
      const verification = {};

      const result = formatVerificationCommands(verification);

      expect(result).toBe('No verification commands configured yet. Edit `.runr/runr.config.json` to add them.');
    });

    it('formats multiple commands per tier', () => {
      const verification = {
        tier0: ['lint', 'format', 'typecheck'],
        tier1: [],
        tier2: []
      };

      const result = formatVerificationCommands(verification);

      expect(result).toContain('- `lint`');
      expect(result).toContain('- `format`');
      expect(result).toContain('- `typecheck`');
    });
  });
});
