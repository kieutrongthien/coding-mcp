import type { AppServices } from "../../main/bootstrap.js";
import { grepContentSchema, projectTreeSchema, searchFilesSchema, summarizeProjectSchema } from "../schemas/search.schemas.js";
import { executeOperation } from "./tool-helpers.js";

export function registerSearchTools(server: any, services: AppServices): void {
  server.registerTool(
    "search_files",
    { description: "Search filenames and paths", inputSchema: searchFilesSchema.shape },
    async (rawArgs: unknown) => {
      const args = searchFilesSchema.parse(rawArgs);
      return await executeOperation(services, "search_files", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return { matches: services.filesystem.searchFiles(project, args.query) };
      }, args.project_id);
    }
  );

  server.registerTool(
    "grep_content",
    { description: "Search content with regex-like pattern", inputSchema: grepContentSchema.shape },
    async (rawArgs: unknown) => {
      const args = grepContentSchema.parse(rawArgs);
      return await executeOperation(services, "grep_content", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return {
          matches: services.filesystem.grepContent(project, args.pattern, args.include_glob, args.exclude_glob)
        };
      }, args.project_id);
    }
  );

  server.registerTool(
    "get_project_tree",
    { description: "Get normalized project tree", inputSchema: projectTreeSchema.shape },
    async (rawArgs: unknown) => {
      const args = projectTreeSchema.parse(rawArgs);
      return await executeOperation(services, "get_project_tree", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return { tree: services.filesystem.getProjectTree(project, args.max_depth) };
      }, args.project_id);
    }
  );

  server.registerTool(
    "summarize_project",
    { description: "Summarize project stack and scripts", inputSchema: summarizeProjectSchema.shape },
    async (rawArgs: unknown) => {
      const args = summarizeProjectSchema.parse(rawArgs);
      return await executeOperation(services, "summarize_project", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        const tree = services.filesystem.getProjectTree(project, 2);
        return {
          stack: project.detected_tooling,
          package_manager: project.package_manager,
          repo: {
            detected_git_repo: project.detected_git_repo,
            default_branch: project.default_branch
          },
          tree
        };
      }, args.project_id);
    }
  );
}
