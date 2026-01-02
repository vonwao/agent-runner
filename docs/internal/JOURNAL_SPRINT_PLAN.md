# Run Journal Feature - Sprint Plan

**Goal**: Build Run Journal v1 to solve: "I do a task and forget what I did, lose history of notes, can't reconstruct what happened."

**Timeline**: 1 day sprint before Show HN launch

**Status**: Pre-implementation planning ✅ COMPLETE AND SOLID

---

## Product Vision

### What Journal Is

Runr today is "reliability during execution."
**Journal makes it "reliability across time."**

Promise: **Every run leaves a case file that you can read in 2 minutes and act on in 10 seconds.**

### Core Wedges

1. **Primary (acquisition)**: Checkpoint + resume when agent fails
2. **Secondary (retention)**: Every run has a permanent case file

---

## Architecture Decisions

### 1. Snapshot vs Living Log (CRITICAL)

**Snapshot fields** (immutable facts at terminal time):
- Run identity (run_id, repo_root, base_sha, head_sha, task_sha256)
- Status (phase, stop_reason, terminal_state, timestamps)
- Checkpoints (milestone_index, title, sha, created_at)
- Verification (pass/fail counts, last failure command + excerpt + log path)
- Changes (git diff stats, files_changed, insertions/deletions, top files)
- Next action (from stop.json if available)

**Living fields** (can grow after run):
- Notes (append-only JSONL, never rewrite)
- Follow-ups (optional markdown checkboxes in journal.md)

**Rule**: journal.json snapshot is pinned to base_sha + head_sha at terminal time. git commands always use stored SHAs, not current HEAD.

### 2. Schema Versioning

Every journal.json includes:
```json
{
  "schema_version": "1.0",
  "generated_by": "runr@0.3.1",
  "generated_at": "2026-01-02T21:18:44Z",
  ...
}
```

- Future fields MUST be additive only
- Markdown rendering MUST tolerate unknown fields
- Never break old journal readers

### 3. Idempotency + Determinism

`runr journal --write` MUST be safe to run repeatedly:
- Same inputs → identical journal.json output
- Deterministic ordering (checkpoints by index, verify attempts by timestamp)
- No non-deterministic paths unless clearly labeled
- Atomic writes (temp → rename, never corrupted half-files)

### 4. Resilience to Missing Data

Journal MUST handle gracefully:
- Timeline truncated or missing
- Verification didn't run
- base/head SHA missing
- git commands fail (detached head, shallow clone, missing remote)
- worktree deleted/moved
- No plan.md
- No task file

**Rule**: Never crash. Emit partial journal with "Missing data" warnings section.

### 5. Security/Privacy (Basic DLP)

Error excerpts can leak secrets. Minimum redaction pass on:
- `AWS_SECRET_ACCESS_KEY=...`
- `OPENAI_API_KEY=...`
- `Bearer <token>`
- `-----BEGIN PRIVATE KEY-----`
- Any env var with `SECRET`, `KEY`, `TOKEN`, `PASSWORD` in name

Don't need perfect DLP, but MUST have guardrails.

### 6. Run Identity Integrity

To trust journals, run must be uniquely defined:
```json
{
  "run_id": "20260102075326",
  "repo_root": "/Users/vonwao/dev/agent-framework",
  "base_sha": "61f830b149dbcb7ed4f0b64ac1cbb6d2ca737f8e",
  "head_sha": "5c98ffa...",
  "task": {
    "path": ".runr/tasks/dogfood-01-polish-init.md",
    "sha256": "abc123...",
    "title": "Dogfood Task 01: Polish Init Command",
    "goal": "Improve runr init detection and UX..."
  }
}
```

This prevents "journal says X but repo moved" confusion.

---

## Data Model

### File Structure

```
.runr/runs/<RUN_ID>/
├── journal.json         # Machine-readable snapshot
├── journal.md           # Human-readable case file
├── notes.jsonl          # Append-only notes (optional)
└── ... (existing files)
```

### journal.json Schema v1.0

