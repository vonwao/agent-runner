# Add Unit Test for Meta Command

## Goal
Add basic unit tests for the new `runr meta` command to verify tool detection and safety checks.

## Requirements
- Test auto-detection of Claude Code and Codex CLI
- Test dirty tree blocking behavior
- Test repo setup validation
- Follow existing test patterns in `src/commands/__tests__/`

## Success Criteria
- Test file created at `src/commands/__tests__/meta.test.ts`
- Tests pass with `npm test`
- All tests use mocking for `execa` calls (no real tool execution)
- Code coverage for main branches of meta command

## Scope
- Only test the meta command logic
- Don't test actual tool launching (mock it)
- Follow patterns from `doctor.test.ts` if it exists
