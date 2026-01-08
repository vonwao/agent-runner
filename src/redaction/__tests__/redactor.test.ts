import { describe, it, expect } from 'vitest';
import { redact, containsSecrets, detectSecretTypes, REDACTED } from '../redactor.js';

describe('redactor', () => {
  describe('redact()', () => {
    it('should return empty string unchanged', () => {
      expect(redact('')).toBe('');
    });

    it('should return normal text unchanged', () => {
      expect(redact('Hello, world!')).toBe('Hello, world!');
      expect(redact('npm run build')).toBe('npm run build');
    });

    it('should redact environment variable assignments', () => {
      expect(redact('TOKEN=abc123secret')).toBe(REDACTED);
      expect(redact('export SECRET=myvalue')).toContain(REDACTED);
      expect(redact('PASSWORD=hunter2')).toBe(REDACTED);
      expect(redact('API_KEY=sk-12345')).toBe(REDACTED);
    });

    it('should redact auth headers', () => {
      expect(redact('Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...')).toBe(REDACTED);
      expect(redact('Authorization: Basic dXNlcm5hbWU6cGFzc3dvcmQ=')).toContain(REDACTED);
    });

    it('should redact AWS credentials', () => {
      expect(redact('AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY')).toBe(REDACTED);
      expect(redact('AKIAIOSFODNN7EXAMPLE')).toBe(REDACTED);
    });

    it('should redact GitHub tokens', () => {
      expect(redact('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(REDACTED);
      expect(redact('gho_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(REDACTED);
    });

    it('should redact npm tokens', () => {
      expect(redact('npm_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(REDACTED);
      expect(redact('//registry.npmjs.org/:_authToken=abc123')).toBe(REDACTED);
    });

    it('should redact provider-specific env vars', () => {
      expect(redact('OPENAI_API_KEY=sk-...')).toBe(REDACTED);
      expect(redact('ANTHROPIC_API_KEY=sk-ant-...')).toBe(REDACTED);
      expect(redact('STRIPE_SECRET_KEY=sk_live_...')).toBe(REDACTED);
    });

    it('should redact connection strings', () => {
      expect(redact('postgresql://user:password@localhost:5432/db')).toContain(REDACTED);
      expect(redact('mongodb://admin:secret@mongo.example.com/db')).toContain(REDACTED);
    });

    it('should redact private keys', () => {
      const privateKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy
-----END RSA PRIVATE KEY-----`;
      expect(redact(privateKey)).toBe(REDACTED);
    });

    it('should redact JSON secret values', () => {
      // JSON pattern replaces the whole key-value match
      const result = redact('{"api_key": "sk-12345"}');
      expect(result).toContain(REDACTED);
      expect(result).not.toContain('sk-12345');
      expect(redact('"password": "mysecret"')).toBe(REDACTED);
    });

    it('should handle multiple secrets in one string', () => {
      const input = 'TOKEN=abc123 PASSWORD=hunter2';
      const result = redact(input);
      expect(result).not.toContain('abc123');
      expect(result).not.toContain('hunter2');
    });

    it('should preserve non-secret content around secrets', () => {
      const input = 'Running command with TOKEN=secret123 and done';
      const result = redact(input);
      expect(result).toContain('Running command with');
      expect(result).toContain('and done');
      expect(result).not.toContain('secret123');
    });
  });

  describe('containsSecrets()', () => {
    it('should return false for empty string', () => {
      expect(containsSecrets('')).toBe(false);
    });

    it('should return false for normal text', () => {
      expect(containsSecrets('Hello, world!')).toBe(false);
      expect(containsSecrets('npm run test')).toBe(false);
    });

    it('should return true when secrets are present', () => {
      expect(containsSecrets('TOKEN=secret')).toBe(true);
      expect(containsSecrets('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(true);
    });
  });

  describe('detectSecretTypes()', () => {
    it('should return empty array for no secrets', () => {
      expect(detectSecretTypes('')).toEqual([]);
      expect(detectSecretTypes('Hello')).toEqual([]);
    });

    it('should identify env_var pattern', () => {
      expect(detectSecretTypes('TOKEN=abc123')).toContain('env_var');
    });

    it('should identify github_token pattern', () => {
      expect(detectSecretTypes('ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')).toContain('github_token');
    });

    it('should identify multiple patterns', () => {
      const types = detectSecretTypes('TOKEN=secret ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
      expect(types).toContain('env_var');
      expect(types).toContain('github_token');
    });
  });
});
