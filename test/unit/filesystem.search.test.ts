import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { FileSystemService } from "../../src/services/filesystem/filesystem.service.js";
import { PathGuard } from "../../src/services/filesystem/path-guard.js";

const projectTemplate = (root: string) => ({
  id: "p1",
  name: "p1",
  absolute_path: root,
  detected_git_repo: false,
  last_scan_time: new Date().toISOString(),
  detected_tooling: [],
  repo_health: { clean: null, ahead: null, behind: null }
});

describe("FileSystemService search performance controls", () => {
  it("limits filename search results and reports has_more", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fs-search-"));
    fs.writeFileSync(path.join(root, "alpha-one.txt"), "x", "utf8");
    fs.writeFileSync(path.join(root, "alpha-two.txt"), "x", "utf8");
    fs.writeFileSync(path.join(root, "alpha-three.txt"), "x", "utf8");

    const service = new FileSystemService(new PathGuard({ protectedPaths: [] }));
    const result = await service.searchFiles(projectTemplate(root), "alpha", {
      limit: 2,
      includeGlob: "**/*"
    });

    expect(result.matches).toHaveLength(2);
    expect(result.has_more).toBe(true);
  });

  it("grep respects max file size and limit", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "fs-grep-"));
    fs.writeFileSync(path.join(root, "small.txt"), "target line\nother line", "utf8");
    fs.writeFileSync(path.join(root, "small2.txt"), "target line again", "utf8");
    fs.writeFileSync(path.join(root, "big.txt"), "x".repeat(2048), "utf8");

    const service = new FileSystemService(new PathGuard({ protectedPaths: [] }));
    const result = await service.grepContent(projectTemplate(root), "target", {
      limit: 1,
      includeGlob: "**/*",
      maxFileSizeBytes: 1024,
      concurrency: 4
    });

    expect(result.matches).toHaveLength(1);
    expect(result.has_more).toBe(true);
    expect(result.skipped_files).toBeGreaterThanOrEqual(1);
  });
});
