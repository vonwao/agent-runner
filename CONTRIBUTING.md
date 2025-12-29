# Contributing to Agent Framework

Thank you for your interest in contributing to the Agent Framework! This document provides guidelines and information for contributors.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/agent-framework.git`
3. Install dependencies: `npm install`
4. Build: `npm run build`
5. Run tests: `npm test`

## Development Workflow

### Building

```bash
npm run build
```

### Testing

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm test -- src/config/__tests__/presets.test.ts
```

### Running Locally

```bash
# Use ts-node for development
npm run dev -- run tasks/test.md

# Or run the built version
npm start -- run tasks/test.md
```

## Code Style

- TypeScript with strict mode
- ESM modules
- Zod for runtime validation
- Vitest for testing

## Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Ensure all tests pass: `npm test`
4. Ensure build succeeds: `npm run build`
5. Submit a PR with a clear description

### PR Title Format

Use conventional commit format:

- `feat: add new feature`
- `fix: resolve bug`
- `docs: update documentation`
- `refactor: restructure code`
- `test: add tests`

## Architecture Overview

```
src/
  cli.ts              # CLI entry point
  config/             # Configuration loading and schema
  context/            # Context pack building
  orchestrator/       # Multi-run coordination
  repo/               # Git operations
  store/              # Run state persistence
  supervisor/         # Main run loop
  verification/       # Test/lint execution
  workers/            # Claude/Codex integration
```

### Key Concepts

- **RunState**: Immutable state object passed through the supervisor loop
- **Milestone**: Unit of work with scope and verification requirements
- **Worktree**: Git worktree providing run isolation
- **Scope Lock**: File patterns constraining modifications

## Reporting Issues

When reporting issues, please include:

1. Steps to reproduce
2. Expected behavior
3. Actual behavior
4. `agent doctor` output
5. Relevant log excerpts from `timeline.jsonl`

## Adding Scope Presets

To add a new scope preset:

1. Edit `src/config/schema.ts`
2. Add patterns to the `SCOPE_PRESETS` object
3. Add tests in `src/config/__tests__/presets.test.ts`

Example:

```typescript
export const SCOPE_PRESETS: Record<string, string[]> = {
  // ... existing presets
  myframework: [
    'myframework.config.*',
    'myframework/**',
  ],
};
```

## Questions?

Open an issue with the `question` label.
