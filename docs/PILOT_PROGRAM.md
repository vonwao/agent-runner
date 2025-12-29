# Agent Framework Pilot Program

We're looking for early adopters to test the Agent Framework in real-world projects.

## What is Agent Framework?

A dual-LLM orchestrator that automates coding tasks with:
- Milestone decomposition
- Scope-based safety guards
- Built-in verification (tests, lint, build)
- Auto-recovery from transient failures
- Collision detection for parallel runs

## Who Should Join?

Ideal pilot participants:
- Have a TypeScript/JavaScript project with tests and linting
- Want to experiment with AI-assisted development
- Can provide structured feedback on issues encountered
- Comfortable with CLI tools

## What You'll Get

- Early access to new features
- Direct support for setup and issues
- Influence on roadmap priorities
- Framework improvements based on your feedback

## Time Commitment

- ~30 minutes for initial setup
- Running 2-3 tasks per week
- Brief feedback on each run (success/failure + notes)

## Prerequisites

1. **Node.js 18+**
2. **Git** (for worktree isolation)
3. **Claude Code CLI** or **Codex CLI** (worker)
4. A project with:
   - `package.json`
   - TypeScript/JavaScript source
   - Some tests/lint configured

## Getting Started

### 1. Install

```bash
npm install -g agent-runner
```

### 2. Initialize Config

In your project root:

```bash
agent init
```

This creates `.agent/agent.config.json`. Edit it to match your project:

```json
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": {
    "allowlist": ["src/**", "tests/**"],
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

### 3. Create a Task

Create `tasks/my-first-task.md`:

```markdown
# Add Health Check Endpoint

Add a `/health` endpoint that returns `{ status: "ok" }`.

## Requirements
- Create GET /api/health route
- Return JSON with status field
- Should always return 200

## Success Criteria
- Endpoint exists and returns expected JSON
- TypeScript types are correct
- Tests pass
```

### 4. Run

```bash
agent run tasks/my-first-task.md --time 10
```

### 5. Report Results

After each run, note:
- Did it complete successfully?
- What was the stop reason?
- Any unexpected behavior?
- How long did it take?

## Common Issues

### "Config not found"

Run `agent init` in your project root.

### "Worker not found"

Ensure Claude Code or Codex is installed and authenticated:

```bash
claude --version
# or
codex --version
```

### "Scope violation"

Your task requires files outside the allowlist. Either:
- Add patterns to `scope.allowlist`
- Use `scope.presets` for common stacks

## Feedback

Report issues and feedback to:
- GitHub Issues: [link]
- Or email: [email]

Include:
- `agent doctor` output
- Stop reason from `state.json`
- Any error messages

## FAQ

**Q: Does this modify my main branch?**
A: No. All runs happen in isolated git worktrees on a new branch.

**Q: What if it breaks something?**
A: The worktree is isolated. Your main code is untouched. You can delete the worktree anytime.

**Q: How much does it cost?**
A: API costs depend on your Claude/Codex usage. Expect $0.50-$5 per complex task.

**Q: Can I run multiple tasks in parallel?**
A: Yes, but the framework will serialize runs that touch the same files to prevent conflicts.
