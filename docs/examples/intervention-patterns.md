# Intervention Patterns

Examples of common `runr intervene` patterns for different scenarios.

## Basic Patterns

### Simple Manual Fix

The most basic intervention - just recording that you did something:

```bash
runr intervene <run_id> \
  --reason manual_fix \
  --note "Fixed missing import statement in auth module"
```

### With Command Output

Capture commands you ran as part of the fix:

```bash
runr intervene <run_id> \
  --reason review_loop \
  --note "Fixed TypeScript errors raised by reviewer" \
  --cmd "npm run typecheck" \
  --cmd "npm test"
```

The output of each command is captured in the intervention receipt.

### Latest Run Shortcut

Don't remember the run ID? Use `latest`:

```bash
runr intervene latest \
  --reason manual_fix \
  --note "Quick fix for the task I was just working on"
```

## SHA Anchoring

### Retroactive Attribution

Already made commits you want to attribute to a run:

```bash
# First, find the commit before your changes
git log --oneline -10

# Then attribute everything since that commit
runr intervene <run_id> \
  --reason scope_violation \
  --note "Manual changes required for scope extension" \
  --since abc123def
```

This captures:
- `base_sha`: The commit you specified
- `head_sha`: Current HEAD after your changes
- `commits_in_range`: List of commits between them

### Understanding the SHA Range

When you use `--since`, the receipt records:

```json
{
  "base_sha": "abc123...",   // Before your changes
  "head_sha": "def456...",   // After your changes
  "commits_in_range": ["commit1", "commit2"],
  "dirty_before": false,
  "dirty_after": false
}
```

Commits within this range are automatically classified as `INFERRED` in `runr audit`.

## Commit Linking

### Create New Commit with Trailers

Stage your changes and create a commit with Runr attribution:

```bash
git add .
runr intervene <run_id> \
  --reason manual_fix \
  --note "Hotfix for production issue" \
  --commit "Fix null pointer in user lookup"
```

Creates a commit with trailers:
```
Fix null pointer in user lookup

Runr-Run-Id: 20260106120000
Runr-Intervention: true
Runr-Reason: manual_fix
```

### Amend Last Commit (Flow Mode Only)

Add Runr trailers to your most recent commit:

```bash
# Already committed? Add attribution after the fact
runr intervene <run_id> \
  --reason manual_fix \
  --note "Attributing my recent commit" \
  --amend-last
```

**Note:** Blocked in Ledger mode. Use `--force` to override (not recommended).

### Stage Without Committing

Just stage changes for later:

```bash
runr intervene <run_id> \
  --reason verification_failed \
  --note "Staged fixes, will commit with PR" \
  --stage-only
```

## Reason-Specific Patterns

### review_loop - Breaking the Review Cycle

When a run stops due to review loop detection:

```bash
# 1. Check what reviewer was asking for
runr status <run_id>

# 2. Fix the issues manually
# (edit files, run tests, etc.)

# 3. Record the intervention with evidence
runr intervene <run_id> \
  --reason review_loop \
  --note "Fixed issues: missing test coverage, TS errors" \
  --cmd "npm run typecheck" \
  --cmd "npm test -- --coverage"
```

### stalled_timeout - Recovering from Stall

When a run times out:

```bash
runr intervene <run_id> \
  --reason stalled_timeout \
  --note "Worker stalled, completed manually" \
  --commit "Complete implementation (manual intervention)"
```

### verification_failed - Fixing Failures

When verification commands fail:

```bash
# Fix the failing verification
# Then record what you did

runr intervene <run_id> \
  --reason verification_failed \
  --note "Fixed build by updating dependencies" \
  --cmd "npm install" \
  --cmd "npm run build"
```

### scope_violation - Out-of-Scope Changes

When changes are needed outside the allowed scope:

```bash
runr intervene <run_id> \
  --reason scope_violation \
  --note "Required changes to shared utility module" \
  --since <base_commit>
```

## Advanced Patterns

### JSON Output for Automation

```bash
runr intervene <run_id> \
  --reason manual_fix \
  --note "Automated fix" \
  --json > intervention.json

# Check result
jq '.success' intervention.json
```

### Full Output Capture

By default, output is truncated. For full output:

```bash
runr intervene <run_id> \
  --reason review_loop \
  --note "Need full test output for review" \
  --cmd-output full \
  --cmd "npm test"
```

### Disable Redaction (Not Recommended)

Secrets are redacted by default. To disable (use with caution):

```bash
runr intervene <run_id> \
  --reason manual_fix \
  --note "Debug intervention (private repo)" \
  --no-redact \
  --cmd "env"
```

## Common Workflows

### Post-Mortem Attribution

After manual work is done, attribute it properly:

```bash
# 1. Find the relevant run
runr status --all

# 2. Find your starting point
git log --oneline | head -20

# 3. Create intervention with SHA range
runr intervene 20260106120000 \
  --reason manual_fix \
  --note "Post-mortem: manual hotfix for production issue" \
  --since abc123def
```

### CI/CD Integration

Record deployments or CI fixes:

```bash
# In CI script
runr intervene ${RUN_ID} \
  --reason manual_fix \
  --note "CI: Fixed flaky test" \
  --cmd "npm test -- --retry 3" \
  --json >> ci-interventions.json
```

### Team Handoff

When handing off work to another team member:

```bash
# Original developer records what they did
runr intervene <run_id> \
  --reason review_loop \
  --note "Partial fix: auth issues resolved, UI still pending" \
  --stage-only

# Next developer continues from there
```

## Tips

1. **Record early, record often** - Don't wait until you're done
2. **Use meaningful notes** - Your future self will thank you
3. **Capture commands** - They serve as evidence and documentation
4. **Use --since for batch attribution** - One intervention can cover multiple commits
5. **Check audit coverage** - `runr audit` shows your attribution gaps
