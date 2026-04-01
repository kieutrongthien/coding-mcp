import fs from "node:fs";
import type { ProjectMetadata } from "../../core/types.js";
import { truncateText } from "../../core/policies.js";
import { PathGuard } from "../filesystem/path-guard.js";
import { applyStructuredEdits, type StructuredEdit } from "./structured-edits.js";
import { applyUnifiedDiff } from "./unified-diff.js";

export interface ApplyPatchInput {
  path: string;
  dry_run?: boolean;
  patch?: string;
  structured_edits?: StructuredEdit[];
}

export class PatchService {
  constructor(private readonly pathGuard: PathGuard) {}

  applyPatch(project: ProjectMetadata, input: ApplyPatchInput) {
    const target = this.pathGuard.resolve(project.absolute_path, input.path);
    this.pathGuard.assertMutationAllowed(project.absolute_path, target);
    this.pathGuard.assertExists(target);

    const before = fs.readFileSync(target, "utf8");

    let after = before;
    let conflicts: string[] = [];
    let summary = "no-op";

    if (input.structured_edits && input.structured_edits.length > 0) {
      const result = applyStructuredEdits(before, input.structured_edits);
      after = result.content;
      conflicts = result.conflicts;
      summary = `structured_edits_applied=${result.applied}`;
    } else if (input.patch) {
      const result = applyUnifiedDiff(before, input.patch);
      after = result.content;
      conflicts = result.conflicts;
      summary = `unified_diff_hunks_applied=${result.appliedHunks}`;
    }

    if (!input.dry_run && after !== before) {
      fs.writeFileSync(target, after, "utf8");
    }

    const beforePreview = truncateText(before, 2000);
    const afterPreview = truncateText(after, 2000);

    return {
      changed_files: after === before ? [] : [input.path],
      patch_summary: summary,
      dry_run: Boolean(input.dry_run),
      conflicts,
      before_preview: beforePreview.value,
      after_preview: afterPreview.value,
      preview_truncated: beforePreview.truncated || afterPreview.truncated
    };
  }
}
