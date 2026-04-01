import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { bootstrap } from "./bootstrap.js";
import { createMcpServer } from "../mcp/server.js";

async function main() {
  const services = bootstrap(process.env.MCP_CONFIG_PATH);
  if (!services.config.enableStdio) {
    services.logger.warn("STDIO transport disabled by configuration");
    return;
  }

  const server = createMcpServer(services);
  const transport = new StdioServerTransport();

  await server.connect(transport);
  services.logger.info("Coding MCP server running on STDIO");
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exit(1);
});
