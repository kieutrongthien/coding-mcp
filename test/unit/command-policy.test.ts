import { describe, expect, it } from "vitest";
import { CommandPolicy } from "../../src/services/commands/command-policy.js";

describe("CommandPolicy", () => {
  const policy = new CommandPolicy({ allowedCommands: ["npm", "pnpm"] });

  it("allows configured command", () => {
    expect(() => policy.assertAllowed("npm")).not.toThrow();
  });

  it("blocks non-allowlisted command", () => {
    expect(() => policy.assertAllowed("rm")).toThrow();
  });

  it("blocks dangerous arg tokens", () => {
    expect(() => policy.assertArgsSafe(["run", "test", "&&", "cat", "/etc/passwd"])).toThrow();
  });
});
