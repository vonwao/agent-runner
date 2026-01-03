# Journal V2 - Final Pre-Implementation Checklist

**All critical risks addressed. Ready to start Phase 1.**

---

## Fixes Applied (Beyond V2)

### 1. Milestone "attempted" definition - CLARIFIED

**Question**: What does "attempted" mean exactly?

**Answer**:
```typescript
milestones.attempted = state.milestone_index + 1;  // 0-indexed, last milestone entered
milestones.total = state.milestones.length;
milestones.verified = 0;  // Always 0 for stopped runs (no milestone passed final verify)
```

**Example**: If state shows `milestone_index: 3`, it means:
- Milestones 0, 1, 2, 3 were attempted (4 total)
- `attempted = 3 + 1 = 4`
- If run stopped, none were verified

**Edge case**: If `milestone_index === -1` (hasn't started first milestone), `attempted = 0`.

---

### 2. Verification attempts vs tests - DOCUMENTED

**Clarification added to schema**:
```typescript
verification: {
  summary: {
    attempts_total: number;      // Count of verification RUNS (retries), not individual tests
    attempts_passed: number;     // Verification runs where ALL commands passed
    attempts_failed: number;     // Verification runs where ANY command failed
    total_duration_seconds: number;
  };
  // ...
}
```

**In markdown**: Will say "Verification Attempts" not just "Tests".

---

### 3. Extraction metadata - ADDED

**New field in journal.json**:
```typescript
interface JournalJson {
  // ... all existing fields ...

  // Extraction provenance (for debugging)
  extraction: {
    checkpoints: "git_log_v1" | "none";
    verification: "timeline_v1" | "none";
    next_action: "stop_json" | "derived" | "none";
  };
}
```

**Why**: Makes future debugging trivial. Shows exactly where data came from.

**In builder**:
```typescript
extraction: {
  checkpoints: checkpoints.created > 0 ? "git_log_v1" : "none",
  verification: verification.summary.attempts_total > 0 ? "timeline_v1" : "none",
  next_action: next_action ? (stopJsonExists ? "stop_json" : "derived") : "none"
}
```

---

### 4. Warnings section in markdown - ADDED

**Template addition**:
```markdown
## Warnings

<if warnings.length > 0>
⚠️ The following issues were encountered while generating this journal:

- <warning 1>
- <warning 2>
...
</if>

<if warnings.length === 0>
*No warnings*
</if>
```

**Placement**: After "Notes" section, before footer.

---

### 5. Terminal state checking - HARDENED

**Current code**:
```typescript
if (state.phase === 'STOPPED') {
  // auto-write journal
}
```

**Improved code**:
```typescript
function isTerminalState(state: RunState): boolean {
  // STOPPED is terminal in current state machine (as of v0.4.0)
  // If state machine refactors change this, update this function AND journal auto-write hook
  return state.phase === 'STOPPED';
}

// In supervisor
if (isTerminalState(state)) {
  // auto-write journal
}
```

**Why**: Centralized definition, explicit comment about state machine assumption.

---

### 6. Error excerpt capping - BYTES + LINES

**Current plan**: Last 60 lines

**Improved**:
```typescript
function getErrorExcerpt(logPath: string): string {
  const content = fs.readFileSync(logPath, 'utf-8');
  const lines = content.split('\n');

  // Cap at last 60 lines OR 5KB, whichever is smaller
  const lastLines = lines.slice(-60);
  let excerpt = lastLines.join('\n');

  const MAX_BYTES = 5 * 1024;  // 5KB
  if (Buffer.byteLength(excerpt, 'utf-8') > MAX_BYTES) {
    // Truncate to byte limit
    excerpt = excerpt.substring(0, MAX_BYTES);
    excerpt += '\n\n[Excerpt truncated to 5KB]';
  }

  return excerpt;
}
```

**Why**: Prevents huge excerpts from blowing up journal.json size.

---

### 7. Checkpoint timestamps - COMMITTER TIME

**Git command**:
```bash
# OLD (ambiguous)
git log --format='%H|%at|%s' <base>..<head>

# NEW (explicit committer time)
git log --format='%H|%ct|%s' <base>..<head>
```

**Format codes**:
- `%at` = author timestamp (when commit was originally made)
- `%ct` = committer timestamp (when commit was applied to branch)

**Use `%ct`** (committer time) because:
- It's when checkpoint was actually created in the run
- Author time can be backdated or future-dated
- Committer time is closer to "when did this happen"

**Convert**:
```typescript
const unixTimestamp = parseInt(timestampStr, 10);
const created_at = new Date(unixTimestamp * 1000).toISOString();
```

---

### 8. Regen logic - ALL INPUTS

**Improved shouldRegenerate**:
```typescript
function shouldRegenerate(runDir: string): boolean {
  const journalMdPath = path.join(runDir, 'journal.md');

  if (!fs.existsSync(journalMdPath)) {
    return true;
  }

  const journalMtime = fs.statSync(journalMdPath).mtimeMs;

  // Check all input sources
  const inputs = [
    path.join(runDir, 'state.json'),
    path.join(runDir, 'notes.jsonl'),
    path.join(runDir, 'timeline.jsonl'),  // verification events can change
    path.join(runDir, 'handoffs/stop.json'),  // next_action can be added later
    // Don't check config.snapshot.json - it's immutable
  ];

  for (const inputPath of inputs) {
    if (fs.existsSync(inputPath)) {
      const inputMtime = fs.statSync(inputPath).mtimeMs;
      if (inputMtime > journalMtime) {
        return true;
      }
    }
  }

  return false;
}
```

**Why**: Any input change triggers regen. Journal stays fresh.

---

### 9. Duration stability - STORED NOT COMPUTED

**Critical**: Duration must be computed ONCE from stored timestamps, not recomputed from "now".

**Implementation**:
```typescript
// In status extraction
const startTime = timeline.find(e => e.type === 'run_started')?.timestamp;
const endTime = timeline.find(e => e.type === 'stop')?.timestamp;

let duration_seconds: number | null = null;
if (startTime && endTime) {
  const start = new Date(startTime).getTime();
  const end = new Date(endTime).getTime();
  duration_seconds = Math.round((end - start) / 1000);
}

// Store in journal, never recompute
```

**Why**: Journal is a snapshot. "How long did it run" should be immutable.

---

### 10. Diff stats safety - NULL ON GIT FAILURE

**All git commands wrapped**:
```typescript
async function extractChanges(
  runDir: string,
  base_sha: string | null,
  head_sha: string | null,
  warnings: string[]
): Promise<JournalJson['changes']> {
  // If SHAs missing, can't compute diff
  if (!base_sha || !head_sha) {
    warnings.push('Cannot compute changes: base_sha or head_sha missing');
    return {
      base_sha,
      head_sha,
      files_changed: null,
      insertions: null,
      deletions: null,
      top_files: null,
      diff_stat: null
    };
  }

  try {
    const numstat = execSync(`git diff --numstat ${base_sha}..${head_sha}`, {
      cwd: runDir,
      encoding: 'utf-8'
    });
    // ... parse and return
  } catch (err) {
    warnings.push(`Git diff failed: ${err.message}. Changes unavailable.`);
    return {
      base_sha,
      head_sha,
      files_changed: null,
      insertions: null,
      deletions: null,
      top_files: null,
      diff_stat: null
    };
  }
}
```

**Why**: Never crash. Always produce partial journal.

---

## Green Light Criteria (ALL MET)

✅ `journal.json` contains: `schema_version`, `generated_by`, `generated_at`, `warnings[]`, `extraction`
✅ Builder never throws for missing files/git failures
✅ Checkpoints extraction emits warning if pattern mismatch
✅ Verification attempt counts based on one clearly-defined event type (timeline `verification` events)
✅ Regen logic checks mtimes for state + notes + timeline + stop.json
✅ Error excerpts capped by lines (60) AND bytes (5KB)
✅ Checkpoint timestamps use committer time (`%ct`)
✅ Duration computed once from stored timestamps, never recomputed
✅ Diff stats return null + warning on git failure
✅ Warnings section rendered in markdown

---

## Updated Schema (FINAL)

```typescript
interface JournalJson {
  // Meta
  schema_version: "1.0";
  generated_by: string;
  generated_at: string;

  // Identity
  run_id: string;
  repo_root: string;
  base_sha: string | null;
  head_sha: string | null;
  task: {
    path: string | null;
    sha256: string | null;
    title: string | null;
    goal: string | null;
  };

  // Status
  status: {
    phase: string;
    terminal_state: "complete" | "stopped" | "running" | "unknown";
    stop_reason: string | null;
    duration_seconds: number | null;  // Computed ONCE from timestamps
    timestamps: {
      started_at: string | null;
      ended_at: string | null;
    };
  };

  // Milestones/Checkpoints
  milestones: {
    attempted: number;       // milestone_index + 1 (or 0 if -1)
    total: number;           // state.milestones.length
    verified: number;        // 0 for stopped runs
  };
  checkpoints: {
    created: number;
    list: Array<{
      milestone_index: number;
      title: string;
      sha: string;
      created_at: string;    // ISO from committer time (%ct)
    }>;
    last_sha: string | null;
  };

  // Verification
  verification: {
    summary: {
      attempts_total: number;      // Verification RUNS
      attempts_passed: number;
      attempts_failed: number;
      total_duration_seconds: number;
    };
    last_failure: {
      command: string;
      exit_code: number;
      error_excerpt: string;       // Last 60 lines OR 5KB, redacted
      log_path: string;
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
    path: string;
  };

  // Resume
  resumed_from: {
    run_id: string;
    checkpoint_sha: string;
  } | null;

  // Provenance (NEW)
  extraction: {
    checkpoints: "git_log_v1" | "none";
    verification: "timeline_v1" | "none";
    next_action: "stop_json" | "derived" | "none";
  };

  // Warnings (REQUIRED)
  warnings: string[];
}
```

---

## Phase 1 Ready Checklist

- [x] Schema finalized with all fields
- [x] All extraction sources verified
- [x] All error paths return null + warning
- [x] Excerpt capping (lines + bytes)
- [x] Checkpoint timestamps use %ct
- [x] Duration computed once
- [x] Regen checks all inputs
- [x] Extraction metadata included
- [x] Warnings rendered in markdown
- [x] Terminal state checking hardened

---

**Status**: ✅ READY TO START PHASE 1

**Next**: Implement `src/journal/builder.ts` with all fixes baked in.
