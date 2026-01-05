# Runr-Native Workflow v1 Implementation

**Sprint Goal:** Implement minimal workflow layer: config + bundle + submit

**Duration:** 1-2 weeks
**Approach:** Manual git workflow (NO self-hosting until M2 tested)

---

## ⚠️ CRITICAL: No Self-Hosting Rules

**DO NOT use Runr to build Runr during this sprint.**

Exceptions:
- ✅ OK: Test `runr bundle` on existing runs (read-only)
- ❌ NOT OK: Use `runr run` or `runr submit` to develop itself
- ❌ NOT OK: Run this task file through Runr

**Why:** Avoid "tool broke itself mid-development" scenarios.

**Development workflow for this sprint:**
1. Work on `dev` branch directly
2. Make commits manually
3. Test in fixture repos / dogfood/ sandbox
4. Only dogfood `submit` on real repo AFTER M2 tests pass

---

## Decisions Locked (Do Not Change)

### Config Schema (5 fields only)

```typescript
interface WorkflowConfig {
  profile: 'solo' | 'pr' | 'trunk';
  integration_branch: string;
  submit_strategy: 'cherry-pick'; // v1 hard limit
  require_clean_tree: boolean;
  require_verification: boolean;
}
```

**Profile Presets:**
- `solo`: integration_branch=`dev`, require_verification=true, require_clean_tree=true
- `pr`: integration_branch=`main`, require_verification=false, require_clean_tree=true
- `trunk`: integration_branch=`main`, require_verification=true, require_clean_tree=true

### Commands to Implement

**1. `runr bundle <run_id> [--output <path>]`**
- Output: deterministic markdown (fixed format, no templating)
- Default: stdout
- If `--output <path>`: write file and print path confirmation

**2. `runr submit <run_id> [--to <branch>] [--dry-run] [--push]`**
- Strategy: cherry-pick only (no merge, no fast-forward)
- Default target: from `workflow.integration_branch` config
- `--dry-run`: validate + print plan, no changes
- `--push`: push to origin after cherry-pick (opt-in)

### Timeline Events

```typescript
// Success
{
  type: 'run_submitted',
  source: 'submit',
  payload: {
    run_id: string,
    checkpoint_sha: string,
    target_branch: string,
    strategy: 'cherry-pick',
    submitted_at: string
  }
}

// Validation failure
{
  type: 'submit_validation_failed',
  source: 'submit',
  payload: {
    run_id: string,
    reason: 'no_checkpoint' | 'run_not_ready' | 'dirty_tree' | 'verification_missing' | 'target_branch_missing' | 'git_error',
    details: string
  }
}

// Cherry-pick conflict
{
  type: 'submit_conflict',
  source: 'submit',
  payload: {
    run_id: string,
    checkpoint_sha: string,
    target_branch: string,
    conflicted_files: string[]
  }
}
```

---

## Milestone 0: Workflow Config

**Goal:** Add workflow config schema, profile presets, and init flag

**Files to Change:**
- `src/config/schema.ts` - Add WorkflowConfig interface and schema
- `src/config/load.ts` - Load workflow config with profile defaults
- `src/commands/init.ts` - Add `--workflow <profile>` flag

**Implementation Details:**

1. **Schema (src/config/schema.ts)**
   ```typescript
   const workflowConfigSchema = z.object({
     profile: z.enum(['solo', 'pr', 'trunk']).default('solo'),
     integration_branch: z.string(),
     submit_strategy: z.literal('cherry-pick').default('cherry-pick'),
     require_clean_tree: z.boolean().default(true),
     require_verification: z.boolean().default(true)
   });
   ```

2. **Profile Defaults Function**
   ```typescript
   function getProfileDefaults(profile: 'solo' | 'pr' | 'trunk') {
     switch (profile) {
       case 'solo':
         return { integration_branch: 'dev', require_verification: true };
       case 'pr':
         return { integration_branch: 'main', require_verification: false };
       case 'trunk':
         return { integration_branch: 'main', require_verification: true };
     }
   }
   ```

