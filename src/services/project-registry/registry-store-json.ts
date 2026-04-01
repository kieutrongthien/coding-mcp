import fs from "node:fs";
import path from "node:path";
import type { ProjectMetadata } from "../../core/types.js";

interface RegistryDocument {
  roots: string[];
  projects: ProjectMetadata[];
  updated_at: string;
}

export class JsonRegistryStore {
  constructor(private readonly filePath: string) {
    const parent = path.dirname(filePath);
    fs.mkdirSync(parent, { recursive: true });
    if (!fs.existsSync(filePath)) {
      const initial: RegistryDocument = { roots: [], projects: [], updated_at: new Date().toISOString() };
      fs.writeFileSync(filePath, JSON.stringify(initial, null, 2), "utf8");
    }
  }

  load(): { roots: string[]; projects: ProjectMetadata[] } {
    const content = fs.readFileSync(this.filePath, "utf8");
    const parsed = JSON.parse(content) as Partial<RegistryDocument>;
    return {
      roots: parsed.roots ?? [],
      projects: parsed.projects ?? []
    };
  }

  save(roots: string[], projects: ProjectMetadata[]): void {
    const next: RegistryDocument = {
      roots,
      projects,
      updated_at: new Date().toISOString()
    };

    fs.writeFileSync(this.filePath, JSON.stringify(next, null, 2), "utf8");
  }
}
