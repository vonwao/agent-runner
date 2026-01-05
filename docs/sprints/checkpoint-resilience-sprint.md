# Checkpoint Resilience Sprint

**Sprint Goal:** Make checkpoint/resume mechanism bulletproof and add essential forensics infrastructure

**Duration:** Jan 5 - TBD
**Status:** In Progress (1/4 deliverables complete)

**Quick Status:**
- ✅ Checkpoint sidecar metadata (commit `1d43ffd`) - **DONE**
- ⏸️ allow_deps allowlist - **NEXT**
- 📋 Stop reason registry - **BACKLOG**
- 📋 RunState schema versioning - **BACKLOG**

---

## Overview

This sprint addresses architectural friction points that are starting to bite as Runr matures. The focus is on **high-leverage, low-risk improvements** that strengthen the core checkpoint/resume system and make dependency changes safe and auditable.

### Why Now?

1. **Checkpoint parsing complexity** is accumulating (legacy formats, drift detection, fragile string parsing)
2. **allow_deps binary switch** will block external adoption (agents get stuck OR users lose trust)
3. **Stop reason strings** are starting to fragment (inconsistent taxonomy across diagnosis/doctor)
4. **Schema evolution** needs foundation before RunState grows further

### What This Fixes

- Git history rewrites breaking resume (rebase, squash, cherry-pick)
- Lockfile changes being all-or-nothing scary
- Stop reason diagnosis being string-matching spaghetti
- Future RunState schema migrations being painful

---

## Sprint Deliverables

### 1. Checkpoint Metadata Sidecar ✅ COMPLETED
**Leverage:** High | **Risk:** Low | **Effort:** Small

**Problem:** Git commit messages are not a database. Every format evolution requires "legacy parser forever."

**Solution:** Write structured metadata alongside git commits.

**Spec:** [checkpoint-metadata-sidecar.md](./specs/checkpoint-metadata-sidecar.md)

**Status:** ✅ Completed Jan 5, 2026 (commit `1d43ffd`)

**Delivered:**
- ✅ Core implementation: `src/store/checkpoint-metadata.ts` (162 lines)
- ✅ Sidecar write in `handleCheckpoint()` with best-effort pattern
- ✅ Resume reads sidecar first, falls back to git log (clean priority chain)
- ✅ Doctor warns if `.runr/` not gitignored (uses `git check-ignore`)
- ✅ Init ensures `.runr/` in `.gitignore`
- ✅ Schema versioning: integer `schema_version: 1` (not semver)
- ✅ Comprehensive tests: 14 unit + 5 integration tests
- ✅ New events: `checkpoint_sidecar_write_failed`, `resume_checkpoint_selected`
- ✅ Modified event: `checkpoint_complete` now includes `sidecar_written` boolean

**Success Criteria:**
- ✅ Resume reads sidecar first, git log parsing is fallback
- ✅ No breaking changes to existing runs
- ⏸️ Drift detection uses sidecar when available (can be enhanced later)

---

### 2. Structured allow_deps with Allowlist (HIGH PRIORITY)
**Leverage:** High | **Risk:** Low | **Effort:** Medium

**Problem:** Binary on/off switch for deps. OFF blocks agents, ON is scary.

**Solution:** Add allowlist mode + lockfile change forensics.

**Spec:** [allow-deps-allowlist.md](./specs/allow-deps-allowlist.md)

**Success Criteria:**
- CLI: `--allow-deps zod,date-fns` works
- Config: persistent allowlist support
- Timeline event: `lockfile_changed` with diffstat and package count
- Default remains strict (no deps)

---

### 3. Stop Reason Registry (MEDIUM PRIORITY)
**Leverage:** Medium | **Risk:** Low | **Effort:** Small

**Problem:** Stop reasons are informal strings scattered across codebase.

**Solution:** Central registry with families, exit codes, and default diagnoses.

**Spec:** [stop-reason-registry.md](./specs/stop-reason-registry.md)

**Success Criteria:**
- Single source of truth for all stop reasons
- Diagnosis code references registry, not string matching
- Consistent exit codes per stop reason family

---

### 4. RunState Schema Versioning (MEDIUM PRIORITY)
**Leverage:** Medium | **Risk:** Low | **Effort:** Tiny

**Problem:** RunState has no schema version, making future migrations harder.

**Solution:** Add `schema_version` field and establish evolution pattern.

