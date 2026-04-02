import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppServices } from "./bootstrap.js";
import type { HttpMetrics } from "../core/http-metrics.js";

export interface PublicRouteDeps {
  services: AppServices;
  metrics: HttpMetrics;
  startedAt: number;
}

interface AuthCodeEntry {
  apiKey: string;
  codeChallenge: string;
  issuedAt: number;
}

const AUTH_CODE_TTL_MS = 5 * 60 * 1000;
const OAUTH_PREFLIGHT_PATHS = new Set([
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-authorization-server",
  "/oauth/token",
  "/oauth/register",
  "/authorize"
]);

export function createPublicRouteHandler(deps: PublicRouteDeps) {
  const { services, metrics, startedAt } = deps;
  const authCodes = new Map<string, AuthCodeEntry>();

  return async function handlePublicRoute(
    req: IncomingMessage,
    res: ServerResponse,
    parsedUrl: URL
  ): Promise<boolean> {
    if (await handleOAuthRoutes(services, authCodes, req, res, parsedUrl)) {
      return true;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/healthz") {
      writeJson(res, 200, {
        ok: true,
        status: "healthy",
        uptime_s: Math.floor(process.uptime())
      });
      return true;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/readyz") {
      writeJson(res, 200, {
        ok: true,
        status: "ready",
        projects_count: services.projectRegistry.listProjects().length,
        uptime_s: Math.floor((Date.now() - startedAt) / 1000)
      });
      return true;
    }

    if (req.method === "GET" && parsedUrl.pathname === "/metrics") {
      writeJson(res, 200, {
        ok: true,
        ...metrics.snapshot()
      });
      return true;
    }

    return false;
  };
}

async function handleOAuthRoutes(
  services: AppServices,
  authCodes: Map<string, AuthCodeEntry>,
  req: IncomingMessage,
  res: ServerResponse,
  parsedUrl: URL
): Promise<boolean> {
  if (!services.authz.enabled) {
    return false;
  }

  if (req.method === "OPTIONS" && OAUTH_PREFLIGHT_PATHS.has(parsedUrl.pathname)) {
    res.statusCode = 204;
    res.setHeader("access-control-allow-origin", "*");
    res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type, authorization, mcp-protocol-version");
    res.setHeader("access-control-max-age", "86400");
    res.end();
    return true;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/.well-known/oauth-protected-resource") {
    const baseUrl = getRequestBaseUrl(req);
    writeJson(res, 200, {
      resource: baseUrl,
      authorization_servers: [baseUrl],
      resource_name: "Coding MCP Server"
    }, true);
    return true;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/.well-known/oauth-authorization-server") {
    const baseUrl = getRequestBaseUrl(req);
    writeJson(
      res,
      200,
      {
        issuer: baseUrl,
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/oauth/token`,
        registration_endpoint: `${baseUrl}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "client_secret_basic", "none"],
        code_challenge_methods_supported: ["S256"],
        scopes_supported: ["read", "write", "admin"]
      },
      true
    );
    return true;
  }

  if (req.method === "GET" && parsedUrl.pathname === "/authorize") {
    handleAuthorize(services, authCodes, res, parsedUrl);
    return true;
  }

  if (req.method === "POST" && parsedUrl.pathname === "/oauth/token") {
    await handleToken(services, authCodes, req, res);
    return true;
  }

  if (req.method === "POST" && parsedUrl.pathname === "/oauth/register") {
    await handleRegister(services, req, res);
    return true;
  }

  return false;
}

function handleAuthorize(
  services: AppServices,
  authCodes: Map<string, AuthCodeEntry>,
  res: ServerResponse,
  parsedUrl: URL
): void {
  const redirectUri = parsedUrl.searchParams.get("redirect_uri");
  const state = parsedUrl.searchParams.get("state");
  const clientSecret = parsedUrl.searchParams.get("client_secret");
  const codeChallenge = parsedUrl.searchParams.get("code_challenge");

  if (!redirectUri) {
    writeJson(res, 400, {
      error: "invalid_request",
      error_description: "redirect_uri is required"
    });
    return;
  }

  const binding = clientSecret ? services.authz.lookupApiKey(clientSecret) : null;
  if (!binding || !clientSecret) {
    const target = new URL(redirectUri);
    target.searchParams.set("error", "access_denied");
    target.searchParams.set("error_description", "Provide your API key via ?client_secret= query parameter");
    if (state) {
      target.searchParams.set("state", state);
    }
    res.statusCode = 302;
    res.setHeader("location", target.toString());
    res.end();
    return;
  }

  const code = Buffer.from(`${clientSecret}:${codeChallenge ?? ""}`, "utf8").toString("base64url");
  authCodes.set(code, { apiKey: clientSecret, codeChallenge: codeChallenge ?? "", issuedAt: Date.now() });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) {
    target.searchParams.set("state", state);
  }
  res.statusCode = 302;
  res.setHeader("location", target.toString());
  res.end();
}

