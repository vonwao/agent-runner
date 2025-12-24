Status: Implemented
Source: src/types/schemas.ts, src/supervisor/runner.ts

# Glossary

Run
A single supervised execution session with its own run store and run ID.

Milestone
A planned unit of work with a goal, done checks, and risk level.

Phase
A step in the supervisor loop (PLAN, IMPLEMENT, VERIFY, REVIEW, CHECKPOINT, FINALIZE).

Tier
A verification level (tier0, tier1, tier2) mapped to configured commands.

Guard
A preflight or post-implement safety check (scope, lockfiles, dirty worktree).

Run store
The on-disk record of a run (`runs/<run_id>/`), including state and events.

Timeline
The JSONL event log in `timeline.jsonl`.

Checkpoint
A commit created after a milestone is approved.

Handoff memo
A markdown note written by the implementer or reviewer for a milestone.

Scope lock
The frozen allowlist and denylist patterns captured at run start. Stored in `state.json` and enforced throughout the run. Prevents scope drift during execution.

Risk level
A milestone property (`low`, `medium`, `high`) that influences verification tier selection. High-risk milestones trigger tier1 verification in addition to tier0.

Risk trigger
A glob pattern in the config that escalates verification when matched against changed files. For example, changes to `package.json` might trigger additional tests.

Block protocol
A structured format for implementer handoff memos when a milestone cannot be completed. Includes: what broke, hypotheses, experiments tried, decision, and next action.

Fix instructions
Context passed to the implementer when retrying after verification failure. Includes the failed command, error output, changed files, and attempt number.

Environment fingerprint
A snapshot of the execution environment (node version, lockfile hash, worker versions) saved at run start. Used to validate resume safety.

Worker stats
Counters tracking how many times each worker (Claude, Codex) was invoked, broken down by phase. Emitted at FINALIZE and stored in `state.json`.

Stop memo
A markdown file (`handoffs/stop.md`) written when a run stops, documenting what's done, what's broken, and recommended next steps.

Tick
A single phase transition in the supervisor loop. The `--max-ticks` option limits how many phases execute per run/resume.

Boot chain
The set of critical files required for the agent to function. These should never be in the allowlist when self-hosting. See [Self-Hosting Safety](self-hosting-safety.md).
