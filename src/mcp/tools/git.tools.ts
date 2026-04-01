import { SecurityError } from "../../core/errors.js";
import type { AppServices } from "../../main/bootstrap.js";
import {
  gitAddSchema,
  gitCheckoutBranchSchema,
  gitCheckoutNewBranchSchema,
  gitCommitSchema,
  gitDiffSchema,
  gitLogSchema,
  gitProjectSchema,
  gitPushSchema,
  gitRestoreSchema,
  gitShowSchema,
  gitTagSchema
} from "../schemas/git.schemas.js";
import { executeOperation } from "./tool-helpers.js";

export function registerGitTools(server: any, services: AppServices): void {
  server.registerTool("git_status", { description: "Get git status for a project", inputSchema: gitProjectSchema.shape }, async (rawArgs: unknown) => {
    const args = gitProjectSchema.parse(rawArgs);
    return await executeOperation(services, "git_status", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return { result: await services.git.status(project) };
    }, args.project_id);
  });

  server.registerTool("git_diff", { description: "Get git diff for a project", inputSchema: gitDiffSchema.shape }, async (rawArgs: unknown) => {
    const args = gitDiffSchema.parse(rawArgs);
    return await executeOperation(services, "git_diff", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return { result: await services.git.diff(project, args.staged) };
    }, args.project_id);
  });

  server.registerTool("git_branch_list", { description: "List git branches for a project", inputSchema: gitProjectSchema.shape }, async (rawArgs: unknown) => {
    const args = gitProjectSchema.parse(rawArgs);
    return await executeOperation(services, "git_branch_list", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return { result: await services.git.branchList(project) };
    }, args.project_id);
  });

  server.registerTool("git_checkout_new_branch", { description: "Create and checkout a new git branch", inputSchema: gitCheckoutNewBranchSchema.shape }, async (rawArgs: unknown) => {
    const args = gitCheckoutNewBranchSchema.parse(rawArgs);
    return await executeOperation(services, "git_checkout_new_branch", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return await services.locks.withProjectLock(args.project_id, async () => ({ result: await services.git.checkoutNewBranch(project, args.branch) }));
    }, args.project_id);
  });

  server.registerTool("git_checkout_branch", { description: "Checkout an existing git branch", inputSchema: gitCheckoutBranchSchema.shape }, async (rawArgs: unknown) => {
    const args = gitCheckoutBranchSchema.parse(rawArgs);
    return await executeOperation(services, "git_checkout_branch", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return await services.locks.withProjectLock(args.project_id, async () => ({ result: await services.git.checkoutBranch(project, args.branch) }));
    }, args.project_id);
  });

  server.registerTool("git_pull", { description: "Pull latest changes from git remote", inputSchema: gitProjectSchema.shape }, async (rawArgs: unknown) => {
    const args = gitProjectSchema.parse(rawArgs);
    return await executeOperation(services, "git_pull", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return await services.locks.withProjectLock(args.project_id, async () => ({ result: await services.git.pull(project) }));
    }, args.project_id);
  });

  server.registerTool("git_add", { description: "Stage files with git add", inputSchema: gitAddSchema.shape }, async (rawArgs: unknown) => {
    const args = gitAddSchema.parse(rawArgs);
    return await executeOperation(services, "git_add", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return await services.locks.withProjectLock(args.project_id, async () => ({ result: await services.git.add(project, args.paths) }));
    }, args.project_id);
  });

  server.registerTool("git_restore", { description: "Restore files from git index or HEAD", inputSchema: gitRestoreSchema.shape }, async (rawArgs: unknown) => {
    const args = gitRestoreSchema.parse(rawArgs);
    if (!args.confirm) {
      throw new SecurityError("git_restore requires confirm=true");
    }

    return await executeOperation(services, "git_restore", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return await services.locks.withProjectLock(args.project_id, async () => ({ result: await services.git.restore(project, args.paths, args.staged) }));
    }, args.project_id);
  });

  server.registerTool("git_commit", { description: "Create a git commit", inputSchema: gitCommitSchema.shape }, async (rawArgs: unknown) => {
    const args = gitCommitSchema.parse(rawArgs);
    return await executeOperation(services, "git_commit", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return await services.locks.withProjectLock(args.project_id, async () => ({ result: await services.git.commit(project, args.message) }));
    }, args.project_id);
  });

  server.registerTool("git_push", { description: "Push commits to a git remote", inputSchema: gitPushSchema.shape }, async (rawArgs: unknown) => {
    const args = gitPushSchema.parse(rawArgs);
    return await executeOperation(services, "git_push", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return await services.locks.withProjectLock(args.project_id, async () => ({
        result: await services.git.push(project, args.remote, args.branch, args.set_upstream)
      }));
    }, args.project_id);
  });

  server.registerTool("git_log", { description: "Show git commit history", inputSchema: gitLogSchema.shape }, async (rawArgs: unknown) => {
    const args = gitLogSchema.parse(rawArgs);
    return await executeOperation(services, "git_log", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return { result: await services.git.log(project, args.limit) };
    }, args.project_id);
  });

  server.registerTool("git_show", { description: "Show details of a git object", inputSchema: gitShowSchema.shape }, async (rawArgs: unknown) => {
    const args = gitShowSchema.parse(rawArgs);
    return await executeOperation(services, "git_show", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return { result: await services.git.show(project, args.ref) };
    }, args.project_id);
  });

  server.registerTool("git_create_tag", { description: "Create an annotated git tag", inputSchema: gitTagSchema.shape }, async (rawArgs: unknown) => {
    const args = gitTagSchema.parse(rawArgs);
    return await executeOperation(services, "git_create_tag", async () => {
      const project = services.projectRegistry.getProject(args.project_id);
      return await services.locks.withProjectLock(args.project_id, async () => ({
        result: await services.git.createTag(project, args.tag, args.message)
      }));
    }, args.project_id);
  });
}
