import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PatchService } from "../../src/services/patch/patch.service.js";
import { PathGuard } from "../../src/services/filesystem/path-guard.js";

describe("PatchService", () => {
  it("applies structured replace_exact edit", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "patch-test-"));
    const filePath = path.join(root, "a.txt");
    fs.writeFileSync(filePath, "hello world", "utf8");

    const service = new PatchService(new PathGuard({ protectedPaths: [] }));

    const result = service.applyPatch(
      {
        id: "p1",
        name: "p1",
        absolute_path: root,
        detected_git_repo: false,
        last_scan_time: new Date().toISOString(),
        detected_tooling: [],
        repo_health: { clean: null, ahead: null, behind: null }
      },
      {
        path: "a.txt",
        structured_edits: [{ type: "replace_exact", find: "world", replace: "mcp" }]
      }
    );

    expect(result.changed_files).toEqual(["a.txt"]);
    expect(fs.readFileSync(filePath, "utf8")).toContain("hello mcp");
  });
});
