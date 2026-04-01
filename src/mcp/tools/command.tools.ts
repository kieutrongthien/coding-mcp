import type { AppServices } from "../../main/bootstrap.js";
import { SecurityError, ValidationError } from "../../core/errors.js";
import { runBuildSchema, runCommandSafeSchema, runLintSchema, runTestSchema } from "../schemas/command.schemas.js";
import { executeOperation } from "./tool-helpers.js";
import { buildCommandCandidates, type CommandOperation } from "../../services/commands/language-commands.js";

export function registerCommandTools(server: any, services: AppServices): void {
  server.registerTool("run_build", { inputSchema: runBuildSchema.shape }, async (rawArgs: unknown) => {
    const args = runBuildSchema.parse(rawArgs);
    return await runAlias(services, args.project_id, "run_build");
  });

  server.registerTool("run_test", { inputSchema: runTestSchema.shape }, async (rawArgs: unknown) => {
    const args = runTestSchema.parse(rawArgs);
    return await runAlias(services, args.project_id, "run_test");
  });

  server.registerTool("run_lint", { inputSchema: runLintSchema.shape }, async (rawArgs: unknown) => {
    const args = runLintSchema.parse(rawArgs);
    return await runAlias(services, args.project_id, "run_lint");
  });

  server.registerTool("run_command_safe", { inputSchema: runCommandSafeSchema.shape }, async (rawArgs: unknown) => {
    const args = runCommandSafeSchema.parse(rawArgs);
    return await executeOperation(services, "run_command_safe", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      const result = await services.commands.run({
        command: args.command,
        args: args.args,
        cwd: args.cwd ? `${project.absolute_path}/${args.cwd}` : project.absolute_path,
        timeoutMs: args.timeout_ms ?? services.config.commandTimeoutMs,
        maxOutputSize: services.config.maxOutputSize,
        retryMaxAttempts: services.config.retryMaxAttempts,
        retryBaseDelayMs: services.config.retryBaseDelayMs
      });

      return {
        exit_code: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        timed_out: result.timedOut,
        duration_ms: result.durationMs
      };
    }, args.project_id);
  });
}

async function runAlias(services: AppServices, projectId: string, operation: CommandOperation) {
  return await executeOperation(services, operation, async () => {
    const project = services.projectRegistry.getProject(projectId);
    const candidates = buildCommandCandidates(project, operation);
    if (candidates.length === 0) {
      throw new ValidationError("No supported command candidates found for project tooling", {
        project_id: projectId,
        detected_tooling: project.detected_tooling,
        operation
      });
    }

    const attempts: Array<{ command: string; args: string[]; source: string; skipped_reason?: string }> = [];

    for (const candidate of candidates) {
      try {
        const result = await services.commands.run({
          command: candidate.command,
          args: candidate.args,
          cwd: project.absolute_path,
          timeoutMs: services.config.commandTimeoutMs,
          maxOutputSize: services.config.maxOutputSize,
          retryMaxAttempts: services.config.retryMaxAttempts,
          retryBaseDelayMs: services.config.retryBaseDelayMs
        });

        return {
          command: candidate.command,
          args: candidate.args,
          source: candidate.source,
          exit_code: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
          timed_out: result.timedOut,
          duration_ms: result.durationMs,
          attempts
        };
      } catch (error) {
        if (isSkippableCandidateError(error)) {
          attempts.push({
            command: candidate.command,
            args: candidate.args,
            source: candidate.source,
            skipped_reason: error instanceof Error ? error.message : "Unknown failure"
          });
          continue;
        }

        throw error;
      }
    }

    throw new ValidationError("No executable command candidate available for this project", {
      project_id: projectId,
      operation,
      attempts
    });
  }, projectId);
}

function isSkippableCandidateError(error: unknown): boolean {
  if (error instanceof SecurityError && error.message.includes("allowlist")) {
    return true;
  }

  if (!error || typeof error !== "object") {
    return false;
  }

  const code = (error as { code?: unknown }).code;
  if (code === "ENOENT") {
    return true;
  }

  const message = String((error as { message?: unknown }).message ?? "");
  return /ENOENT/i.test(message) || /not found/i.test(message);
}
