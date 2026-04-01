import type { AppServices } from "../../main/bootstrap.js";
import { registerProjectTools } from "./project.tools.js";
import { registerFileTools } from "./files.tools.js";
import { registerSearchTools } from "./search.tools.js";
import { registerGitTools } from "./git.tools.js";
import { registerCommandTools } from "./command.tools.js";

export function registerAllTools(server: any, services: AppServices): void {
  registerProjectTools(server, services);
  registerFileTools(server, services);
  registerSearchTools(server, services);
  registerGitTools(server, services);
  registerCommandTools(server, services);
}
