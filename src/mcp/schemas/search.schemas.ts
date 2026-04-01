import { z } from "zod";
import { projectIdSchema } from "./common.js";

export const searchFilesSchema = z.object({
  project_id: projectIdSchema,
  query: z.string().min(1)
});

export const grepContentSchema = z.object({
  project_id: projectIdSchema,
  pattern: z.string().min(1),
  include_glob: z.string().optional(),
  exclude_glob: z.string().optional()
});

export const projectTreeSchema = z.object({
  project_id: projectIdSchema,
  max_depth: z.number().int().positive().max(20).default(3)
});

export const summarizeProjectSchema = z.object({
  project_id: projectIdSchema
});
