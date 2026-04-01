import crypto from "node:crypto";
import path from "node:path";
import { loadConfig } from "../config/load-config.js";
import { createLogger } from "../core/logger.js";
import { AuditLogger } from "../core/audit.js";
import { ProjectLockManager } from "../core/locks.js";
import type { RequestContext } from "../core/types.js";
import { ProjectScanner } from "../services/project-registry/project-scanner.js";
import { JsonRegistryStore } from "../services/project-registry/registry-store-json.js";
import { ProjectRegistryService } from "../services/project-registry/project-registry.service.js";
import { PathGuard } from "../services/filesystem/path-guard.js";
import { FileSystemService } from "../services/filesystem/filesystem.service.js";
import { PatchService } from "../services/patch/patch.service.js";
import { GitRunner } from "../services/git/git-runner.js";
import { GitService } from "../services/git/git.service.js";
import { CommandPolicy } from "../services/commands/command-policy.js";
import { CommandRunnerService } from "../services/commands/command-runner.service.js";
import type { ConfigOverrides } from "../config/load-config.js";
import { AuthzService } from "../services/auth/authz.service.js";
import { createTelemetryService, type TelemetryService } from "../core/telemetry.js";

export interface AppServices {
  config: ReturnType<typeof loadConfig>;
  logger: ReturnType<typeof createLogger>;
  audit: AuditLogger;
  locks: ProjectLockManager;
  projectRegistry: ProjectRegistryService;
  filesystem: FileSystemService;
  patch: PatchService;
  git: GitService;
  commands: CommandRunnerService;
  authz: AuthzService;
  telemetry: TelemetryService;
  createContext: (operation: string, projectId?: string) => RequestContext;
}

export function bootstrap(configPath?: string, overrides?: ConfigOverrides): AppServices {
  const config = loadConfig(configPath, overrides);
  const logger = createLogger({ level: config.logLevel });

  const localhostHosts = new Set(["127.0.0.1", "localhost", "::1"]);
  if (config.enableHttp && !config.enableAuth && !localhostHosts.has(config.httpHost)) {
    logger.warn(
      {
        host: config.httpHost,
        port: config.httpPort
      },
      "HTTP transport is exposed without auth; enable auth or bind to localhost"
    );
  }

  const audit = new AuditLogger(path.resolve(config.auditLogFile), logger);
  const locks = new ProjectLockManager();

  const registryStore = new JsonRegistryStore(path.resolve(config.registryFile));
  const scanner = new ProjectScanner(config.projectsRoots);
  const projectRegistry = new ProjectRegistryService(scanner, registryStore);

  if (projectRegistry.listProjects().length === 0) {
    projectRegistry.refresh();
  }

  const pathGuard = new PathGuard({ protectedPaths: config.protectedPaths });
  const filesystem = new FileSystemService(pathGuard);
  const patch = new PatchService(pathGuard);

  const git = new GitService(new GitRunner(), {
    timeoutMs: config.commandTimeoutMs,
    maxOutputSize: config.maxOutputSize
  });

  const commands = new CommandRunnerService(new CommandPolicy({ allowedCommands: config.allowedCommands }));
  const authz = new AuthzService({
    enabled: config.enableAuth,
    headerName: config.authHeaderName,
    apiKeys: config.authApiKeys
  });
  const telemetry = createTelemetryService(
    {
      enabled: config.enableOtel,
      serviceName: config.otelServiceName,
      endpoint: config.otelExporterOtlpEndpoint,
      headers: config.otelExporterOtlpHeaders
    },
    logger
  );

  return {
    config,
    logger,
    audit,
    locks,
    projectRegistry,
    filesystem,
    patch,
    git,
    commands,
    authz,
    telemetry,
    createContext(operation: string, projectId?: string): RequestContext {
      return {
        requestId: crypto.randomUUID(),
        startedAt: Date.now(),
        operation,
        projectId
      };
    }
  };
}
