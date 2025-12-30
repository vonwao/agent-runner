# Git Branch Incident - 2025-12-30

## Summary

A brief period of branch divergence occurred when commits were moved off `main` and then work continued on `main`. This document explains what happened for any agent/process that may have been affected.

## Timeline of Events

```
Reflog reconstruction:

1. main was at a28b518 (12 commits ahead of origin/main)
2. User requested moving unpushed commits to a dev branch
3. Created branch `dev-unpushed` at a28b518
4. Reset main back to d9abe49 (origin/main)         <-- DANGER WINDOW START
5. Commit 51ce383 "Run completed successfully!" made on main
6. Realized the split caused confusion
7. Merged dev-unpushed back into main at 37b472d    <-- DANGER WINDOW END
8. Deleted dev-unpushed branch
```

## The Danger Window

Between steps 4 and 7, `main` was temporarily missing these commits:

| Commit | Message |
|--------|---------|
| ac45d0b | positioning docs |
| 3ac304c | framework comparison |
| 7de8c15 | build/tests verified |
| 0a5089c | excludes re-injection fix |
| 33e9d4f | half-removed worktree error handling |
| af75ad1 | Phase-1 ownership gating |
| 668c786 | error message check |
| 1039273 | Phase-2 IMPLEMENT enforcement |
| 60f6ce8 | x |
| 73f33f7 | All tasks complete |
| 077c2a6 | Polish items added |
| a28b518 | review loop detection status |

## Current State (After Fix)

```
main is now at 37b472d (14 commits ahead of origin/main)

Graph:
*   37b472d Merge dev-unpushed back to main
|\
| * a28b518 ... (12 commits from dev-unpushed)
| * ...
* | 51ce383 Run completed successfully!
|/
* d9abe49 (origin/main)
```

All commits are now on `main`. The merge commit 37b472d combines both branches.

## What Other Agents Should Check

If you were running during the danger window, verify:

1. **Your working directory base**: What commit was your work based on?
   ```bash
   git log --oneline -n 5  # in your worktree
   ```

2. **If based on d9abe49**: Your changes may not include the 12 commits that were temporarily removed. You may need to rebase or merge from current main.

3. **If based on a28b518 or earlier commits in that chain**: You should be fine - those commits are now back on main via the merge.

4. **If you made commits during the window**: Check if they're reachable from current main:
   ```bash
   git branch --contains <your-commit-sha>
   ```

## Files Potentially Affected

Key files modified in the temporarily-removed commits:
- `src/supervisor/runner.ts`
- `src/repo/worktree.ts`
- `src/ownership/normalize.ts` (new file)
- `src/supervisor/scope-guard.ts` (new file)
- `src/tasks/task-metadata.ts` (new file)
- `docs/framework-comparison.md` (new file)

## Recovery Commands

If your worktree is in a bad state:

```bash
# Option 1: Rebase your work onto current main
git fetch origin
git rebase main

# Option 2: Merge current main into your branch
git merge main

# Option 3: If completely stuck, check reflog
git reflog
# Find a good state and reset to it
```

## The Commit Made During the Window

Commit `51ce383` "Run completed successfully!" was made by agent Otto and contained:

```
src/supervisor/runner.ts | 5 +++--

Fix: Compute isLastMilestone = milestone_index === milestones.length - 1
(Previously is_milestone_end and is_run_end were hardcoded to false)
```

**Verified**: This fix is present in the merged result at `src/supervisor/runner.ts:1140-1145`.

## Merge Verification

- No merge conflict markers in any `.ts` files
- `npm run build` passes
- Otto's changes + dev-unpushed changes both present in final state

## Lesson Learned

Don't split commits to a separate branch if you plan to continue working on main. The "move to dev branch" pattern caused a fork that created confusion. For single-developer, single-stream work, just stay on main.
