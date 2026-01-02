# Day 5: Demo Ready ✅

**Date:** 2026-01-02
**Status:** All assets ready for 3-minute demo recording

---

## Demo Assets Ready

### 1. Real Failure Case ✅
- **Run ID:** `20260102075326`
- **Task:** `.runr/tasks/dogfood-01-polish-init.md` (Python detection)
- **Outcome:** `verification_failed_max_retries`
- **Checkpoints:** 3 successful checkpoints saved
- **Checkpoint commits:**
  - `5c98ffa` - Milestone 3
  - `7e5b62c` - Milestone 2
  - `82eb3c2` - Milestone 1
- **Checkpoint branch:** `agent/20260102075326/dogfood-01-polish-init`

### 2. Success Example Task ✅
- **File:** `.runr/tasks/demo-quick-success.md`
- **Task:** Simple README update (fast execution)
- **Purpose:** Show `next_action: none` for completed run
- **Estimated duration:** ~20 seconds

### 3. Demo Script ✅
- **File:** `docs/internal/DEMO_SCRIPT.md`
- **Duration:** 3 minutes (timestamped sections)
- **Format:** Copy-paste ready commands
- **Risk level:** Zero (uses real proven data)

---

## Pre-Flight Checklist Results

All checks passed:

✅ **Run exists:**
```
20260102075326: stopped 15m49s milestones=0
```

✅ **Checkpoint branch exists:**
```
5c98ffa chore(agent): checkpoint milestone 3
7e5b62c chore(agent): checkpoint milestone 2
82eb3c2 chore(agent): checkpoint milestone 1
```

✅ **Demo task file exists:**
```
.runr/tasks/demo-quick-success.md
```

---

## Key Demo Points (What to Emphasize)

### Money Shot: 3 Checkpoints
When showing the KPI output, point to:
```
phases: CHECKPOINT=192ms(x3) ...
```

**Say:** *"3 checkpoints — that's 3 verified save points."*

### next_action for Automation
When showing the JSON:
```json
{
  "next_action": "resume",
  "stop_reason": "verification_failed_max_retries",
  "checkpoint_sha": "5c98ffa..."
}
```

**Say:** *"Agents read one field and know what to do. No guessing."*

### Git Commits Are Real
When showing the log:
```
git log --oneline agent/20260102075326/dogfood-01-polish-init
```

**Say:** *"Real git commits. Checkpoint branch. Progress isn't lost."*

---

## Demo Flow (3 minutes)

**0:00–0:10** Hook
> "AI agents waste time when they derail. Runr stops cleanly, saves checkpoints, lets you resume."

**0:10–0:25** Show task
> "Real task from our codebase. Milestones + verification gates."

**0:25–1:00** Show failure (MONEY SHOT)
> "Stopped after 3 checkpoints. Verification failed. But work is saved."

**1:00–1:35** Prove checkpoints
> "Three real git commits. You can inspect them."

**1:35–2:05** Show next_action
> "Agents read one field: next_action. No hallucinating resume logic."

**2:05–2:35** Show success (optional)
> "On success: next_action is none."

**2:35–3:00** Close
> "Not smarter. Harder to kill. Resume from checkpoints instead of restarting."

---

## Terminal Setup

Before recording:

```bash
# Set large font (18-20pt in terminal preferences)
# Use high contrast theme
# Simplify prompt
export PS1='$ '

# Clear screen
clear

# Navigate to repo
cd /Users/vonwao/dev/agent-framework
```

---

## Command Sequence (Copy-Paste Ready)

```bash
# 1. Show task
head -30 .runr/tasks/dogfood-01-polish-init.md

# 2. Show failure
node dist/cli.js report 20260102075326

# 3. Show checkpoints
git log --oneline agent/20260102075326/dogfood-01-polish-init | head -8

# 4. Show checkpoint diff (optional)
git show --stat 5c98ffa

# 5. Show next_action JSON
node dist/cli.js report 20260102075326 --json | jq '{next_action, stop_reason, checkpoint_sha, milestones}'

# 6. (OPTIONAL - only if confident) Show success
node dist/cli.js run --task .runr/tasks/demo-quick-success.md --worktree --json
# Then: node dist/cli.js report <RUN_ID> --json | jq '{next_action, outcome}'
```

---

## Backup Plan

If live execution in step 6 fails or takes too long:

**Skip it.** Just say:

> "On success, next_action would be 'none' instead of 'resume'. That's how agents know they're done."

The failure + checkpoints are already proven. Don't gamble on live execution.

---

## Post-Demo Assets Needed (Day 6)

After recording the demo:

- [ ] Upload video to YouTube
- [ ] Create 2 GIFs:
  1. Failure stop + checkpoint shown (~10 sec)
  2. Resume + success + next_action (~10 sec)
- [ ] Update README with video embed
- [ ] Add GIFs above the fold
- [ ] Replace "reliability-first" with "Stop losing 30 minutes when the agent derails"

---

## What Makes This Demo Work

### ✅ Real failure (not staged)
From actual dogfooding session, documented in DOGFOOD_LOG.md

### ✅ Real checkpoints (provable)
Git commits in checkpoint branch, can be inspected

### ✅ Real next_action (working)
JSON output shows automated decision-making field

### ✅ Zero risk
Using already-completed run, not live execution on failure path

### ✅ Clear value prop
"Resume from checkpoints instead of restarting" — instant visceral understanding

---

## One-Liner for Each Segment

Use these exact phrases:

**Failure:**
> "Stopped after **3 checkpoints**. Work is saved."

**Checkpoints:**
> "Real git commits. Checkpoint branch. Progress isn't lost."

**next_action:**
> "Agents read one field. No guessing, no hallucinating."

**Close:**
> "Not smarter. **Harder to kill.**"

---

## Ready to Record

**Everything needed:**
- ✅ Real failure run with checkpoints
- ✅ Checkpoint branch with commits
- ✅ Demo script with exact commands
- ✅ Optional success task
- ✅ Pre-flight checklist verified

**Next step:**
Record 3-minute demo following DEMO_SCRIPT.md

**After recording:**
Proceed to Day 6 (launch assets)
