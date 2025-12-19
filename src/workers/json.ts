import { z } from 'zod';

export function extractJsonBlock(output: string): string | null {
  const start = output.indexOf('BEGIN_JSON');
  const end = output.indexOf('END_JSON');
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  return output.slice(start + 'BEGIN_JSON'.length, end).trim();
}

export function parseJsonWithSchema<T>(
  output: string,
  schema: z.ZodSchema<T>
): { data?: T; error?: string } {
  const block = extractJsonBlock(output) ?? output.trim();
  try {
    const parsed = JSON.parse(block) as unknown;
    const result = schema.safeParse(parsed);
    if (!result.success) {
      return { error: result.error.message };
    }
    return { data: result.data };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}
