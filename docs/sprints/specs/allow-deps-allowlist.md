# Structured allow_deps with Allowlist

**Priority:** HIGH
**Effort:** Medium (~200-300 lines)
**Risk:** Low (default unchanged, opt-in feature)

---

## Problem

Currently `allow_deps` is a binary switch:

```typescript
// src/cli.ts:58
.option('--allow-deps', 'Allow lockfile changes', false)

// src/supervisor/scope-guard.ts:67-75
export function checkLockfiles(..., allowDeps: boolean) {
  if (allowDeps) {
    return { ok: true, violations: [] };  // ← ANY change allowed
  }
  // else block ALL changes
}
```

**Why this blocks adoption:**

| Mode | Problem |
|------|---------|
| **OFF (default)** | Agent gets stuck immediately ("needs zod") |
| **ON** | Scary blanket permission:<br>- No visibility into WHAT changed<br>- Transitive explosions (1 install → 200 packages)<br>- Supply chain risk<br>- Huge diffs, hard to review |

**Users lose trust either way:**
- "It can't install the library I need" (OFF)
- "It installed 50 random packages" (ON)

---

## Solution

Add **allowlist mode**: explicit, auditable, scoped permission.

**Design principles:**
1. **Keep it simple** - Don't build a complex policy matrix yet
2. **Default unchanged** - Strict mode (no deps) remains default
3. **Opt-in** - Allowlist is explicit user choice
4. **Auditable** - Timeline events show what changed
5. **Extensible** - Can add audit/open modes later if needed

---

## Feature: Package Allowlist

### CLI Interface

**String list syntax:**
```bash
# Allow specific packages
runr run --task foo.md --allow-deps zod,date-fns

# Allow all (blanket permission, same as current --allow-deps)
runr run --task foo.md --allow-deps '*'

# No deps (default, current behavior)
runr run --task foo.md
```

**Resume:**
```bash
# Override snapshot config
runr resume <runId> --allow-deps zod,pydantic

# Or inherit from original run (stored in config.snapshot.json)
runr resume <runId>
```

### Config Schema

**In `runr.config.json`:**
```jsonc
{
  "deps": {
    // Default policy: strict | allowlist
    "policy": "strict",

    // If policy = "allowlist", which packages are allowed
    "allowed_packages": ["zod", "date-fns"],

    // Warn if > N packages added (detects transitive explosions)
    "warn_threshold": 50
  }
}
```

**Backward compatibility:**
- If `deps` section missing, defaults to `{ "policy": "strict" }`
- Existing configs continue to work

### How It Works

**Allowlist validation:**
```typescript
// Check if package install is allowed
function isPackageAllowed(
  packageName: string,
  allowedPackages: string[]
): boolean {
  // Wildcard = allow all
  if (allowedPackages.includes('*')) {
    return true;
  }

  // Exact match
  if (allowedPackages.includes(packageName)) {
    return true;
  }

  // Scoped packages: @org/pkg
  // Allow @org/* to match any package in scope
  const scopePattern = allowedPackages.find(p => p.endsWith('/*'));
  if (scopePattern && packageName.startsWith(scopePattern.replace('/*', '/'))) {
    return true;
  }

  return false;
}
```

**Validation happens AFTER implementation:**
```typescript
// In VERIFY phase, after agent makes changes:
// 1. Check if lockfile changed
// 2. If yes, parse lockfile to extract added packages
// 3. Check each package against allowlist
// 4. If violation, fail with helpful message
```

---

## Feature: Lockfile Change Forensics

### Timeline Event

**Event type:** `lockfile_changed`

