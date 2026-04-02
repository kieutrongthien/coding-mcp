import type { IncomingHttpHeaders } from "node:http";
import { SecurityError } from "../../core/errors.js";
import type { AuthContext, AuthRole } from "./auth-context.js";

export interface ApiKeyBinding {
  key: string;
  role: AuthRole;
  id: string;
}

export interface AuthzOptions {
  enabled: boolean;
  headerName: string;
  apiKeys: ApiKeyBinding[];
}

const viewerOperations = new Set<string>([
  "list_projects",
  "get_project",
  "list_directory",
  "read_file",
  "read_multiple_files",
  "search_files",
  "grep_content",
  "get_project_tree",
  "summarize_project",
  "git_status",
  "git_diff",
  "git_branch_list",
  "git_log",
  "git_show"
]);

const editorOperations = new Set<string>([
  ...viewerOperations,
  "create_file",
  "write_file",
  "replace_in_file",
  "apply_patch",
  "move_file",
  "run_build",
  "run_test",
  "run_lint",
  "run_command_safe",
  "git_checkout_new_branch",
  "git_checkout_branch",
  "git_pull",
  "git_add",
  "git_commit",
  "git_push",
  "git_create_tag",
  "refresh_project_index"
]);

export class AuthzService {
  private readonly keyMap = new Map<string, ApiKeyBinding>();

  constructor(private readonly options: AuthzOptions) {
    for (const binding of options.apiKeys) {
      this.keyMap.set(binding.key, binding);
    }
  }

  get enabled(): boolean {
    return this.options.enabled;
  }

  authenticateHttpRequest(headers: IncomingHttpHeaders): AuthContext {
    if (!this.options.enabled) {
      return { apiKeyId: "anonymous", role: "admin" };
    }

    // Support OAuth 2.0 Bearer token (RFC 6750) in addition to the custom header.
    // The access_token issued by /oauth/token is the API key itself.
    const authorization = headers["authorization"];
    const authValue = Array.isArray(authorization) ? authorization[0] : authorization;
    if (authValue && authValue.toLowerCase().startsWith("bearer ")) {
      const bearerKey = authValue.slice(7).trim();
      const bearerBinding = this.keyMap.get(bearerKey);
      if (!bearerBinding) {
        throw new SecurityError("Invalid Bearer token", {});
      }
      return { apiKeyId: bearerBinding.id, role: bearerBinding.role };
    }

    const headerLookup = this.options.headerName.toLowerCase();
    const apiKey = headers[headerLookup] ?? headers[this.options.headerName];
    const value = Array.isArray(apiKey) ? apiKey[0] : apiKey;

    if (!value) {
      throw new SecurityError("Missing API key for HTTP request", {
        header: this.options.headerName
      });
    }

    const binding = this.keyMap.get(value);
    if (!binding) {
      throw new SecurityError("Invalid API key", {
        header: this.options.headerName
      });
    }

    return {
      apiKeyId: binding.id,
      role: binding.role
    };
  }

  /**
   * Validates an API key and returns its binding, or null if invalid.
   * Used by the OAuth token endpoint.
   */
  lookupApiKey(key: string): ApiKeyBinding | null {
    return this.keyMap.get(key) ?? null;
  }

  authorizeOperation(operation: string, role: AuthRole): void {
    if (!this.options.enabled) {
      return;
    }

    if (role === "admin") {
      return;
    }

    if (role === "editor") {
      if (editorOperations.has(operation)) {
        return;
      }
      throw new SecurityError("Operation forbidden for role", { operation, role });
    }

    if (role === "viewer") {
      if (viewerOperations.has(operation)) {
        return;
      }
      throw new SecurityError("Operation forbidden for role", { operation, role });
    }
  }
}
