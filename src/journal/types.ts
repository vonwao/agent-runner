/**
 * Journal types - v1.0 schema
 *
 * Case file for a single run, combining snapshot (immutable facts)
 * and living data (append-only notes).
 */

export interface JournalJson {
  // Meta
  schema_version: '1.0';
  generated_by: string; // "runr@0.4.0"
  generated_at: string; // ISO timestamp

  // Identity
  run_id: string;
  repo_root: string;
  base_sha: string | null;
  head_sha: string | null;
  task: {
    path: string | null;
    sha256: string | null;
    title: string | null; // Parsed from first H1
    goal: string | null; // Parsed from "## Goal" section
  };

  // Status
  status: {
    phase: string;
    terminal_state: 'complete' | 'stopped' | 'running' | 'unknown';
    stop_reason: string | null;
    duration_seconds: number | null; // Computed ONCE from timestamps
    timestamps: {
      started_at: string | null;
      ended_at: string | null;
    };
  };

  // Milestones/Checkpoints
  milestones: {
    attempted: number; // milestone_index + 1 (or 0 if -1)
    total: number; // state.milestones.length
    verified: number; // 0 for stopped runs
  };
  checkpoints: {
    created: number;
    list: Array<{
      milestone_index: number;
      title: string;
      sha: string;
      created_at: string; // ISO from committer time (%ct)
    }>;
    last_sha: string | null;
  };

  // Verification
  verification: {
    summary: {
      attempts_total: number; // Verification RUNS (not individual tests)
      attempts_passed: number;
      attempts_failed: number;
      total_duration_seconds: number;
    };
    last_failure: {
      command: string;
      exit_code: number;
      error_excerpt: string; // Last 60 lines OR 5KB, redacted
      log_path: string; // Relative to run dir
    } | null;
  };

  // Changes
  changes: {
    base_sha: string | null;
    head_sha: string | null;
    files_changed: number | null;
    insertions: number | null;
    deletions: number | null;
    top_files: Array<{
      path: string;
      insertions: number;
      deletions: number;
    }> | null;
    diff_stat: string | null;
    ignored_changes: {
      count: number;
      sample: string[]; // Capped at 20
      ignore_check_status: 'ok' | 'failed';
    } | null;
  };

  // Next Action
  next_action: {
    title: string;
    command: string;
    why: string;
  } | null;

  // Notes
  notes: {
    count: number;
    path: string; // Always "notes.jsonl"
  };

  // Resume
  resumed_from: {
    run_id: string;
    checkpoint_sha: string;
  } | null;

  // Provenance
  extraction: {
    checkpoints: 'git_log_v1' | 'none';
    verification: 'timeline_v1' | 'none';
    next_action: 'stop_json' | 'derived' | 'none';
  };

  // Warnings
  warnings: string[];
}

/**
 * Notes stored in notes.jsonl (append-only)
 */
export interface Note {
  ts: string; // ISO timestamp
  author: 'user'; // v1 only supports user notes
  text: string;
}

/**
 * Checkpoint from git log
 */
export interface Checkpoint {
  milestone_index: number;
  title: string;
  sha: string;
  created_at: string;
}

/**
 * Verification event from timeline.jsonl
 */
export interface VerificationEvent {
  type: 'verification';
  payload: {
    tier: string;
    ok: boolean;
    commands: string[];
    command_results: Array<{
      command: string;
      exit_code: number;
      output: string;
    }>;
    duration_ms: number;
  };
  timestamp: string;
}
