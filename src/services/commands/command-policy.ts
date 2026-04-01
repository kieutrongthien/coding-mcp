import { SecurityError, ValidationError } from "../../core/errors.js";

export interface CommandPolicyOptions {
  allowedCommands: string[];
}

export class CommandPolicy {
  private readonly allowed = new Set<string>();

  constructor(options: CommandPolicyOptions) {
    for (const command of options.allowedCommands) {
      this.allowed.add(command.trim());
    }
  }

  assertAllowed(command: string): void {
    if (!command.trim()) {
      throw new ValidationError("Command cannot be empty");
    }

    if (!this.allowed.has(command)) {
      throw new SecurityError("Command is not in allowlist", { command });
    }
  }

  assertArgsSafe(args: string[]): void {
    const forbiddenTokens = ["&&", "||", ";", "|", "`", "$(", ">", "<"];
    const invalid = args.find((arg) => forbiddenTokens.some((token) => arg.includes(token)));
    if (invalid) {
      throw new SecurityError("Argument contains forbidden shell tokens", { invalid });
    }
  }
}
