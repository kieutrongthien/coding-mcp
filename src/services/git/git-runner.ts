import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { ValidationError } from "../../core/errors.js";
import type { CommandResult } from "../../core/types.js";
import { truncateText } from "../../core/policies.js";

export interface GitRunInput {
  projectPath: string;
  args: string[];
  timeoutMs: number;
  maxOutputSize: number;
}

export class GitRunner {
  async run(input: GitRunInput): Promise<CommandResult> {
    assertGitRepo(input.projectPath);

    const startedAt = Date.now();

    return await new Promise<CommandResult>((resolve, reject) => {
      const child = spawn("git", input.args, {
        cwd: input.projectPath,
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

function assertGitRepo(projectPath: string): void {
  const gitDir = path.join(projectPath, ".git");
  if (!fs.existsSync(gitDir)) {
    throw new ValidationError("Project is not a git repository", { projectPath });
  }
}
