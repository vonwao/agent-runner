import fs from 'node:fs';
import path from 'node:path';
import { getRunsRoot } from './runs-root.js';

/**
 * Find the most recent run ID by scanning the runs directory.
 * Run IDs are expected to be 14-digit timestamps (YYYYMMDDHHmmss).
 * @param repoPath - The target repository path (defaults to current working directory)
 * @returns The latest run ID or null if no runs exist
 */
export function findLatestRunId(repoPath = process.cwd()): string | null {
  const rootDir = getRunsRoot(repoPath);
  if (!fs.existsSync(rootDir)) {
    return null;
  }
  const entries = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse();
  return entries[0] ?? null;
}

/**
 * Resolve a run ID, supporting 'latest' as a special value.
 * @param runId - The run ID or 'latest'
 * @param repoPath - The target repository path (defaults to current working directory)
 * @returns The resolved run ID
 * @throws Error if 'latest' is specified but no runs exist
 * @throws Error if the specified run directory does not exist
 */
export function resolveRunId(runId: string, repoPath = process.cwd()): string {
  const rootDir = getRunsRoot(repoPath);
  let resolvedId = runId;

  if (runId === 'latest') {
    const latest = findLatestRunId(repoPath);
    if (!latest) {
      throw new Error('No runs found. Run a task first with `agent run`.');
    }
    resolvedId = latest;
  }

  // Validate that the run directory exists
  const runDir = path.join(rootDir, resolvedId);
  if (!fs.existsSync(runDir)) {
    // List available runs for helpful error message
    const knownRuns = listRecentRunIds(repoPath, 5);
    const hint = knownRuns.length > 0 ? `Known runs: ${knownRuns.join(', ')}` : 'No runs found.';
    throw new Error(`Run not found: ${resolvedId}. ${hint}`);
  }

  return resolvedId;
}

/**
 * List recent run IDs, sorted by most recent first.
 * @param repoPath - The target repository path (defaults to current working directory)
 * @param limit - Maximum number of runs to return
 * @returns Array of run IDs
 */
export function listRecentRunIds(repoPath = process.cwd(), limit = 10): string[] {
  const rootDir = getRunsRoot(repoPath);
  if (!fs.existsSync(rootDir)) {
    return [];
  }
  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && /^\d{14}$/.test(e.name))
    .map((e) => e.name)
    .sort()
    .reverse()
    .slice(0, limit);
}