```typescript
interface JournalJson {
  // Meta
  schema_version: "1.0";
  generated_by: string;        // "runr@0.3.1"
  generated_at: string;         // ISO timestamp

  // Identity
  run_id: string;
  repo_root: string;
  base_sha: string;
  head_sha: string;
  task: {
    path: string;
    sha256: string;
    title: string | null;       // Parsed from first H1
    goal: string | null;         // Parsed from "## Goal" section
  };

  // Status
  status: {
    phase: string;               // PLAN, IMPLEMENT, VERIFY, etc.
    terminal_state: "complete" | "stopped" | "running" | "unknown";
    stop_reason: string | null;
    exit_code: number | null;
    timestamps: {
      started_at: string | null;
      ended_at: string | null;
    };
  };

  // Checkpoints
  checkpoints: Array<{
    milestone_index: number;
    title: string;
    sha: string;
    created_at: string;          // ISO timestamp
  }>;
  last_checkpoint_sha: string | null;

  // Verification
  verification: {
    summary: {
      passed: number;
      failed: number;
      total_attempts: number;
      total_duration_seconds: number;
    };
    last_failure: {
      command: string;
      exit_code: number;
      error_excerpt: string;      // Last 60 lines, redacted
      log_path: string;
    } | null;
  };

  // Changes
  changes: {
    base_sha: string;            // Redundant but explicit
    head_sha: string;
    files_changed: number;
    insertions: number;
    deletions: number;
    top_files: Array<{           // Top 10 by line changes
      path: string;
      insertions: number;
      deletions: number;
    }>;
    diff_stat: string;           // `git diff --stat base..head` output
  };

  // Next Action
  next_action: {
    title: string;
    command: string;
    why: string;
  } | null;

  // Notes metadata (but not content)
  notes: {
    count: number;
    path: string;                // Relative to run dir
  };

  // Resume context (if this was a resume)
  resumed_from: {
    run_id: string;
    checkpoint_sha: string;
  } | null;
}
```

### notes.jsonl Schema

```jsonl
{"ts":"2026-01-02T21:18:44Z","author":"user","text":"Verification failing due to workspace deps not installed. Try pnpm -w i in worktree."}
{"ts":"2026-01-02T21:22:10Z","author":"user","text":"Fixed by installing deps. Resuming now."}
```

Fields:
- `ts`: ISO timestamp
- `author`: "user" (v1 only supports manual notes)
- `text`: Free-form note text
- (Future: `tags`, `files`, `severity`)

### journal.md Template

```markdown
# Run Journal: <TITLE>

**Run ID**: `<run_id>`
**Status**: <terminal_state> (<stop_reason>)
**Duration**: <duration> seconds
**Started**: <started_at>
**Ended**: <ended_at>

---

## Task

**File**: `<task_path>`
**SHA256**: `<task_sha256>`

### Goal

<task_goal>

### Requirements

<task_requirements if parseable>

---

## Status

- **Phase**: <phase>
- **Outcome**: <terminal_state>
- **Stop Reason**: <stop_reason>
- **Milestones Completed**: <X> / <Y>

---

## Checkpoints

<if no checkpoints>
No checkpoints created.
</if>

<if checkpoints exist>
| Milestone | SHA | Created At |
|-----------|-----|------------|
| 1. <title> | `<sha>` | <timestamp> |
| 2. <title> | `<sha>` | <timestamp> |
| 3. <title> | `<sha>` | <timestamp> |

**Last Checkpoint**: `<last_checkpoint_sha>`
</if>

---

## Verification

**Summary**:
- Passed: <passed>
- Failed: <failed>
- Total Attempts: <total_attempts>
- Duration: <total_duration_seconds>s

<if last_failure>
**Last Failure**:
```
Command: <command>
Exit Code: <exit_code>

<error_excerpt (redacted)>
```

Full log: `<log_path>`
</if>

---

## Changes

**Summary**:
- Files Changed: <files_changed>
- Insertions: +<insertions>
- Deletions: -<deletions>

**Top Changed Files**:
<if top_files>
| File | +/- |
|------|-----|
| `<path>` | +<ins> -<del> |
...
</if>

**Diff Stat**:
```
<git diff --stat base_sha..head_sha>
```

---

## Next Action

<if next_action>
**Recommended**: <title>

```bash
<command>
```

**Why**: <why>
</if>

---

## Notes

<if notes exist>
- [<timestamp>] <text>
- [<timestamp>] <text>
...
</if>

<if no notes>
No notes recorded.

Add a note: `runr note <run_id> "Your note here"`
</if>

---

## Follow-Ups

<if notes or failures>
- [ ] Review verification logs
- [ ] Check checkpoint commits
- [ ] Resume from last checkpoint
</if>

---

*Journal generated by runr@<version> at <generated_at>*
*Schema version: <schema_version>*
```

