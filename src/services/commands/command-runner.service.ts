import { spawn } from "node:child_process";
import type { CommandResult } from "../../core/types.js";
import { truncateText } from "../../core/policies.js";
import { CommandPolicy } from "./command-policy.js";
import { isTransientError, retryWithBackoff } from "../../core/retry.js";

export interface RunCommandInput {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  maxOutputSize: number;
  retryMaxAttempts: number;
  retryBaseDelayMs: number;
}

export class CommandRunnerService {
  constructor(private readonly policy: CommandPolicy) {}

  async run(input: RunCommandInput): Promise<CommandResult> {
    this.policy.assertAllowed(input.command);
    this.policy.assertArgsSafe(input.args);

    return await retryWithBackoff(
      async () => await this.runOnce(input),
      isTransientError,
      {
        maxAttempts: input.retryMaxAttempts,
        baseDelayMs: input.retryBaseDelayMs
      }
    );
  }

  private async runOnce(input: RunCommandInput): Promise<CommandResult> {
    const startedAt = Date.now();

    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: process.env,
        shell: false
      });

      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, input.timeoutMs);

      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString("utf8");
      });

      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);

        const out = truncateText(stdout, input.maxOutputSize);
        const err = truncateText(stderr, input.maxOutputSize);

        resolve({
          exitCode: code ?? 1,
          stdout: out.value,
          stderr: err.value,
          timedOut,
          durationMs: Date.now() - startedAt
        });
      });
    });
  }
}
