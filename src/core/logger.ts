import pino from "pino";

export interface LoggerOptions {
  level: string;
  serviceName?: string;
}

export function createLogger(options: LoggerOptions) {
  const baseOptions: pino.LoggerOptions = {
    level: options.level,
    name: options.serviceName ?? "coding-mcp",
    formatters: {
      level(label) {
        return { level: label };
      }
    },
    timestamp: pino.stdTimeFunctions.isoTime
  };

  const forceJsonLogs = process.env.LOG_FORMAT?.toLowerCase() === "json";
  const showTime = process.env.LOG_SHOW_TIME
    ? ["1", "true", "yes", "on"].includes(process.env.LOG_SHOW_TIME.toLowerCase())
    : process.env.NODE_ENV !== "development";
  const ignoreFields = showTime ? "pid,hostname" : "time,pid,hostname";

  const prettyTransport =
    process.stdout.isTTY && !forceJsonLogs
      ? pino.transport({
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: ignoreFields,
            levelFirst: true,
            singleLine: true,
            messageFormat: "{msg}"
          }
        })
      : undefined;

  return pino(baseOptions, prettyTransport);
}

export type AppLogger = ReturnType<typeof createLogger>;
