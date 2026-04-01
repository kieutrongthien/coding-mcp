import type { AppServices } from "../../main/bootstrap.js";
import {
  analyzeProjectPromptArgs,
  explainFilePromptArgs,
  fixTestFailuresPromptArgs,
  generateCommitMessagePromptArgs,
  implementTaskPromptArgs,
  reviewDiffPromptArgs
} from "../schemas/prompt.schemas.js";

function userText(text: string) {
  return {
    role: "user",
    content: {
      type: "text",
      text
    }
  };
}

export function registerWorkflowPrompts(server: any, services: AppServices): void {
  server.registerPrompt("analyze-project", { argsSchema: analyzeProjectPromptArgs.shape }, async (rawArgs: unknown) => {
    const args = analyzeProjectPromptArgs.parse(rawArgs);
    const project = services.projectRegistry.getProject(args.project_id);
    return {
      messages: [
        userText(
          `Analyze project ${project.name} (${project.absolute_path}). Focus: ${args.focus ?? "architecture, risks, and actionable improvements"}.`
        )
      ]
    };
  });

  server.registerPrompt("implement-task", { argsSchema: implementTaskPromptArgs.shape }, async (rawArgs: unknown) => {
    const args = implementTaskPromptArgs.parse(rawArgs);
    return {
      messages: [
        userText(
          `Implement task for project ${args.project_id}: ${args.task}. Constraints: ${args.constraints ?? "maintain existing style and add tests."}`
        )
      ]
    };
  });

  server.registerPrompt("explain-file", { argsSchema: explainFilePromptArgs.shape }, async (rawArgs: unknown) => {
    const args = explainFilePromptArgs.parse(rawArgs);
    return {
      messages: [
        userText(`Explain file ${args.path} in project ${args.project_id}. Question: ${args.question ?? "How does this file work?"}`)
      ]
    };
  });

  server.registerPrompt(
    "generate-commit-message",
    { argsSchema: generateCommitMessagePromptArgs.shape },
    async (rawArgs: unknown) => {
      const args = generateCommitMessagePromptArgs.parse(rawArgs);
      return {
        messages: [
          userText(
            `Generate a concise conventional commit message for project ${args.project_id} using this diff summary:\n${args.diff_summary}`
          )
        ]
      };
    }
  );

  server.registerPrompt("review-diff", { argsSchema: reviewDiffPromptArgs.shape }, async (rawArgs: unknown) => {
    const args = reviewDiffPromptArgs.parse(rawArgs);
    return {
      messages: [userText(`Review this diff for project ${args.project_id}. Identify bugs, regressions, and missing tests:\n${args.diff}`)]
    };
  });

  server.registerPrompt("fix-test-failures", { argsSchema: fixTestFailuresPromptArgs.shape }, async (rawArgs: unknown) => {
    const args = fixTestFailuresPromptArgs.parse(rawArgs);
    return {
      messages: [
        userText(
          `Fix failing tests in project ${args.project_id}. Use this test output:\n${args.test_output}\nProvide minimal safe code changes.`
        )
      ]
    };
  });
}