---

## Implementation Phases

### Phase 1: Core Snapshot Builder (Morning, ~3 hours)

**Objective**: Implement `buildJournal(runId, repo)` that extracts snapshot data.

**Files**:
- `src/journal/builder.ts` (new)
- `src/journal/types.ts` (new)
- `src/journal/redactor.ts` (new)

**Data sources**:
1. **Run identity**:
   - `run_id` from argument
   - `repo_root` from `getRunsRoot()`
   - `base_sha`, `head_sha` from `config.snapshot.json → _worktree`
   - Task path from `artifacts/task.meta.json`
   - Task SHA256: hash the task file
   - Task title/goal: parse markdown H1 and "## Goal" section

2. **Status**:
   - Read `state.json` for phase, stop_reason
   - Read `summary.json` for terminal_state, timestamps

3. **Checkpoints**:
   - Read `handoffs/milestone_*.md` filenames
   - For each, extract milestone index
   - `git log --format=%H,%at <base_sha>..<head_sha>` to get commits
   - Match commits to milestones via "chore(agent): checkpoint milestone X" pattern
   - Sort by milestone index

4. **Verification**:
   - Read `timeline.jsonl` for all `verification` events
   - Count passed/failed
   - Extract last failure command + exit_code
   - Read corresponding log file (e.g., `artifacts/tests_tier1.log`)
   - Extract last 60 lines, pass through redactor

5. **Changes**:
   - `git diff --stat <base_sha>..<head_sha>` (use stored SHAs!)
   - `git diff --numstat <base_sha>..<head_sha>` to get file-level stats
   - Parse to get top 10 files by total line changes

6. **Next Action**:
   - Read `handoffs/stop.json` if exists
   - Extract first `next_actions[0]`

7. **Notes**:
   - Count lines in `notes.jsonl` if exists
   - Store path relative to run dir

8. **Resume context**:
   - Check `timeline.jsonl` for `resumed_from` event
   - Extract run_id, checkpoint_sha if present

**Resilience**:
- Wrap every git command in try-catch
- If git command fails, set field to null + add warning
- If file doesn't exist, set field to null + add warning
- Collect all warnings in `warnings: string[]` field

**Security**:
- Implement `redactSecrets(text: string): string` in `redactor.ts`
- Basic regex patterns for common secrets
- Apply to error excerpts before storing

**Output**:
- Returns `JournalJson` object
- Includes `warnings` array if any data missing
- Deterministic ordering (no random object key order)

**Tests**:
- `builder.test.ts`: Test with complete run data
- Test with missing timeline
- Test with missing verification
- Test with git command failures
- Test redaction on sample error output

---

### Phase 2: Markdown Renderer (Midday, ~2 hours)

**Objective**: Implement `renderJournalMd(journal, notes?)` → string.

**Files**:
- `src/journal/renderer.ts` (new)

**Logic**:
1. Read `journal.json`
2. Optionally read `notes.jsonl` and parse to array
3. Render template (see template above)
4. Handle missing sections gracefully (show "N/A" or "No data")

**Tests**:
- `renderer.test.ts`: Test with full journal
- Test with missing checkpoints
- Test with missing notes
- Test with missing verification
- Verify markdown validity (no broken tables, code blocks)

---

### Phase 3: CLI Commands (Afternoon, ~2 hours)

**Files**:
- `src/commands/journal.ts` (new)
- `src/commands/note.ts` (new)
- `src/commands/open.ts` (new)
- `src/cli.ts` (register commands)

#### `runr journal <run_id>`

**Behavior**:
1. Check if `journal.md` exists
2. If not exists OR older than state.json → regenerate
3. Print to stdout (no pager)

**Flags**:
- `--json`: Print `journal.json` instead of markdown
- `--write`: Force write journal files (idempotent)
- `--repo <path>`: Target repo

