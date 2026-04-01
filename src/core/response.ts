import { asAppError } from "./errors.js";
import type { FailureResponse, OperationResponse, RequestContext, SuccessResponse } from "./types.js";

export function success<T>(context: RequestContext, data: T, warnings: string[] = []): SuccessResponse<T> {
  return {
    ok: true,
    operation: context.operation,
    project_id: context.projectId,
    data,
    warnings,
    errors: [],
    request_id: context.requestId,
    duration_ms: Date.now() - context.startedAt
  };
}

export function failure(context: RequestContext, error: unknown): FailureResponse {
  const appError = asAppError(error);

  return {
    ok: false,
    operation: context.operation,
    error_code: appError.code,
    message: appError.message,
    details: appError.details as Record<string, never> | undefined,
    request_id: context.requestId,
    duration_ms: Date.now() - context.startedAt
  };
}

export async function safeExecute<T>(
  context: RequestContext,
  action: () => Promise<T>
): Promise<OperationResponse<T>> {
  try {
    const data = await action();
    return success(context, data);
  } catch (error) {
    return failure(context, error);
  }
}
