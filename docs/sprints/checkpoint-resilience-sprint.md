# Checkpoint Resilience Sprint

**Sprint Goal:** Make checkpoint/resume mechanism bulletproof and add essential forensics infrastructure

**Duration:** TBD
**Status:** Planning

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

### 1. Checkpoint Metadata Sidecar (HIGH PRIORITY)
**Leverage:** High | **Risk:** Low | **Effort:** Small

**Problem:** Git commit messages are not a database. Every format evolution requires "legacy parser forever."

**Solution:** Write structured metadata alongside git commits.

**Spec:** [checkpoint-metadata-sidecar.md](./specs/checkpoint-metadata-sidecar.md)

**Success Criteria:**
- Resume reads sidecar first, git log parsing is fallback
- No breaking changes to existing runs
- Drift detection uses sidecar when available

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

**Week 1:**
1. Checkpoint metadata sidecar (spec + implementation)
2. RunState schema versioning (quick win, enables #1)

**Week 2:**
3. allow_deps allowlist + lockfile_changed event
4. Stop reason registry

**Why this order:**
- Items 1-2 are tightly coupled (sidecar needs schema versioning)
- Items 3-4 are independent and can be done in parallel

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
- Resume success rate even after git rebase/squash
- Drift detection uses sidecar (faster, more reliable)

**Deps Safety:**
- Users can install specific packages without scary blanket permission
- Lockfile changes are visible in timeline
- Package count warnings catch transitive explosions

**Code Quality:**
- Stop reason diagnosis becomes lookup, not string matching
- Schema evolution has clear path forward

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
