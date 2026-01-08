# Add "pnpm" Scope Preset

## Goal
Add a new scope preset for pnpm workspaces to complement the existing npm/yarn patterns.

## Requirements
- Add to `src/config/presets.ts` (or wherever scope presets are defined)
- Include common pnpm patterns:
  - `pnpm-lock.yaml` (denylist)
  - `pnpm-workspace.yaml` (allowlist)
  - `.pnpmfile.cjs` (allowlist)
- Follow existing preset structure
- Update preset tests if they exist

## Success Criteria
- Users can use `"presets": ["pnpm"]` in config
- Pattern matches pnpm workspace files correctly
- Tests pass
- No breaking changes to existing presets

## Scope
- Only add the pnpm preset
- Don't modify existing presets
- Add test coverage for new preset