**Implementation**:
```typescript
export async function journalCommand(runId: string, options: JournalOptions): Promise<void> {
  const resolvedRunId = resolveRunId(runId, options.repo);
  const runDir = path.join(getRunsRoot(options.repo), resolvedRunId);

  const journalJsonPath = path.join(runDir, 'journal.json');
  const journalMdPath = path.join(runDir, 'journal.md');

  // Check if regeneration needed
  const stateJsonPath = path.join(runDir, 'state.json');
  const needsRegen = shouldRegenerate(journalMdPath, stateJsonPath);

  if (options.write || needsRegen) {
    // Build and write journal
    const journal = await buildJournal(resolvedRunId, options.repo);
    await writeJournalAtomic(journalJsonPath, journal);

    const notes = await readNotes(path.join(runDir, 'notes.jsonl'));
    const md = renderJournalMd(journal, notes);
    await writeFileAtomic(journalMdPath, md);

    if (options.write) {
      console.log(`Journal written to ${journalMdPath}`);
    }
  }

  // Output
  if (options.json) {
    const journal = JSON.parse(fs.readFileSync(journalJsonPath, 'utf-8'));
    console.log(JSON.stringify(journal, null, 2));
  } else {
    const md = fs.readFileSync(journalMdPath, 'utf-8');
    console.log(md);
  }
}
```

#### `runr note <run_id> "text"`

**Behavior**:
1. Append timestamped note to `notes.jsonl`
2. Invalidate journal.md (delete or mark stale)
3. Print confirmation

**Implementation**:
```typescript
export async function noteCommand(runId: string, text: string, options: NoteOptions): Promise<void> {
  const resolvedRunId = resolveRunId(runId, options.repo);
  const runDir = path.join(getRunsRoot(options.repo), resolvedRunId);
  const notesPath = path.join(runDir, 'notes.jsonl');

  const note = {
    ts: new Date().toISOString(),
    author: 'user',
    text: text
  };

  // Append to JSONL (create if doesn't exist)
  fs.appendFileSync(notesPath, JSON.stringify(note) + '\n', 'utf-8');

  // Invalidate journal.md (delete so it regenerates on next read)
  const journalMdPath = path.join(runDir, 'journal.md');
  if (fs.existsSync(journalMdPath)) {
    fs.unlinkSync(journalMdPath);
  }

  console.log(`Note added to run ${resolvedRunId}`);
  console.log(`  "${text}"`);
}
```

#### `runr open <run_id>`

**Behavior**:
Print paths for quick access.

**Implementation**:
```typescript
export async function openCommand(runId: string, options: OpenOptions): Promise<void> {
  const resolvedRunId = resolveRunId(runId, options.repo);
  const runDir = path.join(getRunsRoot(options.repo), resolvedRunId);

  const journalMdPath = path.join(runDir, 'journal.md');
  const notesPath = path.join(runDir, 'notes.jsonl');

  // Read config.snapshot.json for worktree path
  const configSnapshot = JSON.parse(fs.readFileSync(path.join(runDir, 'config.snapshot.json'), 'utf-8'));
  const worktreePath = configSnapshot._worktree?.effective_repo_path;

  console.log(`Run: ${resolvedRunId}`);
  console.log(`  Dir: ${runDir}`);
  console.log(`  Journal: ${journalMdPath}`);
  console.log(`  Notes: ${notesPath}`);
  if (worktreePath) {
    console.log(`  Worktree: ${worktreePath}`);
  }

  // Also print checkpoint SHA if available
  const journalJsonPath = path.join(runDir, 'journal.json');
  if (fs.existsSync(journalJsonPath)) {
    const journal = JSON.parse(fs.readFileSync(journalJsonPath, 'utf-8'));
    if (journal.last_checkpoint_sha) {
      console.log(`  Last Checkpoint: ${journal.last_checkpoint_sha}`);
    }
  }
}
```

**Tests for commands**:
- `journal.test.ts`: Test all flags, regeneration logic
- `note.test.ts`: Test append, multiple notes
- `open.test.ts`: Test path printing

---

### Phase 4: Auto-Write Hook (Afternoon, ~1 hour)

**Objective**: Automatically generate journal when run reaches terminal state.

