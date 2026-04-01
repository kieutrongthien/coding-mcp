import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { AppServices } from "../main/bootstrap.js";
import { registerAllTools } from "./tools/index.js";
import { registerAllResources } from "./resources/index.js";
import { registerAllPrompts } from "./prompts/index.js";

export function createMcpServer(services: AppServices) {
  const server = new McpServer({
    name: "coding-mcp",
    version: "0.1.0"
  });

  registerAllTools(server, services);
  registerAllResources(server, services);
  registerAllPrompts(server, services);

  return server;
}
