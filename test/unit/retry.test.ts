import { describe, expect, it } from "vitest";
import { isTransientError, retryWithBackoff } from "../../src/core/retry.js";

describe("retryWithBackoff", () => {
  it("retries transient errors until success", async () => {
    let attempts = 0;

    const result = await retryWithBackoff(
      async () => {
        attempts += 1;
        if (attempts < 2) {
          const error = new Error("network timeout");
          (error as Error & { code?: string }).code = "ETIMEDOUT";
          throw error;
        }
        return "ok";
      },
      isTransientError,
      { maxAttempts: 3, baseDelayMs: 1 }
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
  });

  it("does not retry non-transient errors", async () => {
    let attempts = 0;

    await expect(
      retryWithBackoff(
        async () => {
          attempts += 1;
          throw new Error("validation failed");
        },
        isTransientError,
        { maxAttempts: 3, baseDelayMs: 1 }
      )
    ).rejects.toThrow("validation failed");

    expect(attempts).toBe(1);
  });
});
