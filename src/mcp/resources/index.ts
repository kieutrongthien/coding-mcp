import type { AppServices } from "../../main/bootstrap.js";
import { registerProjectResources } from "./project.resources.js";

export function registerAllResources(server: any, services: AppServices): void {
  registerProjectResources(server, services);
}
