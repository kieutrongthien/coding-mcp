# Copilot Instructions for coding-mcp

These instructions apply to all coding agents working in this repository.

## Mission

Build and maintain a production-grade MCP server for multi-project coding workflows with strong safety controls.

## Architecture Rules

- Preserve modular boundaries: config, core, services, and mcp layers.
- Reuse shared services via bootstrap container; do not bypass service abstractions in tool handlers.
- Keep STDIO and HTTP transports behaviorally consistent.

## Safety Rules (Mandatory)

- Never allow path traversal outside project roots.
- Keep destructive operations guarded by explicit confirmation flags.
- Keep command execution allowlist-based; do not introduce shell concatenation.
- Prefer `spawn(command, args, { shell: false })` patterns.
- Maintain output/file size limits and timeout controls.

## MCP Contract Rules

- Keep zod schemas in sync with tool/resource/prompt handlers.
- Keep response envelopes consistent (`ok`, `operation`, `data`, `warnings`, `errors`).
- Return structured failures with clear error codes and details.

## Testing Rules

Before proposing completion for code changes:

1. Run `npm run typecheck`
2. Run `npm test`
3. Add or update tests for changed behavior

## Documentation Rules

- Update README and env examples when changing CLI/config behavior.
- Update GitHub templates/workflows when project process changes.

## Preferred Workflow

1. Read affected schemas and service interfaces first.
2. Implement minimal changes preserving existing API contracts.
3. Validate with typecheck/tests.
4. Summarize changes with impacted files and behavior deltas.
