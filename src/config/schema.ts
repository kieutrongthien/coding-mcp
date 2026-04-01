import { z } from "zod";
import os from "node:os";
import path from "node:path";

const defaultDataDir = path.join(os.homedir(), ".coding-mcp");

export const appConfigSchema = z
  .object({
    projectsRoots: z.array(z.string().min(1)).min(1),
    enableHttp: z.boolean().default(true),
    enableStdio: z.boolean().default(true),
    enableOtel: z.boolean().default(false),
    otelServiceName: z.string().default("coding-mcp"),
    otelExporterOtlpEndpoint: z.string().default("http://localhost:4318/v1/traces"),
    otelExporterOtlpHeaders: z.record(z.string()).default({}),
    enableAuth: z.boolean().default(false),
    authHeaderName: z.string().default("x-api-key"),
    authApiKeys: z
      .array(
        z.object({
          key: z.string().min(1),
          role: z.enum(["viewer", "editor", "admin"]),
          id: z.string().min(1)
        })
      )
      .default([]),
    httpHost: z.string().default("127.0.0.1"),
    httpPort: z.number().int().positive().default(3000),
    httpMode: z.enum(["streamable", "sse"]).default("streamable"),
    maxFileSize: z.number().int().positive().default(1024 * 1024),
    maxOutputSize: z.number().int().positive().default(128 * 1024),
    commandTimeoutMs: z.number().int().positive().default(120_000),
    retryMaxAttempts: z.number().int().positive().default(2),
    retryBaseDelayMs: z.number().int().positive().default(200),
    allowedCommands: z.array(z.string()).default([]),
    protectedPaths: z.array(z.string()).default([]),
    logLevel: z.string().default("info"),
    registryFile: z.string().default(path.join(defaultDataDir, "registry.json")),
    auditLogFile: z.string().default(path.join(defaultDataDir, "audit.log")),
    httpRequestLogFile: z.string().default(path.join(defaultDataDir, "http-requests.log")),
    debugMode: z.boolean().default(false)
  })
  .superRefine((value, ctx) => {
    if (value.enableAuth && value.authApiKeys.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["authApiKeys"],
        message: "authApiKeys must include at least one key when enableAuth=true"
      });
    }
  });

export type AppConfig = z.infer<typeof appConfigSchema>;
