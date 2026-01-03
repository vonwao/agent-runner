import { describe, it, expect } from 'vitest';
import { redactSecrets } from '../../src/journal/redactor.js';

describe('redactSecrets', () => {
  it('redacts AWS access keys', () => {
    const input = 'AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE leaked';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toContain('[REDACTED_AWS_KEY]');
    expect(redacted).not.toContain('AKIAIOSFODNN7EXAMPLE');
    expect(had_redactions).toBe(true);
  });

  it('redacts API keys in env var format', () => {
    const input = 'API_KEY=sk-1234567890abcdef';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('API_KEY=[REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('redacts SECRET_KEY', () => {
    const input = 'SECRET_KEY="my-secret-value"';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('SECRET_KEY=[REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('redacts ACCESS_TOKEN', () => {
    const input = 'ACCESS_TOKEN=ghp_abc123xyz';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('ACCESS_TOKEN=[REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('redacts PRIVATE_KEY', () => {
    const input = 'PRIVATE_KEY=rsa-private-key-content';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('PRIVATE_KEY=[REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('redacts PASSWORD', () => {
    const input = 'PASSWORD=hunter2';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('PASSWORD=[REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('redacts generic SECRET', () => {
    const input = 'DATABASE_SECRET=postgres-password';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('DATABASE_SECRET=[REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('redacts Bearer tokens', () => {
    const input = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('Authorization: Bearer [REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('redacts PEM blocks', () => {
    const input = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7...
-----END PRIVATE KEY-----`;
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('[REDACTED_PEM_BLOCK]');
    expect(had_redactions).toBe(true);
  });

  it('handles multiple secrets in one string', () => {
    const input = `
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
SECRET_KEY=my-secret
Bearer token-value
`;
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toContain('[REDACTED_AWS_KEY]');
    expect(redacted).toContain('SECRET_KEY=[REDACTED]');
    expect(redacted).toContain('Bearer [REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('returns had_redactions=false when no secrets found', () => {
    const input = 'No secrets here, just normal log output';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe(input);
    expect(had_redactions).toBe(false);
  });

  it('is case-insensitive for env var patterns', () => {
    const input = 'api_key=lowercase-secret and API_KEY=uppercase-secret';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toBe('api_key=[REDACTED] and API_KEY=[REDACTED]');
    expect(had_redactions).toBe(true);
  });

  it('does not redact safe substrings', () => {
    const input = 'Looking for API_KEY in config file';
    const { redacted, had_redactions } = redactSecrets(input);

    // Should NOT redact "API_KEY" without "="
    expect(redacted).toContain('API_KEY');
    expect(had_redactions).toBe(false);
  });

  it('handles quoted values', () => {
    const input = 'API_KEY="quoted-secret" and PASSWORD=\'single-quoted\'';
    const { redacted, had_redactions } = redactSecrets(input);

    expect(redacted).toContain('API_KEY=[REDACTED]');
    expect(redacted).toContain('PASSWORD=[REDACTED]');
    expect(had_redactions).toBe(true);
  });
});
