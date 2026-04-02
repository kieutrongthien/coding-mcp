import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AppServices } from "./bootstrap.js";
import { createMcpServer } from "../mcp/server.js";
import { runWithAuthContext } from "../services/auth/auth-context.js";
import { SecurityError } from "../core/errors.js";
import { HttpMetrics } from "../core/http-metrics.js";
import { isSseMessagePath } from "./http-routes.js";
import { handlePublicAuthEndpoints } from "./http-oauth.js";

export async function startHttpServer(services: AppServices): Promise<void> {
  if (!services.config.enableHttp) {
    services.logger.warn("HTTP transport disabled by configuration");
    return;
  }

  const streamableTransports = new Map<string, StreamableTransport>();
  const sseModule = services.config.httpMode === "sse" ? await import("@modelcontextprotocol/sdk/server/sse.js") : undefined;
  const sseTransports = new Map<string, SseMessageTransport>();
  const startedAt = Date.now();
  const metrics = new HttpMetrics();
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

    if (await handlePublicAuthEndpoints({ services, req, res, parsedUrl, sendJson, getRequestBaseUrl })) {
      return;
    }

    if (handleProbeEndpoints(services, req, res, parsedUrl, startedAt, metrics)) {
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
            await handleMcpTransportRequest({
              services,
              req,
              res,
              parsedUrl,
              streamableTransports,
              sseModule,
              sseTransports
            });
          })
      );
    } catch (error) {
      handleRequestError(services, req, res, error);
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

function handleProbeEndpoints(
  services: AppServices,
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  startedAt: number,
  metrics: HttpMetrics
): boolean {
  if (req.method === "GET" && parsedUrl.pathname === "/healthz") {
    sendJson(res, 200, {
      ok: true,
      status: "healthy",
      uptime_s: Math.floor(process.uptime())
    });
    return true;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/readyz") {
    sendJson(res, 200, {
      ok: true,
      status: "ready",
      projects_count: services.projectRegistry.listProjects().length,
      uptime_s: Math.floor((Date.now() - startedAt) / 1000)
    });
    return true;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/metrics") {
    sendJson(res, 200, {
      ok: true,
      ...metrics.snapshot()
    });
    return true;
  }

  return false;
}

async function handleMcpTransportRequest(input: {
  services: AppServices;
  req: IncomingMessage;
  res: ServerResponse;
  parsedUrl: URL;
  streamableTransports: Map<string, StreamableTransport>;
  sseModule: Awaited<typeof import("@modelcontextprotocol/sdk/server/sse.js")> | undefined;
  sseTransports: Map<string, SseMessageTransport>;
}): Promise<void> {
  const { services, req, res, parsedUrl, streamableTransports, sseModule, sseTransports } = input;

  if (services.config.httpMode === "streamable") {
    await handleStreamableRequest(services, req, res, streamableTransports);
    return;
  }

  if (!sseModule) {
    throw new Error("SSE transport module not initialized");
  }

  if (await handleSseRequest(services, req, res, parsedUrl, sseModule, sseTransports)) {
    return;
  }

  res.statusCode = 404;
  res.end("Not found");
}

async function handleStreamableRequest(
  services: AppServices,
  req: IncomingMessage,
  res: ServerResponse,
  streamableTransports: Map<string, StreamableTransport>
): Promise<void> {
  const sessionId = readSingleHeaderValue(req.headers["mcp-session-id"]);

  if (sessionId) {
    const existingTransport = streamableTransports.get(sessionId);
    if (!existingTransport) {
      res.statusCode = 404;
      res.end("Session not found");
      return;
    }

    await existingTransport.handleRequest(req, res);
    return;
  }

  const newTransport = await createConnectedStreamableTransport(services, streamableTransports);
  await newTransport.handleRequest(req, res);
}

async function handleSseRequest(
  services: AppServices,
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL,
  sseModule: Awaited<typeof import("@modelcontextprotocol/sdk/server/sse.js")>,
  sseTransports: Map<string, SseMessageTransport>
): Promise<boolean> {
  if (req.method === "GET" && parsedUrl.pathname === "/sse") {
    const transport = new sseModule.SSEServerTransport("/sse", res);
    sseTransports.set(transport.sessionId, transport);

    res.on("close", () => {
      sseTransports.delete(transport.sessionId);
    });

    const sseServer = createMcpServer(services);
    await sseServer.connect(transport);
    return true;
  }

  if (!isSseMessagePath(req.method, parsedUrl.pathname)) {
    return false;
  }

  const sessionId = parsedUrl.searchParams.get("sessionId");
  if (!sessionId) {
    res.statusCode = 400;
    res.end("Missing sessionId parameter");
    return true;
  }

  const transport = sseTransports.get(sessionId);
  if (!transport) {
    res.statusCode = 404;
    res.end("Session not found");
    return true;
  }

  await transport.handlePostMessage(req, res, undefined);
  return true;
}

function handleRequestError(services: AppServices, req: IncomingMessage, res: ServerResponse, error: unknown): void {
  if (services.authz.enabled && error instanceof SecurityError) {
    const message = error instanceof Error ? error.message : "Unauthorized";
    const resourceMetadataUrl = `${getRequestBaseUrl(req)}/.well-known/oauth-protected-resource`;
    sendJson(
      res,
      401,
      {
        ok: false,
        error_code: "UNAUTHORIZED",
        message
      },
      { "WWW-Authenticate": `Bearer resource_metadata="${resourceMetadataUrl}"` }
    );
    return;
  }

  services.logger.error({ error }, "Failed to handle MCP HTTP request");
  res.statusCode = 500;
  res.end("internal error");
}

function sendJson(
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  headers?: Record<string, string>
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  for (const [key, value] of Object.entries(headers ?? {})) {
    res.setHeader(key, value);
  }
  res.end(JSON.stringify(payload));
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

type StreamableTransport = {
  handleRequest: (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => Promise<void>;
};

type SseMessageTransport = {
  handlePostMessage: (req: IncomingMessage, res: ServerResponse, parsedBody?: unknown) => Promise<void>;
};

async function createConnectedStreamableTransport(
  services: AppServices,
  transportsBySessionId: Map<string, StreamableTransport>
): Promise<StreamableTransport> {
  const transport = await createStreamableTransportWithHooks({
    onSessionInitialized: (sessionId, initializedTransport) => {
      transportsBySessionId.set(sessionId, initializedTransport);
    },
    onSessionClosed: (sessionId) => {
      transportsBySessionId.delete(sessionId);
    }
  });
  const server = createMcpServer(services);
  await server.connect(transport as never);
  return transport;
}

async function createStreamableTransportWithHooks(options?: {
  onSessionInitialized?: (sessionId: string, transport: StreamableTransport) => void;
  onSessionClosed?: (sessionId: string) => void;
}): Promise<StreamableTransport> {
  const streamableModule = await import("@modelcontextprotocol/sdk/server/streamableHttp.js");
  const transport: StreamableTransport = new streamableModule.StreamableHTTPServerTransport({
    // Stateful mode is required when reusing a transport instance across requests.
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (sessionId: string) => {
      options?.onSessionInitialized?.(sessionId, transport);
    },
    onsessionclosed: (sessionId: string) => {
      options?.onSessionClosed?.(sessionId);
    }
  });

  return transport;
}

function readSingleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
}

/**
 * Derives the base URL from the incoming request's Host header.
 * Respects X-Forwarded-Proto for reverse-proxy deployments.
 */
function getRequestBaseUrl(req: import("node:http").IncomingMessage): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers["host"] ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const hostStr = Array.isArray(host) ? host[0] : host;
  const protoStr = Array.isArray(proto) ? proto[0] : proto;
  return `${protoStr}://${hostStr}`;
}