3. **Init Flag (src/commands/init.ts)**
   - Add `--workflow <profile>` option
   - Write config with profile + defaults
   - Print confirmation message

**Verification Commands:**
```bash
# Test init writes config
npm run build
node dist/cli.js init --workflow solo
cat .runr/runr.config.json | grep -A 5 '"workflow"'

# Test profile presets
node dist/cli.js init --workflow pr
cat .runr/runr.config.json | grep 'integration_branch.*main'

# Build + type check
npm run build
npm run typecheck
```

**Done Checks:**
- [ ] Config schema validates profile enum
- [ ] Init writes workflow config with correct defaults
- [ ] Each profile sets expected integration_branch
- [ ] Build passes with no type errors

**Stop Conditions:**
- If schema requires changes to existing config structure beyond adding `workflow` key → STOP
- If profile defaults conflict with existing config → STOP

---

## Milestone 1: Bundle Command

**Goal:** Implement read-only evidence packet generator

**Files to Create:**
- `src/commands/bundle.ts` - Main command implementation
- `tests/commands/bundle.test.ts` - Unit tests

**Bundle Output Format (Fixed):**

```markdown
# Run <run_id>

**Created:** <state.started_at>
**Repo:** <state.repo_path>
**Checkpoint:** <checkpoint_sha or "none">
**Status:** <state.phase> (<state.stop_reason if present>)

## Milestones (<completed>/<total>)
- [x] M0: <goal>
- [ ] M1: <goal>
...

## Verification Evidence
**Status:** <PASSED | FAILED | UNVERIFIED>
**Tier:** <tier or "none">
**Commands:** <commands list or "none">
**Result:** <✓ PASSED | ✗ FAILED | ⚠ UNVERIFIED>

## Changes (since checkpoint base)
<git show --stat output>

## Timeline Event Summary
- <event_type>: <count>
...

## Artifacts
- Timeline: <path to timeline.jsonl>
- Journal: <path to journal.md>
- State: <path to state.json>
- Review: <path to review_digest.md> (if exists)

---
🤖 Generated with Runr
```

**Implementation Details:**

1. **Read State**
   - Load `.runr/runs/<run_id>/state.json`
   - Get checkpoint_sha from state.checkpoint_commit_sha
   - Get milestones, verification evidence, timestamps

2. **Get Diffstat**
   - If checkpoint exists: `git show --stat <checkpoint_sha>`
   - Parse output into changes summary

3. **Timeline Summary**
   - Read `.runr/runs/<run_id>/timeline.jsonl`
   - Count events by type (just top N most common)

4. **Output**
   - Default: stdout
   - If `--output <path>`: write file, print confirmation

**Verification Commands:**
```bash
# Build
npm run build

# Test on real run (safe - read only)
node dist/cli.js bundle 20260105020229
node dist/cli.js bundle 20260105020229 --output /tmp/bundle-test.md

# Run tests
npm test -- bundle.test.ts

# Verify deterministic output (run twice, compare)
node dist/cli.js bundle 20260105020229 > /tmp/b1.md
node dist/cli.js bundle 20260105020229 > /tmp/b2.md
diff /tmp/b1.md /tmp/b2.md
```

**Done Checks:**
- [ ] Bundle outputs markdown for completed run
- [ ] Bundle outputs markdown for stopped run (shows stop_reason)
- [ ] Bundle handles missing checkpoint gracefully (shows "none")
- [ ] Bundle handles missing verification evidence (shows "UNVERIFIED")
- [ ] Output is deterministic (same run_id → same output)
- [ ] Completes in <2 seconds for typical run
- [ ] --output flag writes file and confirms
- [ ] Tests pass

**Stop Conditions:**
- If run folder structure is different than expected → STOP
- If git commands need complex abstractions → STOP (use simple execa)
- If timeline parsing is ambiguous → STOP

