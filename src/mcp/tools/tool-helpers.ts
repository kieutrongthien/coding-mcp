import type { AppServices } from "../../main/bootstrap.js";
import { safeExecute } from "../../core/response.js";
import type { OperationResponse } from "../../core/types.js";
import { getAuthContext } from "../../services/auth/auth-context.js";

export function encodeToolResult(response: OperationResponse<Record<string, unknown>>) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(response, null, 2)
      }
    ],
    structuredContent: response
  };
}

export async function executeOperation(
  services: AppServices,
  operation: string,
  action: () => Promise<Record<string, unknown>>,
  projectId?: string
) {
  const context = services.createContext(operation, projectId);
  const response = await safeExecute(context, async () => {
    const authContext = getAuthContext();
    if (services.authz.enabled && authContext) {
      services.authz.authorizeOperation(operation, authContext.role);
    }

    return await action();
  });
  return encodeToolResult(response);
}
