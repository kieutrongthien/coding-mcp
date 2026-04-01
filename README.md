# Coding MCP Server

Production-oriented multi-project MCP server for coding agents, designed to manage projects under a shared root directory (for example, `/projects`).

## Features

- Multi-project discovery with persistent project registry
- Safe file CRUD and patch application (structured edits + unified diff input)
- Git operations with validation and structured command output
- Safe command execution with allowlisted executables and timeout controls
- MCP tools, resources, and prompts
- Shared business core for STDIO and HTTP transports
- Structured JSON response envelope with request IDs and timing
- Audit logging for mutating operations

## Response Contract

Success:

```json
{
  "ok": true,
  "project_id": "abc123",
  "operation": "read_file",
  "data": {},
  "warnings": [],
  "errors": [],
  "request_id": "uuid",
  "duration_ms": 12
}
```

Failure:

```json
{
  "ok": false,
  "operation": "write_file",
  "error_code": "SECURITY_ERROR",
  "message": "Operation blocked for protected path",
  "details": {},
  "request_id": "uuid",
  "duration_ms": 7
}
```

## Setup

```bash
cp .env.example .env
npm install
npm run build
```

## Run

CLI command (published/global usage):

```bash
npx coding-mcp serve --transport http --host 0.0.0.0 --port 4000 --mode streamable
```

```bash
coding-mcp serve --transport http --host 0.0.0.0 --port 4000 --mode streamable
```

Initialize registry from current projects root:

```bash
cd /projects
coding-mcp init
```

Initialize registry from a specific root:

```bash
coding-mcp init /projects
```

Add and remove roots in registry:

```bash
coding-mcp add /srv/repos
coding-mcp remove /srv/repos
```

STDIO:

```bash
npm run dev:stdio
```

HTTP:

```bash
npm run dev:http
```

CLI serve with overrides:

```bash
npm run dev:serve -- --transport http --host 0.0.0.0 --port 4000 --mode streamable --projects-root /projects --projects-root /srv/repos
```

CLI serve with SSE mode:

```bash
npm run dev:serve -- --transport http --host 127.0.0.1 --port 3001 --mode sse
```

## Configuration

Use environment variables or a JSON/YAML config file passed with `MCP_CONFIG_PATH`.

Key vars:

- `PROJECTS_ROOT`
- `PROJECTS_ROOTS` (comma-separated list; preferred)
- `ENABLE_HTTP`
- `ENABLE_STDIO`
- `HTTP_HOST`
- `HTTP_PORT`
- `MAX_FILE_SIZE`
- `MAX_OUTPUT_SIZE`
- `COMMAND_TIMEOUT_MS`
- `ALLOWED_COMMANDS`
- `PROTECTED_PATHS`
- `LOG_LEVEL`

## MCP Resources

- `project://index`
- `project://{project_id}/tree`
- `project://{project_id}/package-json`
- `project://{project_id}/readme`
- `project://{project_id}/git-status`
- `project://file/{project_id}/{path}`

## Multi-root Discovery

The server can discover projects from multiple parent directories.

1. Set `PROJECTS_ROOTS=/projects,/srv/repos` in environment or config.
2. Optionally pass repeated `--projects-root` flags in CLI serve mode.
3. Projects from all configured roots are indexed into one registry.

## Example MCP Client Config

### Cursor (STDIO)

```json
{
  "mcpServers": {
    "coding-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/coding-mcp/dist/main/stdio.js"],
      "env": {
        "PROJECTS_ROOT": "/projects",
        "ENABLE_STDIO": "true",
        "ENABLE_HTTP": "false"
      }
    }
  }
}
```

### Claude Desktop (STDIO)

```json
{
  "mcpServers": {
    "coding-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/coding-mcp/dist/main/stdio.js"],
      "env": {
        "PROJECTS_ROOT": "/projects"
      }
    }
  }
}
```

### Generic HTTP MCP Client

```json
{
  "mcpServers": {
    "coding-mcp-http": {
      "url": "http://your-host:3000",
      "headers": {}
    }
  }
}
```

## Tool Coverage

Implemented tools include project discovery, file/directory operations, search/analysis, git workflows, and command execution (`run_build`, `run_test`, `run_lint`, `run_command_safe`).

## Tests

```bash
npm test
```

## Future Improvements

1. Full hunk-level unified diff patch application engine
2. OpenTelemetry export hooks
3. Binary-safe file streaming resource endpoints
4. Auth/RBAC for exposed HTTP deployments

## License
MIT License