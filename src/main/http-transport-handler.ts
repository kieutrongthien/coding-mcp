import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppServices } from "./bootstrap.js";
import { createMcpServer } from "../mcp/server.js";
import { runWithAuthContext } from "../services/auth/auth-context.js";
import { isSseMessagePath } from "./http-routes.js";

export interface AuthenticatedTransportDeps {
  services: AppServices;
  streamableTransport?: {
    handleRequest: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  };
  sseModule?: {
    SSEServerTransport: new (path: string, response: ServerResponse, options?: any) => unknown;
  };
}

export function createAuthenticatedTransportHandler(deps: AuthenticatedTransportDeps) {
  const { services, streamableTransport, sseModule } = deps;
  const sseTransports = new Map<string, unknown>();
  const streamableAliases = new Set(["/", "/mcp", "/sse"]);

  return async function handleAuthenticatedTransport(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: URL
  ): Promise<void> {
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

            // Compatibility: some clients send streamable traffic to /mcp or /sse.
            // Normalize to root so StreamableHTTP transport can process it uniformly.
            const originalUrl = req.url;
            const isAliasPath = streamableAliases.has(parsedUrl.pathname);
            if (isAliasPath && parsedUrl.pathname !== "/") {
              req.url = `/${parsedUrl.search}`;
            }

            try {
              await streamableTransport.handleRequest(req, res);
            } catch (error) {
              services.logger.warn({ error }, "Streamable transport threw while handling request");
              if (!res.headersSent) {
                res.statusCode = 400;
                res.setHeader("content-type", "application/json");
                res.end(
                  JSON.stringify({
                    jsonrpc: "2.0",
                    error: {
                      code: -32000,
                      message: "Bad Request: Streamable request rejected"
                    },
                    id: null
                  })
                );
              }
              return;
            } finally {
              req.url = originalUrl;
            }
            return;
          }

          if (!sseModule) {
            throw new Error("SSE transport module not initialized");
          }

          if (req.method === "GET" && parsedUrl.pathname === "/sse") {
            const transport = new sseModule.SSEServerTransport("/sse", res) as {
              sessionId: string;
            };
            sseTransports.set(transport.sessionId, transport as unknown);
            res.on("close", () => {
              sseTransports.delete(transport.sessionId);
            });

            const sseServer = createMcpServer(services);
            await sseServer.connect(transport as unknown as Parameters<typeof sseServer.connect>[0]);
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

            await (transport as { handlePostMessage: (request: unknown, response: unknown, parsedBody?: unknown) => Promise<void> }).handlePostMessage(
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
  };
}
