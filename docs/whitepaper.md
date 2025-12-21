# Agent Framework Runtime

Deterministic, governed execution for AI-assisted code changes.

## What this is
This project is a compiler-like runtime for LLM-driven coding tasks.

It does not try to:
- replace engineers
- generate PRs blindly
- be autonomous

It does:
- enforce scope and governance
- make AI behavior observable and reproducible
- trade raw speed for correctness and control
- scale from simple edits to greenfield bootstraps

## Core ideas
### 1. Compiler mindset
Tasks -> plans -> milestones -> verified commits.
Each phase is explicit, typed, and logged.

### 2. Determinism over vibes
Same task + same seed -> same structure, same tests, same outcomes.

### 3. Governance by construction
The framework cannot modify itself during a run.
Out-of-scope changes stop immediately with an explicit reason.

### 4. Runtime, not chatbot
LLMs are workers, not decision-makers.
The supervisor owns control flow, retries, and failure modes.

## What problems this solves
- The agent changed files it should not
- It passed tests locally but not later
- We do not know why it did that
- We cannot safely let this touch real repos

## What it intentionally does not optimize
- Token minimization
- Perfect code style
- Zero retries
- Maximal autonomy

## Proof of generalization
- Deterministic deckbuilder engine
- Greenfield tactical-grid game created from scratch
- Ambiguous bootstrap succeeds without hardcoded paths
- Hostile scope tests correctly rejected

No manual edits. No patching mid-run.

## When to use this
- Regulated or sensitive codebases
- Shared monorepos
- CI-driven workflows
- Engineers who want control, not magic