**Payload:**
```json
{
  "seq": 23,
  "timestamp": "2026-01-04T12:34:56.789Z",
  "type": "lockfile_changed",
  "source": "supervisor",
  "payload": {
    "lockfiles": ["pnpm-lock.yaml"],
    "packages_added": [
      { "name": "zod", "version": "3.22.0" },
      { "name": "date-fns", "version": "2.30.0" }
    ],
    "packages_removed": [],
    "packages_updated": [
      { "name": "typescript", "from": "5.0.0", "to": "5.3.0" }
    ],
    "total_added": 2,
    "total_removed": 0,
    "diffstat": "1 file changed, 42 insertions(+), 2 deletions(-)",
    "allowed": true,
    "violations": []  // If allowlist violated, list packages here
  }
}
```

**Where to emit:**
- In VERIFY phase, after verification passes
- Before CHECKPOINT
- Captures lockfile delta since last checkpoint

### Lockfile Parsing

**Support common formats:**
- `package-lock.json` (npm)
- `pnpm-lock.yaml` (pnpm)
- `yarn.lock` (yarn)

**Implementation:**
```typescript
// src/supervisor/lockfile-parser.ts

interface PackageChange {
  name: string;
  version: string;
}

interface LockfileDelta {
  packages_added: PackageChange[];
  packages_removed: PackageChange[];
  packages_updated: Array<{ name: string; from: string; to: string }>;
  total_added: number;
  total_removed: number;
}

async function parseLockfileDelta(
  repoPath: string,
  lockfilePath: string,
  baseCommit: string  // Last checkpoint SHA
): Promise<LockfileDelta | null> {
  // 1. Git diff lockfile between baseCommit and HEAD
  const diff = await git(['diff', `${baseCommit}..HEAD`, '--', lockfilePath], repoPath);

  if (!diff.stdout.trim()) {
    return null; // No changes
  }

  // 2. Parse diff based on lockfile type
  if (lockfilePath.endsWith('package-lock.json')) {
    return parseNpmLockfileDiff(diff.stdout);
  } else if (lockfilePath.endsWith('pnpm-lock.yaml')) {
    return parsePnpmLockfileDiff(diff.stdout);
  } else if (lockfilePath.endsWith('yarn.lock')) {
    return parseYarnLockfileDiff(diff.stdout);
  }

  return null;
}

// Minimal implementation: count changes, extract package names
function parseNpmLockfileDiff(diff: string): LockfileDelta {
  // Parse package-lock.json diff
  // Look for added/removed package entries
  // Extract package name + version from JSON diff

  // SIMPLE VERSION: just count lines, extract names from regex
  const added: PackageChange[] = [];
  const removed: PackageChange[] = [];

  // Regex: "package-name": { "version": "1.2.3" ...
  const packageRegex = /"([^"]+)":\s*{\s*"version":\s*"([^"]+)"/g;

  // ... parse diff lines, extract added/removed ...

  return {
    packages_added: added,
    packages_removed: removed,
    packages_updated: [],
    total_added: added.length,
    total_removed: removed.length
  };
}

// Similar for pnpm/yarn (can be simple heuristics at first)
```

**Note:** Perfect parsing is hard (lockfiles are complex). Start with:
1. **Simple heuristics** (regex for common patterns)
2. **Count lines** (total added/removed)
3. **Improve later** if needed (full lockfile parsing libraries exist)

---

## Implementation Plan

### 1. Config Schema Updates

**File:** `src/config/schema.ts`

**Add deps schema:**
```typescript
const depsSchema = z.object({
  policy: z.enum(['strict', 'allowlist']).default('strict'),
  allowed_packages: z.array(z.string()).default([]),
  warn_threshold: z.number().int().positive().default(50)
});

// Add to agentConfigSchema
const agentConfigSchema = z.object({
  // ... existing fields ...
  deps: depsSchema.default({ policy: 'strict', allowed_packages: [], warn_threshold: 50 })
});
```

### 2. CLI Updates

**File:** `src/cli.ts`

**Change option from boolean to string:**
```typescript
// OLD:
.option('--allow-deps', 'Allow lockfile changes', false)

// NEW:
.option(
  '--allow-deps <packages>',
  'Allow specific packages (comma-separated) or "*" for all',
  ''  // Empty string = strict (no deps)
)
```

