/**
 * runr audit - View project history classified by provenance
 *
 * Shows the timeline of commits classified as:
 * - CHECKPOINT: Runr checkpoint commits with receipts
 * - INTERVENTION: Manual work recorded via runr intervene
 * - ATTRIBUTED: Has Runr trailers but no receipt
 * - GAP: No Runr attribution (audit gap)
 *
 * Usage:
 *   runr audit                           # Last 50 commits on current branch
 *   runr audit --range main~80..main     # Custom range
 *   runr audit --run <run_id>            # Commits for specific run
 *   runr audit --json                    # JSON output
 */

import { execSync } from 'node:child_process';
import {
  parseGitLog,
  classifyCommits,
  generateSummary,
  formatClassification,
  getClassificationIcon,
  type AuditSummary,
  type ClassifiedCommit
} from '../audit/classifier.js';

export interface AuditOptions {
  repo: string;
  range?: string;
  runId?: string;
  limit?: number;
  json?: boolean;
  /** Strict mode: treat inferred attribution as gaps */
  strict?: boolean;
  /** Output JSON coverage report */
  coverage?: boolean;
  /** Fail with exit code 1 if explicit coverage is below this threshold (%) */
  failUnder?: number;
  /** Fail with exit code 1 if inferred coverage is below this threshold (%) */
  failUnderWithInferred?: number;
}

/**
 * Get the default branch for range.
 */
function getDefaultBranch(repoPath: string): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: repoPath,
      encoding: 'utf-8'
    }).trim();
  } catch {
    return 'main';
  }
}

/**
 * Build the git range string.
 */
function buildRange(options: AuditOptions): string {
  if (options.range) {
    return options.range;
  }

  const branch = getDefaultBranch(options.repo);
  const limit = options.limit || 50;
  return `${branch}~${limit}..${branch}`;
}

/**
 * Print table of classified commits.
 */
function printTable(commits: ClassifiedCommit[]): void {
  // Column headers
  const headers = ['', 'SHA', 'TYPE', 'RUN ID', 'SUBJECT'];

  // Calculate column widths (fixed for readability)
  const widths = [2, 7, 12, 14, 50];

  // Print header
  const headerLine = headers.map((h, i) => h.padEnd(widths[i])).join('  ');
  console.log(headerLine);
  console.log('-'.repeat(headerLine.length));

  // Print rows (most recent first)
  for (const commit of commits) {
    const icon = getClassificationIcon(commit.classification);
    const type = formatClassification(commit.classification);
    const runId = commit.runId || '-';
    const subject = commit.subject.length > widths[4]
      ? commit.subject.slice(0, widths[4] - 3) + '...'
      : commit.subject;

    const row = [
      icon.padEnd(widths[0]),
      commit.shortSha.padEnd(widths[1]),
      type.padEnd(widths[2]),
      runId.padEnd(widths[3]),
      subject.padEnd(widths[4])
    ];
    console.log(row.join('  '));
  }
}

/**
 * Print summary section.
 */
function printSummary(summary: AuditSummary, strict = false): void {
  const { counts, gaps, runsReferenced, explicitCoverage, inferredCoverage, fullCoverage } = summary;

  console.log('');
  console.log('Summary');
  console.log('-------');
  console.log(`Total commits: ${counts.total}`);
  console.log(`  ✓ Checkpoints:    ${counts.runr_checkpoint}`);
  console.log(`  ⚡ Interventions:  ${counts.runr_intervention}`);
  console.log(`  ~ Inferred:       ${counts.runr_inferred}`);
  console.log(`  ○ Attributed:     ${counts.manual_attributed}`);
  console.log(`  ? Gaps:           ${counts.gap}`);

  if (runsReferenced.length > 0) {
    console.log('');
    console.log(`Runs referenced: ${runsReferenced.length}`);
    const displayRuns = runsReferenced.slice(0, 5);
    for (const runId of displayRuns) {
      console.log(`  ${runId}`);
    }
    if (runsReferenced.length > 5) {
      console.log(`  ...${runsReferenced.length - 5} more`);
    }
  }

  // Audit health indicator with coverage numbers
  console.log('');

  // Show coverage differently based on strict mode
  const coverageDisplay = strict
    ? `${explicitCoverage}% coverage (strict mode)`
    : `${explicitCoverage}% (explicit) / ${inferredCoverage}% (with inferred)`;

  if (gaps.length === 0) {
    console.log(`Audit status: ✓ CLEAN (${coverageDisplay})`);
  } else if (gaps.length <= 3) {
    console.log(`Audit status: ⚠ ${gaps.length} gap${gaps.length === 1 ? '' : 's'} (${coverageDisplay})`);
  } else {
    console.log(`Audit status: ✗ ${gaps.length} gaps (${coverageDisplay})`);
  }

  // Show top gaps if any
  if (gaps.length > 0) {
    console.log('');
    const gapLabel = strict ? 'Top gaps (unattributed commits + inferred):' : 'Top gaps (unattributed commits):';
    console.log(gapLabel);
    const displayGaps = gaps.slice(0, 5);
    for (const gap of displayGaps) {
      console.log(`  ${gap.shortSha} ${gap.subject.slice(0, 50)}`);
    }
    if (gaps.length > 5) {
      console.log(`  ...${gaps.length - 5} more`);
    }
  }
}

