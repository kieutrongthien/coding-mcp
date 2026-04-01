import { z } from "zod";
import { projectIdSchema } from "./common.js";

export const runBuildSchema = z.object({ project_id: projectIdSchema });
export const runTestSchema = z.object({ project_id: projectIdSchema });
export const runLintSchema = z.object({ project_id: projectIdSchema });

export const runCommandSafeSchema = z.object({
  project_id: projectIdSchema,
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().positive().optional()
});
