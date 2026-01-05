# RunState Schema Versioning

**Priority:** MEDIUM
**Effort:** Tiny (~20-30 lines)
**Risk:** Low (pure additive)

---

## Problem

`RunState` interface (src/types/schemas.ts) has no schema version:

```typescript
export interface RunState {
  run_id: string;
  repo_path: string;
  phase: Phase;
  milestone_index: number;
  // ... 20+ fields
  // NO schema_version field
}
```

**Why this is a problem:**
1. **Field evolution is risky** - Adding/removing/renaming fields requires careful migration
2. **No version detection** - Can't tell if state.json is from old or new version
3. **Forward compatibility unclear** - Future changes may break resume for old runs
4. **Migration strategy undefined** - No established pattern for evolving state

**Current state evolution pattern:**
- Fields added with `?` optional marker (e.g., `auto_resume_count?: number`)
- Read code checks if field exists
- No explicit version to know "when was this field added?"

**This works but:**
- Becomes fragile as more fields accumulate
- No way to know "is this state.json compatible with current code?"
- Can't confidently remove deprecated fields

---

## Solution

Add `schema_version` field to RunState.

**Design principles:**
1. **Minimal** - Just add one field, don't redesign everything
2. **Semver-like** - Use "MAJOR.MINOR.PATCH" for clarity
3. **Additive** - New runs get version, old runs get default
4. **Forward-compatible** - Reading code handles missing version gracefully

---

## Schema Changes

### 1. Add Field to RunState

**File:** `src/types/schemas.ts`

```typescript
export interface RunState {
  /** Schema version for this RunState (semver: MAJOR.MINOR.PATCH) */
  schema_version: string;

  // Existing fields
  run_id: string;
  repo_path: string;
  phase: Phase;
  // ... rest of fields
}
```

### 2. Version Numbering

**Initial version:** `"1.0.0"`

**Versioning rules:**
- **MAJOR** - Breaking changes (field removed, type changed incompatibly)
- **MINOR** - Additive changes (new optional field, new enum value)
- **PATCH** - Clarifications or fixes (no structural changes)

**Example evolution:**
- `1.0.0` - Initial versioned schema (this sprint)
- `1.1.0` - Add `checkpoint_metadata_path` field (checkpoint sidecar sprint)
- `1.2.0` - Add `deps_policy` field (allow-deps sprint)
- `2.0.0` - Remove deprecated `resume_token` field (breaking)

### 3. Current Schema Version Constant

**File:** `src/types/schemas.ts`

```typescript
/** Current RunState schema version */
export const RUN_STATE_SCHEMA_VERSION = '1.0.0';

export interface RunState {
  schema_version: string;
  // ... fields
}
```

---

## Write Path (Creating State)

**File:** `src/supervisor/runner.ts` (or wherever initial state is created)

**Current:**
```typescript
const state: RunState = {
  run_id,
  repo_path,
  phase: 'INIT',
  milestone_index: 0,
  milestones: [],
  // ... other fields
};
```

**Updated:**
```typescript
import { RUN_STATE_SCHEMA_VERSION } from '../types/schemas.js';

const state: RunState = {
  schema_version: RUN_STATE_SCHEMA_VERSION,
  run_id,
  repo_path,
  phase: 'INIT',
  milestone_index: 0,
  milestones: [],
  // ... other fields
};
```

**That's it.** All new states get version automatically.

---

## Read Path (Loading State)

**Files:** Anywhere `state.json` is read:
- `src/store/run-store.ts` (readState function)
- `src/commands/resume.ts`
- `src/commands/status.ts`
- `src/commands/report.ts`

**Pattern:**