/**
 * Print coverage report in human-readable format.
 */
function printCoverageReport(summary: AuditSummary, options: AuditOptions): void {
  const { counts, explicitCoverage, inferredCoverage, fullCoverage } = summary;

  const explicitCount = counts.runr_checkpoint + counts.runr_intervention;
  const inferredCount = explicitCount + counts.runr_inferred;
  const fullCount = inferredCount + counts.manual_attributed;

  console.log('Coverage Report');
  console.log('---------------');
  console.log(`Explicit coverage:      ${explicitCoverage}% (${explicitCount}/${counts.total})`);
  console.log(`With inferred:          ${inferredCoverage}% (${inferredCount}/${counts.total})`);
  console.log(`Full (with attributed): ${fullCoverage}% (${fullCount}/${counts.total})`);

  // Show threshold status if specified
  if (options.failUnder !== undefined || options.failUnderWithInferred !== undefined) {
    console.log('');

    if (options.failUnder !== undefined) {
      const status = explicitCoverage >= options.failUnder ? 'PASS' : 'FAIL';
      console.log(`Threshold: ${options.failUnder}% (explicit)`);
      console.log(`Status: ${status} (explicit coverage ${explicitCoverage}% ${status === 'PASS' ? '>=' : '<'} ${options.failUnder}%)`);
    }

    if (options.failUnderWithInferred !== undefined) {
      const status = inferredCoverage >= options.failUnderWithInferred ? 'PASS' : 'FAIL';
      console.log(`Threshold: ${options.failUnderWithInferred}% (with inferred)`);
      console.log(`Status: ${status} (inferred coverage ${inferredCoverage}% ${status === 'PASS' ? '>=' : '<'} ${options.failUnderWithInferred}%)`);
    }
  }
}

/**
 * Generate coverage JSON report.
 */
function generateCoverageJson(summary: AuditSummary): object {
  const { counts, gaps, runsReferenced, explicitCoverage, inferredCoverage, fullCoverage } = summary;

  return {
    range: summary.range,
    timestamp: new Date().toISOString(),
    total_commits: counts.total,
    classifications: {
      runr_checkpoint: counts.runr_checkpoint,
      runr_intervention: counts.runr_intervention,
      runr_inferred: counts.runr_inferred,
      manual_attributed: counts.manual_attributed,
      gap: counts.gap
    },
    coverage: {
      explicit: explicitCoverage / 100,
      with_inferred: inferredCoverage / 100,
      with_attributed: fullCoverage / 100
    },
    gaps: gaps.map(g => ({ sha: g.sha, subject: g.subject })),
    runs_referenced: runsReferenced
  };
}

/**
 * Filter commits for a specific run.
 */
function filterByRun(commits: ClassifiedCommit[], runId: string): ClassifiedCommit[] {
  return commits.filter(c => c.runId === runId);
}

/**
 * Audit command: View project history by provenance.
 */
export async function auditCommand(options: AuditOptions): Promise<void> {
  const range = buildRange(options);

  // Parse git log
  let commits = parseGitLog(options.repo, range);

  if (commits.length === 0) {
    if (options.json) {
      console.log(JSON.stringify({ error: 'no_commits', range }, null, 2));
    } else {
      console.log(`No commits found in range: ${range}`);
    }
    return;
  }

  // Classify commits
  commits = classifyCommits(commits, options.repo);

  // Filter by run if specified
  if (options.runId) {
    commits = filterByRun(commits, options.runId);
    if (commits.length === 0) {
      if (options.json) {
        console.log(JSON.stringify({ error: 'no_commits_for_run', runId: options.runId }, null, 2));
      } else {
        console.log(`No commits found for run: ${options.runId}`);
      }
      return;
    }
  }

  // Generate summary (strict mode treats inferred as gaps)
  const summary = generateSummary(commits, range, options.strict);

  // Output
  if (options.coverage) {
    // Coverage report mode
    if (options.json) {
      console.log(JSON.stringify(generateCoverageJson(summary), null, 2));
    } else {
      console.log(`Audit: ${range}`);
      console.log('');
      printCoverageReport(summary, options);
      console.log('');
    }
  } else if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`Audit: ${range}`);
    if (options.runId) {
      console.log(`Filtered by run: ${options.runId}`);
    }
    if (options.strict) {
      console.log('(strict mode: inferred attribution treated as gaps)');
    }
    console.log('');

    printTable(commits);
    printSummary(summary, options.strict);
    console.log('');
  }

  // Check threshold and set exit code if specified
  if (options.failUnder !== undefined) {
    if (summary.explicitCoverage < options.failUnder) {
      process.exitCode = 1;
    }
  }

  if (options.failUnderWithInferred !== undefined) {
    if (summary.inferredCoverage < options.failUnderWithInferred) {
      process.exitCode = 1;
    }
  }
}
