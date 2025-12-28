# Dogfood Run: dfXX

## Config
- **Track**: `dogfood/tracks/dfXX.yaml`
- **Date**: YYYY-MM-DD
- **Runner**: v0.1.0 (../agent-stable)
- **Parallel**: 1
- **Collision Policy**: serialize
- **Auto-Resume**: true

## Command
```bash
node ../agent-stable/dist/cli.js orchestrate run \
  --config dogfood/tracks/dfXX.yaml \
  --repo . \
  --worktree \
  --auto-resume \
  --collision-policy serialize
```

## Result
- **Status**: complete | stopped | failed
- **Stop Reason**: (if stopped)
- **Duration**: Xm Xs
- **Orchestration ID**: orch-XXXXXXXX-XXXXXX-XXX

## Auto-Resume
- **Triggered**: yes | no
- **Recovery**: successful | failed | n/a

## Collisions
- **Count**: 0
- **Details**: (if any)

## Notes
(observations, issues, surprises)

## Metrics Snapshot
```json
(paste relevant metrics --json output)
```
