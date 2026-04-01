import { z } from "zod";
import os from "node:os";
import path from "node:path";

const defaultDataDir = path.join(os.homedir(), ".coding-mcp");

export const appConfigSchema = z.object({
  projectsRoots: z.array(z.string().min(1)).min(1),
  enableHttp: z.boolean().default(true),
  enableStdio: z.boolean().default(true),
  httpHost: z.string().default("0.0.0.0"),
  httpPort: z.number().int().positive().default(3000),
  httpMode: z.enum(["streamable", "sse"]).default("streamable"),
  maxFileSize: z.number().int().positive().default(1024 * 1024),
  maxOutputSize: z.number().int().positive().default(128 * 1024),
  commandTimeoutMs: z.number().int().positive().default(120_000),
  allowedCommands: z.array(z.string()).default([]),
  protectedPaths: z.array(z.string()).default([]),
  logLevel: z.string().default("info"),
  registryFile: z.string().default(path.join(defaultDataDir, "registry.json")),
  auditLogFile: z.string().default(path.join(defaultDataDir, "audit.log")),
  debugMode: z.boolean().default(false)
});

export type AppConfig = z.infer<typeof appConfigSchema>;
