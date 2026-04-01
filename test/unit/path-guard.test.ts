import path from "node:path";
import { describe, expect, it } from "vitest";
import { PathGuard } from "../../src/services/filesystem/path-guard.js";

describe("PathGuard", () => {
  const guard = new PathGuard({ protectedPaths: [".git", ".env"] });
  const root = "/tmp/project";

  it("blocks traversal outside root", () => {
    expect(() => guard.resolve(root, "../secret")).toThrow();
  });

  it("resolves safe path", () => {
    const target = guard.resolve(root, "src/index.ts");
    expect(target).toBe(path.resolve(root, "src/index.ts"));
  });

  it("blocks mutation of protected path", () => {
    expect(() => guard.assertMutationAllowed(root, path.join(root, ".git/config"))).toThrow();
  });
});
