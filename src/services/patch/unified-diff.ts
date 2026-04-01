import { ValidationError } from "../../core/errors.js";

export interface UnifiedDiffResult {
  content: string;
  appliedHunks: number;
  conflicts: string[];
}

export function applyUnifiedDiff(original: string, patch: string): UnifiedDiffResult {
  const hunks = patch
    .split("\n")
    .filter((line) => line.startsWith("@@ "));

  if (hunks.length === 0) {
    throw new ValidationError("Patch does not contain any hunks");
  }

  return {
    content: original,
    appliedHunks: 0,
    conflicts: ["Unified diff parser is conservative in v1; provide structured_edits for guaranteed application"]
  };
}
