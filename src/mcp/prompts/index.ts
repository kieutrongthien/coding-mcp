import type { AppServices } from "../../main/bootstrap.js";
import { registerWorkflowPrompts } from "./workflow.prompts.js";

export function registerAllPrompts(server: any, services: AppServices): void {
  registerWorkflowPrompts(server, services);
}