**Parse in command handler:**
```typescript
// src/commands/run.ts
const allowDepsInput = options.allowDeps; // e.g., "zod,date-fns" or "*" or ""

let depsPolicy: 'strict' | 'allowlist' = 'strict';
let allowedPackages: string[] = [];

if (allowDepsInput === '*') {
  depsPolicy = 'allowlist';
  allowedPackages = ['*'];
} else if (allowDepsInput) {
  depsPolicy = 'allowlist';
  allowedPackages = allowDepsInput.split(',').map(p => p.trim());
}

// Merge with config
const effectiveDepsConfig = {
  policy: depsPolicy,
  allowed_packages: depsPolicy === 'allowlist' ? allowedPackages : config.deps?.allowed_packages || [],
  warn_threshold: config.deps?.warn_threshold || 50
};
```

### 3. Scope Guard Updates

**File:** `src/supervisor/scope-guard.ts`

**Replace boolean with policy check:**
```typescript
// OLD:
export function checkLockfiles(
  changedFiles: string[],
  lockfiles: string[],
  allowDeps: boolean
): { ok: boolean; violations: string[] }

// NEW:
export function checkLockfiles(
  changedFiles: string[],
  lockfiles: string[],
  depsPolicy: 'strict' | 'allowlist',
  allowedPackages: string[]
): { ok: boolean; violations: string[] } {
  // Strict: block all lockfile changes
  if (depsPolicy === 'strict') {
    const lockfileSet = new Set(lockfiles);
    const violations = changedFiles.filter(f => lockfileSet.has(f));
    return { ok: violations.length === 0, violations };
  }

  // Allowlist: allow lockfile changes (validation happens later in VERIFY)
  if (depsPolicy === 'allowlist') {
    return { ok: true, violations: [] };
  }

  return { ok: true, violations: [] };
}
```

**Note:** Allowlist validation happens AFTER implementation, not during guard check.

### 4. Lockfile Validation in VERIFY Phase

**File:** `src/supervisor/runner.ts` (VERIFY phase, around line 600-700)

**Add lockfile validation after verification passes:**
```typescript
case 'VERIFY': {
  // ... existing verification logic ...

  if (verifyResult.ok) {
    // NEW: Check if lockfiles changed and validate against allowlist
    const lockfileValidation = await validateLockfileChanges({
      repoPath: state.repo_path,
      baseCommit: state.checkpoint_commit_sha || await getInitialCommit(state.repo_path),
      lockfiles: options.config.scope.lockfiles,
      depsPolicy: options.depsConfig.policy,
      allowedPackages: options.depsConfig.allowed_packages,
      warnThreshold: options.depsConfig.warn_threshold,
      runStore
    });

    if (!lockfileValidation.ok) {
      // Lockfile violations: transition to STOPPED
      state.phase = 'STOPPED';
      state.stop_reason = 'lockfile_violation';
      state.last_error = `Lockfile changes include disallowed packages: ${lockfileValidation.violations.join(', ')}`;
      // ... emit event, save state ...
      return state;
    }

    // If lockfile changed and allowed, emit forensics event
    if (lockfileValidation.changed) {
      runStore.appendEvent({
        type: 'lockfile_changed',
        payload: lockfileValidation.delta,
        source: 'supervisor'
      });
    }

    // Proceed to REVIEW
    state.phase = 'REVIEW';
  }
}
```

### 5. Lockfile Validation Function

**File:** `src/supervisor/lockfile-validator.ts` (NEW)

