# Implement Run Receipt v1

## Goal
Implement the Run Receipt v1 specification to make Runr's review UX immediate and intuitive.

## Requirements

Read the full spec first: `docs/specs/run-receipt-v1.md`

Then implement in phases:

### Phase 1: Diff Artifacts (Foundation)
1. At run termination, write to `.runr/runs/<id>/`:
   - `diff.patch` (or `diff.patch.gz` if compressed)
   - `diffstat.txt` (always, even if patch compressed)
   - `files.txt` (list of changed files)
   - `transcript.log` (if captured) OR `transcript.meta.json` (pointer)

2. Compression triggers:
   - Diff size > 50KB
   - Changed lines > 5000
   - Changed files > 100

3. Update console output at run termination to print Run Receipt:
   ```
   Run <id> [<status>] <icon>

   Changes:
     <file>  +N  -N
     ...up to 20 files...
     ...N more files (if > 20)

   Checkpoint: <sha> (verified: <tier> <commands>)  # if exists

   Review:  .runr/runs/<id>/diff.patch
   Submit:  runr submit <id> --to <branch> --dry-run
   ```

4. Context-aware next actions based on stop reason

### Phase 2: Task Contract
1. Add `allowlist_add` field to task schema (optional, array of globs)
2. Merge task-local allowlist with base config allowlist (additive only)
3. Add `verification.tier` field to task schema (optional, tier0/tier1/tier2)
4. Enforce minimum tier0 verification (block tier=none)
5. Scope violation stops → print copy-pasteable YAML fix snippet

### Phase 3: Submit Polish
1. Ensure submit conflict → clean abort (already mostly done)
2. Add conflict tip message: "Tip: Conflicts are common on CHANGELOG.md; consider moving changelog updates into a dedicated task."
3. Verify invariants hold: branch restored, tree clean, timeline event

### Phase 4: Testing
- Test Run Receipt output for all terminal states
- Test diff compression triggers
- Test task-local allowlist override
- Test scope violation stop + resume flow
- Test submit conflict abort + recovery

## Success Criteria

- Every run ends with a Run Receipt showing changes + next action
- Diff artifacts (diff.patch, diffstat.txt, files.txt) always written
- Task-local `allowlist_add` works without editing main config
- Submit conflicts always clean abort (branch restored, tree clean)
- Verification minimum tier0 enforced (cannot skip)
- Tests pass

## Scope
allowlist_add:
  - docs/specs/**

## Verification
tier: tier1

## Notes

- This is a **UX transformation** - the review surface must be immediate
- Follow the spec exactly - don't invent features or skip invariants
- The goal is "meta-agent drives Runr with zero surprise"
- Transcript is best-effort, not mandatory (see spec for pointer format)