---

## Milestone 2: Submit Command

**Goal:** Implement safe cherry-pick integration to target branch

**Files to Create:**
- `src/commands/submit.ts` - Main command implementation
- `tests/commands/submit.test.ts` - Unit tests

**Test Approach:**
- ⚠️ Test in sandbox repos ONLY (not real Runr repo)
- Create fixture repo in tests with fake runs
- Test all validation paths
- Test dry-run behavior
- Test conflict detection

**Implementation Details:**

1. **Validation (Fail Fast)**
   - Load run state
   - Check checkpoint_sha exists
   - Check verification evidence if required
   - Check working tree clean if required
   - Check target branch exists
   - Return single actionable error on failure

2. **Cherry-Pick Execution**
   ```typescript
   // Checkout target branch
   await execa('git', ['checkout', targetBranch], { cwd: repoPath });

   // Cherry-pick checkpoint
   try {
     await execa('git', ['cherry-pick', checkpointSha], { cwd: repoPath });
   } catch (error) {
     // Abort on conflict
     await execa('git', ['cherry-pick', '--abort'], { cwd: repoPath });
     // Emit submit_conflict event
     // Exit with error
   }
   ```

3. **Dry-Run Mode**
   - Run all validations
   - Print what would happen
   - Exit 0 if would succeed, 1 if would fail
   - Do NOT execute cherry-pick
   - Do NOT write events

4. **Push (Optional)**
   ```typescript
   if (pushFlag) {
     await execa('git', ['push', 'origin', targetBranch], { cwd: repoPath });
   }
   ```

5. **Timeline Events**
   - Append events to `.runr/runs/<run_id>/timeline.jsonl`
   - Write run_submitted on success
   - Write submit_validation_failed on validation failure
   - Write submit_conflict on cherry-pick conflict

**Verification Commands:**
```bash
# Build
npm run build

# Test in fixture repo (NOT real repo)
npm test -- submit.test.ts

# Manual sandbox test (create throwaway repo)
mkdir /tmp/submit-sandbox
cd /tmp/submit-sandbox
git init
git commit --allow-empty -m "initial"
git checkout -b dev
# ... create fake run structure
# ... test submit command

# Dry-run test (safe on real repo)
node dist/cli.js submit <run_id> --to dev --dry-run
```

**Done Checks:**
- [ ] Submit validates checkpoint exists
- [ ] Submit validates verification if required
- [ ] Submit validates clean tree if required
- [ ] Submit validates target branch exists
- [ ] Submit refuses if validation fails with clear error
- [ ] Dry-run shows plan without making changes
- [ ] Cherry-pick succeeds on clean apply
- [ ] Cherry-pick aborts on conflict + emits event
- [ ] Push flag pushes to origin (opt-in)
- [ ] Timeline events written correctly
- [ ] Tests pass

**Stop Conditions:**
- If git operations need repo state changes not in spec → STOP
- If conflict resolution needs interactive mode → STOP (abort is correct)
- If push needs authentication handling → STOP (assume git credential helper works)

---

## Milestone 3: Polish & Dogfood

**Goal:** Final testing, docs, optional real-repo dogfood

**Tasks:**

1. **Update Doctor (Optional)**
   - Add check for workflow config
   - Print current profile + integration branch
   - Low effort, high clarity

2. **Documentation**
   - Update CLI docs with new commands
   - Add workflow profile docs
   - Add examples of bundle + submit usage

3. **Dogfood (Controlled)**
   - Find a completed run with checkpoint
   - Run: `runr bundle <run_id>`
   - Inspect output, verify looks good
   - Run: `runr submit <run_id> --to dev --dry-run`
   - Inspect plan, verify safe
   - (Optional) Run: `runr submit <run_id> --to dev`
   - Inspect git log, verify cherry-pick worked
   - (Optional) Run: `runr submit <run_id> --to dev --push`

