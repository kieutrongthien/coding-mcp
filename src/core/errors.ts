export class AppError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("VALIDATION_ERROR", message, details);
    this.name = "ValidationError";
  }
}

export class SecurityError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("SECURITY_ERROR", message, details);
    this.name = "SecurityError";
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("NOT_FOUND", message, details);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: Record<string, unknown>) {
    super("CONFLICT", message, details);
    this.name = "ConflictError";
  }
}

export function asAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError("INTERNAL_ERROR", error.message);
  }

  return new AppError("INTERNAL_ERROR", "Unknown failure");
}
