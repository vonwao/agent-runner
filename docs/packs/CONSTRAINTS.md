# Pack System Constraints (v1)

## Philosophy: Extensions Without Ecosystem Complexity

The pack system provides **data-only extensions** with a **tiny execution engine** for safe actions.

This is NOT a plugin system. This is NOT a marketplace.

### Core vs Pack Boundary

**Core** (src/): Logic + invariants
- Supervisor state machine
- Verification engine
- Worker orchestration
- Safety guarantees

**Packs** (packs/): Opinions + scaffolding + docs
- Workflow defaults
- Documentation templates
- Initialization actions
- No code, no logic

## Hard Constraints (v1/v2)

### 1. Data-Only Packs

Packs contain:
- ✅ JSON manifest (pack.json)
- ✅ Markdown templates (.tmpl files)
- ❌ JavaScript/TypeScript code
- ❌ Shell scripts
- ❌ Binary executables

### 2. Boring Init Actions Only

Allowed actions:
- ✅ `create_file_if_missing` - Create file from template if absent
- ✅ `ensure_gitignore_entry` - Append line to .gitignore if missing
- ❌ Modify existing files (beyond gitignore append)
- ❌ Run commands
- ❌ Make network calls
- ❌ Inspect or change git state

### 3. Idempotent and Safe

All actions must be:
- **Idempotent**: Running twice produces same result
- **Safe**: Cannot break existing repos
- **Transparent**: Dry-run shows exact changes
- **Reversible**: User can manually undo

### 4. No Smart Modifications

Do NOT add:
- Editing existing AGENTS.md
- Adding scripts to package.json
- Modifying git config
- Creating git branches
- Changing file permissions (except via mode in create action)

Keep it boring. Keep it safe.

## When to Add New Features

### Add New Action Types (Internal)

When you need:
- Safe, idempotent operations
- Fully controlled by Runr code
- Clear, limited scope

Example candidates:
- `ensure_package_script` (if heavily requested)
- `create_directory_if_missing`

### Add New Packs

When you have:
- A distinct workflow pattern (not just config tweaks)
- Different branch/merge strategy
- Different verification philosophy

Current packs:
- `solo` - dev→main with verification
- `trunk` - main-only with verification

### DO NOT Add Plugins

Until you have:
- External contributors demanding custom behavior
- Org-specific needs you refuse to ship in core
- Clear security model for untrusted code

If someone wants "customization," tell them to:
1. Fork a pack and maintain it themselves
2. Use `--print` mode and edit config manually
3. Request a new pack in core

## Evolution Strategy

### Rapid Pack Iteration

Change packs freely without touching core:
- Update templates (better docs, clearer guidance)
- Adjust defaults (stricter verification, different branches)
- Add new packs (pr, feature-branch, etc)

### Conservative Core Changes

Change core only for:
- Correctness bugs
- Security issues
- Fundamental workflow improvements

### Version Packs Separately (Future)

When needed:
- Add `pack_version: 2` schema
- Keep v1 packs working
- Clear migration path

## Testing Requirements

Every pack must:
- Load successfully (`runr packs` shows it)
- Pass dry-run without errors
- Create files idempotently
- Generate valid runr.config.json
- Work from npm-installed package

## Security Non-Negotiables

Never relax:
- Pack name sanitization (no path traversal)
- Template path validation (stay in pack dir)
- No code execution from packs
- No network calls during init

## The Long Game

This constraint system lets you:
1. **Move fast on workflow opinions** (edit packs, ship)
2. **Move slow on core invariants** (test thoroughly, debate)
3. **Say no to bloat** ("just fork a pack" is a valid answer)

The tension is intentional.
