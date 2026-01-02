# Runr: Positioning & Messaging Guide

## Core Positioning

> **Runr is the reliable execution layer. Your coding agent can drive it.**

## Two-Layer Strategy

### Layer 1: Runr CLI (The Foundation)
- **Deterministic, scriptable, CI-friendly**
- Phase-gated workflow with verification gates
- Checkpoint-based resumption
- Scope guards and safety controls
- **Audience:** Power users, teams, CI pipelines

### Layer 2: Meta-Agent Operator (The On-Ramp)
- **Zero-friction adoption**
- Agent drives Runr via commands
- Interprets failures, resumes from checkpoints
- Reports back to user in natural language
- **Audience:** Individual devs with Claude Code/Codex already open

## Why This Works

**Problem:** Asking users to learn a new CLI + config format + workflow = high friction

**Solution:** Let their existing coding agent be the operator

**Result:**
- User says: "Use Runr to add auth"
- Agent handles: task files, commands, monitoring, resume, reporting
- User gets: reliable execution without learning new tools

## Key Messages

### For Individual Developers
- "Your coding agent already knows how to use Runr"
- "No need to learn CLI commands — just tell your agent what to build"
- "Your agent operates Runr, you get verified, checkpointed results"

### For Teams/Enterprises
- "Runr provides the execution substrate for AI coding"
- "Deterministic, auditable, resumable workflows"
- "CI-ready, team-ready, production-ready"

### For the "Serious Tool" Crowd
- "Runr is CLI-first, scriptable, and automation-friendly"
- "Meta-agent mode is an optional UX wrapper"
- "Use the CLI directly, or let an agent drive it — your choice"

## Elevator Pitch

**30-second version:**
> "Runr orchestrates AI coding agents through phase-gated workflows with built-in verification and checkpointing. Instead of learning new commands, your existing coding agent operates Runr for you — handling runs, interpreting failures, and resuming from checkpoints. Think of it as a safety harness: the agent does the coding, Runr ensures it's verified and resumable."

**10-second version:**
> "Phase-gated execution for AI agents. Your coding agent drives it, Runr verifies and checkpoints everything."

## Differentiation

| Feature | Runr | Direct Agent Usage |
|---------|------|-------------------|
| **Verification Gates** | Hard gates (tests must pass) | Agent claims success |
| **Checkpoints** | Git commits at milestones | Manual or none |
| **Scope Control** | Enforced allowlist | Honor system |
| **Resumability** | Resume from checkpoint | Start over |
| **Failure Diagnosis** | Structured stop reasons | "Something broke" |
| **Operator Mode** | Meta-agent can drive it | N/A |

| Feature | Runr | Traditional CI/CD |
|---------|------|------------------|
| **Agent Integration** | Native, API-first | Manual scripting |
| **Checkpointing** | Per-milestone | Per-pipeline run |
| **Local Execution** | Git worktrees | Limited |
| **Interactive Resume** | Built-in | Not applicable |
| **Failure Context** | Rich diagnostics | Exit codes + logs |

## Demo Script

### Live Demo (3 minutes)

1. **Setup (30s)**
   ```bash
   npm install -g @weldr/runr
   runr doctor
   ```

2. **Tell Claude Code (30s)**
   > "Use Runr to add a dark mode toggle to this app. Verify tests pass."

3. **Watch (90s)**
   - Claude creates task file
   - Runs `runr run --task ... --worktree --json`
   - Shows live status updates
   - Reports: "Run 20260102143052 completed. All tests pass. Branch: runr/20260102143052"

4. **Simulate failure + resume (60s)**
   - Break a test
   - Claude detects failure, explains what broke
   - Asks: "Should I resume and fix this?"
   - Resumes, fixes, reports success

### Key Takeaway
"Notice: You didn't run a single Runr command. Claude operated it. That's the point."

## Marketing Materials Checklist

- [x] README with Meta-Agent Quickstart (done)
- [x] RUNR_OPERATOR.md (agent integration guide) (done)
- [x] Sample task file (.runr/tasks/example-task.md) (done)
- [x] Sample config (.runr/runr.config.example.json) (done)
- [ ] Demo video (3 min: setup, agent usage, failure/resume)
- [ ] Blog post: "Why Runr uses agents as operators"
- [ ] Twitter thread: "Stop learning CLIs. Let your agent operate the tooling."
- [ ] Comparison table: Runr vs direct agent vs traditional CI

## Messaging Do's and Don'ts

### Do:
- Position meta-agent mode as "easy mode" / "recommended"
- Keep CLI docs prominent (serious users need to see the foundation)
- Show both layers clearly: agent operator AND CLI substrate
- Emphasize **reliability** and **resumability** (core value props)
- Use concrete examples (auth, dark mode, API endpoint)

### Don't:
- Hide the CLI (that's the actual product)
- Require meta-agent mode to function (kills team/CI adoption)
- Oversell AI magic (Runr is a harness, not an agent itself)
- Ignore failure cases (show how Runr helps with failures)
- Use buzzwords without backing them up (show, don't tell)

## FAQ Responses

**Q: "Is this just a wrapper around my agent?"**
A: No. Runr enforces verification gates, scope guards, and checkpoints that agents can't bypass. The agent is the operator, Runr is the execution layer. Think: pilot (agent) vs autopilot system (Runr).

**Q: "Can I use Runr without a meta-agent?"**
A: Absolutely. Runr is CLI-first. Meta-agent mode is an optional UX layer for easier adoption.

**Q: "What if my agent hallucinates or makes mistakes?"**
A: That's exactly why Runr exists. Verification gates catch mistakes (tests fail → retry). Scope guards prevent it from touching forbidden files. Checkpoints let you resume from last good state.

**Q: "How is this different from just running 'npm test'?"**
A: Runr orchestrates the entire workflow (plan → implement → verify → checkpoint), not just one step. It creates git commits at milestones, enforces file scope, and provides structured failure diagnostics.

**Q: "Is this ready for production?"**
A: Runr is v0.3.0 — early but opinionated. Use it for tasks you'd trust an agent with. For mission-critical work, review checkpoint commits before merging.

## Launch Strategy

### Phase 1: Early Adopters (Current)
- Target: Devs already using Claude Code / Codex CLI
- Message: "Your agent can drive Runr. Try it on your next feature."
- Channels: GitHub README, HN Show, Twitter, agent communities

### Phase 2: Mainstream Devs
- Target: Devs curious about AI coding but skeptical
- Message: "AI agents + safety harness = reliable coding"
- Channels: Blog posts, demo videos, comparison tables

### Phase 3: Teams/Enterprises
- Target: Engineering teams evaluating AI tooling
- Message: "Deterministic, auditable, CI-ready agent orchestration"
- Channels: Case studies, integration docs, Slack communities

## Success Metrics

**Adoption:**
- npm downloads
- GitHub stars
- Active runs (telemetry opt-in)
- Meta-agent usage vs direct CLI usage

**Engagement:**
- Resume rate (% of failed runs that get resumed)
- Checkpoint count (indicates milestone-based work)
- Verification tier usage (tier0 vs tier1 vs tier2)

**Satisfaction:**
- GitHub issues (bugs vs feature requests)
- User testimonials
- "Would you recommend Runr?" NPS

## Positioning in One Sentence

**For devs who want AI coding with verification and safety:**
> "Runr is the execution layer that makes AI agents accountable through phase gates, checkpoints, and scope guards — operated by your existing coding agent or directly via CLI."
