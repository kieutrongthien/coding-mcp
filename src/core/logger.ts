import pino from "pino";

export interface LoggerOptions {
  level: string;
  serviceName?: string;
}

export function createLogger(options: LoggerOptions) {
  return pino({
    level: options.level,
    name: options.serviceName ?? "coding-mcp",
    formatters: {
      level(label) {
        return { level: label };
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
