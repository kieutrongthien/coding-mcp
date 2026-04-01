import { describe, expect, it } from "vitest";
import { AuthzService } from "../../src/services/auth/authz.service.js";

describe("AuthzService", () => {
  it("authenticates valid API key", () => {
    const authz = new AuthzService({
      enabled: true,
      headerName: "x-api-key",
      apiKeys: [{ key: "k1", role: "editor", id: "dev-key" }]
    });

    const ctx = authz.authenticateHttpRequest({ "x-api-key": "k1" });
    expect(ctx.role).toBe("editor");
    expect(ctx.apiKeyId).toBe("dev-key");
  });

  it("rejects missing API key when enabled", () => {
    const authz = new AuthzService({
      enabled: true,
      headerName: "x-api-key",
      apiKeys: [{ key: "k1", role: "viewer", id: "view-key" }]
    });

    expect(() => authz.authenticateHttpRequest({})).toThrow();
  });

  it("enforces viewer role restrictions", () => {
    const authz = new AuthzService({
      enabled: true,
      headerName: "x-api-key",
      apiKeys: [{ key: "k1", role: "viewer", id: "view-key" }]
    });

    expect(() => authz.authorizeOperation("read_file", "viewer")).not.toThrow();
    expect(() => authz.authorizeOperation("write_file", "viewer")).toThrow();
  });
});
