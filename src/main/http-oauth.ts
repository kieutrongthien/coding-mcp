import type { IncomingMessage, ServerResponse } from "node:http";
import type { AppServices } from "./bootstrap.js";

type SendJson = (
  res: ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
  headers?: Record<string, string>
) => void;

type GetRequestBaseUrl = (req: IncomingMessage) => string;

export async function handlePublicAuthEndpoints(input: {
  services: AppServices;
  req: IncomingMessage;
  res: ServerResponse;
  parsedUrl: URL;
  sendJson: SendJson;
  getRequestBaseUrl: GetRequestBaseUrl;
}): Promise<boolean> {
  const { services, req, res, parsedUrl, sendJson, getRequestBaseUrl } = input;

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

function readSingleHeaderValue(value: string | string[] | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  return Array.isArray(value) ? value[0] : value;
}
