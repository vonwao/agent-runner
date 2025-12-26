import { execa } from 'execa';
import { VerifyResult, VerificationTier, CommandResult } from '../types/schemas.js';

export async function runVerification(
  tier: VerificationTier,
  commands: string[],
  cwd: string,
  timeoutSeconds: number
): Promise<VerifyResult> {
  const started = Date.now();
  let output = '';
  let ok = true;
  const commandResults: CommandResult[] = [];

  for (const command of commands) {
    try {
      const result = await execa(command, {
        cwd,
        shell: true,
        timeout: timeoutSeconds * 1000,
        all: true
      });
      const cmdOutput = result.all ? `${result.all}\n` : '';
      output += cmdOutput;
      commandResults.push({
        command,
        exit_code: 0,
        output: cmdOutput
      });
    } catch (error) {
      ok = false;
      const errWithCode = error as { exitCode?: number; all?: string };
      const exitCode: number = typeof errWithCode.exitCode === 'number' ? errWithCode.exitCode : 1;
      const errorOutput: string =
        typeof errWithCode.all === 'string'
          ? errWithCode.all
          : error instanceof Error
            ? error.message
            : 'Verification command failed';
      output += `${errorOutput}\n`;
      commandResults.push({
        command,
        exit_code: exitCode,
        output: errorOutput
      });
      break;
    }
  }

  return {
    tier,
    commands,
    command_results: commandResults,
    ok,
    duration_ms: Date.now() - started,
    output
  };
}
