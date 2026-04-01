#!/usr/bin/env node

import { bootstrap } from "./bootstrap.js";
import { startHttpServer } from "./http-server.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "../mcp/server.js";
import { CliUsageError, getCliHelpText, parseCliArgs } from "./cli-args.js";

async function main() {
  if (process.argv.length <= 2) {
    printHelp();
    process.exit(0);
  }

  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    process.exit(0);
  }

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
      throw new CliUsageError("Missing folder argument for add command");
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
      throw new CliUsageError("Missing folder argument for remove command");
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

function printHelp(): void {
  // eslint-disable-next-line no-console
  console.log(getCliHelpText());
}

main().catch((error) => {
  if (error instanceof CliUsageError) {
    // eslint-disable-next-line no-console
    console.error(`Error: ${error.message}`);
    printHelp();
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
