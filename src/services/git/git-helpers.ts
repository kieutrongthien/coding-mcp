import type { CommandResult } from "../../core/types.js";
import { ValidationError } from "../../core/errors.js";

export function assertGitSuccess(result: CommandResult, operation: string): void {
  if (result.exitCode !== 0) {
    throw new ValidationError(`Git operation failed: ${operation}`, {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode
    });
  }
}

export function validateCommitMessage(message: string): void {
  if (!message.trim()) {
    throw new ValidationError("Commit message cannot be empty");
  }
  if (message.trim().length < 3) {
    throw new ValidationError("Commit message is too short");
  }
}
