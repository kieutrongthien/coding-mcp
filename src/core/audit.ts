import fs from "node:fs";
import path from "node:path";
import type { AppLogger } from "./logger.js";

export interface AuditEvent {
  timestamp: string;
  request_id: string;
  project_id?: string;
  operation: string;
  actor: string;
  details?: Record<string, unknown>;
}

export class AuditLogger {
  constructor(
    private readonly auditLogFile: string,
    private readonly logger: AppLogger
  ) {
    ensureParentDir(this.auditLogFile);
  }

  append(event: AuditEvent): void {
    const line = JSON.stringify(event);
    fs.appendFileSync(this.auditLogFile, `${line}\n`, "utf8");
    this.logger.info({ event }, "Audit event recorded");
  }
}

function ensureParentDir(filePath: string): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}
