# Architectural Assessment - January 4, 2026

**Date:** 2026-01-04
**Scope:** Full architectural review
**Status:** Planning phase complete

---

## Executive Summary

Runr's core architecture is **fundamentally sound**. The checkpoint-as-git-commits spine, event sourcing via JSONL timeline, and file-based storage are all correct choices that will scale well.

**However:** A few architectural bets are starting to accumulate friction as the system matures. None are fatal, but they should be addressed proactively:

1. **Checkpoint metadata parsing** - Git commit messages as database is fragile
2. **Binary allow_deps switch** - Blocks adoption or loses user trust
3. **Informal stop reasons** - String matching leads to diagnosis spaghetti
4. **Unversioned RunState** - Schema evolution will become painful

These are **growth pains, not design flaws**. They're solvable with targeted, low-risk improvements.

---

## What's Genuinely Strong

### 1. Checkpoint-as-Git-Commits

**Decision:** Use git commits as verified state checkpoints

**Why it's right:**
- Git commits are the perfect artifact for "verified code state"
- Users already trust git; it's inspectable and standard
- Can `git show` any checkpoint, standard tooling works
- Natural integration with existing workflows

**Evidence of maturity:** Recent drift detection fix (commit `8d25588`) shows you're thinking about edge cases.

**Verdict:** ✅ Keep this. It's a moat.

---

### 2. File-Based Storage

**Decision:** Store all state in `.runr/runs/<runId>/` directory structure

**Why it's right:**
- Perfect fit for the data model (event logs + snapshots)
- Portable, debuggable, git-friendly, works offline
- Users can `zip` a run dir and attach to bug reports
- No setup required (no database to install)
- Each run is self-contained

**File structure is clean:**
```
.runr/runs/<runId>/
├── state.json              # Single source of truth
├── timeline.jsonl          # Append-only event log
├── artifacts/              # Task + context
├── handoffs/               # Stop memos
└── config.snapshot.json    # Frozen config for resume
```

**Verdict:** ✅ Files are correct. SQLite is optional later for analytics, not primary storage.

---

### 3. Phase-Gated State Machine

**Decision:** Force `IMPLEMENT → VERIFY → REVIEW → CHECKPOINT` progression

**Why it's right:**
- Prevents cutting corners
- Makes verification non-optional
- Creates natural checkpoints at verified states
- Retry limits (3 per milestone) prevent infinite loops

**Verdict:** ✅ This is the right enforcement mechanism.

---

### 4. Separation of Concerns

**Modules are well-bounded:**
- `supervisor/` - Orchestration logic
- `store/` - File I/O abstraction
- `workers/` - AI integration
- `diagnosis/` - Post-mortem forensics
- `verification/` - Test execution
- `orchestrator/` - Multi-track coordination

**Verdict:** ✅ Clean architecture that will scale as features are added.

---

## Decisions That Are Biting (or Will Soon)

### A) Git Commit Messages as Metadata Store ⚠️⚠️

**What you're doing:**
```typescript
// src/commands/resume.ts:159-178
const runSpecificPattern = `^chore(runr): checkpoint ${state.run_id} milestone `;
const result = await git(['log', '--grep', runSpecificPattern, ...]);
const match = commitMessage.match(/milestone (\d+)/);
```

**Why it's fragile:**
1. **String parsing hell** - Already have 2 formats (run-specific + legacy)
2. **Git history rewrites** - Rebase, squash, cherry-pick can break resume
3. **Collision risk** - Other tools/hooks can mangle commit messages
4. **Migration pain** - Every format change requires "legacy parser forever"

**Evidence:**
- Drift detection code exists
- Two parsing branches (lines 158-186 and 189-218)
- Comment: "Try run-specific pattern first, then fallback to legacy"

**Impact:** Medium-High (blocking resume in some workflows)

**Fix:** Add checkpoint metadata sidecar (`.runr/checkpoints/<sha>.json`)

**Priority:** HIGH

---

### B) Binary allow_deps Switch ⚠️⚠️

**What you're doing:**
```typescript
// src/supervisor/scope-guard.ts:67-75
export function checkLockfiles(..., allowDeps: boolean) {
  if (allowDeps) {
    return { ok: true, violations: [] };  // ← ANY change allowed
  }
  // else block ALL changes
}
```

**Why it bites:**

| Mode | Problem |
|------|---------|
| OFF (default) | Agent stuck ("needs zod") |
| ON | Scary (no visibility, supply chain risk, huge diffs) |

**Impact:** High (blocks external adoption)

**Fix:** Add allowlist mode + lockfile forensics

**Priority:** HIGH

---

### C) Informal Stop Reason Taxonomy ⚠️

**What you're doing:**
```typescript
// Various locations
state.stop_reason = 'timeout';
state.stop_reason = 'max_ticks';
state.stop_reason = 'guard_violation';
// ... inconsistent strings
```

**Why it bites:**
- Inconsistent strings ("timeout" vs "time_budget_exceeded")
- Diagnosis becomes string-matching spaghetti
- CLI exit codes are ad-hoc
- Hard to evolve

**Impact:** Medium (code quality degradation)

**Fix:** Central stop reason registry with families, exit codes, diagnoses

**Priority:** MEDIUM

---

### D) Unversioned RunState Schema ⚠️

**What's missing:**
```typescript
export interface RunState {
  // NO schema_version field
  run_id: string;
  // ... 20+ fields
}
```

