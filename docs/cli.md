# CLI Reference

Complete reference for all `runr` commands and flags.

## Installation

Install from npm:

```bash
npm install -g @weldr/runr
```

The package name is `@weldr/runr`, the binary is `runr`.

Install from source (optional):

```bash
git clone https://github.com/vonwao/runr.git
cd runr
npm install
npm run build
npm link
```

> **Note**: The legacy `agent` command still works but shows deprecation warnings.

---

## Commands

### runr run

Execute a task with full phase lifecycle.

```bash
runr run --task <path> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--task <path>` | Task file (required) | - |
| `--repo <path>` | Target repo path | `.` |
| `--config <path>` | Config file path | `.runr/runr.config.json` |
| `--time <minutes>` | Time budget | `120` |
| `--max-ticks <count>` | Max phase transitions | `50` |
| `--worktree` | Create isolated git worktree | `false` |
| `--fast` | Skip PLAN and REVIEW phases | `false` |
| `--auto-resume` | Auto-resume on transient failures | `false` |
| `--force-parallel` | Bypass file collision checks | `false` |
| `--allow-deps` | Allow lockfile changes | `false` |
| `--allow-dirty` | Allow dirty worktree | `false` |
| `--dry-run` | Initialize without executing | `false` |
| `--fresh-target` | Wipe target root before start | `false` |
| `--skip-doctor` | Skip worker health checks | `false` |
| `--no-branch` | Don't checkout run branch | `false` |
| `--no-write` | Don't write artifacts | `false` |
| `--web` | Allow web access for unblock | `false` |
| `--json` | Output JSON with run_id | `false` |

**Example:**
```bash
runr run --task .runr/tasks/add-feature.md --worktree --time 30
```

---

### runr resume

Resume a stopped run.

```bash
runr resume <runId> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--config <path>` | Config file path | `.runr/runr.config.json` |
| `--time <minutes>` | Time budget | `120` |
| `--max-ticks <count>` | Max phase transitions | `50` |
| `--allow-deps` | Allow lockfile changes | `false` |
| `--force` | Resume despite env mismatch | `false` |
| `--auto-resume` | Continue auto-resuming | `false` |

---

### runr status

Show run status.

```bash
runr status [runId] [options]
runr status --all
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--all` | Show all runs |

---

### runr report

Generate run report.

```bash
runr report <runId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--tail <count>` | Tail last N events | `50` |
| `--kpi-only` | Compact KPI summary only | `false` |

---

### runr follow

Tail run timeline in real-time.

```bash
runr follow [runId|latest] [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

Exits when run reaches terminal state.

---

### runr wait

Block until run reaches terminal state.

```bash
runr wait [runId|latest] [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--for <condition>` | Wait for: terminal, stop, complete | `terminal` |
| `--timeout <ms>` | Timeout in milliseconds | - |
| `--json` / `--no-json` | Output format | `--json` |

---

### runr doctor

Check worker CLI availability.

```bash
runr doctor [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--config <path>` | Config file path |

---

### runr summarize

Generate summary.json from run KPIs.

```bash
runr summarize <runId|latest> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

---

### runr compare

Compare KPIs between two runs.

```bash
runr compare <runA> <runB> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |

---

### runr metrics

Show aggregated metrics across runs.

```bash
runr metrics [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--days <n>` | Days to aggregate | `30` |
| `--window <n>` | Max runs to consider | `50` |
| `--json` | Output JSON format | `false` |

---

### runr gc

Clean up old worktree directories.

```bash
runr gc [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--dry-run` | Preview without deleting | `false` |
| `--older-than <days>` | Only delete older than N days | `7` |

---

### runr paths

Display canonical runr directory paths.

```bash
runr paths [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--json` / `--no-json` | Output format |

---

### runr version

Show version information.

```bash
runr version [options]
```

| Flag | Description |
|------|-------------|
| `--json` | Output JSON format |

---

### runr guards-only

Run only preflight guards without executing.

```bash
runr guards-only --task <path> [options]
```

| Flag | Description |
|------|-------------|
| `--task <path>` | Task file (required) |
| `--repo <path>` | Target repo path |
| `--config <path>` | Config file path |
| `--allow-deps` | Allow lockfile changes |
| `--allow-dirty` | Allow dirty worktree |
| `--no-write` | Don't write artifacts |

---

## Fun Aliases

Same commands, different vibe:

| Alias | Maps to | Description |
|-------|---------|-------------|
| `runr summon` | `runr run` | Summon a worker to execute a task |
| `runr resurrect` | `runr resume` | Resurrect a stopped run from checkpoint |
| `runr scry` | `runr status` | Scry the fate of a run |
| `runr banish` | `runr gc` | Banish old worktrees to the void |

---

## Orchestration Commands

Multi-track execution with collision-aware scheduling.

### runr orchestrate run

Start a new orchestration.

```bash
runr orchestrate run --config <path> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--config <path>` | Orchestration config (required) | - |
| `--repo <path>` | Target repo path | `.` |
| `--time <minutes>` | Time budget per run | `120` |
| `--max-ticks <count>` | Max ticks per run | `50` |
| `--collision-policy <p>` | serialize, force, fail | `serialize` |
| `--allow-deps` | Allow lockfile changes | `false` |
| `--worktree` | Create worktree per run | `false` |
| `--fast` | Skip PLAN/REVIEW phases | `false` |
| `--auto-resume` | Auto-resume on failures | `false` |
| `--dry-run` | Show plan without running | `false` |

### runr orchestrate resume

Resume a stopped orchestration.

```bash
runr orchestrate resume <orchestratorId|latest> [options]
```

| Flag | Description |
|------|-------------|
| `--repo <path>` | Target repo path |
| `--time <minutes>` | Override time budget |
| `--max-ticks <count>` | Override max ticks |
| `--fast` / `--no-fast` | Override fast mode |
| `--collision-policy <p>` | Override collision policy |

### runr orchestrate wait

Block until orchestration completes.

```bash
runr orchestrate wait <orchestratorId|latest> [options]
```

| Flag | Description | Default |
|------|-------------|---------|
| `--repo <path>` | Target repo path | `.` |
| `--for <condition>` | terminal, stop, complete | `terminal` |
| `--timeout <ms>` | Timeout in milliseconds | - |
| `--json` / `--no-json` | Output format | `--json` |
