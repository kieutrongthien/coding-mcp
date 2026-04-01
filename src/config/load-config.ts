import fs from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { ValidationError } from "../core/errors.js";
import { appConfigSchema, type AppConfig } from "./schema.js";

export interface ConfigOverrides {
  projectsRoots?: string[];
  httpHost?: string;
  httpPort?: number;
  httpMode?: "streamable" | "sse";
}

export function loadConfig(configPath?: string, overrides?: ConfigOverrides): AppConfig {
  const fileConfig = configPath ? loadFileConfig(configPath) : {};

  const projectsRootsFromEnv = parseList(process.env.PROJECTS_ROOTS);
  const legacyProjectRoot = process.env.PROJECTS_ROOT;

  const envConfig = {
    projectsRoots: projectsRootsFromEnv ?? (legacyProjectRoot ? [legacyProjectRoot] : undefined),
    enableHttp: parseBoolean(process.env.ENABLE_HTTP),
    enableStdio: parseBoolean(process.env.ENABLE_STDIO),
    enableOtel: parseBoolean(process.env.ENABLE_OTEL),
    otelServiceName: process.env.OTEL_SERVICE_NAME,
    otelExporterOtlpEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelExporterOtlpHeaders: parseOtelHeaders(process.env.OTEL_EXPORTER_OTLP_HEADERS),
    enableAuth: parseBoolean(process.env.ENABLE_AUTH),
    authHeaderName: process.env.AUTH_HEADER_NAME,
    authApiKeys: parseAuthApiKeys(process.env.AUTH_API_KEYS),
    httpHost: process.env.HTTP_HOST,
    httpPort: parseNumber(process.env.HTTP_PORT),
    httpMode: parseHttpMode(process.env.HTTP_MODE),
    maxFileSize: parseNumber(process.env.MAX_FILE_SIZE),
    maxOutputSize: parseNumber(process.env.MAX_OUTPUT_SIZE),
    commandTimeoutMs: parseNumber(process.env.COMMAND_TIMEOUT_MS),
    retryMaxAttempts: parseNumber(process.env.RETRY_MAX_ATTEMPTS),
    retryBaseDelayMs: parseNumber(process.env.RETRY_BASE_DELAY_MS),
    allowedCommands: parseList(process.env.ALLOWED_COMMANDS),
    protectedPaths: parseList(process.env.PROTECTED_PATHS),
    logLevel: process.env.LOG_LEVEL,
    registryFile: process.env.REGISTRY_FILE,
    auditLogFile: process.env.AUDIT_LOG_FILE,
    httpRequestLogFile: process.env.HTTP_REQUEST_LOG_FILE,
    debugMode: parseBoolean(process.env.DEBUG_MODE)
  };

  const merged = {
    ...fileConfig,
    ...removeUndefined(envConfig),
    ...removeUndefined(overrides ?? {})
  };

  // Make CLI usable out of the box by defaulting to the current working directory.
  if (!("projectsRoots" in merged) || !Array.isArray(merged.projectsRoots) || merged.projectsRoots.length === 0) {
    Object.assign(merged, { projectsRoots: [process.cwd()] });
  }

  const parsed = appConfigSchema.safeParse(merged);
  if (!parsed.success) {
    throw new ValidationError("Invalid configuration", {
      issues: parsed.error.flatten()
    });
  }

  const normalized = parsed.data;
  return {
    ...normalized,
    projectsRoots: normalized.projectsRoots.map((entry) => normalizeUserPath(entry)),
    registryFile: normalizeUserPath(normalized.registryFile),
    auditLogFile: normalizeUserPath(normalized.auditLogFile),
    httpRequestLogFile: normalizeUserPath(normalized.httpRequestLogFile)
  };
}

function loadFileConfig(configPath: string): Record<string, unknown> {
  const absolute = path.resolve(configPath);
  if (!fs.existsSync(absolute)) {
    throw new ValidationError("Config file does not exist", { configPath: absolute });
  }

  const content = fs.readFileSync(absolute, "utf8");
  if (absolute.endsWith(".yaml") || absolute.endsWith(".yml")) {
    return (YAML.parse(content) as Record<string, unknown>) ?? {};
  }

  if (absolute.endsWith(".json")) {
    return (JSON.parse(content) as Record<string, unknown>) ?? {};
  }

  throw new ValidationError("Unsupported config format", { configPath: absolute });
}

function parseBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseList(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseHttpMode(value: string | undefined): "streamable" | "sse" | undefined {
  if (!value) {
    return undefined;
  }

  return value === "sse" ? "sse" : "streamable";
}

function removeUndefined<T extends object>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input as Record<string, unknown>).filter(([, value]) => value !== undefined)
  ) as Partial<T>;
}

function normalizeUserPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return trimmed;
  }

  const home = process.env.USERPROFILE || process.env.HOME || process.env.HOMEPATH;
  if (trimmed === "~" && home) {
    return path.resolve(home);
  }

  if ((trimmed.startsWith("~/") || trimmed.startsWith("~\\")) && home) {
    return path.resolve(home, trimmed.slice(2));
  }

  return path.resolve(trimmed);
}

function parseAuthApiKeys(value: string | undefined): Array<{ key: string; role: "viewer" | "editor" | "admin"; id: string }> | undefined {
  if (!value) {
    return undefined;
  }

  const bindings = value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const [key, roleRaw, idRaw] = entry.split(":").map((part) => part.trim());
      const role = roleRaw as "viewer" | "editor" | "admin";
      if (!key || !role || !["viewer", "editor", "admin"].includes(role)) {
        throw new ValidationError("Invalid AUTH_API_KEYS entry", { entry });
      }

      return {
        key,
        role,
        id: idRaw || `key-${index + 1}`
      };
    });

  return bindings;
}

function parseOtelHeaders(value: string | undefined): Record<string, string> | undefined {
  if (!value) {
    return undefined;
  }

  const headers: Record<string, string> = {};
  for (const entry of value.split(",").map((item) => item.trim()).filter(Boolean)) {
    const [key, ...rest] = entry.split("=");
    const headerKey = key?.trim();
    const headerValue = rest.join("=").trim();
    if (!headerKey || !headerValue) {
      throw new ValidationError("Invalid OTEL_EXPORTER_OTLP_HEADERS entry", { entry });
    }
    headers[headerKey] = headerValue;
  }

  return headers;
}
