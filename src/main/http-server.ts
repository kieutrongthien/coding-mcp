import { createServer } from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AppServices } from "./bootstrap.js";
import { createMcpServer } from "../mcp/server.js";
import { SecurityError } from "../core/errors.js";
import { HttpMetrics } from "../core/http-metrics.js";
import { createPublicRouteHandler, getRequestBaseUrl } from "./http-public-routes.js";
import { createAuthenticatedTransportHandler } from "./http-transport-handler.js";

export async function startHttpServer(services: AppServices): Promise<void> {
  if (!services.config.enableHttp) {
    services.logger.warn("HTTP transport disabled by configuration");
    return;
  }

  const server = createMcpServer(services);
  const streamableTransport =
    services.config.httpMode === "streamable" ? await createStreamableTransport(services) : undefined;
  const sseModule = services.config.httpMode === "sse" ? await import("@modelcontextprotocol/sdk/server/sse.js") : undefined;
  const startedAt = Date.now();
  const metrics = new HttpMetrics();
  const handlePublicRoute = createPublicRouteHandler({
    services,
    metrics,
    startedAt
  });
  const handleAuthenticatedTransport = createAuthenticatedTransportHandler({
    services,
    streamableTransport,
    sseModule
  });

  if (streamableTransport) {
    await server.connect(streamableTransport);
  }
  ensureParentDir(services.config.httpRequestLogFile);

  const httpServer = createServer(async (req, res) => {
    const requestId = crypto.randomUUID();
    const requestStartedAt = Date.now();
    const requestPath = req.url ?? "";
    const requestMethod = req.method ?? "";
    const parsedUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    services.logger.info({ request_id: requestId, method: requestMethod, path: requestPath }, "HTTP request received");

    res.once("finish", () => {
      const durationMs = Date.now() - requestStartedAt;
      metrics.recordRequest({ statusCode: res.statusCode, durationMs });
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

    if (await handlePublicRoute(req, res, parsedUrl)) {
      return;
    }

    try {
      await handleAuthenticatedTransport(req, res, parsedUrl);
    } catch (error) {
      if (services.authz.enabled && error instanceof SecurityError) {
        const message = error instanceof Error ? error.message : "Unauthorized";
        const resourceMetadataUrl = `${getRequestBaseUrl(req)}/.well-known/oauth-protected-resource`;
        res.statusCode = 401;
        res.setHeader("content-type", "application/json");
        res.setHeader("WWW-Authenticate", `Bearer resource_metadata="${resourceMetadataUrl}"`);
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

async function createStreamableTransport(services: AppServices) {
  const streamableModule = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const transport = new streamableModule.StreamableHTTPServerTransport({
    // Use stateless mode for broader client compatibility (e.g. Dify).
    // In this mode, Mcp-Session-Id is not required on follow-up requests.
    sessionIdGenerator: undefined
  });
  transport.onerror = (error: Error) => {
    services.logger.warn({ error }, "Streamable transport rejected request");
  };
  return transport;
}
