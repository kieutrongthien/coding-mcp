import { describe, expect, it } from "vitest";
import { CliUsageError, parseCliArgs } from "../../src/main/cli-args.js";

describe("parseCliArgs", () => {
  it("throws on unknown command", () => {
    expect(() => parseCliArgs(["unknown"]))
      .toThrowError(new CliUsageError("Unknown command: unknown"));
  });

  it("throws on invalid transport", () => {
    expect(() => parseCliArgs(["serve", "--transport", "ws"]))
      .toThrowError(new CliUsageError("Invalid value for --transport: ws"));
  });

  it("throws on unknown option", () => {
    expect(() => parseCliArgs(["serve", "--abc"]))
      .toThrowError(new CliUsageError("Unknown option: --abc"));
  });

  it("throws when add is missing folder", () => {
    expect(() => parseCliArgs(["add"]))
      .toThrowError(new CliUsageError("Missing folder argument for add command"));
  });

  it("throws when serve has positional argument", () => {
    expect(() => parseCliArgs(["serve", "my-folder"]))
      .toThrowError(new CliUsageError("Unexpected positional argument(s) for serve: my-folder"));
  });

  it("parses valid serve options", () => {
    const parsed = parseCliArgs([
      "serve",
      "--transport",
      "http",
      "--host",
      "127.0.0.1",
      "--port",
      "4000",
      "--mode",
      "streamable",
      "--projects-root",
      "/repo1",
      "--projects-root",
      "/repo2"
    ]);

    expect(parsed).toEqual({
      command: "serve",
      transport: "http",
      host: "127.0.0.1",
      port: 4000,
      mode: "streamable",
      projectsRoots: ["/repo1", "/repo2"]
    });
  });
});
