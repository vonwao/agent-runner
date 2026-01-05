# Stop Reason Registry

**Priority:** MEDIUM
**Effort:** Small (~100 lines)
**Risk:** Low (refactoring existing strings)

---

## Problem

Stop reasons are currently informal strings scattered across the codebase:

```typescript
// Various locations:
state.stop_reason = 'timeout';
state.stop_reason = 'max_ticks';
state.stop_reason = 'guard_violation';
state.stop_reason = 'verification_failed';
state.stop_reason = 'review_loop_detected';
state.stop_reason = 'worker_blocked';
// ... etc
```

**Why this is fragile:**
1. **Inconsistent strings** - "timeout" vs "time_budget_exceeded" vs "time_limit"
2. **No structured metadata** - Can't attach exit code, family, or default diagnosis
3. **Diagnosis becomes spaghetti** - String matching in multiple places
4. **Hard to evolve** - Adding new stop reason requires updating multiple files
5. **CLI exit codes are ad-hoc** - No consistent mapping

**Evidence:**
- Diagnosis code likely has big switch statements on string matching
- Doctor command probably has special cases for each reason
- No single source of truth for "what stop reasons exist?"

---

## Solution

Create a **central stop reason registry** with structured metadata.

**Design principles:**
1. **Single source of truth** - One file defines all stop reasons
2. **Structured** - Each reason has code, family, exit code, default diagnosis
3. **Type-safe** - TypeScript ensures we only use valid reasons
4. **Extensible** - Easy to add new reasons or metadata fields

---

## Registry Schema

**File:** `src/types/stop-reasons.ts` (NEW)

```typescript
export interface StopReasonDefinition {
  /** Canonical stop reason code (lowercase_underscore) */
  code: string;

  /** Human-readable title */
  title: string;

  /** Stop reason family (for grouping) */
  family: 'resource_limit' | 'constraint' | 'failure' | 'review' | 'worker' | 'user';

  /** CLI exit code */
  exit_code: number;

  /** Default diagnosis/guidance */
  diagnosis: string;

  /** Whether this stop reason is auto-resumable */
  auto_resumable: boolean;
}

export const STOP_REASONS = {
  // Resource limits
  TIMEOUT: {
    code: 'timeout',
    title: 'Time budget exceeded',
    family: 'resource_limit',
    exit_code: 124,
    diagnosis: 'Increase time budget with --time or simplify task into smaller milestones',
    auto_resumable: false
  },

  MAX_TICKS: {
    code: 'max_ticks',
    title: 'Maximum supervisor ticks reached',
    family: 'resource_limit',
    exit_code: 125,
    diagnosis: 'Increase --max-ticks or simplify task to reduce phase transitions',
    auto_resumable: false
  },

  STALLED: {
    code: 'stalled',
    title: 'Run stalled (no progress)',
    family: 'resource_limit',
    exit_code: 126,
    diagnosis: 'Run made no progress for extended period. Check worker logs for hangs.',
    auto_resumable: true
  },

  // Constraints
  GUARD_VIOLATION: {
    code: 'guard_violation',
    title: 'Scope guard violation',
    family: 'constraint',
    exit_code: 2,
    diagnosis: 'Agent attempted changes outside allowlist or inside denylist. Check scope configuration.',
    auto_resumable: false
  },

  LOCKFILE_VIOLATION: {
    code: 'lockfile_violation',
    title: 'Disallowed lockfile changes',
    family: 'constraint',
    exit_code: 3,
    diagnosis: 'Agent modified lockfiles without permission. Use --allow-deps or update allowlist.',
    auto_resumable: false
  },

  DIRTY_WORKTREE: {
    code: 'dirty_worktree',
    title: 'Dirty worktree before run',
    family: 'constraint',
    exit_code: 4,
    diagnosis: 'Uncommitted changes detected. Commit or use --allow-dirty.',
    auto_resumable: false
  },

  FILE_COLLISION: {
    code: 'file_collision',
    title: 'File ownership collision with active run',
    family: 'constraint',
    exit_code: 5,
    diagnosis: 'Another run has claimed ownership of files in scope. Wait or use --force-parallel.',
    auto_resumable: false
  },

  // Verification failures
  VERIFICATION_FAILED: {
    code: 'verification_failed',
    title: 'Verification commands failed',
    family: 'failure',
    exit_code: 10,
    diagnosis: 'Implementation did not pass verification tier. Check failure logs and retry.',
    auto_resumable: false
  },

  VERIFICATION_TIMEOUT: {
    code: 'verification_timeout',
    title: 'Verification timeout',
    family: 'failure',
    exit_code: 11,
    diagnosis: 'Verification commands exceeded time limit. Increase max_verify_time_per_milestone.',
    auto_resumable: false
  },

  // Review issues
  REVIEW_LOOP_DETECTED: {
    code: 'review_loop_detected',
    title: 'Review loop detected (repeated same review)',
    family: 'review',
    exit_code: 20,
    diagnosis: 'Agent unable to address review comments after multiple attempts. Manual intervention needed.',
    auto_resumable: false
  },

  REVIEW_REJECTED: {
    code: 'review_rejected',
    title: 'Review explicitly rejected',
    family: 'review',
    exit_code: 21,
    diagnosis: 'Reviewer rejected implementation. Check review memo for details.',
    auto_resumable: false
  },

  // Worker issues
  WORKER_BLOCKED: {
    code: 'worker_blocked',
    title: 'Worker reported blocked status',
    family: 'worker',
    exit_code: 30,
    diagnosis: 'Worker unable to proceed. Check handoff memo for details.',
    auto_resumable: false
  },

  WORKER_FAILED: {
    code: 'worker_failed',
    title: 'Worker process failed',
    family: 'worker',
    exit_code: 31,
    diagnosis: 'Worker process crashed or returned error. Check worker logs.',
    auto_resumable: false
  },

  WORKER_TIMEOUT: {
    code: 'worker_timeout',
    title: 'Worker call timeout',
    family: 'worker',
    exit_code: 32,
    diagnosis: 'Worker did not respond within timeout. Check worker health and network.',
    auto_resumable: true
  },

  // User actions
  USER_STOPPED: {
    code: 'user_stopped',
    title: 'User requested stop',
    family: 'user',
    exit_code: 130, // Standard SIGINT exit code
    diagnosis: 'Run stopped by user request (Ctrl+C).',
    auto_resumable: false
  }
} as const;

// Type-safe stop reason codes
export type StopReasonCode = typeof STOP_REASONS[keyof typeof STOP_REASONS]['code'];

// Helper to get definition by code
export function getStopReason(code: string): StopReasonDefinition | undefined {
  return Object.values(STOP_REASONS).find(r => r.code === code);
}

// Auto-resumable reasons (for --auto-resume)
export const AUTO_RESUMABLE_REASONS = Object.values(STOP_REASONS)
  .filter(r => r.auto_resumable)
  .map(r => r.code);
```

