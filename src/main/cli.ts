#!/usr/bin/env node

import { bootstrap } from "./bootstrap.js";
import { startHttpServer } from "./http-server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../mcp/server.js";

interface CliArgs {
  command: "serve" | "init" | "add" | "remove";
  transport: "http" | "stdio";
  host?: string;
  port?: number;
  mode?: "streamable" | "sse";
  projectsRoots?: string[];
  configPath?: string;
  folder?: string;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  const services = bootstrap(args.configPath ?? process.env.MCP_CONFIG_PATH, {
    projectsRoots: args.projectsRoots,
    httpHost: args.host,
    httpPort: args.port,
    httpMode: args.mode
  });

  if (args.command === "init") {
    const target = args.folder ?? process.cwd();
    const result = services.projectRegistry.initFromRoot(target);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          operation: "init",
          data: {
            root: target,
            roots: result.roots,
            refreshed: result.refreshed,
            total_projects: result.projects.length
          }
        },
        null,
        2
      )
    );
    return;
  }

  if (args.command === "add") {
    if (!args.folder) {
      throw new Error("Missing folder argument for add command");
    }

    const result = services.projectRegistry.addRoot(args.folder);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          operation: "add",
          data: {
            added: args.folder,
            roots: result.roots,
            refreshed: result.refreshed,
            total_projects: result.projects.length
          }
        },
        null,
        2
      )
    );
    return;
  }

  if (args.command === "remove") {
    if (!args.folder) {
      throw new Error("Missing folder argument for remove command");
    }

    const result = services.projectRegistry.removeRoot(args.folder);
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          operation: "remove",
          data: {
            removed: args.folder,
            roots: result.roots,
            refreshed: result.refreshed,
            total_projects: result.projects.length
          }
        },
        null,
        2
      )
    );
    return;
  }

  if (args.transport === "stdio") {
    if (!services.config.enableStdio) {
      services.logger.warn("STDIO transport disabled by configuration");
      return;
    }

    const server = createMcpServer(services);
    const transport = new StdioServerTransport();
    await server.connect(transport);
    services.logger.info("Coding MCP server running on STDIO");
    return;
  }

  await startHttpServer(services);
}

function parseCliArgs(argv: string[]): CliArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

  let command: CliArgs["command"] = "serve";
  if (argv[0] === "serve" || argv[0] === "init" || argv[0] === "add" || argv[0] === "remove") {
    command = argv[0];
  }

  const parsed: CliArgs = { command, transport: "http" };
  const startIndex = command === "serve" || command === "init" || command === "add" || command === "remove" ? 1 : 0;

  if (
    (command === "init" || command === "add" || command === "remove") &&
    argv[startIndex] &&
    !argv[startIndex].startsWith("-")
  ) {
    parsed.folder = argv[startIndex];
  }

  for (let i = startIndex; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === "--transport" && argv[i + 1]) {
      const value = argv[i + 1];
      if (value === "http" || value === "stdio") {
        parsed.transport = value;
      }
      i += 1;
      continue;
    }

    if (current === "--host" && argv[i + 1]) {
      parsed.host = argv[i + 1];
      i += 1;
      continue;
    }

    if (current === "--port" && argv[i + 1]) {
      const port = Number(argv[i + 1]);
      if (Number.isFinite(port) && port > 0) {
        parsed.port = port;
      }
      i += 1;
      continue;
    }

    if (current === "--mode" && argv[i + 1]) {
      const mode = argv[i + 1];
      if (mode === "streamable" || mode === "sse") {
        parsed.mode = mode;
      }
      i += 1;
      continue;
    }

    if (current === "--projects-root" && argv[i + 1]) {
      parsed.projectsRoots = parsed.projectsRoots ?? [];
      parsed.projectsRoots.push(argv[i + 1]);
      i += 1;
      continue;
    }

    if (current === "--config" && argv[i + 1]) {
      parsed.configPath = argv[i + 1];
      i += 1;
      continue;
    }
  }

  return parsed;
}

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(`coding-mcp CLI

Usage:
  coding-mcp serve [options]
  coding-mcp init [folder]
  coding-mcp add <folder>
  coding-mcp remove <folder>

Options:
  --transport <http|stdio>      Transport mode (default: http)
  --host <host>                 HTTP host override
  --port <port>                 HTTP port override
  --mode <streamable|sse>       HTTP MCP mode override
  --projects-root <path>        Add project root (repeatable)
  --config <path>               Path to JSON/YAML config file
  -h, --help                    Show this help
`);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
