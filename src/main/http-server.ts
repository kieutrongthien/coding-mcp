import { createServer } from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
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
  ensureParentDir(services.config.httpRequestLogFile);

  const httpServer = createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const requestStartedAt = Date.now();
    const requestPath = req.url ?? "";
    const requestMethod = req.method ?? "";

    services.logger.info({ request_id: requestId, method: requestMethod, path: requestPath }, "HTTP request received");

    res.once("finish", () => {
      const durationMs = Date.now() - requestStartedAt;
      services.logger.info(
        {
          request_id: requestId,
          method: requestMethod,
          path: requestPath,
          status_code: res.statusCode,
          duration_ms: durationMs
        },
        "HTTP request responded"
      );

      appendHttpRequestLog(services, {
        timestamp: new Date().toISOString(),
        request_id: requestId,
        method: requestMethod,
        path: requestPath,
        status_code: res.statusCode,
        duration_ms: durationMs,
        http_version: req.httpVersion,
        remote_address: req.socket.remoteAddress,
        remote_port: req.socket.remotePort,
        user_agent: req.headers["user-agent"],
        request_headers: req.headers,
        response_headers: res.getHeaders()
      });
    });

    try {
      const auth = services.authz.authenticateHttpRequest(req.headers);
      await services.telemetry.runInSpan(
        "mcp.http.request",
        {
          "http.method": req.method ?? "",
          "http.path": req.url ?? "",
          "mcp.auth.role": auth.role,
          "mcp.auth.key_id": auth.apiKeyId
        },
        async () =>
          await runWithAuthContext(auth, async () => {
            await transport.handleRequest(req, res);
          })
      );
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

function appendHttpRequestLog(
  services: AppServices,
  payload: Record<string, unknown>
): void {
  fs.appendFile(services.config.httpRequestLogFile, `${JSON.stringify(payload)}\n`, "utf8", (error) => {
    if (error) {
      services.logger.warn({ error }, "Failed to append HTTP request log");
    }
  });
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

async function createTransportByMode(mode: "streamable" | "sse"): Promise<any> {
  if (mode === "streamable") {
    const streamableModule = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
    return new streamableModule.StreamableHTTPServerTransport({
      // Stateful mode is required when reusing a transport instance across requests.
      sessionIdGenerator: () => crypto.randomUUID()
    });
  }

  const sseModule = await import("@modelcontextprotocol/sdk/server/sse.js");
  return new sseModule.SSEServerTransport("/sse", undefined as any);
}
