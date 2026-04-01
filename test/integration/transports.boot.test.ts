import { describe, expect, it } from "vitest";
import { bootstrap } from "../../src/main/bootstrap.js";
import { createMcpServer } from "../../src/mcp/server.js";

describe("transport boot", () => {
  it("creates shared MCP server with registered capabilities", () => {
    process.env.PROJECTS_ROOT = process.cwd();
    process.env.ENABLE_HTTP = "false";
    process.env.ENABLE_STDIO = "false";

    const services = bootstrap();
    const server = createMcpServer(services);

    expect(server).toBeTruthy();
  });
});
