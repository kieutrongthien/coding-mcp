import { z } from "zod";
import { pathSchema, projectIdSchema } from "./common.js";

export const listDirectorySchema = z.object({
  project_id: projectIdSchema,
  path: pathSchema.default(".")
});

export const readFileSchema = z.object({
  project_id: projectIdSchema,
  path: pathSchema,
  start_line: z.number().int().positive().optional(),
  end_line: z.number().int().positive().optional()
});

export const readMultipleFilesSchema = z.object({
  project_id: projectIdSchema,
  paths: z.array(pathSchema).min(1)
});

export const createFileSchema = z.object({
  project_id: projectIdSchema,
  path: pathSchema,
  content: z.string(),
  overwrite: z.boolean().default(false)
});

export const writeFileSchema = z.object({
  project_id: projectIdSchema,
  path: pathSchema,
  content: z.string()
});

export const replaceInFileSchema = z.object({
  project_id: projectIdSchema,
  path: pathSchema,
  find: z.string(),
  replace: z.string(),
  replace_all: z.boolean().default(false)
});

export const applyPatchSchema = z.object({
  project_id: projectIdSchema,
  path: pathSchema,
  patch: z.string().optional(),
  structured_edits: z
    .array(
      z.union([
        z.object({ type: z.literal("insert_before"), anchor: z.string(), content: z.string() }),
        z.object({ type: z.literal("insert_after"), anchor: z.string(), content: z.string() }),
        z.object({ type: z.literal("replace_exact"), find: z.string(), replace: z.string(), replace_all: z.boolean().optional() }),
        z.object({ type: z.literal("replace_range"), start_line: z.number().int().positive(), end_line: z.number().int().positive(), content: z.string() }),
        z.object({ type: z.literal("delete_range"), start_line: z.number().int().positive(), end_line: z.number().int().positive() })
      ])
    )
    .optional(),
  dry_run: z.boolean().default(false)
});

export const deleteFileSchema = z.object({
  project_id: projectIdSchema,
  path: pathSchema,
  recursive: z.boolean().default(false),
  confirm: z.boolean().default(false)
});

export const moveFileSchema = z.object({
  project_id: projectIdSchema,
  source_path: pathSchema,
  target_path: pathSchema
});
