import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildCommandCandidates } from "../../src/services/commands/language-commands.js";

const projectTemplate = (root: string, tooling: string[], packageManager?: string) => ({
  id: "p1",
  name: "p1",
  absolute_path: root,
  detected_git_repo: false,
  default_branch: undefined,
  package_manager: packageManager,
  last_scan_time: new Date().toISOString(),
  detected_tooling: tooling,
  repo_health: { clean: null, ahead: null, behind: null }
});

describe("buildCommandCandidates", () => {
  it("returns node package-manager based commands", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lang-cmd-node-"));
    const project = projectTemplate(root, ["node"], "pnpm");

    const buildCandidates = buildCommandCandidates(project, "run_build");
    expect(buildCandidates[0]).toEqual({ command: "pnpm", args: ["run", "build"], source: "node" });
  });

  it("includes go and rust commands when tooling is detected", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lang-cmd-go-rust-"));
    const project = projectTemplate(root, ["go", "rust"]);

    const testCandidates = buildCommandCandidates(project, "run_test");
    const keys = testCandidates.map((item) => `${item.command} ${item.args.join(" ")}`);

    expect(keys).toContain("go test ./...");
    expect(keys).toContain("cargo test");
  });

  it("detects java build system files for maven and gradle candidates", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "lang-cmd-java-"));
    fs.writeFileSync(path.join(root, "pom.xml"), "<project></project>", "utf8");
    fs.writeFileSync(path.join(root, "build.gradle"), "plugins {}", "utf8");

    const project = projectTemplate(root, ["java"]);
    const lintCandidates = buildCommandCandidates(project, "run_lint");
    const keys = lintCandidates.map((item) => `${item.command} ${item.args.join(" ")}`);

    expect(keys).toContain("mvn -q -DskipTests verify");
    expect(keys).toContain("gradle check");
  });
});
