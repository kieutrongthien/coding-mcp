import { ValidationError } from "../../core/errors.js";

export interface UnifiedDiffResult {
  content: string;
  appliedHunks: number;
  conflicts: string[];
}

export function applyUnifiedDiff(original: string, patch: string): UnifiedDiffResult {
  const normalizedPatch = patch.replace(/\r\n/g, "\n");
  const lines = normalizedPatch.split("\n");
  const hunks = parseHunks(lines);

  if (hunks.length === 0) {
    throw new ValidationError("Patch does not contain any hunks");
  }

  const originalHasTrailingNewline = original.endsWith("\n");
  let sourceLines = original.replace(/\r\n/g, "\n").split("\n");
  const conflicts: string[] = [];
  let appliedHunks = 0;
  let offset = 0;

  for (const hunk of hunks) {
    const oldSegment = hunk.lines
      .filter((line) => line.type === "context" || line.type === "remove")
      .map((line) => line.value);

    const newSegment = hunk.lines
      .filter((line) => line.type === "context" || line.type === "add")
      .map((line) => line.value);

    const expectedIndex = Math.max(0, hunk.oldStart - 1 + offset);
    const currentSegment = sourceLines.slice(expectedIndex, expectedIndex + oldSegment.length);

    if (!segmentsEqual(currentSegment, oldSegment)) {
      conflicts.push(
        `hunk failed at old_start=${hunk.oldStart}: expected context/removals did not match current file content`
      );
      continue;
    }

    sourceLines = [
      ...sourceLines.slice(0, expectedIndex),
      ...newSegment,
      ...sourceLines.slice(expectedIndex + oldSegment.length)
    ];

    offset += newSegment.length - oldSegment.length;
    appliedHunks += 1;
  }

  let content = sourceLines.join("\n");
  if (originalHasTrailingNewline && !content.endsWith("\n")) {
    content += "\n";
  }

  return {
    content,
    appliedHunks,
    conflicts
  };
}

interface HunkLine {
  type: "context" | "add" | "remove";
  value: string;
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: HunkLine[];
}

function parseHunks(lines: string[]): Hunk[] {
  const hunks: Hunk[] = [];
  let current: Hunk | null = null;

  for (const line of lines) {
    const header = parseHunkHeader(line);
    if (header) {
      if (current) {
        hunks.push(validateHunk(current));
      }
      current = { ...header, lines: [] };
      continue;
    }

    if (!current) {
      continue;
    }

    if (line === "\\ No newline at end of file") {
      continue;
    }

    const marker = line[0];
    if (marker === " ") {
      current.lines.push({ type: "context", value: line.slice(1) });
      continue;
    }
    if (marker === "+") {
      current.lines.push({ type: "add", value: line.slice(1) });
      continue;
    }
    if (marker === "-") {
      current.lines.push({ type: "remove", value: line.slice(1) });
      continue;
    }

    throw new ValidationError("Invalid unified diff hunk line", { line });
  }

  if (current) {
    hunks.push(validateHunk(current));
  }

  return hunks;
}

function parseHunkHeader(line: string): Omit<Hunk, "lines"> | null {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (!match) {
    return null;
  }

  return {
    oldStart: Number(match[1]),
    oldCount: Number(match[2] ?? "1"),
    newStart: Number(match[3]),
    newCount: Number(match[4] ?? "1")
  };
}

function validateHunk(hunk: Hunk): Hunk {
  const oldCount = hunk.lines.filter((line) => line.type === "context" || line.type === "remove").length;
  const newCount = hunk.lines.filter((line) => line.type === "context" || line.type === "add").length;

  if (oldCount !== hunk.oldCount || newCount !== hunk.newCount) {
    throw new ValidationError("Unified diff hunk length mismatch", {
      oldStart: hunk.oldStart,
      declaredOldCount: hunk.oldCount,
      actualOldCount: oldCount,
      declaredNewCount: hunk.newCount,
      actualNewCount: newCount
    });
  }

  return hunk;
}

function segmentsEqual(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return false;
    }
  }

  return true;
}