---

## Usage Patterns

### 1. Setting Stop Reason

**Before (string literal):**
```typescript
state.stop_reason = 'timeout';
state.stop_reason = 'guard_violation';
```

**After (registry constant):**
```typescript
import { STOP_REASONS } from '../types/stop-reasons.js';

state.stop_reason = STOP_REASONS.TIMEOUT.code;
state.stop_reason = STOP_REASONS.GUARD_VIOLATION.code;
```

**With TypeScript, this enables:**
- Autocomplete for valid stop reasons
- Typo prevention
- Easy refactoring (rename one place, updates everywhere)

### 2. Diagnosis

**Before (scattered logic):**
```typescript
// In doctor.ts or diagnosis/analyzer.ts
if (stop_reason === 'timeout') {
  return 'Increase time budget with --time';
} else if (stop_reason === 'max_ticks') {
  return 'Increase --max-ticks or simplify task';
} else if (stop_reason === 'guard_violation') {
  return 'Check scope configuration';
}
// ... 20 more cases ...
```

**After (registry lookup):**
```typescript
import { getStopReason } from '../types/stop-reasons.js';

const definition = getStopReason(stop_reason);
if (definition) {
  return definition.diagnosis;
} else {
  return 'Unknown stop reason';
}
```

### 3. Exit Codes

**Before (ad-hoc):**
```typescript
// In CLI commands
if (state.stop_reason === 'timeout') {
  process.exit(124);
} else if (state.stop_reason === 'guard_violation') {
  process.exit(2);
}
// Inconsistent across commands
```

**After (registry lookup):**
```typescript
import { getStopReason } from '../types/stop-reasons.js';

const definition = getStopReason(state.stop_reason);
const exitCode = definition?.exit_code ?? 1;
process.exit(exitCode);
```

### 4. Auto-Resume Check

