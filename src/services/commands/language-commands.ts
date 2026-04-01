import fs from "node:fs";
import path from "node:path";
import type { ProjectMetadata } from "../../core/types.js";

export type CommandOperation = "run_build" | "run_test" | "run_lint";

export interface CommandCandidate {
  command: string;
  args: string[];
  source: string;
}

export function buildCommandCandidates(project: ProjectMetadata, operation: CommandOperation): CommandCandidate[] {
  const tooling = new Set(project.detected_tooling);
  const candidates: CommandCandidate[] = [];

  if (tooling.has("node")) {
    const script = operationToScript(operation);
    const packageManager = project.package_manager ?? "npm";
    candidates.push({
      command: packageManager,
      args: ["run", script],
      source: "node"
    });
  }

  if (tooling.has("python")) {
    if (operation === "run_build") {
      candidates.push({ command: "python", args: ["-m", "build"], source: "python" });
    }
    if (operation === "run_test") {
      candidates.push({ command: "pytest", args: [], source: "python" });
    }
    if (operation === "run_lint") {
      candidates.push({ command: "ruff", args: ["check", "."], source: "python" });
      candidates.push({ command: "flake8", args: ["."], source: "python" });
    }
  }

  if (tooling.has("go")) {
    if (operation === "run_build") {
      candidates.push({ command: "go", args: ["build", "./..."], source: "go" });
    }
    if (operation === "run_test") {
      candidates.push({ command: "go", args: ["test", "./..."], source: "go" });
    }
    if (operation === "run_lint") {
      candidates.push({ command: "go", args: ["vet", "./..."], source: "go" });
    }
  }

  if (tooling.has("rust")) {
    if (operation === "run_build") {
      candidates.push({ command: "cargo", args: ["build"], source: "rust" });
    }
    if (operation === "run_test") {
      candidates.push({ command: "cargo", args: ["test"], source: "rust" });
    }
    if (operation === "run_lint") {
      candidates.push({ command: "cargo", args: ["clippy"], source: "rust" });
    }
  }

  if (tooling.has("java")) {
    if (hasFile(project.absolute_path, "pom.xml")) {
      if (operation === "run_build") {
        candidates.push({ command: "mvn", args: ["-q", "-DskipTests", "package"], source: "java-maven" });
      }
      if (operation === "run_test") {
        candidates.push({ command: "mvn", args: ["-q", "test"], source: "java-maven" });
      }
      if (operation === "run_lint") {
        candidates.push({ command: "mvn", args: ["-q", "-DskipTests", "verify"], source: "java-maven" });
      }
    }

    if (hasAnyFile(project.absolute_path, ["build.gradle", "build.gradle.kts", "settings.gradle", "settings.gradle.kts"])) {
      if (operation === "run_build") {
        candidates.push({ command: "gradle", args: ["build", "-x", "test"], source: "java-gradle" });
      }
      if (operation === "run_test") {
        candidates.push({ command: "gradle", args: ["test"], source: "java-gradle" });
      }
      if (operation === "run_lint") {
        candidates.push({ command: "gradle", args: ["check"], source: "java-gradle" });
      }
    }
  }

  if (tooling.has("php")) {
    if (hasFile(project.absolute_path, "composer.json")) {
      const script = operationToScript(operation);
      candidates.push({ command: "composer", args: ["run", script], source: "php-composer" });
    }

    if (operation === "run_test") {
      candidates.push({ command: "phpunit", args: [], source: "php" });
    }
  }

  if (hasAnyFile(project.absolute_path, ["Makefile", "makefile"])) {
    const target = operationToScript(operation);
    candidates.push({ command: "make", args: [target], source: "make" });
  }

  return dedupeCandidates(candidates);
}

function operationToScript(operation: CommandOperation): "build" | "test" | "lint" {
  if (operation === "run_build") {
    return "build";
  }
  if (operation === "run_test") {
    return "test";
  }
  return "lint";
}

function hasFile(projectRoot: string, relativePath: string): boolean {
  return fs.existsSync(path.join(projectRoot, relativePath));
}

function hasAnyFile(projectRoot: string, relativePaths: string[]): boolean {
  return relativePaths.some((item) => hasFile(projectRoot, item));
}

function dedupeCandidates(candidates: CommandCandidate[]): CommandCandidate[] {
  const seen = new Set<string>();
  const unique: CommandCandidate[] = [];
  for (const candidate of candidates) {
    const key = `${candidate.command}|${candidate.args.join(" ")}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(candidate);
    }
  }
  return unique;
}
