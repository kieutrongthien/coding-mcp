import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import { lookup as lookupMime } from "mime-types";
import { ValidationError } from "../../core/errors.js";
import { truncateText } from "../../core/policies.js";
import type { ProjectMetadata } from "../../core/types.js";
import { PathGuard } from "./path-guard.js";

export interface ReadFileOptions {
  startLine?: number;
  endLine?: number;
  maxFileSize: number;
}

export interface ResourceFileReadResult {
  path: string;
  absolute_path: string;
  mime_type: string;
  size_bytes: number;
  content_bytes: number;
  truncated: boolean;
  is_binary: boolean;
  encoding: "utf8" | "base64";
  content: string;
}

export class FileSystemService {
  constructor(private readonly pathGuard: PathGuard) {}

  readFileForResource(project: ProjectMetadata, relativePath: string, maxBytes: number): ResourceFileReadResult {
    const target = this.pathGuard.resolve(project.absolute_path, relativePath);
    this.pathGuard.assertExists(target);

    const stat = fs.statSync(target);
    const raw = fs.readFileSync(target);
    const truncated = raw.byteLength > maxBytes;
    const safeBuffer = truncated ? raw.subarray(0, maxBytes) : raw;
    const isBinary = detectBinary(safeBuffer);
    const mimeType = (lookupMime(target) || "application/octet-stream").toString();

    return {
      path: relativePath,
      absolute_path: target,
      mime_type: mimeType,
      size_bytes: stat.size,
      content_bytes: safeBuffer.byteLength,
      truncated,
      is_binary: isBinary,
      encoding: isBinary ? "base64" : "utf8",
      content: isBinary ? safeBuffer.toString("base64") : safeBuffer.toString("utf8")
    };
  }

  listDirectory(project: ProjectMetadata, relativePath: string) {
    const target = this.pathGuard.resolve(project.absolute_path, relativePath || ".");
    this.pathGuard.assertExists(target);

    const entries = fs.readdirSync(target, { withFileTypes: true });
    return entries.map((entry) => {
      const absolute = path.join(target, entry.name);
      const stats = fs.statSync(absolute);
      return {
        name: entry.name,
        path: toProjectRelative(project.absolute_path, absolute),
        type: entry.isDirectory() ? "directory" : "file",
        size: stats.size,
        modified_time: stats.mtime.toISOString()
      };
    });
  }

  readFile(project: ProjectMetadata, relativePath: string, options: ReadFileOptions) {
    const target = this.pathGuard.resolve(project.absolute_path, relativePath);
    this.pathGuard.assertExists(target);

    const stat = fs.statSync(target);
    if (stat.size > options.maxFileSize) {
      throw new ValidationError("File exceeds maximum configured size", {
        path: relativePath,
        fileSize: stat.size,
        maxFileSize: options.maxFileSize
      });
    }

    const raw = fs.readFileSync(target, "utf8");
    const lines = raw.split(/\r?\n/);
    const start = Math.max(1, options.startLine ?? 1);
    const end = Math.min(lines.length, options.endLine ?? lines.length);
    const selection = lines.slice(start - 1, end).join("\n");

    return {
      path: relativePath,
      absolute_path: target,
      mime_type: lookupMime(target) || "text/plain",
      total_lines: lines.length,
      start_line: start,
      end_line: end,
      content: selection
    };
  }

  readMultipleFiles(project: ProjectMetadata, paths: string[], maxFileSize: number) {
    return paths.map((item) => this.readFile(project, item, { maxFileSize }));
  }

  createFile(project: ProjectMetadata, relativePath: string, content: string, overwrite: boolean) {
    const target = this.pathGuard.resolve(project.absolute_path, relativePath);
    this.pathGuard.assertMutationAllowed(project.absolute_path, target);
    fs.mkdirSync(path.dirname(target), { recursive: true });

    if (fs.existsSync(target) && !overwrite) {
      throw new ValidationError("File already exists and overwrite=false", { path: relativePath });
    }

    fs.writeFileSync(target, content, "utf8");
    return { path: relativePath, bytes_written: Buffer.byteLength(content, "utf8") };
  }

  writeFile(project: ProjectMetadata, relativePath: string, content: string) {
    const target = this.pathGuard.resolve(project.absolute_path, relativePath);
    this.pathGuard.assertMutationAllowed(project.absolute_path, target);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content, "utf8");

