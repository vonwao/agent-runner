import { describe, it, expect } from 'vitest';

// Extract the parsing function for testing
// We'll need to export it from codex.ts or inline the logic here

interface CodexEvent {
  type: string;
  item?: {
    type: string;
    text?: string;
  };
}

function extractTextFromCodexJsonl(output: string): string {
  const lines = output.trim().split('\n').filter(Boolean);
  const texts: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as CodexEvent;
      if (event.type === 'item.completed' && event.item?.type === 'agent_message' && event.item.text) {
        texts.push(event.item.text);
      }
    } catch {
      // Skip malformed lines
    }
  }

  return texts.join('\n');
}

describe('extractTextFromCodexJsonl', () => {
  it('extracts agent_message text from valid JSONL', () => {
    const input = `{"type":"thread.started","thread_id":"abc123"}
{"type":"turn.started"}
{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"thinking..."}}
{"type":"item.completed","item":{"id":"item_1","type":"agent_message","text":"HELLO WORLD"}}
{"type":"turn.completed","usage":{"input_tokens":100,"output_tokens":10}}`;

    const result = extractTextFromCodexJsonl(input);
    expect(result).toBe('HELLO WORLD');
  });

  it('concatenates multiple agent_message items', () => {
    const input = `{"type":"item.completed","item":{"type":"agent_message","text":"First message"}}
{"type":"item.completed","item":{"type":"agent_message","text":"Second message"}}`;

    const result = extractTextFromCodexJsonl(input);
    expect(result).toBe('First message\nSecond message');
  });

  it('ignores reasoning and command_execution items', () => {
    const input = `{"type":"item.completed","item":{"type":"reasoning","text":"I should run git status"}}
{"type":"item.completed","item":{"type":"command_execution","command":"git status","aggregated_output":"clean"}}
{"type":"item.completed","item":{"type":"agent_message","text":"Done!"}}`;

    const result = extractTextFromCodexJsonl(input);
    expect(result).toBe('Done!');
  });

  it('handles malformed JSON lines gracefully', () => {
    const input = `{"type":"item.completed","item":{"type":"agent_message","text":"Valid"}}
this is not json
{"broken json
{"type":"item.completed","item":{"type":"agent_message","text":"Also valid"}}`;

    const result = extractTextFromCodexJsonl(input);
    expect(result).toBe('Valid\nAlso valid');
  });

  it('returns empty string when no agent_message found', () => {
    const input = `{"type":"thread.started","thread_id":"abc"}
{"type":"turn.started"}
{"type":"item.completed","item":{"type":"reasoning","text":"thinking"}}
{"type":"turn.completed"}`;

    const result = extractTextFromCodexJsonl(input);
    expect(result).toBe('');
  });

  it('handles empty input', () => {
    expect(extractTextFromCodexJsonl('')).toBe('');
    expect(extractTextFromCodexJsonl('   ')).toBe('');
    expect(extractTextFromCodexJsonl('\n\n')).toBe('');
  });

  it('handles missing item.text gracefully', () => {
    const input = `{"type":"item.completed","item":{"type":"agent_message"}}
{"type":"item.completed","item":{"type":"agent_message","text":""}}
{"type":"item.completed","item":{"type":"agent_message","text":"Has text"}}`;

    const result = extractTextFromCodexJsonl(input);
    expect(result).toBe('Has text');
  });

  it('handles control characters and unicode', () => {
    const input = `{"type":"item.completed","item":{"type":"agent_message","text":"Hello\\nWorld\\twith\\ttabs"}}`;

    const result = extractTextFromCodexJsonl(input);
    expect(result).toBe('Hello\nWorld\twith\ttabs');
  });

  it('handles carriage returns in output', () => {
    const input = `{"type":"item.completed","item":{"type":"agent_message","text":"Line1"}}\r\n{"type":"item.completed","item":{"type":"agent_message","text":"Line2"}}`;

    const result = extractTextFromCodexJsonl(input);
    // After trim and split, we should still get both messages
    expect(result).toContain('Line1');
    expect(result).toContain('Line2');
  });
});
