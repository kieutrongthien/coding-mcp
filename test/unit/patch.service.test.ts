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

  it("applies structured replace alias edit", () => {
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
        structured_edits: [{ type: "replace", find: "world", replace: "alias" }]
      }
    );

    expect(result.changed_files).toEqual(["a.txt"]);
    expect(fs.readFileSync(filePath, "utf8")).toContain("hello alias");
  });

  it("applies unified diff hunks to file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "patch-test-"));
    const filePath = path.join(root, "a.txt");
    fs.writeFileSync(filePath, "line1\nline2\nline3\n", "utf8");

    const service = new PatchService(new PathGuard({ protectedPaths: [] }));
    const patch = [
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-line2",
      "+line2-updated",
      " line3"
    ].join("\n");

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
        patch
      }
    );

    expect(result.patch_summary).toBe("unified_diff_hunks_applied=1");
    expect(result.conflicts).toEqual([]);
    expect(fs.readFileSync(filePath, "utf8")).toBe("line1\nline2-updated\nline3\n");
  });

  it("reports conflict when unified diff hunk does not match file", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "patch-test-"));
    const filePath = path.join(root, "a.txt");
    fs.writeFileSync(filePath, "line1\nlineX\nline3\n", "utf8");

    const service = new PatchService(new PathGuard({ protectedPaths: [] }));
    const patch = [
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-line2",
      "+line2-updated",
      " line3"
    ].join("\n");

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
        patch
      }
    );

    expect(result.patch_summary).toBe("unified_diff_hunks_applied=0");
    expect(result.conflicts.length).toBe(1);
    expect(fs.readFileSync(filePath, "utf8")).toBe("line1\nlineX\nline3\n");
  });

  it("accepts unified diff with trailing newline", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "patch-test-"));
    const filePath = path.join(root, "a.txt");
    fs.writeFileSync(filePath, "line1\nline2\nline3\n", "utf8");

    const service = new PatchService(new PathGuard({ protectedPaths: [] }));
    const patch = [
      "--- a/a.txt",
      "+++ b/a.txt",
      "@@ -1,3 +1,3 @@",
      " line1",
      "-line2",
      "+line2-updated",
      " line3",
      ""
    ].join("\n");

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
        patch
      }
    );

    expect(result.patch_summary).toBe("unified_diff_hunks_applied=1");
    expect(result.conflicts).toEqual([]);
    expect(fs.readFileSync(filePath, "utf8")).toBe("line1\nline2-updated\nline3\n");
  });
});
