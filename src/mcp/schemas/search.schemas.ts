import { z } from "zod";
import { projectIdSchema } from "./common.js";

export const searchFilesSchema = z.object({
  project_id: projectIdSchema,
  query: z.string().min(1),
  limit: z.number().int().positive().max(5000).default(200),
  include_glob: z.string().optional(),
  exclude_glob: z.string().optional()
});

export const grepContentSchema = z.object({
  project_id: projectIdSchema,
  pattern: z.string().min(1),
  limit: z.number().int().positive().max(5000).default(200),
  include_glob: z.string().optional(),
  exclude_glob: z.string().optional(),
  max_file_size_bytes: z.number().int().positive().max(8 * 1024 * 1024).default(1024 * 1024),
  concurrency: z.number().int().positive().max(64).default(8)
});

export const projectTreeSchema = z.object({
  project_id: projectIdSchema,
  max_depth: z.number().int().positive().max(20).default(3)
});

export const summarizeProjectSchema = z.object({
  project_id: projectIdSchema
});
