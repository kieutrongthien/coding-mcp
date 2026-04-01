import type { AppServices } from "../../main/bootstrap.js";
import { getProjectSchema, refreshProjectIndexSchema } from "../schemas/project.schemas.js";
import { executeOperation } from "./tool-helpers.js";

export function registerProjectTools(server: any, services: AppServices): void {
  server.registerTool(
    "list_projects",
    {
      description: "List discovered projects under configured root"
    },
    async () => {
      return await executeOperation(services, "list_projects", async () => ({
        projects: services.projectRegistry.listProjects()
      }));
    }
  );

  server.registerTool(
    "get_project",
    {
      description: "Get project metadata by project_id",
      inputSchema: getProjectSchema.shape
    },
    async (rawArgs: unknown) => {
      const args = getProjectSchema.parse(rawArgs);
      return await executeOperation(
        services,
        "get_project",
        async () => ({
          project: services.projectRegistry.getProject(args.project_id)
        }),
        args.project_id
      );
    }
  );

  server.registerTool(
    "refresh_project_index",
    {
      description: "Refresh one project or all projects",
      inputSchema: refreshProjectIndexSchema.shape
    },
    async (rawArgs: unknown) => {
      const args = refreshProjectIndexSchema.parse(rawArgs);
      return await executeOperation(services, "refresh_project_index", async () => {
        const refreshed = services.projectRegistry.refresh(args.project_id);
        return refreshed;
      }, args.project_id);
    }
  );

}
