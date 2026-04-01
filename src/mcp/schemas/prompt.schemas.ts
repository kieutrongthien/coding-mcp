import { z } from "zod";

export const analyzeProjectPromptArgs = z.object({
  project_id: z.string().min(3),
  focus: z.string().optional()
});

export const implementTaskPromptArgs = z.object({
  project_id: z.string().min(3),
  task: z.string().min(5),
  constraints: z.string().optional()
});

export const explainFilePromptArgs = z.object({
  project_id: z.string().min(3),
  path: z.string().min(1),
  question: z.string().optional()
});

export const generateCommitMessagePromptArgs = z.object({
  project_id: z.string().min(3),
  diff_summary: z.string().min(1)
});

export const reviewDiffPromptArgs = z.object({
  project_id: z.string().min(3),
  diff: z.string().min(1)
});

export const fixTestFailuresPromptArgs = z.object({
  project_id: z.string().min(3),
  test_output: z.string().min(1)
});
