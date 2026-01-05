# Checkpoint Metadata Sidecar

**Priority:** HIGH
**Effort:** Small (~100-150 lines)
**Risk:** Low (pure additive, fallback to git log parsing)

---

## Problem

Git commit messages are being used as a structured metadata store:

```typescript
// Current approach (src/commands/resume.ts:159-178)
const runSpecificPattern = `^chore(runr): checkpoint ${state.run_id} milestone `;
const result = await git(['log', '--grep', runSpecificPattern, ...]);
const match = commitMessage.match(/milestone (\d+)/);
lastCheckpointMilestoneIndex = parseInt(match[1], 10);
```

**Why this is fragile:**
1. String parsing hell (already have 2 formats: run-specific + legacy)
2. Git history rewrites (rebase, squash, cherry-pick) can:
   - Reorder commits
   - Condense commits (squash merges)
   - Remove commits entirely
3. Collision risk with other tools/hooks
4. Every format change requires "legacy parser forever"

**Evidence:**
- Drift detection code exists (`feat(resume): Detect and correct milestone index drift`)
- Two separate parsing branches for legacy vs new format
- Comment: "Try run-specific pattern first, then fallback to legacy"

---

## Solution

**Keep git commits as the checkpoint mechanism** (they're still the right artifact for verified state).

**Add structured metadata sidecar** (decouples metadata lookup from commit message parsing).

### File Structure

```
.runr/
├── runs/<runId>/
│   ├── state.json
│   ├── timeline.jsonl
│   └── ...
└── checkpoints/
    ├── <sha1>.json          # Metadata for checkpoint commit sha1
    ├── <sha2>.json          # Metadata for checkpoint commit sha2
    └── index.json           # Optional: run_id → sha mapping
```

### Checkpoint Metadata Schema

**File:** `.runr/checkpoints/<sha>.json`

```json
{
  "schema_version": "1.0.0",
  "sha": "ae7bb871d69c479a2790ef0b941e99d34c1b5820",
  "run_id": "20260104035601",
  "milestone_index": 0,
  "milestone_title": "Implement getValidMoveTargets function",
  "created_at": "2026-01-04T03:58:12.345Z",
  "tier": "tier0",
  "verification_commands": [
    "npm install",
    "npm run lint",
    "npm run typecheck",
    "npm run test"
  ]
}
```

**Fields:**
- `schema_version` (string): Version of this schema (for future evolution)
- `sha` (string): Git commit SHA (redundant with filename, but useful for validation)
- `run_id` (string): Which run created this checkpoint
- `milestone_index` (number): Which milestone this checkpoint represents (0-indexed)
- `milestone_title` (string): Human-readable milestone goal
- `created_at` (string): ISO 8601 timestamp
- `tier` (string): Which verification tier was used (tier0, tier1, tier2)
- `verification_commands` (string[]): Commands that passed verification

**Why this schema:**
- Minimal (only what's needed for resume)
- Self-contained (doesn't require reading other files)
- Extensible (schema_version enables evolution)

---

## Implementation Plan

### 1. Write Path (Checkpoint Creation)

**Location:** `src/supervisor/runner.ts` in `CHECKPOINT` phase (around line 800-900)

**Current flow:**
1. Create git commit
2. Update state.json with `checkpoint_commit_sha`
3. Log `checkpoint_complete` event to timeline

**New flow:**
1. Create git commit → get `sha`
2. **Write `.runr/checkpoints/<sha>.json`** (NEW)
3. Update state.json with `checkpoint_commit_sha`
4. Log `checkpoint_complete` event to timeline

**Atomic write pattern:**
```typescript
import fs from 'node:fs/promises';
import path from 'node:path';

async function writeCheckpointMetadata(options: {
  repoPath: string;
  sha: string;
  runId: string;
  milestoneIndex: number;
  milestone: Milestone;
  tier: VerificationTier;
  verificationCommands: string[];
}): Promise<void> {
  const { repoPath, sha, runId, milestoneIndex, milestone, tier, verificationCommands } = options;

  const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');
  await fs.mkdir(checkpointsDir, { recursive: true });

  const metadata = {
    schema_version: '1.0.0',
    sha,
    run_id: runId,
    milestone_index: milestoneIndex,
    milestone_title: milestone.goal,
    created_at: new Date().toISOString(),
    tier,
    verification_commands: verificationCommands
  };

  const metadataPath = path.join(checkpointsDir, `${sha}.json`);
  const tempPath = `${metadataPath}.tmp`;

  // Atomic write: write to temp file, then rename
  await fs.writeFile(tempPath, JSON.stringify(metadata, null, 2), 'utf-8');
  await fs.rename(tempPath, metadataPath);
}
```

**Where to call:**
In `src/supervisor/runner.ts`, after successful git commit:

```typescript
case 'CHECKPOINT': {
  // ... existing git commit logic ...
  const commitSha = await createCheckpointCommit(...);

  // NEW: Write checkpoint metadata
  await writeCheckpointMetadata({
    repoPath: state.repo_path,
    sha: commitSha,
    runId: state.run_id,
    milestoneIndex: state.milestone_index,
    milestone: state.milestones[state.milestone_index],
    tier: /* current tier */,
    verificationCommands: /* commands run */
  });

  // ... rest of checkpoint logic ...
}
```

---

### 2. Read Path (Resume)

**Location:** `src/commands/resume.ts` in `buildResumePlan()` function (around line 143-250)

**Current flow:**
1. Try git log with run-specific pattern
2. Fallback to legacy pattern
3. Parse commit message to extract milestone index

**New flow:**
1. **Try sidecar metadata for this run_id** (NEW, FAST)
2. Fallback to git log with run-specific pattern
3. Fallback to legacy pattern
4. Parse commit message to extract milestone index

**Sidecar lookup function:**
```typescript
interface CheckpointMetadata {
  schema_version: string;
  sha: string;
  run_id: string;
  milestone_index: number;
  milestone_title: string;
  created_at: string;
  tier: VerificationTier;
  verification_commands: string[];
}

async function findLatestCheckpointBySidecar(
  repoPath: string,
  runId: string
): Promise<{ sha: string; milestoneIndex: number } | null> {
  const checkpointsDir = path.join(repoPath, '.runr', 'checkpoints');

  // Check if checkpoints directory exists
  try {
    await fs.access(checkpointsDir);
  } catch {
    return null; // No sidecars exist yet
  }

  // Read all checkpoint files
  const files = await fs.readdir(checkpointsDir);
  const jsonFiles = files.filter(f => f.endsWith('.json') && f !== 'index.json');

  // Filter to this run_id and find highest milestone_index
  let latestCheckpoint: { sha: string; milestoneIndex: number } | null = null;

  for (const file of jsonFiles) {
    try {
      const content = await fs.readFile(
        path.join(checkpointsDir, file),
        'utf-8'
      );
      const metadata: CheckpointMetadata = JSON.parse(content);

      // Skip if wrong run
      if (metadata.run_id !== runId) {
        continue;
      }

      // Track highest milestone_index for this run
      if (
        latestCheckpoint === null ||
        metadata.milestone_index > latestCheckpoint.milestoneIndex
      ) {
        latestCheckpoint = {
          sha: metadata.sha,
          milestoneIndex: metadata.milestone_index
        };
      }
    } catch {
      // Ignore malformed files
      continue;
    }
  }

  return latestCheckpoint;
}
```

**Updated resume plan logic:**
```typescript
export async function buildResumePlan(options: {
  state: RunState;
  repoPath: string;
  runStore: RunStore;
  config: AgentConfig;
}): Promise<ResumePlan> {
  const { state, repoPath } = options;

  let checkpointSha: string | null = null;
  let lastCheckpointMilestoneIndex = -1;
  let checkpointSource: 'sidecar' | 'git_log_run_specific' | 'git_log_legacy' | 'none' = 'none';

  // PRIORITY 1: Try sidecar metadata (NEW)
  const sidecarResult = await findLatestCheckpointBySidecar(repoPath, state.run_id);
  if (sidecarResult) {
    checkpointSha = sidecarResult.sha;
    lastCheckpointMilestoneIndex = sidecarResult.milestoneIndex;
    checkpointSource = 'sidecar';
  }

  // PRIORITY 2: Fallback to git log (run-specific pattern)
  if (checkpointSha === null) {
    // ... existing git log logic ...
  }

  // PRIORITY 3: Fallback to legacy git log
  if (checkpointSha === null) {
    // ... existing legacy logic ...
  }

  // ... rest of buildResumePlan ...
}
```

---

### 3. Backward Compatibility

**No breaking changes:**
- Old runs (without sidecars) continue to work via git log parsing
- New runs write sidecars automatically
- Resume tries sidecar first, falls back to git log

**Migration strategy:**
- **No migration day needed**
- Existing checkpoints don't need sidecars (git log parsing still works)
- New checkpoints get sidecars automatically
- Gradual transition as new runs are created

**Handling missing sidecars:**
```typescript
// Resume will try:
// 1. Sidecar (fast, reliable) → if exists, use it
// 2. Git log (slower, fragile) → fallback for old runs
// 3. Error → only if both fail
```

---

### 4. Drift Detection Enhancement

**Current drift detection:** (src/commands/resume.ts, recent commit `8d25588`)

Uses git log to find checkpoint, compares with state.json milestone_index.

**With sidecar:**
- Drift detection becomes faster (no git log grep)
- More reliable (not affected by commit message changes)

**Updated drift detection:**
```typescript
// If sidecar exists:
const sidecarMilestoneIndex = sidecarResult.milestoneIndex;
const stateMilestoneIndex = state.milestone_index;

if (sidecarMilestoneIndex !== stateMilestoneIndex) {
  console.warn('Milestone index drift detected');
  console.warn(`State says: ${stateMilestoneIndex}`);
  console.warn(`Checkpoint says: ${sidecarMilestoneIndex}`);
  console.warn('Using checkpoint as source of truth');

  // Correct drift
  state.milestone_index = sidecarMilestoneIndex;
}
```

---

### 5. Timeline Event (Optional Enhancement)

**Add checkpoint metadata to timeline:**

```json
{
  "seq": 42,
  "timestamp": "2026-01-04T03:58:12.345Z",
  "type": "checkpoint_complete",
  "source": "supervisor",
  "payload": {
    "milestone_index": 0,
    "commit_sha": "ae7bb871...",
    "tier": "tier0",
    "sidecar_written": true  // NEW: confirms metadata sidecar was written
  }
}
```

This makes it easy to verify sidecars were created.

---

## Testing Strategy

### Unit Tests

**Test sidecar write:**
```typescript
// tests/checkpoint-sidecar.test.ts
describe('writeCheckpointMetadata', () => {
  it('should write metadata to .runr/checkpoints/<sha>.json', async () => {
    // ... test atomic write ...
  });

  it('should create checkpoints directory if missing', async () => {
    // ... test mkdir recursive ...
  });
});
```

**Test sidecar read:**
```typescript
describe('findLatestCheckpointBySidecar', () => {
  it('should return null if checkpoints dir does not exist', async () => {
    // ... test missing dir ...
  });

  it('should find latest checkpoint for run_id', async () => {
    // ... test with multiple checkpoints ...
  });

  it('should ignore checkpoints from other runs', async () => {
    // ... test filtering by run_id ...
  });

  it('should handle malformed JSON gracefully', async () => {
    // ... test error handling ...
  });
});
```

### Integration Tests

**Test resume with sidecar:**
```typescript
// tests/resume-with-sidecar.test.ts
describe('Resume with sidecar', () => {
  it('should prefer sidecar over git log', async () => {
    // 1. Create run with checkpoint
    // 2. Verify sidecar exists
    // 3. Resume
    // 4. Verify checkpointSource === 'sidecar'
  });

  it('should fall back to git log if sidecar missing', async () => {
    // 1. Create run with checkpoint
    // 2. Delete sidecar
    // 3. Resume
    // 4. Verify checkpointSource === 'git_log_run_specific'
  });
});
```

**Test resilience to git history rewrites:**
```typescript
describe('Resume after git rebase', () => {
  it('should resume successfully even after rebase', async () => {
    // 1. Create run with checkpoint (sidecar written)
    // 2. Git rebase (commit SHA changes)
    // 3. Resume should still work (sidecar has original SHA)
    // Note: This might fail if we validate SHA exists in git history
    //       Consider whether sidecar should be primary source even if commit missing
  });
});
```

---

## Rollout Plan

### Phase 1: Write Sidecars (Week 1, Days 1-2)
1. Implement `writeCheckpointMetadata()`
2. Call it after checkpoint commit in `runner.ts`
3. Add unit tests
4. Verify sidecars are created in manual testing

### Phase 2: Read Sidecars (Week 1, Days 3-4)
1. Implement `findLatestCheckpointBySidecar()`
2. Update `buildResumePlan()` to try sidecar first
3. Add unit tests
4. Test resume with and without sidecars

### Phase 3: Drift Detection (Week 1, Day 5)
1. Update drift detection to use sidecar when available
2. Add integration tests
3. Document behavior in resume plan output

### Phase 4: Timeline Event (Optional, Week 2)
1. Add `sidecar_written` field to `checkpoint_complete` event
2. Update timeline schema docs

---

## File Changes Summary

**New files:**
- `src/store/checkpoint-metadata.ts` (sidecar read/write functions)
- `tests/checkpoint-sidecar.test.ts` (unit tests)
- `tests/resume-with-sidecar.test.ts` (integration tests)

**Modified files:**
- `src/supervisor/runner.ts` (call writeCheckpointMetadata in CHECKPOINT phase)
- `src/commands/resume.ts` (try sidecar first in buildResumePlan)
- `src/types/schemas.ts` (add CheckpointMetadata interface if needed)

**Total LOC estimate:** ~150 lines (implementation + tests)

---

## Success Criteria

- [ ] Checkpoint commits write `.runr/checkpoints/<sha>.json`
- [ ] Resume reads sidecar if exists
- [ ] Resume falls back to git log if sidecar missing
- [ ] Drift detection uses sidecar when available
- [ ] No breaking changes to existing runs
- [ ] Tests pass for sidecar read/write
- [ ] Manual testing: create run, checkpoint, resume with sidecar
- [ ] Manual testing: delete sidecar, resume with git log fallback

---

## Future Enhancements (Not in Scope)

- **Index file:** `.runr/checkpoints/index.json` mapping run_id → [sha1, sha2, ...]
  - Faster lookup than scanning all files
  - Can add later if performance becomes issue
- **Garbage collection:** Delete sidecars for old/deleted runs
  - Can add to `runr gc` command later
- **Validation:** Check sidecar SHA matches git commit
  - Useful for detecting corruption
  - Can add with `runr doctor` later
