import fs from "node:fs";
import path from "node:path";
import { NotFoundError } from "../../core/errors.js";
import type { ProjectMetadata } from "../../core/types.js";
import { JsonRegistryStore } from "./registry-store-json.js";
import { ProjectScanner } from "./project-scanner.js";

export class ProjectRegistryService {
  private projects = new Map<string, ProjectMetadata>();
  private roots = new Set<string>();

  constructor(
    private readonly scanner: ProjectScanner,
    private readonly store: JsonRegistryStore
  ) {
    const persisted = store.load();
    for (const project of persisted.projects) {
      this.projects.set(project.id, project);
    }

    for (const root of persisted.roots) {
      this.roots.add(path.resolve(root));
    }

    if (persisted.roots.length === 0) {
      for (const root of this.scanner.getRoots()) {
        this.roots.add(path.resolve(root));
      }
    }

    this.scanner.setRoots([...this.roots]);
  }

  listRoots(): string[] {
    return [...this.roots].sort((a, b) => a.localeCompare(b));
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
      this.store.save(this.listRoots(), [...this.projects.values()]);
      return { refreshed: scanned.length, projects: this.listProjects() };
    }

    const found = scanned.find((project) => project.id === projectId);
    if (!found) {
      throw new NotFoundError("Project not found during refresh", { projectId });
    }

    this.projects.set(found.id, found);
    this.store.save(this.listRoots(), [...this.projects.values()]);
    return { refreshed: 1, projects: [found] };
  }

  initFromRoot(root: string): { roots: string[]; refreshed: number; projects: ProjectMetadata[] } {
    const normalized = path.resolve(root);
    this.assertRootExists(normalized);
    this.roots = new Set([normalized]);
    this.scanner.setRoots([normalized]);
    const refreshed = this.refresh();
    return {
      roots: this.listRoots(),
      refreshed: refreshed.refreshed,
      projects: refreshed.projects
    };
  }

  addRoot(root: string): { roots: string[]; refreshed: number; projects: ProjectMetadata[] } {
    const normalized = path.resolve(root);
    this.assertRootExists(normalized);
    this.roots.add(normalized);
    this.scanner.setRoots(this.listRoots());
    const refreshed = this.refresh();
    return {
      roots: this.listRoots(),
      refreshed: refreshed.refreshed,
      projects: refreshed.projects
    };
  }

  removeRoot(root: string): { roots: string[]; refreshed: number; projects: ProjectMetadata[] } {
    const normalized = path.resolve(root);
    if (!this.roots.has(normalized)) {
      throw new NotFoundError("Root folder not found in registry", { root: normalized });
    }

    this.roots.delete(normalized);
    this.scanner.setRoots(this.listRoots());
    const refreshed = this.refresh();
    return {
      roots: this.listRoots(),
      refreshed: refreshed.refreshed,
      projects: refreshed.projects
    };
  }

  private assertRootExists(root: string): void {
    if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
      throw new NotFoundError("Root folder not found", { root });
    }
  }
}
