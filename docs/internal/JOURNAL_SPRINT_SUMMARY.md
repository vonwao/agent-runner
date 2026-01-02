# Run Journal Sprint - Executive Summary

**Full plan**: [JOURNAL_SPRINT_PLAN.md](./JOURNAL_SPRINT_PLAN.md)

---

## What This Solves

Your pain: **"I do a task and forget what I did, lose history of notes, can't reconstruct what happened."**

Journal turns Runr from "reliability during execution" to **"reliability across time."**

Promise: **Every run leaves a case file that you can read in 2 minutes and act on in 10 seconds.**

---

## What You Get (v1)

### Files per run:
```
.runr/runs/<RUN_ID>/
├── journal.json         # Machine-readable snapshot (schema v1.0)
├── journal.md           # Human-readable case file
└── notes.jsonl          # Append-only notes (optional)
```

### Commands:
```bash
runr journal <run_id>        # View case file (markdown)
runr journal <run_id> --json # Machine-readable output
runr journal <run_id> --write # Force regenerate
runr note <run_id> "..."     # Add timestamped note
runr open <run_id>           # Print paths (journal, worktree, etc.)
```

### Auto-generated on every run completion/stop

No extra work. Just `runr run` and you get a permanent case file.

---

## What's In a Journal

**journal.json** (schema v1.0):
- Run identity (run_id, repo, base_sha, head_sha, task sha256)
- Status (phase, stop_reason, timestamps)
- Checkpoints (milestone index, title, sha, created_at)
- Verification summary (passed/failed counts, last failure with redacted error excerpt)
- Changes (git diff stats, files changed, top 10 files by line changes)
- Next action (from stop.json if available)
- Notes metadata (count, path)
- Resume context (if resumed from checkpoint)

**journal.md**: Human-readable rendering of above + compiled notes.

**notes.jsonl**: Append-only timestamped notes you add manually.

---

## Architecture Wins (No Corners Cut)

✅ **Snapshot vs Living Log**: Facts immutable, notes append-only
✅ **Idempotent**: Same input → same output, safe to regenerate
✅ **Atomic Writes**: temp → rename, never corrupted
✅ **Missing Data Resilience**: Never crash, emit partial + warnings
✅ **Secret Redaction**: Basic DLP (AWS keys, API tokens, etc.)
✅ **Schema Versioned**: Forward-compatible, additive-only fields
✅ **Run Identity**: Unique by run_id + base_sha + head_sha + task_sha256
✅ **Git SHA Pinning**: Always uses stored SHAs, not current HEAD

---

## Edge Cases Handled

- Timeline truncated/missing → partial journal + warning
- Verification didn't run → summary shows N/A
- Git commands fail → partial journal + warning
- Worktree deleted → uses stored SHAs from snapshot
- Non-git repo → journal without change tracking
- Multiple verify commands → shows last failure chronologically
- Resume runs → includes `resumed_from` field
- Monorepo → scoped to base..head SHA range
- Secret leakage → redacts common patterns in error excerpts

---

## Timeline (1 Day Sprint)

**Morning** (3h): Core snapshot builder + redactor + tests
**Midday** (2h): Markdown renderer + tests
**Afternoon** (2-3h): CLI commands + auto-write hook + tests
**Late** (1h): Manual testing + README + example journal

**Ship**: Bump to v0.4.0, publish to npm

---

## Test Coverage

**Unit tests** (6 suites):
- builder.test.ts (complete data, missing data, git failures, redaction)
- renderer.test.ts (full render, missing sections, markdown validity)
- redactor.test.ts (AWS keys, API keys, Bearer tokens, private keys)
- journal.test.ts (regeneration, --write, --json flags)
- note.test.ts (append, create, multiple notes)
- open.test.ts (paths, missing worktree)

**Integration tests**:
- Full run → journal exists
- Failed run → journal includes next_action
- Notes → appear in journal
- Resume → includes resumed_from

**Manual tests**:
- Dogfood run 20260102075326
- Empty repo
- Non-git repo

---

## Out of Scope (Don't Build)

❌ Fancy diff hunks
❌ Full timeline summarization
❌ TUI editor
❌ GitHub PR linking
❌ Structured known_issues
❌ Notes tags/severity
❌ Multi-author notes
❌ Journal search/filter
❌ Web UI

**Ship v1, get signal, iterate.**

---

## Launch Impact

**README addition**: "Case Files" section with example
**Demo asset**: `docs/examples/dogfood-journal.md` (from real run)
**Show HN pitch update**: Add journal as retention wedge

---

## Risks Mitigated

1. Git failures → Wrapped in try-catch, partial journal
2. Large error logs → Only last 60 lines, capped at 5KB
3. Secret leakage → Basic regex redaction
4. Slow regeneration → Cached, only regen if stale
5. Windows paths → Use path.join everywhere

---

## Definition of Done

✅ All tests pass
✅ `runr journal 20260102075326` works
✅ `runr note` works
✅ `runr open` works
✅ README updated
✅ Example journal.md committed
✅ No regressions
✅ Published to npm as v0.4.0

---

## Decision Point

**Read full plan**: [JOURNAL_SPRINT_PLAN.md](./JOURNAL_SPRINT_PLAN.md)

**Questions to validate**:
1. Is this the right scope for v1? (Not too big, not too small)
2. Does this solve your "I forget what I did" pain?
3. Any must-haves missing from v1 scope?
4. Any nice-to-haves that should be cut?
5. Ready to start Phase 1 (builder)?

**If approved**: Start implementation immediately.
**If changes needed**: Mark up the plan, I'll revise.
