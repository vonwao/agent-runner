# Quickstart

Get Runr running on your project in 5 minutes.

## Prerequisites

- **Node.js 18+**
- **Git** (for worktree isolation)
- **Claude Code CLI** authenticated (`claude --version`)

## Install

Install from npm:

```bash
npm install -g @weldr/runr
```

Verify installation:

```bash
runr version
runr doctor
```

Install from source (optional):

```bash
git clone https://github.com/vonwao/runr.git
cd runr
npm install
npm run build
npm link
```

## Configure Your Project

Initialize Runr with a workflow pack (recommended):

```bash
cd your-project

# Choose a workflow:
# - solo: Development branch workflow (dev → main)
# - trunk: Trunk-based development (main only)

runr init --pack solo
```

This creates:
- `.runr/runr.config.json` - Auto-detected verification commands + workflow config
- `.runr/tasks/example-task.md` - Starter task template
- `AGENTS.md` - Agent guidelines for this project
- `CLAUDE.md` - Claude Code integration guide

**Preview without writing:**
```bash
runr init --pack solo --dry-run
```

**Manual configuration** (without pack):
```bash
runr init  # Interactive setup, auto-detects verification
```

See [Packs User Guide](packs-user-guide.md) for details on workflow packs.

## Create a Task

Create `.runr/tasks/my-first-task.md`:

```markdown
# Add Health Check Endpoint

Add a GET /api/health endpoint that returns { status: "ok" }.

## Requirements
- Create the route handler
- Return JSON response
- Handle errors gracefully

## Success Criteria
- Endpoint responds with 200 and correct JSON
- TypeScript types are correct
```

## Run Your First Task

```bash
# Check environment
runr doctor

# Execute task (uses worktree isolation)
runr run --task .runr/tasks/my-first-task.md --worktree

# Monitor progress in another terminal
runr follow <run_id>

# View results
runr report <run_id>
```

## Submit Verified Changes

After a successful run, integrate the checkpoint:

```bash
# Generate evidence bundle
runr bundle <run_id>

# Preview submit (no changes)
runr submit <run_id> --to main --dry-run

# Execute submit (cherry-pick checkpoint to main)
runr submit <run_id> --to main

# Push to remote
git push origin main
```

See [Workflow Guide](workflow-guide.md) for complete bundle→submit workflow.

## Key Commands

| Command | Purpose |
|---------|---------|
| `runr init --pack <name>` | Initialize with workflow pack (solo/trunk) |
| `runr doctor` | Verify environment and worker CLIs |
| `runr run --task <file>` | Execute a task |
| `runr follow <run_id>` | Tail run progress in real-time |
| `runr report <run_id>` | Generate run report |
| `runr bundle <run_id>` | Generate evidence bundle |
| `runr submit <run_id> --to <branch>` | Submit verified checkpoint to branch |
| `runr resume <run_id>` | Resume a stopped run |
| `runr status` | Show current run status |

### Fun Aliases

Same commands, different vibe:

```bash
runr summon --task task.md   # run
runr resurrect <id>          # resume
runr scry <id>               # status
runr banish                  # gc
```

See [CLI Reference](cli.md) for all commands.

## Canonical Paths

All runr files live under `.runr/` in your project:

```
.runr/
  runr.config.json    # Configuration
  tasks/              # Task definitions
  runs/<run_id>/      # Run artifacts
    state.json        # Run state
    timeline.jsonl    # Event log
.runr-worktrees/
  <run_id>/           # Isolated git worktree (if --worktree used)
```

> **Note**: Legacy `.agent/` paths are still supported with deprecation warnings.

## Next Steps

- [Workflow Guide](workflow-guide.md) - Complete bundle/submit workflow
- [Packs User Guide](packs-user-guide.md) - Choosing and using workflow packs
- [Configuration Reference](configuration.md) - Full config schema
- [Run Lifecycle](run-lifecycle.md) - How phases work
- [Guards and Scope](guards-and-scope.md) - Safety constraints
