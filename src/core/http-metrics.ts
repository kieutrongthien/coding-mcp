export interface HttpRequestMetricInput {
  statusCode: number;
  durationMs: number;
}

export interface HttpMetricsSnapshot {
  request_count: number;
  error_count: number;
  latency_ms: {
    avg: number;
    p95: number;
    max: number;
  };
}

export class HttpMetrics {
  private requestCount = 0;
  private errorCount = 0;
  private totalLatencyMs = 0;
  private maxLatencyMs = 0;
  private readonly recentLatencies: number[] = [];
  private readonly maxRecentEntries = 2048;

  recordRequest(input: HttpRequestMetricInput): void {
    this.requestCount += 1;
    this.totalLatencyMs += input.durationMs;
    this.maxLatencyMs = Math.max(this.maxLatencyMs, input.durationMs);

    if (input.statusCode >= 500) {
      this.errorCount += 1;
    }

    this.recentLatencies.push(input.durationMs);
    if (this.recentLatencies.length > this.maxRecentEntries) {
      this.recentLatencies.shift();
    }
  }

  snapshot(): HttpMetricsSnapshot {
    const avg = this.requestCount > 0 ? this.totalLatencyMs / this.requestCount : 0;
    const p95 = calculateP95(this.recentLatencies);

    return {
      request_count: this.requestCount,
      error_count: this.errorCount,
      latency_ms: {
        avg: Number(avg.toFixed(2)),
        p95,
        max: this.maxLatencyMs
      }
    };
  }
}

function calculateP95(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil(0.95 * sorted.length) - 1;
  return sorted[Math.max(index, 0)] ?? 0;
}
