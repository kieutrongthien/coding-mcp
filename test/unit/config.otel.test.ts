import { describe, expect, it } from "vitest";
import { loadConfig } from "../../src/config/load-config.js";

describe("OpenTelemetry config parsing", () => {
  it("parses OTEL headers from env", () => {
    process.env.PROJECTS_ROOTS = process.cwd();
    process.env.ENABLE_OTEL = "true";
    process.env.OTEL_SERVICE_NAME = "test-service";
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318/v1/traces";
    process.env.OTEL_EXPORTER_OTLP_HEADERS = "authorization=Bearer token,x-api-key=abc";

    const config = loadConfig();
    expect(config.enableOtel).toBe(true);
    expect(config.otelServiceName).toBe("test-service");
    expect(config.otelExporterOtlpHeaders.authorization).toBe("Bearer token");
    expect(config.otelExporterOtlpHeaders["x-api-key"]).toBe("abc");
  });
});
