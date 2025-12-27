/**
 * Mock worker for testing auto-resume and stall detection.
 *
 * Controlled via AGENT_MOCK_WORKER env var:
 * - "hang": Never resolves (simulates hung worker)
 * - "hang_once": First call hangs, subsequent calls succeed
 * - "delay_5s": Resolves after 5 seconds with valid output
 * - unset/other: Not used (real workers are used)
 *
 * The mock worker returns valid JSON output for the stage being tested.
 */

import { WorkerResult } from '../types/schemas.js';
import { WorkerRunInput } from './codex.js';

// Track call count for hang_once mode
let callCount = 0;

/**
 * Check if mock worker mode is enabled.
 */
export function isMockWorkerEnabled(): boolean {
  const mode = process.env.AGENT_MOCK_WORKER;
  return mode === 'hang' || mode === 'hang_once' || mode === 'delay_5s';
}

/**
 * Get mock worker mode.
 */
export function getMockWorkerMode(): string | undefined {
  return process.env.AGENT_MOCK_WORKER;
}

/**
 * Reset mock worker state (for tests).
 */
export function resetMockWorker(): void {
  callCount = 0;
}

/**
 * Generate valid JSON output based on stage.
 * This ensures the mock can produce parseable responses.
 */
function generateValidOutput(prompt: string): string {
  // Detect stage from prompt content
  if (prompt.includes('PLAN') || prompt.includes('milestones')) {
    return JSON.stringify({
      milestones: [
        {
          goal: 'Mock milestone for testing',
          files_expected: ['test.txt'],
          risk_level: 'low'
        }
      ]
    });
  }

  if (prompt.includes('IMPLEMENT') || prompt.includes('implement')) {
    return JSON.stringify({
      status: 'ok',
      handoff_memo: 'Mock implementation complete.'
    });
  }

  if (prompt.includes('REVIEW') || prompt.includes('review')) {
    return JSON.stringify({
      status: 'approve',
      changes: []
    });
  }

  // Default response
  return JSON.stringify({ result: 'ok' });
}

/**
 * Run mock worker with configured behavior.
 */
export async function runMockWorker(input: WorkerRunInput): Promise<WorkerResult> {
  const mode = getMockWorkerMode();
  callCount++;

  console.log(`[mock-worker] Mode: ${mode}, Call: ${callCount}`);

  switch (mode) {
    case 'hang':
      // Hang for 20 seconds then fail - allows watchdog (10s intervals) to catch the 12s cap
      console.log('[mock-worker] Hanging for 20 seconds...');
      await new Promise(resolve => setTimeout(resolve, 20000));
      return {
        status: 'failed',
        commands_run: ['mock-worker'],
        observations: ['Worker timed out (mock)']
      };

    case 'hang_once':
      // First call hangs (20s), subsequent calls succeed
      if (callCount === 1) {
        console.log('[mock-worker] First call - hanging for 20 seconds...');
        await new Promise(resolve => setTimeout(resolve, 20000));
        return {
          status: 'failed',
          commands_run: ['mock-worker'],
          observations: ['Worker timed out (mock hang_once first call)']
        };
      }
      console.log('[mock-worker] Subsequent call - returning success');
      return {
        status: 'ok',
        commands_run: ['mock-worker'],
        observations: [generateValidOutput(input.prompt)]
      };

    case 'delay_5s':
      // Delay 5 seconds then succeed
      console.log('[mock-worker] Delaying 5 seconds...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      return {
        status: 'ok',
        commands_run: ['mock-worker'],
        observations: [generateValidOutput(input.prompt)]
      };

    default:
      // Should not reach here if isMockWorkerEnabled() is checked first
      return {
        status: 'failed',
        commands_run: ['mock-worker'],
        observations: ['Mock worker called but not configured']
      };
  }
}
