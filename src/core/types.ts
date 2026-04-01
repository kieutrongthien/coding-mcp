export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface SuccessResponse<T = Record<string, JsonValue>> {
  ok: true;
  project_id?: string;
  operation: string;
  data: T;
  warnings: string[];
  errors: string[];
  request_id?: string;
  duration_ms?: number;
}

export interface FailureResponse {
  ok: false;
  operation: string;
  error_code: string;
  message: string;
  details?: Record<string, JsonValue>;
  request_id?: string;
  duration_ms?: number;
}

export type OperationResponse<T = Record<string, JsonValue>> = SuccessResponse<T> | FailureResponse;

export interface RequestContext {
  requestId: string;
  startedAt: number;
  operation: string;
  projectId?: string;
}

export interface CommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  absolute_path: string;
  detected_git_repo: boolean;
  default_branch?: string;
  package_manager?: string;
  last_scan_time: string;
  detected_tooling: string[];
  repo_health: {
    clean: boolean | null;
    ahead: number | null;
    behind: number | null;
  };
}

export interface ListProjectsData {
  projects: ProjectMetadata[];
}
