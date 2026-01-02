# Runr

Phase-gated orchestration for agent tasks.

> **Status**: v0.3.0 — Renamed from `agent-runner`. Early, opinionated, evolving.

## The Problem

AI agents can write code. They can also:
- Claim success without verification
- Touch files they shouldn't
- Loop forever
- Fail in ways that are hard to explain

Runr doesn't make agents smarter. It makes them accountable.

## What It Does

Runr orchestrates AI workers (Claude, Codex) through a phase-based workflow with hard gates:

```
PLAN → IMPLEMENT → VERIFY → REVIEW → CHECKPOINT → done
         ↑___________|  (retry if needed)
```

Every phase has criteria. You don't move forward without meeting them.

## Why Phase Gates?

Most agent tools optimize for speed. Runr optimizes for trust.

When a run fails (and it will), you get:
- **Structured diagnostics** — exactly why it stopped
- **Checkpoints** — resume from where it failed
- **Scope guards** — files it couldn't touch, it didn't touch
- **Evidence** — "done" means "proven done"

## Demo

![Runr Checkpoint Demo](https://i.imgur.com/XVFpTUZ.gif)

*Checkpoints are real git commits created after each verified milestone. If a later milestone fails, resume from the last checkpoint without redoing completed work.*

## Meta-Agent Quickstart (Recommended)

**The easiest way to use Runr:** Let your coding agent drive it.

Runr works as a **reliable execution backend**. Instead of learning CLI commands, your agent (Claude Code, Codex, etc.) operates Runr for you — handling runs, interpreting failures, and resuming from checkpoints.

### Setup (One-Time)

```bash
# 1. Install Runr
npm install -g @weldr/runr

# 2. Verify environment
runr doctor

# 3. Create minimal config
mkdir -p .runr/tasks
cat > .runr/runr.config.json << 'EOF'
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "presets": ["typescript", "vitest"]
  },
  "verification": {
    "tier0": ["npm run typecheck"],
    "tier1": ["npm test"]
  }
}
EOF
```

### Usage

Just tell your coding agent:

> "Use Runr to add user authentication with OAuth2. Create checkpoints after each milestone."

The agent will:
1. Create a task file (`.runr/tasks/add-auth.md`)
2. Run `runr run --task ... --worktree --json`
3. Monitor progress with `runr status`
4. Handle failures, resume from checkpoints
5. Report results with commit links

**See [RUNR_OPERATOR.md](./RUNR_OPERATOR.md)** for the complete agent integration guide.

### Why This Works

Most devs already have a coding agent open. Telling them:
- "Drop this in your agent, and it'll drive Runr for you"

…has near-zero friction compared to:
- "Learn these CLI commands, create config files, understand phase gates"

The agent becomes your operator. Runr stays the reliable execution layer.

---

## Quick Start (Direct CLI)

```bash
# Install
npm install -g @weldr/runr

# Verify
runr version
runr doctor

# Run a task
cd /your/project
runr run --task .runr/tasks/my-task.md --worktree
```

> Prefer source install? See [Development](#development).

## Configuration

Create `.runr/runr.config.json`:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
    "denylist": ["node_modules/**"],
    "presets": ["vitest", "typescript"]
  },
  "verification": {
    "tier0": ["npm run typecheck"],
    "tier1": ["npm run build"],
    "tier2": ["npm test"]
  }
}
```

### Scope Presets

Don't write patterns by hand:

```json
{
  "scope": {
    "presets": ["nextjs", "vitest", "drizzle", "tailwind"]
  }
}
```

Available: `nextjs`, `react`, `drizzle`, `prisma`, `vitest`, `jest`, `playwright`, `typescript`, `tailwind`, `eslint`, `env`

## CLI Reference

| Command | What it does |
|---------|--------------|
| `runr run --task <file>` | Start a task |
| `runr resume <id>` | Continue from checkpoint |
| `runr status [id]` | Show run state |
| `runr follow [id]` | Tail run progress |
| `runr report <id>` | Generate run report |
| `runr gc` | Clean up old runs |
| `runr doctor` | Check environment |

### Aliases

Same functionality, different vibe:

```bash
runr summon --task task.md   # run
runr resurrect <id>          # resume
runr scry <id>               # status
runr banish                  # gc
```

## Task Files

Tasks are markdown files:

```markdown
# Add user authentication

## Goal
OAuth2 login with Google.

## Requirements
- Session management
- Protected routes
- Logout functionality

## Success Criteria
- Users can log in with Google
- Session persists across refreshes
```

## Stop Reasons

When Runr stops, it tells you why:

| Reason | What happened |
|--------|---------------|
| `complete` | Task finished. Ship it. |
| `verification_failed_max_retries` | Tests failed too many times |
| `guard_violation` | Touched files outside scope |
| `review_loop_detected` | Reviewer kept requesting same changes |
| `time_budget_exceeded` | Ran out of time |

Every stop produces `stop.json` + `stop.md` with diagnostics.

## Philosophy

This isn't magic. Runs fail. The goal is understandable, resumable failure.

This isn't a chatbot. Task in, code out.

This isn't a code generator. It orchestrates generators.

Agents lie. Logs don't. If it can't prove it, it didn't do it.

## Migrating from agent-runner

| Old | New |
|-----|-----|
| `agent` CLI | `runr` CLI |
| `.agent/` directory | `.runr/` directory |
| `agent.config.json` | `runr.config.json` |
| `.agent-worktrees/` | `.runr-worktrees/` |
Old paths still work for now, with deprecation warnings.

## Development

```bash
npm run build    # compile
npm test         # run tests
npm run dev -- run --task task.md  # run from source
```

## Release History

| Version | Date | Highlights |
|---------|------|------------|
| v0.3.0 | **Renamed to Runr**, new CLI, new directory structure |
| v0.2.2 | Worktree location fix, guard diagnostics |
| v0.2.1 | Scope presets, review digest |
| v0.2.0 | Review loop detection |
| v0.1.0 | Initial stable release |

See [CHANGELOG.md](CHANGELOG.md) for details.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache 2.0 — See [LICENSE](LICENSE).

---

<sub>Existence is pain, but shipping is relief.</sub>
