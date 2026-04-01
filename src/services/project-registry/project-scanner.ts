import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ProjectMetadata } from "../../core/types.js";

export class ProjectScanner {
  constructor(private readonly projectsRoots: string[]) {}

  scan(): ProjectMetadata[] {
    const byId = new Map<string, ProjectMetadata>();
    const projects: ProjectMetadata[] = [];

    for (const root of this.projectsRoots) {
      if (!fs.existsSync(root)) {
        continue;
      }

      const entries = fs.readdirSync(root, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) {
          continue;
        }

        const absolutePath = path.join(root, entry.name);
        const gitDir = path.join(absolutePath, ".git");
        const detectedGitRepo = fs.existsSync(gitDir);
        const detectedTooling = detectTooling(absolutePath);
        const id = stableProjectId(absolutePath);

        const project: ProjectMetadata = {
          id,
          name: entry.name,
          absolute_path: absolutePath,
          detected_git_repo: detectedGitRepo,
          default_branch: detectedGitRepo ? detectDefaultBranch(absolutePath) : undefined,
          last_scan_time: new Date().toISOString(),
          detected_tooling: detectedTooling,
          package_manager: detectPackageManager(absolutePath),
          repo_health: {
            clean: null,
            ahead: null,
            behind: null
          }
        };

        byId.set(id, project);
      }
    }

    projects.push(...byId.values());

    return projects.sort((a, b) => a.name.localeCompare(b.name));
  }
}

function stableProjectId(absolutePath: string): string {
  return crypto.createHash("sha1").update(absolutePath).digest("hex").slice(0, 12);
}

function detectDefaultBranch(projectPath: string): string | undefined {
  const headPath = path.join(projectPath, ".git", "HEAD");
  if (!fs.existsSync(headPath)) {
    return undefined;
  }

  const content = fs.readFileSync(headPath, "utf8").trim();
  if (!content.startsWith("ref:")) {
    return undefined;
  }

  return content.split("/").at(-1);
}

function detectTooling(projectPath: string): string[] {
  const signals: Array<[string, string]> = [
    ["package.json", "node"],
    ["composer.json", "php"],
    ["pyproject.toml", "python"],
    ["requirements.txt", "python"],
    ["go.mod", "go"],
    ["Cargo.toml", "rust"],
    ["pom.xml", "java"],
    ["build.gradle", "java"]
  ];

  return signals
    .filter(([file]) => fs.existsSync(path.join(projectPath, file)))
    .map(([, stack]) => stack)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function detectPackageManager(projectPath: string): string | undefined {
  if (fs.existsSync(path.join(projectPath, "pnpm-lock.yaml"))) {
    return "pnpm";
  }
  if (fs.existsSync(path.join(projectPath, "yarn.lock"))) {
    return "yarn";
  }
  if (fs.existsSync(path.join(projectPath, "package-lock.json"))) {
    return "npm";
  }
  return undefined;
}
