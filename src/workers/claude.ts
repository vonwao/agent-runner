import { execa } from 'execa';
import { WorkerConfig } from '../config/schema.js';
import { WorkerResult } from '../types/schemas.js';
import { WorkerRunInput } from './codex.js';

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

export async function runClaude(input: WorkerRunInput): Promise<WorkerResult> {
  const { bin, args } = input.worker;

  try {
    const result = await execa(bin, args, {
      cwd: input.repo_path,
      input: input.prompt,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 300000 // 5 min timeout
    });

    const rawOutput = result.stdout;
    const text = input.worker.output === 'json'
      ? extractTextFromClaudeJson(rawOutput)
      : rawOutput;

    return {
      status: result.exitCode === 0 ? 'ok' : 'failed',
      commands_run: [`${bin} ${args.join(' ')}`],
      observations: [text || rawOutput]
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || err.message || 'Claude command failed';

    return {
      status: 'failed',
      commands_run: [`${bin} ${args.join(' ')}`],
      observations: [output]
    };
  }
}
