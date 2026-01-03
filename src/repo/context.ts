import path from 'node:path';
import { git, gitOptional } from './git.js';
import { RepoContext } from '../types/schemas.js';

export async function getGitRoot(repoPath: string): Promise<string> {
  const result = await git(['rev-parse', '--show-toplevel'], repoPath);
  return result.stdout.trim();
}

export async function getDefaultBranch(
  repoPath: string,
  fallback: string
): Promise<string> {
  const result = await gitOptional(
    ['symbolic-ref', 'refs/remotes/origin/HEAD'],
    repoPath
  );
  if (result?.stdout) {
    const parts = result.stdout.trim().split('/');
    const branch = parts[parts.length - 1];
    if (branch) {
      return branch;
    }
  }
  return fallback;
}

export async function getCurrentBranch(repoPath: string): Promise<string> {
  const result = await git(['rev-parse', '--abbrev-ref', 'HEAD'], repoPath);
  return result.stdout.trim();
}

export async function listChangedFiles(gitRoot: string): Promise<string[]> {
  // Use -z for NUL delimiter (fixes newlines in filenames)
  const result = await git(['status', '--porcelain', '-z'], gitRoot);

  if (!result.stdout || result.stdout.length === 0) {
    return [];
  }

  // Parse NUL-delimited entries
  // For renames, git outputs: "R  old_name\0new_name\0"
  // So after split, we get: ["R  old_name", "new_name", ...]
  const entries = result.stdout.split('\0').filter((entry) => entry.length > 0);
  const files: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Entry format: "XY filename" where XY is 2-char status code
    // Check if this looks like a status entry (has at least 3 chars and space at position 2)
    if (entry.length >= 3 && entry[2] === ' ') {
      const statusCode = entry.slice(0, 2);
      const filePath = entry.slice(3);

      // Check if this is a rename (R) or copy (C)
      if (statusCode[0] === 'R' || statusCode[1] === 'R' ||
          statusCode[0] === 'C' || statusCode[1] === 'C') {
        // For renames/copies, next entry is the new filename
        if (filePath) files.push(filePath); // old name
        if (i + 1 < entries.length) {
          files.push(entries[i + 1]); // new name
          i++; // Skip next entry since we consumed it
        }
      } else {
        // Regular file
        if (filePath) files.push(filePath);
      }
    } else {
      // Entry without status code (shouldn't happen except in rename case handled above)
      // Skip it to avoid corruption
    }
  }

  // Deduplicate
  const uniqueFiles = [...new Set(files)];

  if (uniqueFiles.length === 0) {
    return [];
  }

  // Filter out gitignored files using NUL delimiter
  return filterIgnoredFiles(gitRoot, uniqueFiles);
}

/**
 * Summary of ignored changed files (for forensics/journal)
 */
export interface IgnoredChangesSummary {
  ignored_count: number;
  ignored_sample: string[]; // Capped at 20 entries
  ignore_check_status: 'ok' | 'failed';
}

/**
 * Get summary of ignored changed files.
 * Call this when you need forensics (journal, guard violations).
 * Cheaper than filtering if you only need counts.
 *
 * @param gitRoot - Git repository root
 * @returns Summary with counts and sample
 */
