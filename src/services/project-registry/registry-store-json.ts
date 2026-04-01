import fs from "node:fs";
import path from "node:path";
import type { ProjectMetadata } from "../../core/types.js";

interface RegistryDocument {
  projects: ProjectMetadata[];
  updated_at: string;
}

export class JsonRegistryStore {
  constructor(private readonly filePath: string) {
    const parent = path.dirname(filePath);
    fs.mkdirSync(parent, { recursive: true });
    if (!fs.existsSync(filePath)) {
      const initial: RegistryDocument = { projects: [], updated_at: new Date().toISOString() };
      fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), "utf8");
    }
  }

  loadProjects(): ProjectMetadata[] {
    const content = fs.readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(content) as RegistryDocument;
    return parsed.projects;
  }

  saveProjects(projects: ProjectMetadata[]): void {
    const next: RegistryDocument = {
      projects,
      updated_at: new Date().toISOString()
    };

    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), "utf8");
  }
}
