import path from "node:path";
import { SecurityError } from "./errors.js";

export function normalizeProjectPath(projectRoot: string, userPath: string): string {
  const normalized = path.resolve(projectRoot, userPath);
  const relative = path.relative(projectRoot, normalized);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new SecurityError("Path traversal outside project root is not allowed", {
      projectRoot,
      userPath
    });
  }

  return normalized;
}

export function isProtectedPath(projectRoot: string, targetAbsolutePath: string, protectedPaths: string[]): boolean {
  const relative = path.relative(projectRoot, targetAbsolutePath).replaceAll("\\", "/");
  return protectedPaths.some((entry) => relative === entry || relative.startsWith(`${entry}/`));
}

export function truncateText(content: string, maxBytes: number): { truncated: boolean; value: string } {
  const size = Buffer.byteLength(content, "utf8");
  if (size <= maxBytes) {
    return { truncated: false, value: content };
  }

  const truncated = content.slice(0, Math.max(0, maxBytes));
  return { truncated: true, value: truncated };
}
