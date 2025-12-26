import path from 'node:path';

/**
 * Get the runs root directory for a given repo path.
 * Runs are stored under .agent/runs in the target repo.
 *
 * @param repoPath - The target repository path
 * @returns The absolute path to the runs directory (e.g., /path/to/repo/.agent/runs)
 */
export function getRunsRoot(repoPath: string): string {
  return path.join(path.resolve(repoPath), '.agent', 'runs');
}

/**
 * Get the run directory for a specific run ID within a repo.
 *
 * @param repoPath - The target repository path
 * @param runId - The run ID (timestamp format)
 * @returns The absolute path to the run directory
 */
export function getRunDir(repoPath: string, runId: string): string {
  return path.join(getRunsRoot(repoPath), runId);
}
