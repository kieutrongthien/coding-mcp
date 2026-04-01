import { ValidationError } from "../../core/errors.js";

export type StructuredEdit =
  | { type: "insert_before"; anchor: string; content: string }
  | { type: "insert_after"; anchor: string; content: string }
  | { type: "replace_exact"; find: string; replace: string; replace_all?: boolean }
  | { type: "replace_range"; start_line: number; end_line: number; content: string }
  | { type: "delete_range"; start_line: number; end_line: number };

export interface StructuredEditResult {
  content: string;
  conflicts: string[];
  applied: number;
}

export function applyStructuredEdits(original: string, edits: StructuredEdit[]): StructuredEditResult {
  let content = original;
  const conflicts: string[] = [];
  let applied = 0;

  for (const edit of edits) {
    try {
      const next = applySingle(content, edit);
      if (next.changed) {
        content = next.content;
        applied += 1;
      }
    } catch (error) {
      conflicts.push(error instanceof Error ? error.message : "Unknown structured edit error");
    }
  }

  return { content, conflicts, applied };
}

function applySingle(content: string, edit: StructuredEdit): { content: string; changed: boolean } {
  switch (edit.type) {
    case "insert_before": {
      const index = content.indexOf(edit.anchor);
      if (index < 0) {
        throw new ValidationError("insert_before anchor not found", { anchor: edit.anchor });
      }
      return { content: content.slice(0, index) + edit.content + content.slice(index), changed: true };
    }
    case "insert_after": {
      const index = content.indexOf(edit.anchor);
      if (index < 0) {
        throw new ValidationError("insert_after anchor not found", { anchor: edit.anchor });
      }
      const anchorEnd = index + edit.anchor.length;
      return { content: content.slice(0, anchorEnd) + edit.content + content.slice(anchorEnd), changed: true };
    }
    case "replace_exact": {
      if (edit.replace_all) {
        const regex = new RegExp(escapeRegex(edit.find), "g");
        if (!regex.test(content)) {
          throw new ValidationError("replace_exact find string not found", { find: edit.find });
        }
        return { content: content.replace(regex, edit.replace), changed: true };
      }

      const index = content.indexOf(edit.find);
      if (index < 0) {
        throw new ValidationError("replace_exact find string not found", { find: edit.find });
      }

      return {
        content: content.slice(0, index) + edit.replace + content.slice(index + edit.find.length),
        changed: true
      };
    }
    case "replace_range": {
      const lines = content.split(/\r?\n/);
      assertRange(edit.start_line, edit.end_line, lines.length);
      const next = [...lines.slice(0, edit.start_line - 1), edit.content, ...lines.slice(edit.end_line)];
      return { content: next.join("\n"), changed: true };
    }
    case "delete_range": {
      const lines = content.split(/\r?\n/);
      assertRange(edit.start_line, edit.end_line, lines.length);
      const next = [...lines.slice(0, edit.start_line - 1), ...lines.slice(edit.end_line)];
      return { content: next.join("\n"), changed: true };
    }
    default:
      return { content, changed: false };
  }
}

function assertRange(start: number, end: number, total: number): void {
  if (start < 1 || end < start || end > total) {
    throw new ValidationError("Invalid line range", { start, end, total });
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