**Files**:
- `src/supervisor/supervisor.ts` (modify)

**Hook location**: In supervisor, after writing `state.json` for terminal states.

**Logic**:
```typescript
// After stop/complete
runStore.writeState(state);

// Auto-write journal
if (state.phase === 'STOPPED' || state.phase === 'COMPLETE') {
  try {
    const journal = await buildJournal(runId, repoPath);
    await writeJournalAtomic(path.join(runDir, 'journal.json'), journal);

    const notes = await readNotes(path.join(runDir, 'notes.jsonl'));
    const md = renderJournalMd(journal, notes);
    await writeFileAtomic(path.join(runDir, 'journal.md'), md);
  } catch (err) {
    // Log warning but don't fail run
    console.warn(`Warning: Failed to generate journal: ${err}`);
  }
}
```

**Tests**:
- Integration test: Run completes → journal.json and journal.md exist
- Integration test: Run stops → journal.json includes stop handoff

---

## Edge Cases to Handle

### 1. Multiple Verification Commands

**Problem**: tier0 has 2 commands, tier1 has 1. Which failed last?

**Solution**: Parse `timeline.jsonl` for ALL `verification` events. Take the last one chronologically with `ok: false`. Extract `command_results` array and find the failing command.

### 2. Retries

**Problem**: Verification failed 3 times. How to show this?

**Solution**:
- Count total verification attempts in summary
- Show "failed after N attempts" in last_failure
- Include all attempt durations in total_duration_seconds

### 3. Resume Runs

**Problem**: Run was resumed from checkpoint. How to show this?

**Solution**:
- Check `timeline.jsonl` for `resumed_from` event
- Extract `run_id` and `checkpoint_sha`
- Include in `journal.json.resumed_from` field
- In markdown, add section: "Resumed from run <run_id> at checkpoint <sha>"

### 4. Non-Git Repos

**Problem**: User runs in a directory without git.

**Solution**:
- All git commands wrapped in try-catch
- If git fails, set `base_sha`, `head_sha`, `changes` to null
- Add warning: "Git repository not available. Change tracking disabled."
- Journal still generated with other data

### 5. Worktree Deleted/Moved

**Problem**: Worktree was deleted after run.

**Solution**:
- Don't rely on worktree existing
- Use `config.snapshot.json → _worktree.base_sha` and `head_sha` from snapshot
- If git commands fail, add warning but continue

### 6. Monorepos

**Problem**: `git diff` in monorepo shows changes in other packages.

**Solution**:
- Use `base_sha..head_sha` range (not `HEAD`)
- This scopes diff to the run's changes only
- If user wants to filter by `scope.allowlist`, add flag later (out of v1 scope)

### 7. Windows Paths

**Problem**: Path separators differ.

**Solution**:
- Use `path.join()` everywhere (never hardcode `/`)
- `path.relative()` for display paths
- Test on Windows if time permits (otherwise document limitation)

---

## Test Plan

### Unit Tests

1. **builder.test.ts**:
   - ✅ Builds complete journal from full run data
   - ✅ Handles missing timeline.jsonl
   - ✅ Handles missing verification events
   - ✅ Handles git command failures (mocked)
   - ✅ Redacts secrets in error excerpts
   - ✅ Deterministic output (same input → same output)

2. **renderer.test.ts**:
   - ✅ Renders complete journal.md from full journal.json
   - ✅ Handles missing checkpoints section
   - ✅ Handles missing notes section
   - ✅ Handles missing verification section
   - ✅ Valid markdown (no broken tables/code blocks)

3. **redactor.test.ts**:
   - ✅ Redacts AWS keys
   - ✅ Redacts API keys
   - ✅ Redacts Bearer tokens
   - ✅ Redacts private keys
   - ✅ Doesn't over-redact (false positives)

4. **journal.test.ts** (command):
   - ✅ Generates journal on first call
   - ✅ Reuses cached journal if fresh
   - ✅ Regenerates if state.json newer than journal.md
   - ✅ `--write` flag forces regeneration
   - ✅ `--json` flag outputs JSON

5. **note.test.ts** (command):
   - ✅ Appends note to notes.jsonl
   - ✅ Creates notes.jsonl if doesn't exist
   - ✅ Multiple notes preserve order
   - ✅ Invalidates journal.md after note