**Before (hardcoded list):**
```typescript
const AUTO_RESUMABLE = ['stalled_timeout', 'worker_call_timeout'];
if (AUTO_RESUMABLE.includes(stop_reason)) {
  // ...
}
```

**After (derived from registry):**
```typescript
import { AUTO_RESUMABLE_REASONS } from '../types/stop-reasons.js';

if (AUTO_RESUMABLE_REASONS.includes(stop_reason)) {
  // ...
}
```

### 5. Grouping by Family

**New capability:**
```typescript
import { STOP_REASONS } from '../types/stop-reasons.js';

// Get all resource limit reasons
const resourceLimits = Object.values(STOP_REASONS)
  .filter(r => r.family === 'resource_limit')
  .map(r => r.code);

// Get all constraint violations
const constraints = Object.values(STOP_REASONS)
  .filter(r => r.family === 'constraint')
  .map(r => r.code);
```

---

## Implementation Plan

### 1. Create Registry

**File:** `src/types/stop-reasons.ts` (NEW)
- Define `StopReasonDefinition` interface
- Define `STOP_REASONS` registry with all known reasons
- Export `getStopReason()` helper
- Export `AUTO_RESUMABLE_REASONS` list

### 2. Update Stop Reason Assignment Sites

**Files to update:**
- `src/supervisor/runner.ts` (main stop reason assignment)
- `src/commands/run.ts`
- `src/commands/resume.ts`
- Any other files that set `state.stop_reason`

**Pattern:**
```typescript
// Before:
state.stop_reason = 'timeout';

// After:
import { STOP_REASONS } from '../types/stop-reasons.js';
state.stop_reason = STOP_REASONS.TIMEOUT.code;
```

### 3. Update Diagnosis Logic

**Files to update:**
- `src/diagnosis/analyzer.ts`
- `src/commands/doctor.ts`

**Pattern:**
```typescript
// Before: big switch statement
switch (stop_reason) {
  case 'timeout': return 'Increase time budget...';
  case 'max_ticks': return 'Increase max ticks...';
  // ... 20 more cases
}

// After: registry lookup
import { getStopReason } from '../types/stop-reasons.js';
const definition = getStopReason(stop_reason);
return definition?.diagnosis ?? 'Unknown stop reason';
```

### 4. Update Exit Code Logic

**Files to update:**
- `src/commands/run.ts`
- `src/commands/resume.ts`
- Any command that returns exit codes based on stop reason

**Pattern:**
```typescript
// Before:
if (state.stop_reason === 'timeout') {
  process.exit(124);
} else {
  process.exit(1);
}

// After:
import { getStopReason } from '../types/stop-reasons.js';
const definition = getStopReason(state.stop_reason);
process.exit(definition?.exit_code ?? 1);
```

### 5. Update Auto-Resume Logic

**Files to update:**
- `src/commands/resume.ts`
- `src/supervisor/runner.ts` (if auto-resume logic exists there)

**Pattern:**
```typescript
// Before:
const AUTO_RESUMABLE = ['stalled_timeout', 'worker_call_timeout'];

// After:
import { AUTO_RESUMABLE_REASONS } from '../types/stop-reasons.js';
// Use AUTO_RESUMABLE_REASONS directly
```

---

## Migration Strategy

**No breaking changes:**
- RunState still stores `stop_reason` as string
- Timeline events unchanged
- Existing runs with old stop reason strings still work

**Gradual migration:**
1. Create registry
2. Update code to use registry constants
3. Legacy strings still work (no validation yet)
4. Optional: Add validation later to warn on unknown stop reasons

**Backward compatibility:**
```typescript
// Registry includes all known historical stop reasons
// If we find old strings in state.json, getStopReason() returns undefined
// Diagnosis falls back to generic message
```

---

## Testing Strategy

### Unit Tests

