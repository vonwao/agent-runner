# Packs User Guide

Workflow packs are complete presets that initialize Runr with best-practice configuration, documentation, and branch strategy.

## What Are Packs?

A **pack** provides:

1. **Default configuration** - Pre-filled `runr.config.json` with workflow settings
2. **Documentation templates** - `AGENTS.md` and `CLAUDE.md` for your project
3. **Branch strategy** - Recommended git workflow (dev→main or main-only)

**Think of packs as project blueprints** — instead of manually configuring workflow settings, choose a pack that matches your team's process.

## Available Packs

### Solo Pack

**Use case:** Solo developer or small team with integration branch

- **Integration branch:** `dev`
- **Release branch:** `main`
- **Workflow:** All work happens on `dev`, submit verified changes to `main`

**Best for:**
- Solo developers
- Small teams (2-3 people)
- Wanting sandbox branch for experiments
- Main branch is production/release

**Initialization:**
```bash
runr init --pack solo
```

**What it creates:**
```
.runr/
├── runr.config.json          # Configured for dev→main workflow
├── tasks/
│   └── example-task.md
AGENTS.md                      # Agent guidelines for this project
CLAUDE.md                      # Claude Code integration guide
```

**Generated config:**
```json
{
  "workflow": {
    "profile": "solo",
    "integration_branch": "dev",
    "require_verification": true
  }
}
```

### Trunk Pack

**Use case:** Trunk-based development on main branch

- **Integration branch:** `main`
- **Release branch:** `main`
- **Workflow:** All work happens directly on `main`, fast iteration

**Best for:**
- Teams practicing trunk-based development
- Fast iteration cycle
- Main is always deployable
- Continuous deployment

**Initialization:**
```bash
runr init --pack trunk
```

**Generated config:**
```json
{
  "workflow": {
    "profile": "trunk",
    "integration_branch": "main",
    "require_verification": true
  }
}
```

## Choosing a Pack

| Question | Solo | Trunk |
|----------|------|-------|
| Do you want a separate integration branch? | ✅ Yes (dev) | ❌ No (main only) |
| Do you want to experiment before releasing? | ✅ Yes | ⚠️ Limited |
| Is your team practicing trunk-based dev? | ❌ No | ✅ Yes |
| Do you need fast iteration on main? | ⚠️ Manual | ✅ Built-in |
| Team size | Solo or 2-3 | Any |

**Still unsure?** Start with **solo** — you can always change later by editing config.

## Using Packs

### List Available Packs

```bash
runr packs
```

Output:
```
Available workflow packs:

  solo
    Solo development with integration branch (dev → main)

  trunk
    Trunk-based development (main only, fast iteration)

Usage:
  runr init --pack <name>           # Initialize with pack
  runr init --pack solo --dry-run   # Preview changes
```

### Preview Pack Changes

See what a pack will create **without writing files:**

```bash
runr init --pack solo --dry-run
```

Output shows:
- Files that will be created
- Configuration that will be written
- Template content

### Initialize with Pack

```bash
# Solo workflow
runr init --pack solo

# Trunk workflow
runr init --pack trunk
```

**What happens:**
1. Creates `.runr/` directory
2. Writes `runr.config.json` with workflow preset
3. Creates template documentation (`AGENTS.md`, `CLAUDE.md`)
4. Creates example task file

**Idempotent:** Safe to run multiple times, won't overwrite existing config.

## What Gets Created

### runr.config.json

Pack initialization auto-detects verification commands and adds workflow settings:

```json
{
  "agent": {
    "name": "my-project",
    "version": "1"
  },
  "scope": {
    "presets": ["typescript", "vitest"]  // Auto-detected
  },
  "verification": {
    "tier0": ["npm run typecheck"],      // Auto-detected
    "tier1": ["npm test"]                // Auto-detected
  },
  "workflow": {
    "profile": "solo",                   // From pack
    "integration_branch": "dev",         // From pack
    "require_verification": true         // From pack
  }
}
```

### AGENTS.md

Agent-facing guidelines for your project:

- **Workflow explanation** - How to use Runr in this project
- **Verification requirements** - What must pass before checkpoint
- **Submit process** - Bundle → dry-run → submit → push pattern
- **Safety rules** - When to use wrapper vs manual commands

**Example excerpt:**
```markdown
## Workflow: Solo Dev (dev → main)

This project uses the **solo** workflow:

- All work lands on `dev` (or feature branches)
- Runr creates verified checkpoints with full test evidence
- Submit verified changes to `main` via: bundle → dry-run → submit → push
```

### CLAUDE.md

Claude Code integration guide:

- **Quick start** - Commands to run tasks and submit
- **How Runr works** - Phase-gated workflow explanation
- **Configuration** - Where to find config
- **Determinism & safety** - P0 invariants
- **Concrete commands** - Copy-paste ready examples
- **Error handling** - What to do when things break

