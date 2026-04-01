# Coding MCP

Production-ready, multi-project MCP server for coding agents.

`coding-mcp` is designed for remote and local agent workflows where many repositories are managed under one or more root folders (for example `/projects`, `/srv/repos`). The primary goal is to let agents code remotely without cloning source repositories to the agent machine and without per-repository local setup on that machine. It provides safe filesystem and git automation, consistent MCP contracts, and hardened HTTP deployment controls.

## Documentation
- Quickstart: [https://coding-mcp.omaicode.com](https://coding-mcp.omaicode.com)
- API Reference: [https://coding-mcp.omaicode.com/api-reference](https://coding-mcp.omaicode.com/api-reference)
- Source Code Analysis: [https://coding-mcp.omaicode.com/architecture/source-code-analysis](https://coding-mcp.omaicode.com/architecture/source-code-analysis)
- CLI and Registry Guide: [https://coding-mcp.omaicode.com/guides/cli-and-registry](https://coding-mcp.omaicode.com/guides/cli-and-registry)

## Highlights

- Multi-project registry with persistent indexing
- Full tool/resource/prompt MCP surface for coding workflows
- Safe file operations and patching (structured edits + unified diff hunks)
- Git command suite with structured output
- Allowlist-based command runner with timeout and output limits
- Binary-safe file resources (text and base64 blob modes)
- Dual transport support: STDIO and HTTP (streamable or SSE)
- HTTP API-key authentication + RBAC (viewer/editor/admin)
- OpenTelemetry hooks for request and tool-level tracing
- Structured operation envelopes with request IDs and timing
- Audit logging for mutating actions

## Architecture

The server uses one shared core with modular services:

- `config`: environment/config-file loading + runtime validation
- `core`: response contracts, errors, logging, telemetry hooks, locks
- `services`: filesystem, git, patching, command execution, auth, project registry
- `mcp`: tool/resource/prompt registries bound to shared services
- `main`: CLI and transport bootstrap (`stdio`, `http`, `serve/init/add/remove`)

This keeps STDIO and HTTP behavior consistent while allowing transport-specific controls (for example HTTP auth).

## Response Contract

Successful operation:

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

Failed operation:

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

## Quick Start

```bash
npm install -g @kieutrongthien/coding-mcp
```

If you want to develop from source, use:

```bash
git clone https://github.com/kieutrongthien/coding-mcp.git
cd coding-mcp
cp .env.example .env
npm install
npm run build
npm install -g .
```

Run HTTP transport:

```bash
coding-mcp serve --transport http --host 0.0.0.0 --port 4000 --mode streamable
```

Run STDIO transport:

```bash
coding-mcp serve --transport stdio
```

## CLI Commands

Initialize registry roots from current directory:

```bash
cd /projects
coding-mcp init
```

Initialize from an explicit root:

```bash
coding-mcp init /projects
```

Add/remove project roots:

```bash
coding-mcp add /srv/repos
coding-mcp remove /srv/repos
```

Development commands:

```bash
npm run dev:stdio
npm run dev:http
npm run dev:serve -- --transport http --host 127.0.0.1 --port 3001 --mode sse
```

## Configuration

Use environment variables directly or provide a JSON/YAML file via `MCP_CONFIG_PATH`.

Core settings:

- `PROJECTS_ROOTS` (preferred, comma-separated)
- `PROJECTS_ROOT` (legacy compatibility)
- `ENABLE_HTTP`, `ENABLE_STDIO`
- `HTTP_HOST`, `HTTP_PORT`, `HTTP_MODE`
- `MAX_FILE_SIZE`, `MAX_OUTPUT_SIZE`, `COMMAND_TIMEOUT_MS`
- `RETRY_MAX_ATTEMPTS`, `RETRY_BASE_DELAY_MS`
- `ALLOWED_COMMANDS`, `PROTECTED_PATHS`
- `LOG_LEVEL`
- `REGISTRY_FILE`, `AUDIT_LOG_FILE`, `HTTP_REQUEST_LOG_FILE`

Security settings:

- `ENABLE_AUTH`
- `AUTH_HEADER_NAME`
- `AUTH_API_KEYS` in `key:role:id` format

Observability settings:

- `ENABLE_OTEL`
- `OTEL_SERVICE_NAME`
- `OTEL_EXPORTER_OTLP_ENDPOINT`
- `OTEL_EXPORTER_OTLP_HEADERS` in `key=value,key2=value2`

## HTTP Security (Auth/RBAC)

Enable API-key authentication when exposing HTTP transport.

```bash
ENABLE_AUTH=true
AUTH_HEADER_NAME=x-api-key
AUTH_API_KEYS=viewer-key:viewer:viewer1,editor-key:editor:editor1,admin-key:admin:admin1
```

Request header:

```http
x-api-key: editor-key
```

Roles:

- `viewer`: read-only operations
- `editor`: read + non-destructive write/build/test flows
- `admin`: full access (including destructive operations)

## OpenTelemetry

Tracing can be exported over OTLP HTTP.

```bash
ENABLE_OTEL=true
OTEL_SERVICE_NAME=coding-mcp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20token
```

Emitted spans:

- `mcp.http.request`
- `mcp.tool.{operation}`

## HTTP Monitoring Endpoints

When HTTP transport is enabled, these endpoints are available:

- `GET /healthz`: liveness status
- `GET /readyz`: readiness status and indexed project count
- `GET /metrics`: basic metrics (`request_count`, `error_count`, latency summary)

## MCP Resources

- `project://index`
- `project://{project_id}/tree`
- `project://{project_id}/package-json`
- `project://{project_id}/readme`
- `project://{project_id}/git-status`
- `project://file/{project_id}/{path}`
- `project://file-meta/{project_id}/{path}`

File resource behavior:

- Text files are returned via `text`
- Binary files are returned via base64 `blob`
- Response payloads are bounded by configured output limits

## MCP Client Examples

Cursor (STDIO):

```json
{
  "mcpServers": {
    "coding-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/coding-mcp/dist/src/main/stdio.js"],
      "env": {
        "PROJECTS_ROOTS": "/projects,/srv/repos",
        "ENABLE_STDIO": "true",
        "ENABLE_HTTP": "false"
      }
    }
  }
}
```

Claude Desktop (STDIO):

```json
{
  "mcpServers": {
    "coding-mcp": {
      "command": "node",
      "args": ["/absolute/path/to/coding-mcp/dist/src/main/stdio.js"],
      "env": {
        "PROJECTS_ROOTS": "/projects"
      }
    }
  }
}
```

Generic HTTP MCP client:

```json
{
  "mcpServers": {
    "coding-mcp-http": {
      "url": "http://your-host:3000",
      "headers": {
        "x-api-key": "editor-key"
      }
    }
  }
}
```

## Validation

```bash
npm run typecheck
npm test
```

## License

MIT