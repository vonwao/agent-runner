# Dogfooding Guide

Using the agent to develop itself.

## Prerequisites

```bash
# Build the stable version first
npm run build
git tag v0.1.0  # (if not already tagged)

# Create a stable worktree to use as the runner
git worktree add ../agent-stable v0.1.0
cd ../agent-stable && npm install && npm run build && npm link
```

## Five Commands

### 1. Run a task on this repo

```bash
cd /path/to/agent-framework
agent run --task .agent/tasks/your-task.md --worktree --auto-resume
```

Use `--worktree` to isolate changes. Use `--auto-resume` to recover from transient failures.

### 2. Follow progress in real-time

```bash
agent follow
```

Tails the timeline and exits when the run completes or stops.

### 3. Check run status

```bash
agent status --all        # All runs
agent report latest       # Detailed report for latest run
agent metrics --json      # Aggregate metrics
```

### 4. Resume a stopped run

```bash
agent resume <run_id> --max-ticks 75  # Increase ticks if needed
agent resume <run_id> --time 180      # Increase time budget if needed
```

### 5. Multi-task orchestration

```bash
agent orchestrate run --config .agent/tracks.yaml --worktree --auto-resume
agent orchestrate wait latest
```

## How to Recover

### Run stopped with `max_ticks_reached`

The task oscillated between phases too many times. Resume with more ticks:

```bash
agent resume <run_id> --max-ticks 100
```

### Run stopped with `time_budget_exceeded`

The task needed more time. Resume with a larger budget:

```bash
agent resume <run_id> --time 180
```

### Run stopped with `stalled_timeout`

No progress was detected. Check the timeline for the last activity:

```bash
agent report <run_id> --tail 20
```

If the worker hung, resume with `--auto-resume` to retry automatically.

### Run stopped with `guard_violation`

Files outside the allowlist were modified. Either:
1. Add the files to the allowlist in `agent.config.json`
2. Or remove the changes and resume

### Run stopped with `verification_failed_max_retries`

Tests failed 3 times. Check the verification logs:

```bash
cat .agent/runs/<run_id>/artifacts/tests_tier0.log
```

Fix the issue manually and resume, or update the task to be more specific.

### Run stopped with `worker_call_timeout`

The worker (Claude/Codex) didn't respond in time. This is usually transient. Resume with `--auto-resume`:

```bash
agent resume <run_id> --auto-resume
```

## Golden Rule

> **Never use the development version to run tasks on itself.**

Always use the stable worktree (`../agent-stable`) as the runner when making changes to the agent framework. This prevents the "sawing off the branch you're sitting on" problem.

```bash
# Good: stable runner, development target
cd /path/to/agent-framework
../agent-stable/dist/cli.js run --task .agent/tasks/fix-something.md --worktree

# Bad: development version running on itself
agent run --task .agent/tasks/fix-something.md  # Don't do this!
```

## Quick Reference

| Command | Description |
|---------|-------------|
| `agent doctor` | Check worker availability |
| `agent paths --json` | Show artifact directories |
| `agent gc --dry-run` | Preview cleanup of old worktrees |
| `agent version --json` | Show version and schema info |
| `agent metrics --days 7` | Last week's metrics |
