import { z } from "zod";
import { projectIdSchema } from "./common.js";

export const getProjectSchema = z.object({
  project_id: projectIdSchema
});

export const refreshProjectIndexSchema = z.object({
  project_id: projectIdSchema.optional()
});