```typescript
import { parseLockfileDelta, LockfileDelta } from './lockfile-parser.js';

interface LockfileValidationResult {
  ok: boolean;
  changed: boolean;
  violations: string[];
  delta?: LockfileDelta & {
    diffstat: string;
    allowed: boolean;
  };
}

export async function validateLockfileChanges(options: {
  repoPath: string;
  baseCommit: string;
  lockfiles: string[];
  depsPolicy: 'strict' | 'allowlist';
  allowedPackages: string[];
  warnThreshold: number;
  runStore: RunStore;
}): Promise<LockfileValidationResult> {
  const { repoPath, baseCommit, lockfiles, depsPolicy, allowedPackages, warnThreshold } = options;

  // Check which lockfiles changed
  const changedLockfiles: string[] = [];
  for (const lockfile of lockfiles) {
    const diff = await git(['diff', '--name-only', `${baseCommit}..HEAD`, '--', lockfile], repoPath);
    if (diff.stdout.trim()) {
      changedLockfiles.push(lockfile);
    }
  }

  if (changedLockfiles.length === 0) {
    return { ok: true, changed: false, violations: [] };
  }

  // If strict policy, lockfile changes should have been blocked by guard
  // This is a safety check
  if (depsPolicy === 'strict') {
    return {
      ok: false,
      changed: true,
      violations: changedLockfiles
    };
  }

  // Parse lockfile delta
  const lockfilePath = changedLockfiles[0]; // Use first changed lockfile
  const delta = await parseLockfileDelta(repoPath, lockfilePath, baseCommit);

  if (!delta) {
    return { ok: true, changed: false, violations: [] };
  }

  // Get diffstat
  const diffStatResult = await git(['diff', '--stat', `${baseCommit}..HEAD`, '--', lockfilePath], repoPath);
  const diffstat = diffStatResult.stdout.trim();

  // Validate added packages against allowlist
  const violations: string[] = [];
  if (!allowedPackages.includes('*')) {
    for (const pkg of delta.packages_added) {
      if (!isPackageAllowed(pkg.name, allowedPackages)) {
        violations.push(pkg.name);
      }
    }
  }

  // Warn if threshold exceeded
  if (delta.total_added > warnThreshold) {
    console.warn(`⚠ Warning: ${delta.total_added} packages added (threshold: ${warnThreshold})`);
    console.warn('This may indicate transitive dependency explosion');
  }

  return {
    ok: violations.length === 0,
    changed: true,
    violations,
    delta: {
      ...delta,
      diffstat,
      allowed: violations.length === 0
    }
  };
}

function isPackageAllowed(packageName: string, allowedPackages: string[]): boolean {
  if (allowedPackages.includes('*')) {
    return true;
  }

  if (allowedPackages.includes(packageName)) {
    return true;
  }

  // Scoped packages: @org/pkg
  const scopePattern = allowedPackages.find(p => p.endsWith('/*'));
  if (scopePattern && packageName.startsWith(scopePattern.replace('/*', '/'))) {
    return true;
  }

  return false;
}
```

---

## Testing Strategy

### Unit Tests

**Test allowlist matching:**
```typescript
// tests/lockfile-validator.test.ts
describe('isPackageAllowed', () => {
  it('should allow exact match', () => {
    expect(isPackageAllowed('zod', ['zod', 'date-fns'])).toBe(true);
  });

  it('should disallow non-matching package', () => {
    expect(isPackageAllowed('axios', ['zod', 'date-fns'])).toBe(false);
  });

  it('should allow wildcard', () => {
    expect(isPackageAllowed('anything', ['*'])).toBe(true);
  });

  it('should allow scoped packages with wildcard', () => {
    expect(isPackageAllowed('@anthropic/sdk', ['@anthropic/*'])).toBe(true);
    expect(isPackageAllowed('@other/pkg', ['@anthropic/*'])).toBe(false);
  });
});
```

**Test lockfile parsing:**
```typescript
describe('parseLockfileDelta', () => {
  it('should parse package-lock.json diff', async () => {
    // ... test with mock diff ...
  });

  it('should return null if no changes', async () => {
    // ... test with empty diff ...
  });
});
```

### Integration Tests

