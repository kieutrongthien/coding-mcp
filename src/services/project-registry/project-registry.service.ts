import { NotFoundError } from "../../core/errors.js";
import type { ProjectMetadata } from "../../core/types.js";
import { JsonRegistryStore } from "./registry-store-json.js";
import { ProjectScanner } from "./project-scanner.js";

export class ProjectRegistryService {
  private projects = new Map<string, ProjectMetadata>();

  constructor(
    private readonly scanner: ProjectScanner,
    private readonly store: JsonRegistryStore
  ) {
    const persisted = store.loadProjects();
    for (const project of persisted) {
      this.projects.set(project.id, project);
    }
  }

  listProjects(): ProjectMetadata[] {
    return [...this.projects.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  getProject(projectId: string): ProjectMetadata {
    const project = this.projects.get(projectId);
    if (!project) {
      throw new NotFoundError("Project not found", { projectId });
    }

    return project;
  }

  refresh(projectId?: string): { refreshed: number; projects: ProjectMetadata[] } {
    const scanned = this.scanner.scan();

    if (!projectId) {
      this.projects = new Map(scanned.map((project) => [project.id, project]));
      this.store.saveProjects([...this.projects.values()]);
      return { refreshed: scanned.length, projects: this.listProjects() };
    }

    const found = scanned.find((project) => project.id === projectId);
    if (!found) {
      throw new NotFoundError("Project not found during refresh", { projectId });
    }

    this.projects.set(found.id, found);
    this.store.saveProjects([...this.projects.values()]);
    return { refreshed: 1, projects: [found] };
  }
}
