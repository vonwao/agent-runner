# Task: Extract formatDuration to shared utility

## Goal
The `formatDuration` function in `src/commands/metrics.ts` is useful elsewhere. Extract it to a shared utility.

## Requirements
1. Create `src/utils/format.ts` with the `formatDuration` function
2. Export it from a new `src/utils/index.ts` barrel file
3. Update `src/commands/metrics.ts` to import from the shared utility
4. Add a simple unit test in `src/utils/__tests__/format.test.ts`

## Scope
- `src/utils/format.ts` (new)
- `src/utils/index.ts` (new)
- `src/utils/__tests__/format.test.ts` (new)
- `src/commands/metrics.ts` (update import)

## Verification
- Build passes: `npm run build`
- Tests pass: `npm test`
- New test covers: ms, seconds, minutes formatting