6. **open.test.ts** (command):
   - ✅ Prints all paths correctly
   - ✅ Handles missing worktree gracefully
   - ✅ Includes checkpoint SHA if available

### Integration Tests

1. **Full run cycle**:
   - ✅ Run completes successfully
   - ✅ journal.json exists and valid
   - ✅ journal.md exists and readable
   - ✅ `runr journal <run_id>` prints markdown
   - ✅ `runr journal <run_id> --json` prints JSON

2. **Failed run cycle**:
   - ✅ Run stops with verification failure
   - ✅ journal.json includes last_failure with error excerpt
   - ✅ journal.json includes next_action from stop.json
   - ✅ journal.md shows verification failure section

3. **Notes cycle**:
   - ✅ `runr note <run_id> "note 1"`
   - ✅ `runr note <run_id> "note 2"`
   - ✅ `runr journal <run_id>` shows both notes in order
   - ✅ notes.jsonl has 2 lines

4. **Resume cycle**:
   - ✅ Run fails with checkpoints
   - ✅ `runr resume <run_id>`
   - ✅ Resumed run's journal.json includes `resumed_from` field

### Manual Testing Checklist

- [ ] Run journal on dogfood run 20260102075326
- [ ] Verify all sections render correctly
- [ ] Add note, verify it appears in journal
- [ ] Run on empty/new repo (minimal data)
- [ ] Run on non-git directory (graceful degradation)
- [ ] Verify redaction on real error logs

---

## Success Criteria

### Minimum Viable v1

- ✅ `runr journal <run_id>` prints human-readable case file
- ✅ `runr journal <run_id> --json` prints machine-readable JSON
- ✅ `runr journal <run_id> --write` generates/updates journal files
- ✅ `runr note <run_id> "text"` appends timestamped note
- ✅ `runr open <run_id>` prints paths for quick access
- ✅ Auto-write on terminal state (complete/stopped)
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ Handles missing data gracefully (no crashes)
- ✅ Basic secret redaction works
- ✅ Idempotent writes (same input → same output)
- ✅ Atomic writes (no corrupted files)

### Launch Readiness

- ✅ README section "Case Files" with example
- ✅ Demo journal.md from dogfood run in repo
- ✅ CLI help text updated
- ✅ No regressions in existing tests

---

## Out of Scope (Post-v1)

**Don't implement in this sprint:**
- Fancy "top diff hunks" extraction
- Full timeline summarization
- TUI editor for notes
- GitHub PR/issue linking
- Structured `known_issues[]` field
- Notes tags/severity/files
- Multi-author notes (future: agent notes)
- Journal diffs across runs
- Search/filter journals by tags

---

## README Section (Launch)

Add to `README.md` under "How It Works":

```markdown
## Case Files

Every run leaves a permanent journal:

```bash
runr journal <run_id>        # View case file
runr journal <run_id> --json # Machine-readable
runr note <run_id> "..."     # Add timestamped note
```

**What's in a journal?**
- Task goal and requirements
- Checkpoints with git SHAs
- Verification results (pass/fail + error excerpts)
- Changes summary (files, insertions, deletions)
- Next action (if stopped)
- Your notes (append-only, never lost)

**Example**: [dogfood-journal.md](docs/examples/dogfood-journal.md)

Journals are automatically generated when runs complete or stop.
```

---

## File Checklist

### New Files to Create

- [ ] `src/journal/types.ts` - TypeScript interfaces
- [ ] `src/journal/builder.ts` - buildJournal() function
- [ ] `src/journal/renderer.ts` - renderJournalMd() function
- [ ] `src/journal/redactor.ts` - redactSecrets() function
- [ ] `src/journal/atomic.ts` - writeFileAtomic() helper
- [ ] `src/commands/journal.ts` - CLI command
- [ ] `src/commands/note.ts` - CLI command
- [ ] `src/commands/open.ts` - CLI command
- [ ] `tests/journal/builder.test.ts` - Unit tests
- [ ] `tests/journal/renderer.test.ts` - Unit tests
- [ ] `tests/journal/redactor.test.ts` - Unit tests
- [ ] `tests/commands/journal.test.ts` - Command tests
- [ ] `tests/commands/note.test.ts` - Command tests
- [ ] `tests/commands/open.test.ts` - Command tests
- [ ] `test/acceptance/journal.test.ts` - Integration tests
- [ ] `docs/examples/dogfood-journal.md` - Example output

