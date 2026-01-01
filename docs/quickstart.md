# Quickstart

Get Runr running on your project in 5 minutes.

## Prerequisites

- **Node.js 18+**
- **Git** (for worktree isolation)
- **Claude Code CLI** authenticated (`claude --version`)

## Install

Not yet published to npm. Install from source:

```bash
git clone https://github.com/vonwao/runr.git
cd runr
npm install
npm run build
npm link
```

Verify installation:

```bash
runr version
runr doctor
```

## Configure Your Project

Create `.runr/runr.config.json` in your project root:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**"],
    "denylist": ["node_modules/**"],
    "presets": ["typescript", "vitest"]
  },
  "verification": {
    "tier0": ["npm run typecheck", "npm run lint"],
    "tier1": ["npm run build"],
    "tier2": ["npm test"]
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

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

## Run

```bash
# Check environment
runr doctor

# Execute task (uses worktree isolation)
runr run --task .runr/tasks/my-first-task.md --time 10

# Monitor progress
runr follow <run_id>

# View results
runr report <run_id>
```

## Key Commands

| Command | Purpose |
|---------|---------|
| `runr doctor` | Verify environment and worker CLIs |
| `runr run --task <file>` | Execute a task |
| `runr follow <run_id>` | Tail run progress in real-time |
| `runr report <run_id>` | Generate run report |
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

- [Configuration Reference](configuration.md) - Full config schema
- [Run Lifecycle](run-lifecycle.md) - How phases work
- [Guards and Scope](guards-and-scope.md) - Safety constraints
