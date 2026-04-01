import { createServer } from "node:http";
import type { AppServices } from "./bootstrap.js";
import { createMcpServer } from "../mcp/server.js";
import { runWithAuthContext } from "../services/auth/auth-context.js";
import { SecurityError } from "../core/errors.js";

export async function startHttpServer(services: AppServices): Promise<void> {
  if (!services.config.enableHttp) {
    services.logger.warn("HTTP transport disabled by configuration");
    return;
  }

  const server = createMcpServer(services);
  const transport = await createTransportByMode(services.config.httpMode);

  await server.connect(transport);

  const httpServer = createServer(async (req, res) => {
    try {
      const auth = services.authz.authenticateHttpRequest(req.headers);
      await runWithAuthContext(auth, async () => {
        await transport.handleRequest(req, res);
      });
    } catch (error) {
      if (services.authz.enabled && error instanceof SecurityError) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            ok: false,
            error_code: "UNAUTHORIZED",
            message
          })
        );
        return;
      }

      services.logger.error({ error }, "Failed to handle MCP HTTP request");
      res.statusCode = 500;
      res.end("internal error");
    }
  });

  await new Promise<void>((resolve) => {
    httpServer.listen(services.config.httpPort, services.config.httpHost, () => {
      services.logger.info(
        {
          host: services.config.httpHost,
          port: services.config.httpPort,
          mode: services.config.httpMode
        },
        "Coding MCP server listening on HTTP"
      );
      resolve();
    });
  });
}

async function createTransportByMode(mode: "streamable" | "sse"): Promise<any> {
  if (mode === "streamable") {
    const streamableModule = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    return new streamableModule.StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
  }

  const sseModule = await import("@modelcontextprotocol/sdk/server/sse.js");
  return new sseModule.SSEServerTransport("/sse", undefined as any);
}
