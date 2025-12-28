# Task: Add validation for metrics --window option

## Goal
Add validation to ensure the `--window` option is a positive integer.

## Requirements
1. In `src/cli.ts`, validate that `--window` value is a positive integer > 0
2. If invalid, print an error message and exit with code 1
3. Error message should be: "Error: --window must be a positive integer"

## Scope
- `src/cli.ts` only (in the metrics command action)

## Verification
- Build passes: `npm run build`
- `npx agent metrics --window 0` shows error and exits 1
- `npx agent metrics --window -5` shows error and exits 1
- `npx agent metrics --window abc` shows error and exits 1
- `npx agent metrics --window 10` works normally
