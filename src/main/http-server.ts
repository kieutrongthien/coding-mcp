import { createServer } from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AppServices } from "./bootstrap.js";
import { createMcpServer } from "../mcp/server.js";
import { runWithAuthContext } from "../services/auth/auth-context.js";
import { SecurityError } from "../core/errors.js";
import { HttpMetrics } from "../core/http-metrics.js";
import { isSseMessagePath } from "./http-routes.js";

export async function startHttpServer(services: AppServices): Promise<void> {
  if (!services.config.enableHttp) {
    services.logger.warn("HTTP transport disabled by configuration");
    return;
  }

  const server = createMcpServer(services);
  const streamableTransport =
    services.config.httpMode === "streamable" ? await createStreamableTransport() : undefined;
  const sseModule = services.config.httpMode === "sse" ? await import("@modelcontextprotocol/sdk/server/sse.js") : undefined;
  const sseTransports = new Map<string, unknown>();
  const startedAt = Date.now();
  const metrics = new HttpMetrics();

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

    if (req.method === "GET" && parsedUrl.pathname === "/healthz") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          status: "healthy",
          uptime_s: Math.floor(process.uptime())
        })
      );
      return;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/readyz") {
      const projectsCount = services.projectRegistry.listProjects().length;
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          status: "ready",
          projects_count: projectsCount,
          uptime_s: Math.floor((Date.now() - startedAt) / 1000)
        })
      );
      return;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/metrics") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify({
          ok: true,
          ...metrics.snapshot()
        })
      );
      return;
    }

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
            if (services.config.httpMode === "streamable") {
              if (!streamableTransport) {
                throw new Error("Streamable transport not initialized");
              }

              await streamableTransport.handleRequest(req, res);
              return;
            }

            if (!sseModule) {
              throw new Error("SSE transport module not initialized");
            }

            if (req.method === "GET" && parsedUrl.pathname === "/sse") {
              const transport = new sseModule.SSEServerTransport("/sse", res);
              sseTransports.set(transport.sessionId, transport);

              res.on("close", () => {
                sseTransports.delete(transport.sessionId);
              });

              const sseServer = createMcpServer(services);
              await sseServer.connect(transport);
              return;
            }

            if (isSseMessagePath(req.method, parsedUrl.pathname)) {
              const sessionId = parsedUrl.searchParams.get("sessionId");
              if (!sessionId) {
                res.statusCode = 400;
                res.end("Missing sessionId parameter");
                return;
              }

              const transport = sseTransports.get(sessionId);
              if (!transport) {
                res.statusCode = 404;
                res.end("Session not found");
                return;
              }

              await (transport as { handlePostMessage: (req: unknown, res: unknown, parsedBody?: unknown) => Promise<void> }).handlePostMessage(
                req,
                res,
                undefined
              );
              return;
            }

            res.statusCode = 404;
            res.end("Not found");
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

async function createStreamableTransport() {
  const streamableModule = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  return new streamableModule.StreamableHTTPServerTransport({
    // Stateful mode is required when reusing a transport instance across requests.
    sessionIdGenerator: () => crypto.randomUUID()
  });
}
