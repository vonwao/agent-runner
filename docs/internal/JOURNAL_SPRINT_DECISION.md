# Journal Sprint - Decision Checklist

Before starting implementation, validate these decisions:

---

## Core Product Questions

### 1. Does this solve your pain?

**Your pain**: "I do a task and forget what I did, lose history of notes, can't reconstruct what happened."

**What Journal gives you**:
- Permanent case file per run (journal.md)
- Machine-readable data (journal.json)
- Append-only notes that never get lost (notes.jsonl)
- Auto-generated on every run completion

**Question**: Does this solve it? Or are we missing something fundamental?

---

### 2. Is the scope right for v1?

**In scope**:
- ✅ Auto-generated snapshot (status, checkpoints, verification, changes)
- ✅ Manual notes (append-only)
- ✅ Markdown rendering
- ✅ CLI commands (journal, note, open)
- ✅ Basic secret redaction

**Out of scope**:
- ❌ Timeline summarization (too noisy for v1)
- ❌ GitHub issue/PR linking
- ❌ Notes tags/severity
- ❌ Agent-authored notes
- ❌ Search/filter

**Question**: Is this the right cut? Anything we absolutely need in v1?

---

### 3. Is the data model right?

**Journal includes**:
- Task (path, sha256, title, goal)
- Status (phase, stop_reason, timestamps)
- Checkpoints (index, title, sha, created_at)
- Verification (summary + last failure with redacted excerpt)
- Changes (diff stats, top 10 files)
- Next action (from stop.json)
- Notes (timestamped, append-only)

**Journal excludes**:
- Full timeline events (too much noise)
- All verification attempts (just summary + last failure)
- Full task content (just title + goal, link to file)
- Diff hunks (just stats for v1)

**Question**: Is this the right level of detail? Too much? Too little?

---

## Architecture Questions

### 4. Snapshot vs Living Log

**Decision**:
- Snapshot fields (status, checkpoints, changes) = immutable at generation time
- Living fields (notes) = append-only, never rewrite
- Git commands always use stored base_sha..head_sha, not current HEAD

**Question**: Does this separation make sense? Or should everything be living?

---

### 5. Regeneration Strategy

**Decision**:
- Auto-generate on run completion/stop
- Cache journal.md
- Regenerate only if:
  - journal.md doesn't exist
  - state.json is newer than journal.md
  - User runs `--write` flag

**Question**: Is this caching strategy right? Or always regenerate?

---

### 6. Notes Integration

**Decision**:
- Notes stored in separate `notes.jsonl` (append-only)
- Compiled into journal.md on render
- Adding note invalidates journal.md (forces regen)

**Question**: Should notes be in separate file or embedded in journal.json?

---

### 7. Secret Redaction

**Decision**:
- Basic regex patterns (AWS keys, API keys, Bearer tokens, private keys)
- Apply to error excerpts only (not full logs)
- Document as "basic DLP, not perfect"

**Question**: Is basic redaction enough for v1? Or need something more robust?

---

## Implementation Questions

### 8. Error Handling Philosophy

**Decision**:
- NEVER crash if data is missing
- Emit partial journal with warnings
- All git commands wrapped in try-catch
- Missing files → null + warning

**Question**: Is "always partial journal + warnings" the right approach?

---

### 9. Test Coverage

**Decision**:
- 6 unit test suites
- 4 integration tests
- Manual testing checklist
- All edge cases covered (missing data, git failures, resume, etc.)

**Question**: Is this test coverage sufficient? Or overkill?

---

### 10. Launch Timing

**Decision**:
- Build Journal v1 BEFORE Show HN launch
- Reason: You need it to dogfood Runr properly
- Timeline: 1 day sprint (today)

**Question**: Are we still going Journal-first, then launch? Or launch now, Journal later?

---

## UX Questions

### 11. Command Names

**Proposed**:
```bash
runr journal <run_id>        # View journal
runr journal <run_id> --json # JSON output
runr journal <run_id> --write # Force regenerate
runr note <run_id> "text"    # Add note
runr open <run_id>           # Print paths
```

**Alternatives considered**:
- `runr case <run_id>` (shorter, but less clear)
- `runr log <run_id>` (conflicts with git log mental model)
- `runr report <run_id>` (already taken by existing command)

**Question**: Are these command names right? Or prefer alternatives?

---

### 12. Default Output Format

**Decision**:
- `runr journal <run_id>` → prints markdown to stdout (no pager)
- Use `--json` flag for machine-readable output

**Question**: Should default be markdown or JSON? Or auto-detect (TTY vs pipe)?

---

### 13. Notes Workflow

**Proposed**:
```bash
# Add note
runr note <run_id> "Verification failing due to X"

# View journal (includes notes)
runr journal <run_id>
```

**Alternative**:
- Interactive editor: `runr note <run_id>` opens $EDITOR
- TUI: `runr journal --edit <run_id>` with cursor navigation

**Question**: Is CLI append-only enough for v1? Or need editor integration?

---

## README / Launch Questions

### 14. Demo Asset

**Decision**:
- Include `docs/examples/journal-example.md` (from dogfood run)
- Show in README "Case Files" section
- Use in Show HN demo

**Question**: Is showing a real failure example the right demo? Or create success example?

---

### 15. Show HN Messaging

**Current wedges**:
1. Primary: "Checkpoints save work when agent fails"
2. Secondary: "Every run leaves a case file" (NEW)

**Question**: Should we lead with Journal or keep it as secondary? Or save Journal for retention, not acquisition?

---

## Version Bump

### 16. Semver

**Proposed**: v0.3.1 → v0.4.0 (minor bump, new feature)

**Alternatives**:
- v0.3.2 (patch, if we consider it a "fix" for missing feature)
- v1.0.0 (major, if we consider this "launch-ready")

**Question**: Is v0.4.0 the right version?

---

## Risks

### 17. Anything Missing?

**Known risks + mitigations**:
- Git failures → try-catch + partial journal ✅
- Large error logs → last 60 lines only ✅
- Secret leakage → basic redaction ✅
- Slow regeneration → caching + --write flag ✅
- Windows paths → path.join everywhere ✅

**Question**: Any other risks we're not addressing?

---

## Final Decision

**If all above look good**:
- ✅ Start Phase 1 (builder) immediately
- ✅ Follow implementation order in plan
- ✅ Ship as v0.4.0 today

**If changes needed**:
- 🔄 Mark up [JOURNAL_SPRINT_PLAN.md](./JOURNAL_SPRINT_PLAN.md)
- 🔄 Specify what to change
- 🔄 I'll revise plan before starting

**If scope too big**:
- 📉 Propose what to cut for v1
- 📉 Move to v2 roadmap

**If timing wrong**:
- ⏸️ Skip Journal, launch Show HN now
- ⏸️ Build Journal after user signal

---

## User Sign-Off

**[ ]** I've read [JOURNAL_SPRINT_SUMMARY.md](./JOURNAL_SPRINT_SUMMARY.md)
**[ ]** I've reviewed [JOURNAL_SPRINT_PLAN.md](./JOURNAL_SPRINT_PLAN.md)
**[ ]** I've seen the [example output](../examples/journal-example.md)
**[ ]** I've validated all 17 decisions above
**[ ]** I'm ready to start implementation

**OR**

**[ ]** I have changes (specify in reply)
**[ ]** I want to cut scope (specify what)
**[ ]** I want to delay Journal (launch first)

---

**Next**: Reply with "APPROVED - start Phase 1" or list changes needed.