**Test allowlist enforcement:**
```typescript
// tests/allow-deps-integration.test.ts
describe('Allow-deps allowlist', () => {
  it('should allow package in allowlist', async () => {
    // 1. Run with --allow-deps zod
    // 2. Agent installs zod
    // 3. Verification passes
    // 4. lockfile_changed event emitted
  });

  it('should block package not in allowlist', async () => {
    // 1. Run with --allow-deps zod
    // 2. Agent installs axios (not allowed)
    // 3. Verification fails with lockfile_violation
  });

  it('should allow all packages with wildcard', async () => {
    // 1. Run with --allow-deps '*'
    // 2. Agent installs anything
    // 3. Verification passes
  });
});
```

---

## User Experience

### Success Case

**Command:**
```bash
runr run --task implement-validation.md --allow-deps zod
```

**Output:**
```
✓ Preflight: Scope OK (allow: apps/api/**, deps: zod)
...
⚠ Lockfile changed: pnpm-lock.yaml
  Packages added: zod@3.22.0 (1 package, 0 transitive)
  Allowed: yes
...
✓ Checkpoint created: ae7bb87
```

### Violation Case

**Command:**
```bash
runr run --task implement-api.md --allow-deps zod
```

**Agent installs:** `zod` (allowed) + `axios` (not allowed)

**Output:**
```
✓ Implementation complete
✗ Verification failed: Lockfile violation
  Lockfile changed: pnpm-lock.yaml
  Disallowed packages: axios
  Allowed packages: zod

  To fix:
  1. Remove disallowed packages from code
  2. Or re-run with --allow-deps 'zod,axios'
  3. Or allow all with --allow-deps '*'

Run stopped: lockfile_violation
```

---

## Rollout Plan

### Phase 1: Config Schema (Week 2, Day 1)
1. Add `depsSchema` to config
2. Update CLI to parse `--allow-deps <packages>`
3. Update scope guard to accept policy

### Phase 2: Lockfile Parser (Week 2, Days 2-3)
1. Implement minimal lockfile parsing (package-lock.json first)
2. Add unit tests
3. Test diffstat extraction

### Phase 3: Validation (Week 2, Days 4-5)
1. Implement `validateLockfileChanges()`
2. Call from VERIFY phase
3. Add timeline event emission
4. Integration tests

### Phase 4: Polish (Week 2, Day 5)
1. Error messages + user guidance
2. Warning for threshold exceeded
3. Documentation updates

---

## File Changes Summary

**New files:**
- `src/supervisor/lockfile-parser.ts` (~150 lines)
- `src/supervisor/lockfile-validator.ts` (~100 lines)
- `tests/lockfile-validator.test.ts` (unit tests)
- `tests/allow-deps-integration.test.ts` (integration tests)

**Modified files:**
- `src/config/schema.ts` (add depsSchema)
- `src/cli.ts` (change --allow-deps option)
- `src/commands/run.ts` (parse deps config)
- `src/commands/resume.ts` (same)
- `src/supervisor/scope-guard.ts` (update checkLockfiles signature)
- `src/supervisor/runner.ts` (call validation in VERIFY phase)

**Total LOC estimate:** ~300 lines

---

## Success Criteria

- [ ] CLI accepts `--allow-deps pkg1,pkg2`
- [ ] Config supports persistent allowlist
- [ ] Lockfile changes emit `lockfile_changed` event with diffstat
- [ ] Allowlist violations block run with helpful error
- [ ] Wildcard `*` allows all packages
- [ ] Scoped packages `@org/*` work
- [ ] Default behavior unchanged (strict, no deps)
- [ ] Tests pass
- [ ] Manual testing: run with allowlist, verify enforcement

---

## Future Enhancements (Not in Scope)

- **Audit mode:** Allow all deps but scream in logs/timeline
- **Open mode:** Alias for `--allow-deps '*'`
- **Lockfile auto-commit:** Separate milestone for deps changes
- **Better parsing:** Use lockfile parsing libraries instead of regex
- **Transitive dep analysis:** Show dependency tree
