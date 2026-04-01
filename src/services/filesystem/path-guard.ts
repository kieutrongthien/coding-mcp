import fs from "node:fs";
import path from "node:path";
import { NotFoundError, SecurityError } from "../../core/errors.js";
import { isProtectedPath, normalizeProjectPath } from "../../core/policies.js";

export interface PathGuardOptions {
  protectedPaths: string[];
}

export class PathGuard {
  constructor(private readonly options: PathGuardOptions) {}

  resolve(projectRoot: string, userPath: string): string {
    return normalizeProjectPath(projectRoot, userPath);
  }

  assertExists(target: string): void {
    if (!fs.existsSync(target)) {
      throw new NotFoundError("Path not found", { target });
    }
  }

  assertMutationAllowed(projectRoot: string, targetPath: string): void {
    const normalized = path.resolve(targetPath);
    if (isProtectedPath(projectRoot, normalized, this.options.protectedPaths)) {
      throw new SecurityError("Operation blocked for protected path", {
        targetPath: normalized
      });
    }
  }
}