### Files to Modify

- [ ] `src/cli.ts` - Register journal, note, open commands
- [ ] `src/supervisor/supervisor.ts` - Add auto-write hook
- [ ] `README.md` - Add "Case Files" section
- [ ] `package.json` - Bump version to 0.4.0 after ship

---

## Risk Mitigation

### Risk 1: Git Commands Fail in Edge Cases

**Mitigation**: Wrap ALL git commands in try-catch. Return partial journal with warnings. Never crash.

### Risk 2: Large Error Logs Blow Up Memory

**Mitigation**: Only read last 60 lines of error logs. Use `tail -n 60` or read file in reverse. Cap excerpt at 5KB.

### Risk 3: Secret Redaction Misses Patterns

**Mitigation**: Start with basic regex. Document limitation. Can improve iteratively based on user reports.

### Risk 4: Atomic Writes Fail on Windows

**Mitigation**: Test on macOS/Linux first. Document Windows limitation if found. Add Windows CI later.

### Risk 5: Journal.md Regeneration is Slow

**Mitigation**: Cache journal.md. Only regenerate if state.json is newer. Add `--write` flag to force.

---

## Definition of Done

Sprint is DONE when:

1. ✅ All unit tests pass (`npm test`)
2. ✅ All integration tests pass
3. ✅ Manual testing checklist complete
4. ✅ `runr journal 20260102075326` produces readable output
5. ✅ `runr note 20260102075326 "test"` works
6. ✅ `runr open 20260102075326` prints paths
7. ✅ README updated with "Case Files" section
8. ✅ Example journal.md committed to repo
9. ✅ No regressions in existing features
10. ✅ Built and published to npm as v0.4.0

---

## Implementation Order (Optimized)

**Morning** (3 hours):
1. Create type definitions (`types.ts`)
2. Implement secret redactor (`redactor.ts`) + tests
3. Implement builder (`builder.ts`) - bulk of work here
4. Write builder unit tests

**Midday** (2 hours):
5. Implement renderer (`renderer.ts`)
6. Write renderer unit tests
7. Implement atomic write helper (`atomic.ts`)

**Afternoon** (2-3 hours):
8. Implement CLI commands (journal, note, open)
9. Register in CLI
10. Write command unit tests
11. Add auto-write hook to supervisor
12. Write integration tests

**Late Afternoon** (1 hour):
13. Manual testing on dogfood run
14. Generate example journal.md
15. Update README
16. Final test pass

**Ship**:
17. Commit with message: "feat: add run journal (v1)"
18. Bump to v0.4.0
19. Publish to npm
20. Update Show HN post draft to include Journal feature

---

## Questions to Answer During Implementation

- [ ] Should journal.md include full task content or just link?
  - **Answer**: Just title + goal excerpt. Link to task file path.

- [ ] Should we show ALL verification attempts or just summary?
  - **Answer**: Summary + last failure only. Full timeline is too noisy for v1.

- [ ] Should checkpoints show full commit messages or just SHAs?
  - **Answer**: SHA + parsed milestone title from commit message pattern.

- [ ] Should changes section filter by scope.allowlist?
  - **Answer**: No for v1. Show all changes in base..head range. Can add filter later.

- [ ] Should we validate journal.json schema on read?
  - **Answer**: No for v1. Just tolerate unknown fields. Add validation in v2 if needed.

---

## Post-Launch Iteration Ideas

**After Show HN, consider:**
- [ ] `runr journal --diff <run1> <run2>` - Compare two runs
- [ ] `runr journal --search "error"` - Search notes/excerpts
- [ ] Agent-authored notes (phase transitions, decisions)
- [ ] Structured follow-up tasks (like GitHub issues)
- [ ] Journal "tags" for categorization
- [ ] Web UI for browsing journals
- [ ] Export to PDF/HTML

**User signal required first.**

---

**Status**: ✅ PLAN COMPLETE - Ready for implementation

**Next Step**: Review plan with user, get approval, start Phase 1.