    return { path: relativePath, bytes_written: Buffer.byteLength(content, "utf8") };
  }

  replaceInFile(project: ProjectMetadata, relativePath: string, find: string, replace: string, replaceAll: boolean) {
    const target = this.pathGuard.resolve(project.absolute_path, relativePath);
    this.pathGuard.assertMutationAllowed(project.absolute_path, target);
    this.pathGuard.assertExists(target);

    const before = fs.readFileSync(target, "utf8");
    if (!find) {
      throw new ValidationError("find must not be empty");
    }

    let replacements = 0;
    const after = replaceAll
      ? before.replace(new RegExp(escapeRegex(find), "g"), () => {
          replacements += 1;
          return replace;
        })
      : before.replace(find, () => {
          replacements += 1;
          return replace;
        });

    fs.writeFileSync(target, after, "utf8");

    const preview = truncateText(after, 4000);
    return {
      path: relativePath,
      replacements,
      preview: preview.value,
      preview_truncated: preview.truncated
    };
  }

  deleteFile(project: ProjectMetadata, relativePath: string, recursive: boolean) {
    const target = this.pathGuard.resolve(project.absolute_path, relativePath);
    this.pathGuard.assertMutationAllowed(project.absolute_path, target);
    this.pathGuard.assertExists(target);

    const stat = fs.statSync(target);
    if (stat.isDirectory()) {
      if (!recursive) {
        throw new ValidationError("Target is a directory; set recursive=true to delete", { path: relativePath });
      }
      fs.rmSync(target, { recursive: true, force: false });
      return { path: relativePath, deleted_type: "directory" };
    }

    fs.unlinkSync(target);
    return { path: relativePath, deleted_type: "file" };
  }

  moveFile(project: ProjectMetadata, sourcePath: string, targetPath: string) {
    const source = this.pathGuard.resolve(project.absolute_path, sourcePath);
    const target = this.pathGuard.resolve(project.absolute_path, targetPath);
    this.pathGuard.assertMutationAllowed(project.absolute_path, source);
    this.pathGuard.assertMutationAllowed(project.absolute_path, target);
    this.pathGuard.assertExists(source);

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.renameSync(source, target);

    return { source_path: sourcePath, target_path: targetPath };
  }

  searchFiles(project: ProjectMetadata, query: string) {
    return fg.sync([`**/*${query}*`], {
      cwd: project.absolute_path,
      dot: true,
      onlyFiles: false
    });
  }

  grepContent(
    project: ProjectMetadata,
    pattern: string,
    includeGlob?: string,
    excludeGlob?: string
  ): Array<{ path: string; line: number; snippet: string }> {
    const include = includeGlob || "**/*";
    const files = fg.sync([include], {
      cwd: project.absolute_path,
      onlyFiles: true,
      dot: true,
      ignore: excludeGlob ? [excludeGlob] : undefined
    });

    const regex = new RegExp(pattern, "i");
    const matches: Array<{ path: string; line: number; snippet: string }> = [];

    for (const relative of files) {
      const absolute = path.join(project.absolute_path, relative);
      const content = fs.readFileSync(absolute, "utf8");
      const lines = content.split(/\r?\n/);
      lines.forEach((line, index) => {
        if (regex.test(line)) {
          matches.push({ path: relative, line: index + 1, snippet: line.trim() });
        }
      });
    }

    return matches;
  }

  getProjectTree(project: ProjectMetadata, maxDepth = 3) {
    const walk = (dir: string, depth: number): Record<string, unknown> => {
      if (depth > maxDepth) {
        return { type: "directory", path: toProjectRelative(project.absolute_path, dir), truncated: true };
      }

      const children = fs
        .readdirSync(dir, { withFileTypes: true })
        .map((entry) => {
          const absolute = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            return walk(absolute, depth + 1);
          }

          const stat = fs.statSync(absolute);
          return {
            type: "file",
            name: entry.name,
            path: toProjectRelative(project.absolute_path, absolute),
            size: stat.size
          };
        });

      return {
        type: "directory",
        name: path.basename(dir),
        path: toProjectRelative(project.absolute_path, dir),
        children
      };
    };

    return walk(project.absolute_path, 0);
  }
}

function detectBinary(buffer: Buffer): boolean {
  const maxProbe = Math.min(buffer.length, 1024);
  if (maxProbe === 0) {
    return false;
  }

  let suspicious = 0;
  for (let i = 0; i < maxProbe; i += 1) {
    const byte = buffer[i];
    if (byte === 0) {
      return true;
    }

    const isControl = byte < 7 || (byte > 14 && byte < 32);
    if (isControl) {
      suspicious += 1;
    }
  }

  return suspicious / maxProbe > 0.1;
}

function toProjectRelative(root: string, absolutePath: string): string {
  const relative = path.relative(root, absolutePath).replaceAll("\\", "/");
  return relative || ".";
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
