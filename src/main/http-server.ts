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

export async function startHttpServer(services: AppServices): Promise<void> {
  if (!services.config.enableHttp) {
    services.logger.warn("HTTP transport disabled by configuration");
    return;
  }

  const streamableTransports = new Map<string, StreamableTransport>();
  const sseModule = services.config.httpMode === "sse" ? await import("@modelcontextprotocol/sdk/server/sse.js") : undefined;
  const sseTransports = new Map<string, unknown>();
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

    if (await handlePublicAuthEndpoints(services, req, res, parsedUrl)) {
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

async function handlePublicAuthEndpoints(
  services: AppServices,
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  if (!services.authz.enabled) {
    return false;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/.well-known/oauth-protected-resource") {
    const baseUrl = getRequestBaseUrl(req);
    sendJson(
      res,
      200,
      {
        resource: baseUrl,
        authorization_servers: [baseUrl],
        resource_name: "Coding MCP Server"
      },
      { "access-control-allow-origin": "*" }
    );
    return true;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/.well-known/oauth-authorization-server") {
    const baseUrl = getRequestBaseUrl(req);
    sendJson(
      res,
      200,
      {
        issuer: baseUrl,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        grant_types_supported: ["client_credentials"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic"],
        response_types_supported: [],
        scopes_supported: ["read", "write", "admin"],
        code_challenge_methods_supported: ["S256"]
      },
      { "access-control-allow-origin": "*" }
    );
    return true;
  }

  if (req.method === "POST" && parsedUrl.pathname === "/oauth/token") {
    const params = new URLSearchParams(await readRequestBody(req, 4096));
    if (params.get("grant_type") !== "client_credentials") {
      sendJson(res, 400, { error: "unsupported_grant_type" });
      return true;
    }

    const clientSecret = resolveOAuthClientSecret(params, req.headers["authorization"]);
    if (!clientSecret) {
      sendJson(res, 401, { error: "invalid_client" });
      return true;
    }

    const binding = services.authz.lookupApiKey(clientSecret);
    if (!binding) {
      sendJson(res, 401, { error: "invalid_client" });
      return true;
    }

    sendJson(
      res,
      200,
      {
        access_token: clientSecret,
        token_type: "bearer",
        expires_in: 3600 * 24 * 365
      },
      { "cache-control": "no-store" }
    );
    return true;
  }

  if (req.method === "POST" && parsedUrl.pathname === "/oauth/register") {
    const registrationKey = extractBearerToken(req.headers["authorization"]);
    const binding = registrationKey ? services.authz.lookupApiKey(registrationKey) : null;
    if (!binding || !registrationKey) {
      sendJson(res, 401, { error: "unauthorized" });
      return true;
    }

    sendJson(res, 201, {
      client_id: binding.id,
      client_secret: registrationKey,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      grant_types: ["client_credentials"],
      token_endpoint_auth_method: "client_secret_post"
    });
    return true;
  }

  return false;
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
  sseTransports: Map<string, unknown>;
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
  sseTransports: Map<string, unknown>
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

  await (transport as { handlePostMessage: (req: unknown, res: unknown, parsedBody?: unknown) => Promise<void> }).handlePostMessage(
    req,
    res,
    undefined
  );
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

async function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk as string;
    if (body.length > maxBytes) {
      break;
    }
  }
  return body;
}

function resolveOAuthClientSecret(params: URLSearchParams, authorizationHeader: string | string[] | undefined): string | null {
  const secretFromBody = params.get("client_secret");
  if (secretFromBody) {
    return secretFromBody;
  }

  const authHeaderValue = readSingleHeaderValue(authorizationHeader);
  if (!authHeaderValue || !authHeaderValue.toLowerCase().startsWith("basic ")) {
    return null;
  }

  const decoded = Buffer.from(authHeaderValue.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return null;
  }

  return decoded.slice(separatorIndex + 1);
}

function extractBearerToken(authorizationHeader: string | string[] | undefined): string | null {
  const authHeaderValue = readSingleHeaderValue(authorizationHeader);
  if (!authHeaderValue || !authHeaderValue.toLowerCase().startsWith("bearer ")) {
    return null;
  }
  return authHeaderValue.slice(7).trim();
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