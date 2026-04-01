import { z } from "zod";
import { projectIdSchema } from "./common.js";

export const gitProjectSchema = z.object({ project_id: projectIdSchema });
export const gitDiffSchema = z.object({ project_id: projectIdSchema, staged: z.boolean().default(false) });
export const gitCheckoutNewBranchSchema = z.object({ project_id: projectIdSchema, branch: z.string().min(1) });
export const gitCheckoutBranchSchema = z.object({ project_id: projectIdSchema, branch: z.string().min(1) });
export const gitAddSchema = z.object({ project_id: projectIdSchema, paths: z.array(z.string()).min(1) });
export const gitRestoreSchema = z.object({
  project_id: projectIdSchema,
  paths: z.array(z.string()).min(1),
  staged: z.boolean().default(false),
  confirm: z.boolean().default(false)
});
export const gitCommitSchema = z.object({ project_id: projectIdSchema, message: z.string().min(3) });
export const gitPushSchema = z.object({
  project_id: projectIdSchema,
  remote: z.string().optional(),
  branch: z.string().optional(),
  set_upstream: z.boolean().default(false)
});
export const gitLogSchema = z.object({ project_id: projectIdSchema, limit: z.number().int().positive().max(100).default(20) });
export const gitShowSchema = z.object({ project_id: projectIdSchema, ref: z.string().default("HEAD") });
export const gitTagSchema = z.object({ project_id: projectIdSchema, tag: z.string().min(1), message: z.string().optional() });
