# Using Runr in Your Project

This guide explains how to set up and run Runr in any target repository.

## Prerequisites

- Node.js 18+
- Git
- Claude CLI (`claude --version`) authenticated

## Installation

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

## Project Setup

### 1. Create directory structure

```bash
cd /path/to/your-project
mkdir -p .runr/tasks
```

### 2. Create config file

Create `.runr/runr.config.json`:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**"],
    "denylist": ["node_modules/**"],
    "presets": ["typescript"]
  },
  "verification": {
    "tier0": ["npm run lint", "npm run typecheck"],
    "tier1": ["npm run build"]
  },
  "phases": {
    "plan": "claude",
    "implement": "claude",
    "review": "claude"
  }
}
```

See [Configuration Reference](configuration.md) for full schema.

### 3. Create a task file

Create `.runr/tasks/my-task.md`:

```markdown
# Add User Authentication

## Goal
Add login/logout functionality.

## Requirements
- OAuth2 with Google
- Session management
- Protected routes

## Success Criteria
- Users can log in
- Session persists
- Unauthorized users redirected
```

## Running Tasks

### Basic run

```bash
runr run --task .runr/tasks/my-task.md
```

### With worktree isolation (recommended)

```bash
runr run --task .runr/tasks/my-task.md --worktree
```

### With time limit

```bash
runr run --task .runr/tasks/my-task.md --worktree --time 30
```

### Fun mode

```bash
runr summon --task .runr/tasks/my-task.md --worktree
```

## Monitoring

```bash
# Tail progress in real-time
runr follow latest

# Check status
runr status --all

# Generate report
runr report latest
```

## Common Workflows

### Resume a stopped run

```bash
runr resume <run_id>
# or: runr resurrect <run_id>
```

### Clean up old worktrees

```bash
runr gc --dry-run  # Preview
runr gc            # Delete worktrees older than 7 days
# or: runr banish --dry-run
```

### View aggregated metrics

```bash
runr metrics
```

## Directory Structure

After running, your project will have:

```
.runr/
  runr.config.json    # Configuration
  tasks/              # Task definitions
  runs/
    <run_id>/
      state.json      # Run state
      timeline.jsonl  # Event log
.runr-worktrees/
  <run_id>/           # Git worktree (if --worktree used)
```

> **Note**: Legacy `.agent/` paths are still supported with deprecation warnings.

## Troubleshooting

### "Config not found"

Ensure `.runr/runr.config.json` exists in your project root.

### "Worker not found"

```bash
runr doctor
```

Check that Claude CLI is installed and authenticated.

### Scope violation

Task requires files outside `scope.allowlist`. Either:
- Add patterns to `allowlist`
- Use `presets` for common stacks

See [Troubleshooting](troubleshooting.md) for more issues.