**Spec:** [runstate-schema-version.md](./specs/runstate-schema-version.md)

**Success Criteria:**
- `schema_version: "1.0.0"` in all new RunState snapshots
- Read path handles missing version (treats as legacy)
- Doc for how to evolve schema in future

---

## Non-Goals (Explicitly Out of Scope)

- **Complex deps policy matrix** (strict/audit/open modes) - can add later if needed
- **SQLite index** - wait for concrete cross-run query use case
- **RunState field reorganization** (core/transient/metadata layers) - not painful yet
- **Worktree improvements** - working fine
- **Timeline compaction** - not hitting size limits

---

## Implementation Order

**✅ Completed (Jan 5):**
1. ✅ Checkpoint metadata sidecar - Spec + implementation + tests complete
   - Note: Sidecar has its own schema_version (integer 1), RunState schema versioning deferred

**🔄 Up Next:**
2. Structured allow_deps with Allowlist (HIGH PRIORITY)
   - CLI: `--allow-deps zod,date-fns`
   - Config: persistent allowlist
   - Timeline: `lockfile_changed` event with forensics

**📋 Backlog:**
3. Stop Reason Registry (MEDIUM PRIORITY)
4. RunState Schema Versioning (MEDIUM PRIORITY - may not be needed if sidecar pattern works)

**Why this order:**
- Item 1 is the biggest risk reduction (resume resilience)
- Item 2 is the biggest UX win (safe deps without trust loss)
- Items 3-4 are nice-to-have polish

---

## Risk Assessment

### Low Risk
- All changes are **additive** (no breaking changes)
- Checkpoint sidecar **falls back** to git log parsing
- allow_deps allowlist is **opt-in** (default unchanged)
- Schema versioning is **forward-compatible**

### Migration Strategy
- **No migration day needed**
- Old runs continue to work (legacy parsing)
- New runs get new features automatically
- Gradual transition as runs are created/resumed

---

## Success Metrics

**Checkpoint Resilience:**
- ✅ Resume success rate even after git rebase/squash (fallback chain: sidecar → git_log_run_specific → git_log_legacy)
- ✅ Sidecar metadata provides clean provenance (no git message parsing in happy path)
- ⏸️ Drift detection uses sidecar (can be enhanced to prefer sidecar in future)

**Deps Safety:**
- ⏸️ Users can install specific packages without scary blanket permission
- ⏸️ Lockfile changes are visible in timeline
- ⏸️ Package count warnings catch transitive explosions

**Code Quality:**
- ✅ Removed "worst hidden schema" (checkpoint metadata no longer embedded in commit messages)
- ⏸️ Stop reason diagnosis becomes lookup, not string matching
- ✅ Schema evolution has clear path forward (sidecar uses `schema_version: 1`)

---

## Lessons Learned (Deliverable #1)

**What Worked:**
- Integer `schema_version` (not semver) - simpler, file formats don't need semantic versioning
- Best-effort sidecar write pattern - never fails runs, degrades gracefully
- Optional fields (`tier`, `verification_commands`) - don't fake missing data
- Safe optional chaining (`?.`) for runtime values - defensive programming pays off
- Git check-ignore preferred over .gitignore parsing - uses git's own logic

**What Changed During Implementation:**
- Originally planned semver `"1.0.0"` → switched to integer `1` (user corrective feedback)
- Added mtime fallback for tie-breaking (created_at might be missing in corrupt sidecars)
- Added absolute path in error event payload (better debugging)
- Tracked actual `sidecarWritten` boolean (not hardcoded `true`)

**Impact:**
- Resume is now robust to git history rewrites (rebase, squash, cherry-pick)
- Checkpoint metadata is auditable, structured, and versioned
- Doctor/init ensure `.runr/` doesn't pollute working tree
- 867 tests passing (including 14 new unit + 5 new integration tests)

---

## Follow-up Work (Future Sprints)

After this sprint, consider:
- Optional SQLite index (when cross-run queries become common)
- Audit/open modes for allow_deps (if allowlist proves insufficient)
- RunState field layering (if state.json becomes unwieldy)
- Fixture governance (if gym tests become hard to maintain)

---

## References

- [Architectural Assessment](../architecture/assessment-2026-01-04.md)
- Recent commits: checkpoint drift detection (`8d25588`), resume preview (`522342c`)
- [Resume Implementation](../../src/commands/resume.ts)
- [Checkpoint Logic](../../src/supervisor/runner.ts)