**Verification Commands:**
```bash
# Full test suite
npm test

# Build check
npm run build

# Dogfood bundle (safe)
node dist/cli.js bundle <real_run_id>

# Dogfood submit dry-run (safe)
node dist/cli.js submit <real_run_id> --to dev --dry-run

# Optional: Real submit (carefully)
node dist/cli.js submit <real_run_id> --to dev
git log --oneline -3
git status
```

**Done Checks:**
- [ ] All tests pass
- [ ] Build succeeds with no warnings
- [ ] Bundle works on real run
- [ ] Submit dry-run works on real run
- [ ] Docs updated
- [ ] (Optional) Submit executed successfully on real run

---

## Output Required

At the end of implementation, provide:

1. **Files Changed/Added**
   - List all modified/created files
   - Line count changes

2. **CLI Usage Examples**
   ```bash
   # Config
   runr init --workflow solo

   # Bundle
   runr bundle 20260105020229
   runr bundle 20260105020229 --output bundle.md

   # Submit
   runr submit 20260105020229 --to dev --dry-run
   runr submit 20260105020229 --to dev
   runr submit 20260105020229 --to dev --push
   ```

3. **Example Bundle Output**
   - Show full bundle markdown for a real run

4. **Test Results**
   - Command output showing all tests pass
   - Coverage report (if available)

5. **Edge Cases Encountered**
   - Document any unexpected issues
   - Document workarounds or assumptions made

---

## Escape Hatches (If Things Go Wrong)

**If bundle breaks:**
- Read state.json manually
- Use `git show --stat <sha>` manually
- No damage done (read-only)

**If submit breaks:**
- Manual: `git checkout dev && git cherry-pick <sha>`
- Abort conflicts: `git cherry-pick --abort`
- Reset if needed: `git reset --hard origin/dev`

**If config breaks:**
- Edit `.runr/runr.config.json` manually
- Remove workflow section if needed
- Existing commands still work without it

---

## Stop Conditions (Ask Before Proceeding)

**STOP if:**
1. Changes required to public CLI surface beyond spec
2. Git operations need complex abstractions not in spec
3. Config changes break existing functionality
4. Test fixture setup is ambiguous
5. Conflict resolution needs interactive mode
6. Authentication issues with push
7. Run folder structure differs from expected
8. Timeline schema needs changes

**When stopped, report:**
- What you were trying to do
- What the blocker is
- Propose minimal solution or ask for guidance

---

## Success Criteria (Final Acceptance)

- [ ] `runr init --workflow solo` writes correct config
- [ ] `runr bundle <run_id>` generates deterministic markdown
- [ ] `runr submit <run_id> --to dev --dry-run` validates without changes
- [ ] `runr submit <run_id> --to dev` cherry-picks checkpoint
- [ ] Submit validation catches all error cases with clear messages
- [ ] Submit conflicts abort cleanly
- [ ] Timeline events written correctly
- [ ] All tests pass
- [ ] Bundle + submit work on real Runr run (dogfood proof)
- [ ] No breaking changes to existing commands
- [ ] Docs updated with examples

---

## Timeline Estimate

- **M0 (Config):** 2-3 hours
- **M1 (Bundle):** 4-6 hours
- **M2 (Submit):** 6-8 hours
- **M3 (Polish):** 2-3 hours

**Total:** ~1 week with testing + polish

---

## Notes for Implementation

**Keep it boring:**
- Use `execa` for git commands (already in project)
- Use existing config loading patterns
- Use existing timeline append patterns
- Use existing error handling patterns

**Don't over-engineer:**
- No custom git abstraction layer
- No template engine for bundle
- No conflict resolution logic
- No complex validation framework

**Test progressively:**
- M0: Test config writes correctly
- M1: Test bundle on real runs (safe)
- M2: Test submit in sandbox first, real repo last
- M3: Dogfood carefully with dry-run first

**Commit frequently:**
- After each milestone
- After each major function
- Keep commits small and focused
