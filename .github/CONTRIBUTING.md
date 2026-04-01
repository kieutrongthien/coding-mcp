# Contributing

Thanks for contributing to coding-mcp.

## Development Setup

1. Install Node.js 20+
2. Clone the repository
3. Install dependencies:

```bash
npm install
```

4. Run quality checks:

```bash
npm run typecheck
npm test
npm run build
```

## Branch and Commit Guidelines

- Create branches from `main`
- Use descriptive branch names, for example: `feat/multi-root-indexing`
- Prefer small, focused pull requests
- Use clear commit messages; conventional commits are recommended

Examples:
- `feat: add git branch protection checks`
- `fix: block path traversal in read_file`
- `docs: update CLI serve examples`

## Pull Request Requirements

Before opening a PR:

1. Ensure all tests pass locally
2. Run `npm run typecheck`
3. Update tests for new behavior
4. Update documentation for user-facing changes
5. Keep PR scope focused on one topic

## Coding Standards

- TypeScript with strict typing
- Runtime validation for external inputs
- Defensive error handling with structured responses
- Security-first defaults for filesystem, git, and command execution

## Adding MCP Features

When adding new tools/resources/prompts:

1. Add or update zod schemas in `src/mcp/schemas`
2. Register handlers in the appropriate registry under `src/mcp`
3. Reuse shared services from `src/services`
4. Ensure response envelope consistency (`ok`, `operation`, `data`, `warnings`, `errors`)
5. Add tests for normal and failure paths

## Reporting Issues

Use GitHub Issues and include:

- What you expected
- What happened
- Reproduction steps
- Relevant logs or error output
