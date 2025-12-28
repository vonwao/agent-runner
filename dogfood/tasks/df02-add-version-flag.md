# Task: Add --short flag to version command

## Goal
Add a `--short` flag to the version command that outputs just the version number.

## Requirements
1. Add `--short` option to the version command in `src/cli.ts`
2. Update `VersionOptions` in `src/commands/version.ts` to include `short: boolean`
3. When `--short` is true, output only the version string (e.g., "0.1.0")
4. Default behavior (no flag) remains unchanged

## Scope
- `src/cli.ts`
- `src/commands/version.ts`

## Verification
- Build passes: `npm run build`
- `npx agent version --short` outputs just "0.1.0"
- `npx agent version` still outputs full info
