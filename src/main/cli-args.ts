export interface CliArgs {
  command: "serve" | "init" | "add" | "remove";
  transport: "http" | "stdio";
  host?: string;
  port?: number;
  mode?: "streamable" | "sse";
  projectsRoots?: string[];
  configPath?: string;
  folder?: string;
}

const COMMANDS = new Set(["serve", "init", "add", "remove"]);

export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

export function parseCliArgs(argv: string[]): CliArgs {
  if (argv.length === 0) {
    return { command: "serve", transport: "http" };
  }

  let command: CliArgs["command"] = "serve";
  let startIndex = 0;

  const first = argv[0];
  if (COMMANDS.has(first)) {
    command = first as CliArgs["command"];
    startIndex = 1;
  } else if (!first.startsWith("-")) {
    throw new CliUsageError(`Unknown command: ${first}`);
  }

  const parsed: CliArgs = { command, transport: "http" };
  const positional: string[] = [];

  for (let i = startIndex; i < argv.length; i += 1) {
    const current = argv[i];

    if (!current.startsWith("-")) {
      positional.push(current);
      continue;
    }

    if (current === "--help" || current === "-h") {
      continue;
    }

    if (current === "--transport") {
      const value = argv[i + 1];
      if (!value) {
        throw new CliUsageError("Missing value for --transport");
      }
      if (value !== "http" && value !== "stdio") {
        throw new CliUsageError(`Invalid value for --transport: ${value}`);
      }
      parsed.transport = value;
      i += 1;
      continue;
    }

    if (current === "--host") {
      const value = argv[i + 1];
      if (!value) {
        throw new CliUsageError("Missing value for --host");
      }
      parsed.host = value;
      i += 1;
      continue;
    }

    if (current === "--port") {
      const value = argv[i + 1];
      if (!value) {
        throw new CliUsageError("Missing value for --port");
      }
      const port = Number(value);
      if (!Number.isInteger(port) || port <= 0) {
        throw new CliUsageError(`Invalid value for --port: ${value}`);
      }
      parsed.port = port;
      i += 1;
      continue;
    }

    if (current === "--mode") {
      const value = argv[i + 1];
      if (!value) {
        throw new CliUsageError("Missing value for --mode");
      }
      if (value !== "streamable" && value !== "sse") {
        throw new CliUsageError(`Invalid value for --mode: ${value}`);
      }
      parsed.mode = value;
      i += 1;
      continue;
    }

    if (current === "--projects-root") {
      const value = argv[i + 1];
      if (!value) {
        throw new CliUsageError("Missing value for --projects-root");
      }
      parsed.projectsRoots = parsed.projectsRoots ?? [];
      parsed.projectsRoots.push(value);
      i += 1;
      continue;
    }

    if (current === "--config") {
      const value = argv[i + 1];
      if (!value) {
        throw new CliUsageError("Missing value for --config");
      }
      parsed.configPath = value;
      i += 1;
      continue;
    }

    throw new CliUsageError(`Unknown option: ${current}`);
  }

  if (command === "serve") {
    if (positional.length > 0) {
      throw new CliUsageError(`Unexpected positional argument(s) for serve: ${positional.join(" ")}`);
    }
    return parsed;
  }

  if (command === "init") {
    if (positional.length > 1) {
      throw new CliUsageError(`Too many arguments for init: ${positional.join(" ")}`);
    }
    parsed.folder = positional[0];
    return parsed;
  }

  if (command === "add" || command === "remove") {
    if (positional.length === 0) {
      throw new CliUsageError(`Missing folder argument for ${command} command`);
    }
    if (positional.length > 1) {
      throw new CliUsageError(`Too many arguments for ${command}: ${positional.join(" ")}`);
    }
    parsed.folder = positional[0];
    return parsed;
  }

  return parsed;
}

export function getCliHelpText(): string {
  return `coding-mcp CLI

Usage:
  coding-mcp serve [options]
  coding-mcp init [folder]
  coding-mcp add <folder>
  coding-mcp remove <folder>

Options:
  --transport <http|stdio>      Transport mode (default: http)
  --host <host>                 HTTP host override
  --port <port>                 HTTP port override
  --mode <streamable|sse>       HTTP MCP mode override
  --projects-root <path>        Add project root (repeatable)
  --config <path>               Path to JSON/YAML config file
  -h, --help                    Show this help
`;
}