# Guard Torture: Tool Pollution Test Suite

Systematic test suite for Runr's guard behavior under tool cache/artifact pollution.

## Purpose

Stress-test the guard's `git check-ignore` integration by generating real-world tool caches that should NOT trigger guard violations when gitignored.

## Scenarios

Each scenario in `scenarios/<tool>/` tests a common tool that generates artifacts:

1. **tsx-cache** — tsx/ts-node compilation caches (`.tmp/`)
2. **vite-cache** — Vite dependency pre-bundling (`node_modules/.vite/`)
3. **eslint-cache** — ESLint cache file (`.eslintcache`)
4. **pytest-cache** — pytest cache directory (`.pytest_cache/`)
5. **coverage-cache** — Coverage artifacts (`coverage/`, `.nyc_output/`)
6. **macos-dsstore** — macOS Finder metadata (`.DS_Store`, `._*`)

## Structure

Each scenario contains:
- `generate.sh` — Script that creates the tool artifacts
- `.gitignore` — Ignore rules for the artifacts
- `expect.json` — Expected guard behavior (with/without gitignore)

## Running Scenarios

```bash
cd scenarios/<tool>
./generate.sh
# Run guard checks to verify behavior
```

## Expected Behavior Matrix

| Tool artifacts | Gitignored? | Guard result | Journal |
|---------------|-------------|--------------|---------|
| Any scenario  | ✅ Yes       | OK (no violation) | Ignored count incremented |
| Any scenario  | ❌ No        | VIOLATION | Guard stops run |

## Test Coverage

These scenarios cover:
- Common Node.js toolchains (tsx, vite, eslint, nyc)
- Python toolchains (pytest)
- OS-level noise (macOS Finder metadata)
- Real-world tool pollution that caused guard violations in production

## Integration with Runr Tests

Guard behavior tests should:
1. Generate artifacts using scenario scripts
2. Run guard checks with/without gitignore
3. Assert expected violations/ignores
4. Verify journal includes ignored file metrics
