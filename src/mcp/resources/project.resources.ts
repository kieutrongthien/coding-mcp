import fs from "node:fs";
import path from "node:path";
import mime from "mime-types";
import type { AppServices } from "../../main/bootstrap.js";

export function registerProjectResources(server: any, services: AppServices): void {
  server.registerResource(
    "projects-index",
    "project://index",
    {
      title: "Projects Index",
      description: "Discovered projects"
    },
    async () => ({
      contents: [
        {
          uri: "project://index",
          mimeType: "application/json",
          text: JSON.stringify({ projects: services.projectRegistry.listProjects() }, null, 2)
        }
      ]
    })
  );

  const projects = services.projectRegistry.listProjects();
  for (const project of projects) {
    const treeUri = `project://${project.id}/tree`;
    server.registerResource(
      `${project.id}-tree`,
      treeUri,
      { title: `Project ${project.name} tree` },
      async () => ({
        contents: [
          {
            uri: treeUri,
            mimeType: "application/json",
            text: JSON.stringify({ tree: services.filesystem.getProjectTree(project, 4) }, null, 2)
          }
        ]
      })
    );

    const readmePath = path.join(project.absolute_path, "README.md");
    if (fs.existsSync(readmePath)) {
      const uri = `project://${project.id}/readme`;
      server.registerResource(`${project.id}-readme`, uri, { title: `Project ${project.name} README` }, async () => ({
        contents: [
          {
            uri,
            mimeType: "text/markdown",
            text: fs.readFileSync(readmePath, "utf8")
          }
        ]
      }));
    }

    const packageJsonPath = path.join(project.absolute_path, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      const uri = `project://${project.id}/package-json`;
      server.registerResource(`${project.id}-package-json`, uri, { title: `Project ${project.name} package.json` }, async () => ({
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: fs.readFileSync(packageJsonPath, "utf8")
          }
        ]
      }));
    }

    const statusUri = `project://${project.id}/git-status`;
    server.registerResource(`${project.id}-git-status`, statusUri, { title: `Project ${project.name} git status` }, async () => {
      const status = project.detected_git_repo ? await services.git.status(project) : null;
      return {
        contents: [
          {
            uri: statusUri,
            mimeType: "application/json",
            text: JSON.stringify({ status }, null, 2)
          }
        ]
      };
    });
  }

  server.registerResource(
    "project-file-template",
    "project://file/{project_id}/{path}",
    {
      title: "Project file content"
    },
    async (uri: URL, params: { project_id: string; path: string }) => {
      const project = services.projectRegistry.getProject(params.project_id);
      const read = services.filesystem.readFileForResource(project, params.path, services.config.maxOutputSize);

      if (read.is_binary) {
        return {
          contents: [
            {
              uri: uri.toString(),
              mimeType: read.mime_type || "application/octet-stream",
              blob: read.content
            }
          ]
        };
      }

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: (mime.lookup(params.path) || read.mime_type || "text/plain").toString(),
            text: read.content
          }
        ]
      };
    }
  );

  server.registerResource(
    "project-file-meta-template",
    "project://file-meta/{project_id}/{path}",
    {
      title: "Project file metadata"
    },
    async (uri: URL, params: { project_id: string; path: string }) => {
      const project = services.projectRegistry.getProject(params.project_id);
      const read = services.filesystem.readFileForResource(project, params.path, services.config.maxOutputSize);

      return {
        contents: [
          {
            uri: uri.toString(),
            mimeType: "application/json",
            text: JSON.stringify(
              {
                path: read.path,
                absolute_path: read.absolute_path,
                mime_type: read.mime_type,
                size_bytes: read.size_bytes,
                content_bytes: read.content_bytes,
                truncated: read.truncated,
                is_binary: read.is_binary,
                encoding: read.encoding
              },
              null,
              2
            )
          }
        ]
      };
    }
  );
}
