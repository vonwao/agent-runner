# Resume Gym: State Integrity Test Suite

Systematic tests for resume correctness. Each case exercises a specific failure → resume scenario.

## Purpose

Ensure resume behavior is **deterministic**, **explainable**, and **never surprising**:
1. Nothing already verified gets redone
2. User can answer "What changed since last checkpoint?"
3. Resume behavior follows documented invariants

## Case Index (Ordered)

| Order | Case | Stop Reason | Resume Behavior |
|-------|------|-------------|-----------------|
| 10 | `test-failure` | Milestone 2 verify fails | Resumes at milestone 2, doesn't rerun milestone 1 |
| 20 | `lint-failure` | Lint error in milestone 3 | Resumes at milestone 3 after user fixes lint |
| 30 | `guard-violation` | File outside allowlist | Resumes after user moves file or updates allowlist |
| 40 | `dirty-working-tree` | N/A (preflight) | Resume REFUSES with clear error unless --auto-stash |
| 50 | `merge-conflict` | N/A (preflight) | Resume REFUSES if working tree conflicts |

## Adding a New Case

1. Create directory: `fixtures/resume-gym/<case-name>/`
2. Add `case.json` with order, description, run/resume args
3. Add `expect.json` with assertions
4. Create `repo/` template (no .git)
5. Add optional `steps/setup.sh` or `steps/mutate-before-resume.sh`
6. Update this README index

## Shared Tools

Located in `_shared/tools/`:
- `pass.sh` — Always exits 0
- `fail.sh` — Always exits 1
- `flaky-n-of-m.sh N M` — Fails first N attempts, passes on attempt N+1
- `write-file.sh <path> <content>` — Deterministic file writes
- `touch-cache.sh [type]` — Creates gitignored cache files

## Running Tests

```bash
npm test -- src/commands/__tests__/resume-gym.test.ts
```

Each test:
1. Copies `repo/` to temp dir
2. Runs `git init` + baseline commit
3. Executes `runr run ...` (expecting stop)
4. Optionally mutates working tree
5. Executes `runr resume ...`
6. Asserts invariants from `expect.json`

## Invariants Tested

- **No duplicate checkpoints**: Same sha never checkpointed twice
- **Milestone monotonicity**: Resume starts from last passing checkpoint
- **No duplicate work**: Milestones 1..k not re-run if checkpointed
- **Resume provenance**: Timeline has resume event with checkpoint_sha + milestone_index
- **Working tree safety**: Dirty tree refused unless explicit --auto-stash
- **Delta explanation**: Resume records diffstat since checkpoint
