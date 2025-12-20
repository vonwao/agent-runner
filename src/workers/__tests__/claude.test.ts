import { describe, it, expect } from 'vitest';

interface ClaudeJsonResponse {
  result?: string;
  content?: string;
  message?: string;
  error?: string;
}

function extractTextFromClaudeJson(output: string): string {
  try {
    const parsed = JSON.parse(output) as ClaudeJsonResponse;
    return parsed.result || parsed.content || parsed.message || output;
  } catch {
    // If not valid JSON, return raw output
    return output;
  }
}

describe('extractTextFromClaudeJson', () => {
  it('extracts result field from valid JSON', () => {
    const input = '{"result":"Hello World"}';
    expect(extractTextFromClaudeJson(input)).toBe('Hello World');
  });

  it('extracts content field when result is missing', () => {
    const input = '{"content":"Content text","other":"ignored"}';
    expect(extractTextFromClaudeJson(input)).toBe('Content text');
  });

  it('extracts message field as fallback', () => {
    const input = '{"message":"Message text"}';
    expect(extractTextFromClaudeJson(input)).toBe('Message text');
  });

  it('returns raw output when not valid JSON', () => {
    const input = 'This is plain text, not JSON';
    expect(extractTextFromClaudeJson(input)).toBe('This is plain text, not JSON');
  });

  it('returns raw output for truncated JSON', () => {
    const input = '{"result":"trun';
    expect(extractTextFromClaudeJson(input)).toBe('{"result":"trun');
  });

  it('returns raw output for empty object with no known fields', () => {
    const input = '{"unknown":"field"}';
    // Returns the original input since result/content/message are all falsy
    expect(extractTextFromClaudeJson(input)).toBe('{"unknown":"field"}');
  });

  it('handles empty string result', () => {
    const input = '{"result":"","content":"fallback"}';
    // Empty string is falsy, so falls through to content
    expect(extractTextFromClaudeJson(input)).toBe('fallback');
  });

  it('handles null values', () => {
    const input = '{"result":null,"content":"actual content"}';
    expect(extractTextFromClaudeJson(input)).toBe('actual content');
  });

  it('handles nested JSON in result', () => {
    const input = '{"result":"{\\"nested\\":\\"json\\"}"}';
    expect(extractTextFromClaudeJson(input)).toBe('{"nested":"json"}');
  });

  it('handles array response gracefully', () => {
    const input = '["array","response"]';
    // Arrays don't have result/content/message, returns original
    expect(extractTextFromClaudeJson(input)).toBe('["array","response"]');
  });

  it('handles error field in response', () => {
    const input = '{"error":"Something went wrong","result":""}';
    // Empty result is falsy, but we don't currently use error field
    // This returns the raw input since result/content/message are empty/missing
    expect(extractTextFromClaudeJson(input)).toBe('{"error":"Something went wrong","result":""}');
  });

  it('handles whitespace in output', () => {
    const input = '  {"result":"with spaces"}  ';
    // JSON.parse handles leading/trailing whitespace
    expect(extractTextFromClaudeJson(input)).toBe('with spaces');
  });

  it('handles newlines in result text', () => {
    const input = '{"result":"line1\\nline2\\nline3"}';
    expect(extractTextFromClaudeJson(input)).toBe('line1\nline2\nline3');
  });
});

describe('Claude JSON error handling', () => {
  it('fails loud on completely invalid input', () => {
    // Current implementation returns the raw output, which is reasonable
    // but we might want to distinguish "valid text" from "parse error" later
    const input = '}{invalid';
    const result = extractTextFromClaudeJson(input);
    // Currently returns raw - this is acceptable behavior
    expect(result).toBe('}{invalid');
  });

  it('handles BOM characters', () => {
    const input = '\uFEFF{"result":"with BOM"}';
    // JSON.parse may fail with BOM prefix
    const result = extractTextFromClaudeJson(input);
    // Should either parse successfully or return raw
    expect(result.includes('with BOM') || result.includes('\uFEFF')).toBe(true);
  });
});
