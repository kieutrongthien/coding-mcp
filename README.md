# Coding MCP

Production-ready MCP server that lets AI agents perform coding tasks on remote repositories.

## What is it?

`coding-mcp` is an [MCP (Model Context Protocol)](https://modelcontextprotocol.io) server that exposes your code repositories as a set of tools and resources that AI agents can use to read, write, search, and run commands — all without the agent needing local access to the repositories.

**Primary goal:** deploy one server on a machine that hosts your code, then connect any MCP-compatible agent (Claude, Cursor, etc.) to it. The agent can browse files, edit code, run builds and tests, manage git, and more — all through structured MCP tool calls.

```
┌──────────────────────────────────────────────┐
│  AI Agent (Claude / Cursor / any MCP client) │
└────────────────┬─────────────────────────────┘
                 │  MCP over HTTP or STDIO
                 ▼
┌──────────────────────────────────────────────┐
│           coding-mcp server                  │
│  (runs on the machine with your repos)       │
│                                              │
│  Tools: files · git · search · commands      │
│  Resources: project index · file content     │
│  Prompts: implement · review · fix tests     │
└──────────────────┬───────────────────────────┘
                   │  filesystem + git
                   ▼
      /projects/repo-a  /projects/repo-b  …
```

## Documentation

- Quickstart: [https://coding-mcp.omaicode.com](https://coding-mcp.omaicode.com)
- API Reference: [https://coding-mcp.omaicode.com/api-reference](https://coding-mcp.omaicode.com/api-reference)
- Source Code Analysis: [https://coding-mcp.omaicode.com/architecture/source-code-analysis](https://coding-mcp.omaicode.com/architecture/source-code-analysis)
- CLI and Registry Guide: [https://coding-mcp.omaicode.com/guides/cli-and-registry](https://coding-mcp.omaicode.com/guides/cli-and-registry)

## Highlights

- Multi-project registry with persistent indexing
- Safe file operations and patching (structured edits + unified diff hunks)
- Git command suite with structured output
- Allowlist-based command runner with timeout and output limits
- Binary-safe file resources (text and base64 blob modes)
- Dual transport support: STDIO and HTTP (streamable or SSE)
- HTTP API-key authentication + RBAC (viewer/editor/admin)
- OpenTelemetry hooks for request and tool-level tracing
- Structured operation envelopes with request IDs and timing
- Audit logging for mutating actions

## Quick Start

Install globally:

```bash
npm install -g @kieutrongthien/coding-mcp
```

Register one or more project roots (the directories that contain your repos):

```bash
coding-mcp init /projects
```

Start the server:

```bash
# HTTP transport (for remote agents)
coding-mcp serve --transport http --host 0.0.0.0 --port 4000 --mode streamable

# STDIO transport (for local agents like Cursor or Claude Desktop)
coding-mcp serve --transport stdio
```

### Build from source

```bash
git clone https://github.com/kieutrongthien/coding-mcp.git
cd coding-mcp
cp .env.example .env
npm install
npm run build
npm install -g .
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `coding-mcp init [path]` | Scan a directory for projects and write the registry. Defaults to the current working directory. |
| `coding-mcp add <path>` | Add a new root directory to the project registry. |
| `coding-mcp remove <path>` | Remove a root directory from the project registry. |
| `coding-mcp serve` | Start the MCP server. Accepts `--transport`, `--host`, `--port`, and `--mode` flags. |

Development shortcuts (no build step needed):

```bash
npm run dev:stdio
npm run dev:http
npm run dev:serve -- --transport http --host 127.0.0.1 --port 3001 --mode sse
```

## MCP Tools

Tools are the primary interface for agents. Each tool accepts a `project_id` (returned by `list_projects`) and operates within that project's root, preventing any path traversal outside it.

### Project Tools

| Tool | Description |
|------|-------------|
| `list_projects` | List all projects discovered in the configured root directories. |
| `get_project` | Get metadata for a specific project (path, detected tooling, package manager, git info). |
| `refresh_project_index` | Re-scan one project or all projects to pick up newly added repositories. |

### File Tools

| Tool | Description |
|------|-------------|
| `list_directory` | List files and subdirectories at a given path within a project. |
| `read_file` | Read file content, optionally limited to a line range. |
| `read_multiple_files` | Read multiple files in a single call. |
| `create_file` | Create a new file. Set `overwrite: true` to replace an existing file. |
| `write_file` | Overwrite the full content of an existing file. |
| `replace_in_file` | Find and replace text within a file (first match or all matches). |
| `apply_patch` | Apply a unified diff or a list of structured edit operations to a file. |
| `delete_file` | Delete a file or directory. Requires `confirm: true` as a safety guard. |
| `move_file` | Move or rename a file or directory. |

### Search Tools

| Tool | Description |
|------|-------------|
| `search_files` | Search for files by name or path pattern within a project. |
| `grep_content` | Search file contents using a regex-like pattern. Returns matching lines with file paths and line numbers. |
| `get_project_tree` | Get the directory tree of a project up to a configurable depth. |
| `summarize_project` | Return a summary of the project stack, package manager, detected tooling, and top-level tree. |

### Git Tools

| Tool | Description |
|------|-------------|
| `git_status` | Show the current working tree status (modified, staged, untracked files). |
| `git_diff` | Show unstaged or staged changes as a unified diff. |
| `git_branch_list` | List all local and remote branches. |
| `git_checkout_branch` | Switch to an existing branch. |
| `git_checkout_new_branch` | Create and switch to a new branch. |
| `git_pull` | Pull the latest changes from the remote. |
| `git_add` | Stage one or more files or paths. |
| `git_restore` | Discard working tree changes for specified paths. Requires `confirm: true`. |
| `git_commit` | Create a commit with the given message. |
| `git_push` | Push commits to a remote branch. Supports `set_upstream`. |
| `git_log` | Show recent commit history with configurable limit. |
| `git_show` | Show details of a specific commit, tag, or git object by ref. |
| `git_create_tag` | Create an annotated tag. |

### Command Tools

Commands run inside the project directory. Only commands on the `ALLOWED_COMMANDS` allowlist are permitted.

| Tool | Description |
|------|-------------|
| `run_build` | Run the build command auto-detected from the project tooling (e.g. `npm run build`, `make`). |
| `run_test` | Run the test command auto-detected from the project tooling (e.g. `npm test`, `pytest`). |
| `run_lint` | Run the lint command auto-detected from the project tooling (e.g. `npm run lint`, `ruff`). |
| `run_command_safe` | Run any allowlisted command with explicit arguments, working directory, and timeout. |

## MCP Resources

Resources expose read-only data that agents can fetch directly by URI.

| Resource URI | Description |
|--------------|-------------|
| `project://index` | JSON list of all indexed projects. |
| `project://{project_id}/tree` | Directory tree of the project (depth 4). |
| `project://{project_id}/readme` | Raw content of the project's `README.md`. |
| `project://{project_id}/package-json` | Raw content of the project's `package.json`. |
| `project://{project_id}/git-status` | Current git status as JSON. |
| `project://file/{project_id}/{path}` | Content of any file. Text files are returned as `text`; binary files as base64 `blob`. |
| `project://file-meta/{project_id}/{path}` | Metadata of a file (size, MIME type, encoding, truncation status). |

## MCP Prompts

Prompts provide pre-built instructions that agents can invoke to start structured coding workflows.

| Prompt | Description |
|--------|-------------|
| `analyze-project` | Ask the agent to analyze a project's architecture, risks, and improvements. |
| `implement-task` | Ask the agent to implement a described task within a project. |
| `explain-file` | Ask the agent to explain how a specific file works. |
| `generate-commit-message` | Ask the agent to generate a conventional commit message from a diff summary. |
| `review-diff` | Ask the agent to review a diff for bugs, regressions, and missing tests. |
| `fix-test-failures` | Ask the agent to fix failing tests given raw test output. |

## MCP Client Examples

### Claude Desktop (STDIO)

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

### Cursor (STDIO)

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

### Generic HTTP MCP client

```json
{
  "mcpServers": {
    "coding-mcp-http": {
      "url": "http://your-host:4000",
      "headers": {
        "x-api-key": "editor-key"
      }
    }
  }
}
```

## Configuration

Use environment variables directly or provide a JSON/YAML config file via `MCP_CONFIG_PATH`.

### Core settings

| Variable | Description |
|----------|-------------|
| `PROJECTS_ROOTS` | Comma-separated list of root directories to scan for projects (preferred). |
| `PROJECTS_ROOT` | Single root directory (legacy compatibility). |
| `ENABLE_HTTP` | Enable the HTTP transport (`true`/`false`). |
| `ENABLE_STDIO` | Enable the STDIO transport (`true`/`false`). |
| `HTTP_HOST` | HTTP server bind address (default `127.0.0.1`). |
| `HTTP_PORT` | HTTP server port (default `3000`). |
| `HTTP_MODE` | HTTP transport mode: `streamable` or `sse`. |
| `MAX_FILE_SIZE` | Maximum file size for read operations (bytes). |
| `MAX_OUTPUT_SIZE` | Maximum command or resource output size (bytes). |
| `COMMAND_TIMEOUT_MS` | Timeout for command execution (milliseconds). |
| `RETRY_MAX_ATTEMPTS` | Number of retry attempts for transient failures. |
| `RETRY_BASE_DELAY_MS` | Base delay between retries (milliseconds). |
| `ALLOWED_COMMANDS` | Comma-separated list of commands permitted by `run_command_safe`. |
| `PROTECTED_PATHS` | Comma-separated path patterns that cannot be modified. |
| `LOG_LEVEL` | Log verbosity: `trace`, `debug`, `info`, `warn`, `error`. |
| `REGISTRY_FILE` | Path to the project registry JSON file. |
| `AUDIT_LOG_FILE` | Path to the audit log for mutating operations. |
| `HTTP_REQUEST_LOG_FILE` | Path to the HTTP request log. |

### Security settings

| Variable | Description |
|----------|-------------|
| `ENABLE_AUTH` | Enable API-key authentication for the HTTP transport. |
| `AUTH_HEADER_NAME` | HTTP header used to pass the API key (default `x-api-key`). |
| `AUTH_API_KEYS` | Comma-separated list of keys in `key:role:id` format. |

### Observability settings

| Variable | Description |
|----------|-------------|
| `ENABLE_OTEL` | Enable OpenTelemetry tracing. |
| `OTEL_SERVICE_NAME` | Service name reported in traces. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP HTTP endpoint for trace export. |
| `OTEL_EXPORTER_OTLP_HEADERS` | Headers for the OTLP exporter in `key=value,key2=value2` format. |

## HTTP Security (Auth/RBAC)

Enable API-key authentication when exposing the HTTP transport to external agents.

```bash
ENABLE_AUTH=true
AUTH_HEADER_NAME=x-api-key
AUTH_API_KEYS=viewer-key:viewer:viewer1,editor-key:editor:editor1,admin-key:admin:admin1
```

Pass the key in the request header:

```http
x-api-key: editor-key
```

Roles:

| Role | Permissions |
|------|-------------|
| `viewer` | Read-only operations |
| `editor` | Read + non-destructive write, build, and test operations |
| `admin` | Full access including destructive operations |

## HTTP Monitoring Endpoints

When HTTP transport is enabled:

| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Liveness check |
| `GET /readyz` | Readiness check with indexed project count |
| `GET /metrics` | Basic metrics: `request_count`, `error_count`, latency summary |

## OpenTelemetry

Tracing can be exported over OTLP HTTP:

```bash
ENABLE_OTEL=true
OTEL_SERVICE_NAME=coding-mcp
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318/v1/traces
OTEL_EXPORTER_OTLP_HEADERS=authorization=Bearer%20token
```

Emitted spans:

- `mcp.http.request`
- `mcp.tool.{operation}`

## Response Contract

All tool responses follow the same envelope format.

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

## Architecture

The server uses one shared core with modular layers:

- `config`: environment/config-file loading and runtime validation
- `core`: response contracts, errors, logging, telemetry hooks, locks
- `services`: filesystem, git, patching, command execution, auth, project registry
- `mcp`: tool/resource/prompt registries bound to shared services
- `main`: CLI and transport bootstrap (`stdio`, `http`, `serve/init/add/remove`)

STDIO and HTTP transports share the same service layer, keeping behavior consistent while allowing transport-specific controls (such as HTTP authentication).

## Validation

```bash
npm run typecheck
npm test
```

## License

MIT