import { AsyncLocalStorage } from "node:async_hooks";

export type AuthRole = "viewer" | "editor" | "admin";

export interface AuthContext {
  apiKeyId: string;
  role: AuthRole;
}

const storage = new AsyncLocalStorage<AuthContext>();

export function runWithAuthContext<T>(context: AuthContext, action: () => Promise<T>): Promise<T> {
  return storage.run(context, action);
}

export function getAuthContext(): AuthContext | undefined {
  return storage.getStore();
}