**Example excerpt:**
```markdown
## Quick Start

1. Ensure Claude Code is installed and configured
2. Create tasks in `.runr/tasks/`
3. Run: `runr run --task .runr/tasks/your-task.md --worktree`
4. Submit: `runr submit <run_id> --to dev`
```

### tasks/example-task.md

Starter task file showing markdown format:

```markdown
# Example Task

## Goal
Demonstrate task file format

## Requirements
- Clear goal statement
- Specific requirements
- Success criteria

## Success Criteria
- Task completes without errors
- Verification passes
```

## Customizing After Initialization

Packs provide **starting points**, not rigid rules. Customize freely:

### Change integration branch

Edit `.runr/runr.config.json`:
```json
{
  "workflow": {
    "integration_branch": "develop"  // Changed from "dev"
  }
}
```

### Add verification commands

```json
{
  "verification": {
    "tier0": ["npm run typecheck", "npm run lint"],
    "tier1": ["npm run build"],
    "tier2": ["npm test", "npm run e2e"]  // Added e2e
  }
}
```

### Disable verification requirement

```json
{
  "workflow": {
    "require_verification": false  // Skip verification check on submit
  }
}
```

### Edit documentation templates

Modify `AGENTS.md` and `CLAUDE.md` to match your team's process:

```bash
# Add project-specific guidelines
vim AGENTS.md

# Add custom wrapper scripts
vim CLAUDE.md
```

## Pack Lifecycle

### Fresh Project

```bash
cd new-project
npm init -y
runr init --pack solo

# Start using Runr immediately
runr run --task .runr/tasks/setup-project.md --worktree
```

### Existing Project

```bash
cd existing-project  # Already has .git/
runr init --pack trunk

# Runr detects existing package.json, tsconfig.json, etc.
# Auto-configures verification commands
```

### Switching Packs

To switch from solo to trunk:

```bash
# Option 1: Re-initialize (preserves existing config)
runr init --pack trunk

# Option 2: Manual edit
vim .runr/runr.config.json
# Change: "profile": "trunk"
# Change: "integration_branch": "main"
```

**Note:** Switching packs only updates config, doesn't change git branches.

## Advanced: Creating Custom Packs

Packs live in `packs/` directory of Runr source. To create a custom pack:

1. **Fork Runr repository**
2. **Copy existing pack:**
   ```bash
   cp -r packs/solo packs/custom
   ```
3. **Edit manifest:**
   ```json
   {
     "name": "custom",
     "version": "1.0.0",
     "description": "Custom workflow for my team"
   }
   ```
4. **Customize templates** in `packs/custom/templates/`
5. **Test locally:**
   ```bash
   npm run build
   npm link
   runr packs  # Should list your custom pack
   ```

**Note:** Custom packs require local Runr build. For team distribution, consider:
- Internal npm registry
- Git submodule
- Documented manual setup

See [Packs Developer Guide](packs/README.md) for full details.

## Comparing Packs to Manual Setup

### With Pack

```bash
runr init --pack solo
# Done! Config + docs + examples created
```

### Without Pack (Manual)

```bash
mkdir -p .runr/tasks
cat > .runr/runr.config.json << 'EOF'
{
  "agent": { "name": "my-project", "version": "1" },
  "scope": { "allowlist": ["src/**"] },
  "verification": { "tier0": ["npm test"] },
  "workflow": {
    "profile": "solo",
    "integration_branch": "dev",
    "require_verification": true
  }
}
EOF

# Still need to write AGENTS.md, CLAUDE.md manually
# Still need to create example task
```

**Packs save setup time and ensure best practices.**

## FAQ

**Q: Can I use Runr without a pack?**

A: Yes! Packs are optional. You can:
```bash
runr init  # Interactive setup without pack
# or
runr run --task task.md --repo . --config custom-config.json
```

**Q: What if I don't like the generated docs?**

A: Edit or delete them freely. `AGENTS.md` and `CLAUDE.md` are templates, not requirements.

**Q: Can I have multiple workflow profiles?**

A: No, one config = one workflow. Use different configs for different workflows:
```bash
runr run --task task.md --config .runr/solo.config.json
runr run --task task.md --config .runr/trunk.config.json
```

**Q: Do packs create git branches?**

A: No. Packs only configure Runr settings. You still need to create branches:
```bash
git checkout -b dev  # For solo pack
```

**Q: Can I share a custom pack with my team?**

A: Yes, but requires coordination:
1. Share pack files (via git or tarball)
2. Each team member installs locally
3. Or, commit generated config and docs to your project repo (simpler)

**Q: What happens if I run `runr init --pack solo` twice?**

A: Idempotent — won't overwrite existing config. Safe to re-run.

## See Also

- [Workflow Guide](workflow-guide.md) - How to use bundle/submit
- [Configuration Reference](configuration.md) - Workflow config fields
- [CLI Reference](cli.md) - `runr init` and `runr packs` commands
- [Packs Developer Guide](packs/README.md) - Creating custom packs