export async function getIgnoredChangesSummary(gitRoot: string): Promise<IgnoredChangesSummary> {
  // Use same parsing as listChangedFiles()
  const result = await git(['status', '--porcelain', '-z'], gitRoot);

  if (!result.stdout || result.stdout.length === 0) {
    return {
      ignored_count: 0,
      ignored_sample: [],
      ignore_check_status: 'ok'
    };
  }

  // Parse all changed files (same logic as listChangedFiles)
  const entries = result.stdout.split('\0').filter((entry) => entry.length > 0);
  const files: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    if (entry.length >= 3 && entry[2] === ' ') {
      const statusCode = entry.slice(0, 2);
      const filePath = entry.slice(3);

      // Handle renames/copies
      if (statusCode[0] === 'R' || statusCode[1] === 'R' ||
          statusCode[0] === 'C' || statusCode[1] === 'C') {
        if (filePath) files.push(filePath);
        if (i + 1 < entries.length) {
          files.push(entries[i + 1]);
          i++;
        }
      } else {
        if (filePath) files.push(filePath);
      }
    }
  }

  const uniqueFiles = [...new Set(files)];

  if (uniqueFiles.length === 0) {
    return {
      ignored_count: 0,
      ignored_sample: [],
      ignore_check_status: 'ok'
    };
  }

  // Check which files are ignored
  try {
    const { execa } = await import('execa');

    const checkIgnoreResult = await execa('git', ['check-ignore', '-z', '--stdin'], {
      cwd: gitRoot,
      input: uniqueFiles.join('\0'),
      reject: false
    });

    const ignoredFiles = checkIgnoreResult.stdout
      .split('\0')
      .filter(line => line.length > 0);

    // Cap sample at 20 entries
    const sample = ignoredFiles.slice(0, 20);

    return {
      ignored_count: ignoredFiles.length,
      ignored_sample: sample,
      ignore_check_status: 'ok'
    };
  } catch (err) {
    // check-ignore failed
    return {
      ignored_count: 0,
      ignored_sample: [],
      ignore_check_status: 'failed'
    };
  }
}

/**
 * Filter out gitignored files from a list of paths.
 * Uses git check-ignore with NUL delimiters for correctness.
 *
 * @param gitRoot - Git repository root
 * @param files - List of file paths to check
 * @returns Filtered list with ignored files removed
 */
async function filterIgnoredFiles(gitRoot: string, files: string[]): Promise<string[]> {
  try {
    const { execa } = await import('execa');

    // Use -z for NUL delimiter (handles filenames with newlines)
    const checkIgnoreResult = await execa('git', ['check-ignore', '-z', '--stdin'], {
      cwd: gitRoot,
      input: files.join('\0'),
      reject: false  // Don't throw on exit code 1 (no files ignored)
    });

    // Parse NUL-delimited output
    const ignoredFiles = new Set(
      checkIgnoreResult.stdout
        .split('\0')
        .filter(line => line.length > 0)
    );

    // Return only files that are NOT ignored
    return files.filter(file => !ignoredFiles.has(file));
  } catch (err) {
    // Fail-safe: if check-ignore fails, return all files (strict mode)
    // Caller should log warning about this
    return files;
  }
}

export function getTouchedPackages(changedFiles: string[]): string[] {
  const packages = new Set<string>();
  for (const file of changedFiles) {
    const parts = file.split(path.sep);
    const idx = parts.indexOf('packages');
    if (idx !== -1 && parts.length > idx + 1) {
      packages.add(path.join('packages', parts[idx + 1]));
      continue;
    }
    if (parts[0] === 'package.json') {
      packages.add('root');
    }
  }
  return Array.from(packages);
}

export function toRunBranch(runId: string, slug: string): string {
  const safeSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `agent/${runId}/${safeSlug || 'task'}`;
}

export async function buildRepoContext(
  repoPath: string,
  runId: string,
  slug: string,
  defaultBranchFallback: string
): Promise<RepoContext> {
  const gitRoot = await getGitRoot(repoPath);
  const defaultBranch = await getDefaultBranch(gitRoot, defaultBranchFallback);
  const currentBranch = await getCurrentBranch(gitRoot);
  const runBranch = toRunBranch(runId, slug);
  const changedFiles = await listChangedFiles(gitRoot);
  const touchedPackages = getTouchedPackages(changedFiles);
  return {
    repo_path: repoPath,
    git_root: gitRoot,
    default_branch: defaultBranch,
    run_branch: runBranch,
    current_branch: currentBranch,
    changed_files: changedFiles,
    touched_packages: touchedPackages
  };
}
