import type { AppServices } from "../../main/bootstrap.js";
import { runBuildSchema, runCommandSafeSchema, runLintSchema, runTestSchema } from "../schemas/command.schemas.js";
import { executeOperation } from "./tool-helpers.js";

export function registerCommandTools(server: any, services: AppServices): void {
  server.registerTool("run_build", { inputSchema: runBuildSchema.shape }, async (rawArgs: unknown) => {
    const args = runBuildSchema.parse(rawArgs);
    return await runAlias(services, args.project_id, "run_build", ["run", "build"]);
  });

  server.registerTool("run_test", { inputSchema: runTestSchema.shape }, async (rawArgs: unknown) => {
    const args = runTestSchema.parse(rawArgs);
    return await runAlias(services, args.project_id, "run_test", ["run", "test"]);
  });

  server.registerTool("run_lint", { inputSchema: runLintSchema.shape }, async (rawArgs: unknown) => {
    const args = runLintSchema.parse(rawArgs);
    return await runAlias(services, args.project_id, "run_lint", ["run", "lint"]);
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
        maxOutputSize: services.config.maxOutputSize
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

async function runAlias(services: AppServices, projectId: string, operation: string, args: string[]) {
  return await executeOperation(services, operation, async () => {
    const project = services.projectRegistry.getProject(projectId);
    const packageManager = project.package_manager ?? "npm";
    const result = await services.commands.run({
      command: packageManager,
      args,
      cwd: project.absolute_path,
      timeoutMs: services.config.commandTimeoutMs,
      maxOutputSize: services.config.maxOutputSize
    });

    return {
      command: packageManager,
      args,
      exit_code: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
      timed_out: result.timedOut,
      duration_ms: result.durationMs
    };
  }, projectId);
}