**Why it bites:**
- Can't detect old vs new state.json
- Schema evolution requires careful optional fields
- No migration strategy
- Future field removals will be painful

**Impact:** Low now, High later

**Fix:** Add `schema_version: "1.0.0"` field

**Priority:** MEDIUM (but easy, do it now)

---

## Decisions Under Observation

### Run Lifecycle Complexity

**RunState is accumulating fields:**
- Started with ~10 fields
- Now has 20+ fields (auto_resume_count, review_rounds, last_review_fingerprint, ...)

**Is this bad?** Not yet. But:
- No clear separation of core vs transient vs metadata
- All fields treated equally

**Recommendation:** Monitor. If state.json becomes unwieldy, consider layering:
- Core (run_id, phase, milestones, checkpoint_commit_sha)
- Transient (retries, last_error, phase_started_at)
- Metadata (worker_stats, auto_resume_count)

**Priority:** LOW (future sprint if needed)

---

## Questions Answered

### Do we need a database?

**NO.** Files are the right primary storage for local CLI.

**When you WOULD need SQLite:**
- Cross-run queries ("all review loops in last 30 days")
- Team analytics dashboard
- Search across hundreds of runs

**How to add it later:**
- SQLite as **optional index** (can be deleted/rebuilt)
- Files remain source of truth
- No migration day needed

**Verdict:** Don't add DB now. Wait for concrete query use case.

---

### Is allow_deps biting us?

**YES.** Will bite harder when:
- External users try Runr (stuck immediately)
- Demonstrating "agent can install libraries" (binary switch is scary)
- Lockfile diffs become unreadable

**Fix:** Structured policy (allowlist + forensics)

**Priority:** HIGH (product blocker for external adoption)

---

### Are runs becoming too complex?

**YES, but it's the RIGHT complexity.**

You're building a forensic machine. More artifacts = more trust.

**The danger is NOT "more files."** The danger is:
- Inconsistent schemas
- Duplicated sources of truth
- Unbounded growth (huge logs, giant excerpts)
- No clear "which artifact is authoritative?"

**You're managing this well:**
- Caps on samples
- Schema version fields (timeline)
- Read-only modes
- Clear artifact contract

**Verdict:** Continue current approach. Monitor for duplication.

---

## Risk Assessment by Priority

### HIGH RISK (address in next sprint)

| Issue | Impact | Effort | Risk |
|-------|--------|--------|------|
| Checkpoint metadata parsing | Resume breaks on git rewrites | Small | Low |
| Binary allow_deps | External adoption blocked | Medium | Low |

### MEDIUM RISK (address soon)

| Issue | Impact | Effort | Risk |
|-------|--------|--------|------|
| Informal stop reasons | Code quality degradation | Small | Low |
| Unversioned RunState | Future schema changes painful | Tiny | Low |

### LOW RISK (monitor)

| Issue | Impact | Effort | Risk |
|-------|--------|--------|------|
| RunState field sprawl | State.json becomes unwieldy | Medium | Low |
| No SQLite index | Cross-run queries slow | Medium | Low |

---

## Recommended Next Sprint

**Sprint Name:** "Checkpoint Resilience Sprint"

**Goals:**
1. Make checkpoint/resume bulletproof (metadata sidecar)
2. Make dependency changes safe (allowlist + forensics)
3. Prevent taxonomy drift (stop reason registry)
4. Enable schema evolution (RunState versioning)

**Deliverables:**
1. Checkpoint metadata sidecar (HIGH, ~150 LOC)
2. Structured allow_deps with allowlist (HIGH, ~300 LOC)
3. Stop reason registry (MEDIUM, ~100 LOC)
4. RunState schema versioning (MEDIUM, ~30 LOC)

**Total effort:** ~600 LOC, 1-2 weeks

**Risk:** Low (all additive, backward-compatible)

---

## Long-Term Architectural Vision

### What to Keep

- Git commits as checkpoints (moat)
- Files as primary storage (correct for CLI)
- Phase-gated state machine (prevents shortcuts)
- Event sourcing via timeline.jsonl (forensics)
- Separation of concerns (supervisor/store/workers/diagnosis)

### What to Improve (this sprint)

- Checkpoint metadata → sidecar files (decouple from git messages)
- Dependency policy → structured allowlist (safe + auditable)
- Stop reasons → central registry (consistent diagnosis)
- RunState schema → versioned (evolution-ready)

### What to Consider Later

- Optional SQLite index (when cross-run queries needed)
- RunState field layering (if sprawl becomes painful)
- Fixture governance (if gym tests become hard to maintain)
- Timeline compaction (if logs get huge)

---

## Conclusion

**Overall assessment:** You're doing genuinely well. The core philosophy and system spine are solid.

**The issues identified are "growth pains," not fatal flaws:**
- Checkpoint parsing complexity → sidecar metadata
- Binary deps switch → allowlist + forensics
- Informal stop reasons → registry
- Unversioned state → add schema_version

**None require rewriting.** All are incremental improvements that strengthen Runr for scale.

**Next step:** Execute the Checkpoint Resilience Sprint to address high-priority friction points before external adoption.

---

## References

- Sprint plan: [checkpoint-resilience-sprint.md](../sprints/checkpoint-resilience-sprint.md)
- Recent commits: `8d25588` (drift detection), `522342c` (resume preview)
- Codebase architecture: [Architecture Overview](./architecture-overview.md) (auto-generated from exploration)