async function handleToken(
  services: AppServices,
  authCodes: Map<string, AuthCodeEntry>,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const params = new URLSearchParams(await readBody(req, 4096));
  const grantType = params.get("grant_type");
  let clientSecret = params.get("client_secret");

  const authHdr = req.headers["authorization"];
  const authHdrValue = Array.isArray(authHdr) ? authHdr[0] : authHdr;
  if (!clientSecret && authHdrValue && authHdrValue.toLowerCase().startsWith("basic ")) {
    const decoded = Buffer.from(authHdrValue.slice(6), "base64").toString("utf8");
    const colonIdx = decoded.indexOf(":");
    if (colonIdx !== -1) {
      clientSecret = decoded.slice(colonIdx + 1);
    }
  }

  if (grantType === "client_credentials") {
    if (!clientSecret || !services.authz.lookupApiKey(clientSecret)) {
      writeJson(res, 401, { error: "invalid_client" });
      return;
    }
    writeJsonWithNoStore(res, {
      access_token: clientSecret,
      token_type: "bearer",
      expires_in: 3600 * 24 * 365
    });
    return;
  }

  if (grantType === "authorization_code") {
    const code = params.get("code");
    const codeVerifier = params.get("code_verifier");
    if (!code) {
      writeJson(res, 400, { error: "invalid_request", error_description: "code is required" });
      return;
    }

    const entry = authCodes.get(code);
    if (!entry || Date.now() - entry.issuedAt > AUTH_CODE_TTL_MS) {
      authCodes.delete(code);
      writeJson(res, 400, { error: "invalid_grant" });
      return;
    }
    authCodes.delete(code);

    if (entry.codeChallenge && codeVerifier) {
      const expectedChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
      if (expectedChallenge !== entry.codeChallenge) {
        writeJson(res, 400, { error: "invalid_grant", error_description: "PKCE verification failed" });
        return;
      }
    }

    if (!services.authz.lookupApiKey(entry.apiKey)) {
      writeJson(res, 400, { error: "invalid_grant" });
      return;
    }

    writeJsonWithNoStore(res, {
      access_token: entry.apiKey,
      token_type: "bearer",
      expires_in: 3600 * 24 * 365
    });
    return;
  }

  writeJson(res, 400, { error: "unsupported_grant_type" });
}

async function handleRegister(
  services: AppServices,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const rawBody = await readBody(req, 8192);
  let registrationKey: string | null = null;

  const regAuth = req.headers["authorization"];
  const regAuthValue = Array.isArray(regAuth) ? regAuth[0] : regAuth;
  if (regAuthValue && regAuthValue.toLowerCase().startsWith("bearer ")) {
    registrationKey = regAuthValue.slice(7).trim();
  }

  if (!registrationKey) {
    const customHeaderName = services.config.authHeaderName.toLowerCase();
    const headerValue = req.headers[customHeaderName];
    const customHeaderValue = Array.isArray(headerValue) ? headerValue[0] : headerValue;
    if (customHeaderValue) {
      registrationKey = customHeaderValue;
    }
  }

  if (!registrationKey) {
    try {
      const parsed = JSON.parse(rawBody) as Record<string, unknown>;
      if (typeof parsed.client_secret === "string") {
        registrationKey = parsed.client_secret;
      }
    } catch {
      // ignore non-json bodies
    }
  }

  const binding = registrationKey ? services.authz.lookupApiKey(registrationKey) : null;
  if (!binding || !registrationKey) {
    writeJson(res, 401, {
      error: "unauthorized",
      error_description: "Provide your API key as Authorization: Bearer or as client_secret in the request body"
    });
    return;
  }

  writeJson(res, 201, {
    client_id: binding.id,
    client_secret: registrationKey,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    grant_types: ["authorization_code", "client_credentials"],
    response_types: ["code"],
    token_endpoint_auth_method: "client_secret_post"
  });
}

async function readBody(req: IncomingMessage, maxBytes: number): Promise<string> {
  let body = "";
  for await (const chunk of req) {
    body += chunk as string;
    if (body.length > maxBytes) {
      break;
    }
  }
  return body;
}

function writeJson(res: ServerResponse, statusCode: number, payload: unknown, cors = false): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json");
  if (cors) {
    res.setHeader("access-control-allow-origin", "*");
  }
  res.end(JSON.stringify(payload));
}

function writeJsonWithNoStore(res: ServerResponse, payload: unknown): void {
  res.statusCode = 200;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

export function getRequestBaseUrl(req: IncomingMessage): string {
  const host = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const proto = req.headers["x-forwarded-proto"] ?? "http";
  const hostStr = Array.isArray(host) ? host[0] : host;
  const protoStr = Array.isArray(proto) ? proto[0] : proto;
  return `${protoStr}://${hostStr}`;
}
