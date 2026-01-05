# Runr Documentation

## Canonical Conventions

| Aspect | Convention |
|--------|------------|
| **CLI** | `runr` (install via npm, see [Quickstart](quickstart.md)) |
| **Config** | `.runr/runr.config.json` |
| **Tasks** | `.runr/tasks/*.md` |
| **Runs** | `.runr/runs/<run_id>/` |
| **Worktrees** | `.runr-worktrees/<run_id>/` (outside `.runr/` to avoid denylist conflicts) |
| **Orchestrations** | `.runr/orchestrations/<orch_id>/` |

> **Note**: Legacy `.agent/` paths are still supported with deprecation warnings. The canonical public interface is `.runr/...`.

---

## Start Here

- **[Overview](overview.md)** - Simple explanation (non-technical)
- **[How It Works](how-it-works.md)** - Technical explanation
- **[Quickstart](quickstart.md)** - Get running in 5 minutes
- **[Tutorial](tutorial.md)** - Hands-on exercises (30 min)
- **[CLI Reference](cli.md)** - All commands and flags

## Core Concepts

- [Run Lifecycle](run-lifecycle.md) - Phase flow: PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT
- [Guards and Scope](guards-and-scope.md) - Allowlist, denylist, presets
- [Verification](verification.md) - Tier0/1/2 test selection
- [Configuration](configuration.md) - Full config schema
- [Workflow Guide](workflow-guide.md) - Bundle, submit, and integration workflows
- [Packs User Guide](packs-user-guide.md) - Workflow packs (solo/trunk)

## Architecture

- [Architecture Overview](architecture.md) - System design
- [Workers](workers.md) - Claude/Codex integration
- [Worktrees](worktrees.md) - Git worktree isolation
- [Run Store](run-store.md) - State and artifacts

## Reference

- [Glossary](glossary.md) - Terms and definitions
- [Troubleshooting](troubleshooting.md) - Common issues
- [Bug Reporting](bug-reporting.md) - How agents should report issues
- [RUNBOOK](RUNBOOK.md) - Operator workflows

## Guides

- **[Solo Workflow Example](examples/solo-workflow.md)** - Canonical copy-paste reference
- [Target Repo Setup](TARGET_REPO_SETUP.md) - Using in your project
- [Pilot Program](PILOT_PROGRAM.md) - Early adopter guide

## Status

| Feature | Status |
|---------|--------|
| Milestone execution | Implemented |
| Scope guards | Implemented |
| Review loop detection | Implemented |
| Worktree isolation | Implemented |
| Auto-resume | Implemented |
| Collision detection | Implemented |
| Scope presets | Implemented (v0.2.1) |

---

## Reading Paths

**New user**: Quickstart → Solo Workflow Example → Run Lifecycle

**Understanding workflow**: Solo Workflow Example → Workflow Guide → Packs User Guide

**Understanding safety**: Guards and Scope → Verification → Worktrees

**Debugging a run**: CLI Reference → Troubleshooting → RUNBOOK
