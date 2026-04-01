export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
}

export async function retryWithBackoff<T>(
  action: () => Promise<T>,
  shouldRetry: (error: unknown) => boolean,
  options: RetryOptions
): Promise<T> {
  let attempt = 0;

  for (;;) {
    attempt += 1;
    try {
      return await action();
    } catch (error) {
      if (attempt >= options.maxAttempts || !shouldRetry(error)) {
        throw error;
      }

      const delayMs = options.baseDelayMs * Math.pow(2, attempt - 1);
      await sleep(delayMs);
    }
  }
}

export function isTransientError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const message = String((error as { message?: unknown }).message ?? "").toLowerCase();
  const code = String((error as { code?: unknown }).code ?? "").toUpperCase();

  const transientCodes = new Set(["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND"]);
  if (transientCodes.has(code)) {
    return true;
  }

  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("connection reset") ||
    message.includes("temporarily unavailable") ||
    message.includes("network")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
