import { execa } from 'execa';
import { WorkerConfig } from '../config/schema.js';
import { WorkerResult } from '../types/schemas.js';

export interface WorkerRunInput {
  prompt: string;
  repo_path: string;
  worker: WorkerConfig;
}

interface CodexEvent {
  type: string;
  message?: {
    role?: string;
    content?: Array<{ type: string; text?: string }>;
  };
}

function extractTextFromCodexJsonl(output: string): string {
  const lines = output.trim().split('\n').filter(Boolean);
  const texts: string[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as CodexEvent;
      if (event.type === 'message' && event.message?.role === 'assistant') {
        const content = event.message.content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block.type === 'text' && block.text) {
              texts.push(block.text);
            }
          }
        }
      }
    } catch {
      // Skip malformed lines
    }
  }

  return texts.join('\n');
}

export async function runCodex(input: WorkerRunInput): Promise<WorkerResult> {
  const { bin, args } = input.worker;

  // Build argv: base args + repo path via -C
  const argv = [...args, '-C', input.repo_path];

  try {
    const result = await execa(bin, argv, {
      cwd: input.repo_path,
      input: input.prompt,
      stdout: 'pipe',
      stderr: 'pipe',
      timeout: 300000 // 5 min timeout
    });

    const rawOutput = result.stdout;
    const text = input.worker.output === 'jsonl'
      ? extractTextFromCodexJsonl(rawOutput)
      : rawOutput;

    return {
      status: result.exitCode === 0 ? 'ok' : 'failed',
      commands_run: [`${bin} ${argv.join(' ')}`],
      observations: [text || rawOutput]
    };
  } catch (error) {
    const err = error as { stdout?: string; stderr?: string; message?: string };
    const output = err.stdout || err.stderr || err.message || 'Codex command failed';

    return {
      status: 'failed',
      commands_run: [`${bin} ${argv.join(' ')}`],
      observations: [output]
    };
  }
}
