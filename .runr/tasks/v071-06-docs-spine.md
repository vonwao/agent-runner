# 06: Documentation Spine - Structure + Story

## Goal
Create a tight 3-page documentation spine that tells a coherent story. Structure, not walls of text.

## Note
The "why-runr.md" narrative should be human-written or human-edited. Agent handles structure, links, and technical accuracy.

## Requirements

### 1. README.md - Above the Fold

```markdown
# Runr

> Turn agent coding into resumable, reviewable work—without killing momentum.

[30-second terminal GIF placeholder]

## 60-Second Demo

npm install -g @weldr/runr
runr init --pack solo
runr run --task .runr/tasks/example-task.md
# If it stops: runr intervene latest --reason manual_fix --note "fixed"
runr submit latest --to dev

## Two Modes

**Flow** — Ship fast, record what you can
**Ledger** — Audit-first, everything on the record

[→ Hybrid Workflow Guide](docs/hybrid-workflow.md)

## What You Get

- **Checkpoints** — Every milestone is a resumable state
- **Receipts** — Diffs, verification logs, intervention records
- **Hybrid provenance** — Manual fixes don't become black holes

## Quick Links

- [Why Runr?](docs/why-runr.md)
- [Hybrid Workflow](docs/hybrid-workflow.md)
- [CLI Reference](docs/cli.md)
- [Configuration](docs/configuration.md)
```

### 2. docs/why-runr.md - The Story Doc

```markdown
# Why Runr?

## The Problem

AI coding agents are powerful but chaotic:
- They crash, stall, hit edge cases
- "Just resume" loses context
- Manual fixes become audit black holes
- No proof of what actually happened

## The Solution

Runr is a workflow layer for agent coding.

**Checkpoints**: Every milestone is a resumable state with verification evidence.

**Receipts**: Machine-readable records of what happened and why.

**Hybrid provenance**: Track both agent work AND manual interventions.

## The Trade-off

Runr adds ~5% overhead for:
- 100% resumability
- Complete audit trail
- Proof your code was reviewed

## Who It's For

- Solo devs using Claude Code or Codex
- Teams needing audit trails
- Anyone tired of lost agent context

## Evidence-Driven Development

Traditional: write code → hope it works → push
With Runr: plan → implement → verify → checkpoint → prove it

Every change has evidence. Every manual fix is recorded.
Your git history becomes a provenance chain, not just a commit log.
```

### 3. docs/hybrid-workflow.md - How It Actually Works

```markdown
# Hybrid Workflow Guide

## The Reality

Not everything goes through Runr. Manual fixes happen.
Runr makes them visible, not invisible.

## Flow vs Ledger

| Aspect | Flow Mode | Ledger Mode |
|--------|-----------|-------------|
| Goal | Productivity | Auditability |
| --amend-last | Allowed | Blocked |
| Git hooks | Warn only | Block gaps |
| Best for | Solo dev, prototyping | Production, compliance |

## The Core Pattern

1. `runr run --task .runr/tasks/feature.md`
2. If STOPPED → fix → `runr intervene` or `runr resume`
3. If FINISHED → `runr submit latest --to dev`
4. Check coverage: `runr audit`

## Recording Manual Work

When you fix something outside Runr:

runr intervene latest --reason manual_fix \
  --note "What you fixed" \
  --commit "Fix: description"

This creates a receipt so the audit trail stays intact.

## Checking Coverage

runr audit --range dev~50..dev
runr audit --coverage --json

## Optional: Git Hooks

runr hooks install

In Flow mode: warns on provenance gaps
In Ledger mode: blocks commits without attribution
```

### 4. Update docs/cli.md

Group commands by workflow phase:
- **Setup**: init, doctor, mode
- **Execution**: run, resume, status, follow
- **Recording**: intervene, note
- **Integration**: bundle, submit
- **Audit**: audit, journal
- **Maintenance**: gc, hooks

### 5. Clean Up Legacy References

- Remove all `.agent/` references (old directory name)
- Remove all `agent` CLI references (old command name)
- Ensure examples use `runr` consistently

## Tests
- Quick Start commands actually work
- All internal links resolve
- No `.agent/` or `agent ` references remain
- Examples are copy-paste ready

## Scope
allowlist_add:
  - README.md
  - docs/why-runr.md
  - docs/hybrid-workflow.md
  - docs/cli.md

## Verification
tier: tier0

## Acceptance Checks
```bash
# Verify no legacy references
grep -r "\.agent/" docs/ README.md && echo "FAIL: .agent/ found" || echo "OK"
grep -rw "agent " docs/ README.md | grep -v "meta-agent" && echo "FAIL: 'agent ' found" || echo "OK"

# Verify Quick Start
npm pack
cd /tmp && mkdir doc-test && cd doc-test
npm init -y && npm install /path/to/weldr-runr-*.tgz
npx runr init --pack solo
npx runr run --task .runr/tasks/example-task.md --dry-run
```
