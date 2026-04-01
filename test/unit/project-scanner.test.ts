import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ProjectScanner } from "../../src/services/project-registry/project-scanner.js";

describe("ProjectScanner", () => {
  it("discovers child directories as projects", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-"));
    fs.mkdirSync(path.join(root, "a"), { recursive: true });
    fs.mkdirSync(path.join(root, "b"), { recursive: true });

    const scanner = new ProjectScanner([root]);
    const projects = scanner.scan();

    expect(projects).toHaveLength(2);
    expect(projects.map((p) => p.name)).toEqual(["a", "b"]);
  });

  it("discovers projects from multiple roots", () => {
    const rootA = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-a-"));
    const rootB = fs.mkdtempSync(path.join(os.tmpdir(), "scan-test-b-"));

    fs.mkdirSync(path.join(rootA, "alpha"), { recursive: true });
    fs.mkdirSync(path.join(rootB, "beta"), { recursive: true });

    const scanner = new ProjectScanner([rootA, rootB]);
    const projects = scanner.scan();

    expect(projects.map((p) => p.name)).toEqual(["alpha", "beta"]);
  });
});
