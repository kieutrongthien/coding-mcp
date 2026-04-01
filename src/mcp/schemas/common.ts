import { z } from "zod";

export const projectIdSchema = z.string().min(3);
export const pathSchema = z.string().min(1);

export const responseEnvelopeSchema = z.union([
  z.object({
    ok: z.literal(true),
    operation: z.string(),
    project_id: z.string().optional(),
    data: z.record(z.any()),
    warnings: z.array(z.string()),
    errors: z.array(z.string()),
    request_id: z.string().optional(),
    duration_ms: z.number().optional()
  }),
  z.object({
    ok: z.literal(false),
    operation: z.string(),
    error_code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional(),
    request_id: z.string().optional(),
    duration_ms: z.number().optional()
  })
]);