```typescript
// Read state.json
const raw = fs.readFileSync(statePath, 'utf-8');
const state = JSON.parse(raw) as RunState;

// Handle missing schema_version (legacy runs)
if (!state.schema_version) {
  state.schema_version = '0.0.0'; // Mark as legacy/unversioned
}

// Version compatibility check (optional, can add later)
const [major] = state.schema_version.split('.').map(Number);
const [currentMajor] = RUN_STATE_SCHEMA_VERSION.split('.').map(Number);

if (major > currentMajor) {
  console.warn(`⚠ Warning: State schema version ${state.schema_version} is newer than supported ${RUN_STATE_SCHEMA_VERSION}`);
  console.warn('Resume may fail or behave unexpectedly. Update runr to latest version.');
}
```

**Backward compatibility:**
- Legacy runs (no schema_version) → assign `"0.0.0"`
- Resume still works (all existing fields present)
- No migration needed

---

## Migration Strategy

**There is no migration.**

**For legacy runs (created before schema versioning):**
- `schema_version` field is missing
- Read code detects this and assigns `"0.0.0"`
- Everything continues to work

**For new runs (created after this change):**
- `schema_version: "1.0.0"` written automatically
- Read code sees version and knows it's current

**For future schema changes:**
- Bump version appropriately (MAJOR/MINOR/PATCH)
- Add migration logic if needed (based on version comparison)

**Example future migration:**
```typescript
// Hypothetical: RunState 2.0.0 removed deprecated `resume_token` field

const state = JSON.parse(raw) as RunState;

if (!state.schema_version) {
  state.schema_version = '0.0.0';
}

const [major] = state.schema_version.split('.').map(Number);

// Migrate from 1.x to 2.0
if (major === 1) {
  // Remove deprecated field
  delete (state as any).resume_token;
  state.schema_version = '2.0.0';
}
```

---

## Version Compatibility Guidelines

### When to Bump MAJOR

Breaking changes that require migration:
- Remove a field
- Change field type incompatibly (string → number)
- Rename a field
- Change enum values in incompatible way

**Action:** Increment MAJOR, reset MINOR and PATCH to 0
**Example:** `1.5.2` → `2.0.0`

### When to Bump MINOR

Additive changes that are backward-compatible:
- Add new optional field
- Add new enum value (if code handles unknowns gracefully)
- Expand type (string → string | null)

**Action:** Increment MINOR, reset PATCH to 0
**Example:** `1.5.2` → `1.6.0`

### When to Bump PATCH

Non-structural changes:
- Documentation updates in schema comments
- Clarifications
- Bug fixes to schema validation

**Action:** Increment PATCH
**Example:** `1.5.2` → `1.5.3`

---

## Implementation Plan

### Phase 1: Add Field to Schema (Day 1)
1. Add `schema_version: string` to RunState interface
2. Add `RUN_STATE_SCHEMA_VERSION = '1.0.0'` constant
3. Update TypeScript types

### Phase 2: Update Write Path (Day 1)
1. Find all places where RunState is created
2. Add `schema_version: RUN_STATE_SCHEMA_VERSION` to initialization
3. Test that new runs have version

### Phase 3: Update Read Path (Day 2)
1. Find all places where state.json is read
2. Add fallback: `state.schema_version ||= '0.0.0'`
3. Test that old runs still work

### Phase 4: Documentation (Day 2)
1. Document versioning policy
2. Document how to evolve schema
3. Add version to state.json example in docs

---

## File Changes Summary

**Modified files:**
- `src/types/schemas.ts` (add field + constant, ~3 lines)
- `src/supervisor/runner.ts` (add version to state creation, ~1 line)
- `src/store/run-store.ts` (add fallback in read, ~2 lines)
- `src/commands/resume.ts` (add version check, ~5 lines)
- `src/commands/status.ts` (add fallback, ~1 line)
- `src/commands/report.ts` (add fallback, ~1 line)
- `docs/architecture/schema-versioning.md` (NEW, documentation)

**Total LOC:** ~20-30 lines

---

## Testing Strategy

### Unit Tests

