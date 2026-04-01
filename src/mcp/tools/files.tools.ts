import { SecurityError } from "../../core/errors.js";
import type { AppServices } from "../../main/bootstrap.js";
import {
  applyPatchSchema,
  createFileSchema,
  deleteFileSchema,
  listDirectorySchema,
  moveFileSchema,
  readFileSchema,
  readMultipleFilesSchema,
  replaceInFileSchema,
  writeFileSchema
} from "../schemas/file.schemas.js";
import { executeOperation } from "./tool-helpers.js";

export function registerFileTools(server: any, services: AppServices): void {
  server.registerTool(
    "list_directory",
    { description: "List files and directories", inputSchema: listDirectorySchema.shape },
    async (rawArgs: unknown) => {
      const args = listDirectorySchema.parse(rawArgs);
      return await executeOperation(services, "list_directory", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return { entries: services.filesystem.listDirectory(project, args.path) };
      }, args.project_id);
    }
  );

  server.registerTool(
    "read_file",
    { description: "Read file content", inputSchema: readFileSchema.shape },
    async (rawArgs: unknown) => {
      const args = readFileSchema.parse(rawArgs);
      return await executeOperation(services, "read_file", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return services.filesystem.readFile(project, args.path, {
          startLine: args.start_line,
          endLine: args.end_line,
          maxFileSize: services.config.maxFileSize
        });
      }, args.project_id);
    }
  );

  server.registerTool(
    "read_multiple_files",
    { description: "Read multiple files", inputSchema: readMultipleFilesSchema.shape },
    async (rawArgs: unknown) => {
      const args = readMultipleFilesSchema.parse(rawArgs);
      return await executeOperation(services, "read_multiple_files", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return {
          files: services.filesystem.readMultipleFiles(project, args.paths, services.config.maxFileSize)
        };
      }, args.project_id);
    }
  );

  server.registerTool(
    "create_file",
    { description: "Create file safely", inputSchema: createFileSchema.shape },
    async (rawArgs: unknown) => {
      const args = createFileSchema.parse(rawArgs);
      return await executeOperation(services, "create_file", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return await services.locks.withProjectLock(args.project_id, async () => {
          const result = services.filesystem.createFile(project, args.path, args.content, args.overwrite);
          services.audit.append({
            timestamp: new Date().toISOString(),
            request_id: crypto.randomUUID(),
            project_id: args.project_id,
            operation: "create_file",
            actor: "mcp-client",
            details: { path: args.path, overwrite: args.overwrite }
          });
          return result;
        });
      }, args.project_id);
    }
  );

  server.registerTool(
    "write_file",
    { description: "Write file content", inputSchema: writeFileSchema.shape },
    async (rawArgs: unknown) => {
      const args = writeFileSchema.parse(rawArgs);
      return await executeOperation(services, "write_file", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return await services.locks.withProjectLock(args.project_id, async () => {
          const result = services.filesystem.writeFile(project, args.path, args.content);
          services.audit.append({
            timestamp: new Date().toISOString(),
            request_id: crypto.randomUUID(),
            project_id: args.project_id,
            operation: "write_file",
            actor: "mcp-client",
            details: { path: args.path }
          });
          return result;
        });
      }, args.project_id);
    }
  );

  server.registerTool(
    "replace_in_file",
    { description: "Replace content in file", inputSchema: replaceInFileSchema.shape },
    async (rawArgs: unknown) => {
      const args = replaceInFileSchema.parse(rawArgs);
      return await executeOperation(services, "replace_in_file", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return await services.locks.withProjectLock(args.project_id, async () =>
          services.filesystem.replaceInFile(project, args.path, args.find, args.replace, args.replace_all)
        );
      }, args.project_id);
    }
  );

  server.registerTool(
    "apply_patch",
    { description: "Apply unified diff or structured edits", inputSchema: applyPatchSchema.shape },
    async (rawArgs: unknown) => {
      const args = applyPatchSchema.parse(rawArgs);
      return await executeOperation(services, "apply_patch", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return await services.locks.withProjectLock(args.project_id, async () =>
          services.patch.applyPatch(project, args)
        );
      }, args.project_id);
    }
  );

  server.registerTool(
    "delete_file",
    { description: "Delete file or directory", inputSchema: deleteFileSchema.shape },
    async (rawArgs: unknown) => {
      const args = deleteFileSchema.parse(rawArgs);
      if (!args.confirm) {
        throw new SecurityError("delete_file requires confirm=true");
      }

      return await executeOperation(services, "delete_file", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return await services.locks.withProjectLock(args.project_id, async () =>
          services.filesystem.deleteFile(project, args.path, args.recursive)
        );
      }, args.project_id);
    }
  );

  server.registerTool(
    "move_file",
    { description: "Move file or directory", inputSchema: moveFileSchema.shape },
    async (rawArgs: unknown) => {
      const args = moveFileSchema.parse(rawArgs);
      return await executeOperation(services, "move_file", async () => {
        const project = services.projectRegistry.getProject(args.project_id);
        return await services.locks.withProjectLock(args.project_id, async () =>
          services.filesystem.moveFile(project, args.source_path, args.target_path)
        );
      }, args.project_id);
    }
  );
}

import crypto from "node:crypto";
