import { SpanStatusCode, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { Resource } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import type { AppLogger } from "./logger.js";

export interface TelemetryConfig {
  enabled: boolean;
  serviceName: string;
  endpoint: string;
  headers: Record<string, string>;
}

export interface TelemetryService {
  runInSpan<T>(name: string, attributes: Record<string, string | number | boolean>, action: () => Promise<T>): Promise<T>;
}

export function createTelemetryService(config: TelemetryConfig, logger: AppLogger): TelemetryService {
  if (!config.enabled) {
    return {
      async runInSpan<T>(_name: string, _attributes: Record<string, string | number | boolean>, action: () => Promise<T>) {
        return await action();
      }
    };
  }

  const provider = new NodeTracerProvider({
    resource: new Resource({
      "service.name": config.serviceName
    })
  });

  const exporter = new OTLPTraceExporter({
    url: config.endpoint,
    headers: config.headers
  });

  provider.addSpanProcessor(new BatchSpanProcessor(exporter));
  provider.register();

  const tracer = trace.getTracer(config.serviceName);
  logger.info({ endpoint: config.endpoint, service: config.serviceName }, "OpenTelemetry tracing enabled");

  return {
    async runInSpan<T>(name: string, attributes: Record<string, string | number | boolean>, action: () => Promise<T>) {
      return await tracer.startActiveSpan(name, async (span) => {
        try {
          for (const [key, value] of Object.entries(attributes)) {
            span.setAttribute(key, value);
          }

          const result = await action();
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.recordException(error as Error);
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : "Unknown error"
          });
          throw error;
        } finally {
          span.end();
        }
      });
    }
  };
}