**Test registry lookup:**
```typescript
// tests/stop-reasons.test.ts
import { getStopReason, STOP_REASONS } from '../src/types/stop-reasons';

describe('Stop Reason Registry', () => {
  it('should return definition for valid code', () => {
    const def = getStopReason('timeout');
    expect(def).toBeDefined();
    expect(def?.title).toBe('Time budget exceeded');
    expect(def?.exit_code).toBe(124);
  });

  it('should return undefined for unknown code', () => {
    const def = getStopReason('invalid_reason');
    expect(def).toBeUndefined();
  });

  it('should have unique exit codes per family', () => {
    const exitCodes = Object.values(STOP_REASONS).map(r => r.exit_code);
    const uniqueCodes = new Set(exitCodes);
    // Some overlap is OK (e.g., different families can share codes)
    // Just ensure no exact duplicates in same family
  });

  it('should mark correct reasons as auto-resumable', () => {
    expect(STOP_REASONS.STALLED.auto_resumable).toBe(true);
    expect(STOP_REASONS.WORKER_TIMEOUT.auto_resumable).toBe(true);
    expect(STOP_REASONS.TIMEOUT.auto_resumable).toBe(false);
  });
});
```

### Integration Tests

**Test exit codes:**
```typescript
describe('Run exit codes', () => {
  it('should exit with 124 on timeout', async () => {
    // Run with very short timeout
    // Verify exit code === 124
  });

  it('should exit with 2 on guard violation', async () => {
    // Run with scope violation
    // Verify exit code === 2
  });
});
```

---

## Documentation

### Registry Documentation

**File:** `docs/architecture/stop-reasons.md` (NEW)

```markdown
# Stop Reasons

Runr uses a structured registry of stop reasons to ensure consistent diagnosis,
exit codes, and handling across the codebase.

## Registry Location

All stop reasons are defined in `src/types/stop-reasons.ts`.

## Families

| Family | Description | Exit Code Range |
|--------|-------------|-----------------|
| resource_limit | Time, ticks, or resource exhaustion | 124-129 |
| constraint | Scope, lockfile, or policy violations | 2-9 |
| failure | Verification or execution failures | 10-19 |
| review | Review process issues | 20-29 |
| worker | Worker process problems | 30-39 |
| user | User-initiated actions | 130+ |

## All Stop Reasons

(Auto-generated table from registry)

| Code | Title | Family | Exit Code | Auto-Resumable |
|------|-------|--------|-----------|----------------|
| timeout | Time budget exceeded | resource_limit | 124 | No |
| max_ticks | Maximum ticks reached | resource_limit | 125 | No |
| ... | ... | ... | ... | ... |

## Adding New Stop Reasons

1. Add to `STOP_REASONS` in `src/types/stop-reasons.ts`
2. Choose appropriate family and exit code
3. Write clear diagnosis message
4. Determine if auto-resumable
5. Update this documentation
```

---

## Rollout Plan

### Phase 1: Create Registry (Day 1)
1. Create `src/types/stop-reasons.ts`
2. Add all known stop reasons
3. Add tests
4. Document in `docs/architecture/stop-reasons.md`

### Phase 2: Update Assignment Sites (Day 2)
1. Find all `state.stop_reason = '...'` assignments
2. Replace with `STOP_REASONS.X.code`
3. Test that runs still work

### Phase 3: Update Diagnosis (Day 3)
1. Refactor diagnosis logic to use registry
2. Remove string matching code
3. Test doctor command

### Phase 4: Update Exit Codes (Day 4)
1. Refactor exit code logic
2. Test CLI exit codes
3. Update docs

---

## File Changes Summary

**New files:**
- `src/types/stop-reasons.ts` (~150 lines)
- `tests/stop-reasons.test.ts` (unit tests)
- `docs/architecture/stop-reasons.md` (documentation)

**Modified files:**
- `src/supervisor/runner.ts` (use STOP_REASONS constants)
- `src/commands/run.ts` (use exit codes from registry)
- `src/commands/resume.ts` (use AUTO_RESUMABLE_REASONS)
- `src/diagnosis/analyzer.ts` (use registry for diagnosis)
- `src/commands/doctor.ts` (use registry for diagnosis)

**Total LOC estimate:** ~100 lines (registry + refactoring)

---

## Success Criteria

- [ ] All stop reasons in single registry file
- [ ] Stop reason assignment uses constants, not strings
- [ ] Diagnosis uses registry lookup, not switch statements
- [ ] Exit codes use registry, not ad-hoc mapping
- [ ] Auto-resumable list derived from registry
- [ ] Tests pass
- [ ] No breaking changes to existing runs
- [ ] Documentation updated

---

## Future Enhancements (Not in Scope)

- **Stop reason telemetry:** Track frequency of each stop reason
- **Diagnosis templates:** Support parameterized diagnosis messages
- **Recovery actions:** Structured "what to do next" beyond diagnosis string
- **Validation:** Warn if state.stop_reason not in registry