**Test version assignment:**
```typescript
// tests/state-schema-version.test.ts
describe('RunState schema version', () => {
  it('should assign current version to new state', () => {
    const state = createInitialState(...);
    expect(state.schema_version).toBe(RUN_STATE_SCHEMA_VERSION);
  });

  it('should default to 0.0.0 for legacy state', () => {
    const legacyJson = `{"run_id": "...", "phase": "INIT", ...}`;  // No schema_version
    const state = JSON.parse(legacyJson) as RunState;

    // Simulate read path
    if (!state.schema_version) {
      state.schema_version = '0.0.0';
    }

    expect(state.schema_version).toBe('0.0.0');
  });
});
```

### Integration Tests

**Test resume with legacy state:**
```typescript
describe('Resume with legacy state', () => {
  it('should resume old run without schema_version', async () => {
    // 1. Create mock state.json without schema_version
    // 2. Run resume command
    // 3. Verify it works
    // 4. Verify version was assigned
  });
});
```

---

## Example state.json

**Before (no version):**
```json
{
  "run_id": "20260104035601",
  "repo_path": "/path/to/repo",
  "phase": "CHECKPOINT",
  "milestone_index": 1,
  "milestones": [...]
}
```

**After (with version):**
```json
{
  "schema_version": "1.0.0",
  "run_id": "20260104035601",
  "repo_path": "/path/to/repo",
  "phase": "CHECKPOINT",
  "milestone_index": 1,
  "milestones": [...]
}
```

---

## Documentation

### Schema Versioning Policy

**File:** `docs/architecture/schema-versioning.md` (NEW)

```markdown
# RunState Schema Versioning

## Overview

RunState uses semantic versioning (MAJOR.MINOR.PATCH) to track schema evolution
and ensure compatibility between different versions of Runr.

## Current Version

Current schema version is defined in `src/types/schemas.ts`:

\`\`\`typescript
export const RUN_STATE_SCHEMA_VERSION = '1.0.0';
\`\`\`

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2026-01-04 | Initial versioned schema |
| 0.0.0 | N/A | Legacy (pre-versioning) runs |

## Versioning Rules

See [Semantic Versioning](https://semver.org/) for general principles.

Applied to RunState:

- **MAJOR**: Breaking changes (removed fields, incompatible type changes)
- **MINOR**: Additive changes (new optional fields, new enum values)
- **PATCH**: Non-structural changes (docs, clarifications)

## Backward Compatibility

- Legacy runs (no `schema_version` field) are treated as version `0.0.0`
- All code must handle missing `schema_version` gracefully
- Newer code should warn (not error) when reading older schema versions

## Forward Compatibility

- Older code may fail to read newer schema versions (MAJOR bump)
- Warn users to upgrade Runr when encountering newer schema

## How to Evolve Schema

1. Determine impact (breaking, additive, or non-structural)
2. Bump version appropriately
3. Update `RUN_STATE_SCHEMA_VERSION` constant
4. Add migration logic if needed (based on version comparison)
5. Update this documentation
6. Add tests for migration path
```

---

## Rollout Plan

**Day 1 Morning:**
1. Add `schema_version` field to RunState interface
2. Add `RUN_STATE_SCHEMA_VERSION` constant
3. Update state creation in supervisor

**Day 1 Afternoon:**
4. Add version fallback in read paths
5. Write unit tests

**Day 2:**
6. Integration testing with legacy runs
7. Documentation
8. Commit and merge

---

## Success Criteria

- [ ] `schema_version` field added to RunState
- [ ] `RUN_STATE_SCHEMA_VERSION` constant defined
- [ ] All new runs have `schema_version: "1.0.0"`
- [ ] Legacy runs (no version) are handled gracefully
- [ ] Tests pass for versioned and legacy states
- [ ] Documentation updated
- [ ] No breaking changes to existing runs

---

## Future Work (Not in Scope)

- **Automatic migration on read** - Upgrade old schemas to current
- **Version compatibility matrix** - Document which versions can read which
- **Schema evolution tests** - Automated tests for migration paths
- **Version validation** - Strict mode that errors on version mismatch
- **Timeline schema versioning** - Apply same pattern to timeline events
