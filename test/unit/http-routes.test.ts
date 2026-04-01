import { describe, expect, it } from "vitest";
import { isSseMessagePath } from "../../src/main/http-routes.js";

describe("http route helpers", () => {
  it("matches legacy and current SSE message endpoints", () => {
    expect(isSseMessagePath("POST", "/sse")).toBe(true);
    expect(isSseMessagePath("POST", "/messages")).toBe(true);
  });

  it("rejects non-message paths and methods", () => {
    expect(isSseMessagePath("GET", "/sse")).toBe(false);
    expect(isSseMessagePath("POST", "/metrics")).toBe(false);
  });
});
