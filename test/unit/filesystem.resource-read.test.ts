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

describe("FileSystemService.readFileForResource", () => {
  it("returns utf8 for text content", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "resource-read-"));
    fs.writeFileSync(path.join(root, "hello.txt"), "hello mcp", "utf8");

    const service = new FileSystemService(new PathGuard({ protectedPaths: [] }));
    const result = service.readFileForResource(projectTemplate(root), "hello.txt", 1024);

    expect(result.is_binary).toBe(false);
    expect(result.encoding).toBe("utf8");
    expect(result.content).toBe("hello mcp");
  });

  it("returns base64 for binary content and truncates by max bytes", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "resource-read-"));
    const bytes = Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    fs.writeFileSync(path.join(root, "blob.bin"), bytes);

    const service = new FileSystemService(new PathGuard({ protectedPaths: [] }));
    const result = service.readFileForResource(projectTemplate(root), "blob.bin", 5);

    expect(result.is_binary).toBe(true);
    expect(result.encoding).toBe("base64");
    expect(result.truncated).toBe(true);
    expect(Buffer.from(result.content, "base64")).toEqual(bytes.subarray(0, 5));
  });
});
