import { describe, expect, it } from "vitest";
import { HttpMetrics } from "../../src/core/http-metrics.js";

describe("HttpMetrics", () => {
  it("tracks request count, error count, and latency summary", () => {
    const metrics = new HttpMetrics();

    metrics.recordRequest({ statusCode: 200, durationMs: 20 });
    metrics.recordRequest({ statusCode: 500, durationMs: 100 });
    metrics.recordRequest({ statusCode: 200, durationMs: 40 });

    const snapshot = metrics.snapshot();
    expect(snapshot.request_count).toBe(3);
    expect(snapshot.error_count).toBe(1);
    expect(snapshot.latency_ms.avg).toBeGreaterThan(0);
    expect(snapshot.latency_ms.max).toBe(100);
    expect(snapshot.latency_ms.p95).toBe(100);
  });
});
