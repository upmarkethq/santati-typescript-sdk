/** Thrown when the Santati API returns a non-2xx response. */
export class SantatiApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, options: { status: number; body?: unknown }) {
    super(message);
    this.name = "SantatiApiError";
    this.status = options.status;
    this.body = options.body;
  }
}

/** Thrown when the API returns HTTP 429 and retries are exhausted. */
export class SantatiRateLimitError extends SantatiApiError {
  readonly retryAfterMs: number | undefined;

  constructor(message: string, options: { status: number; body?: unknown; retryAfterMs?: number }) {
    super(message, options);
    this.name = "SantatiRateLimitError";
    this.retryAfterMs = options.retryAfterMs;
  }
}
