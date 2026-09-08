import { SantatiApiError, SantatiRateLimitError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 3;

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  fetch: typeof fetch;
}

function parseRetryAfterMs(header: string | null): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

function backoffMs(attempt: number): number {
  const base = Math.min(1000 * 2 ** attempt, 10_000);
  return base + Math.random() * 250;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function parseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Fetch wrapper with timeout, exponential backoff + jitter on 429/5xx,
 * and Retry-After header support.
 */
export async function request(url: string, options: RequestOptions): Promise<unknown> {
  const {
    method = "GET",
    headers = {},
    body,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    fetch: fetchImpl,
  } = options;

  let lastError: SantatiApiError | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetchImpl(url, {
      method,
      headers,
      body,
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (response.ok) {
      return parseBody(response);
    }

    const responseBody = await parseBody(response);

    if (response.status === 429) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get("Retry-After"));
      if (attempt < retries) {
        await sleep(retryAfterMs ?? backoffMs(attempt));
        continue;
      }
      throw new SantatiRateLimitError(`Santati API rate limit exceeded (HTTP ${response.status})`, {
        status: response.status,
        body: responseBody,
        retryAfterMs,
      });
    }

    if (isRetryable(response.status) && attempt < retries) {
      await sleep(backoffMs(attempt));
      continue;
    }

    lastError = new SantatiApiError(`Santati API request failed with status ${response.status}`, {
      status: response.status,
      body: responseBody,
    });
    break;
  }

  throw lastError ?? new SantatiApiError("Santati API request failed", { status: 0 });
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function isAbsoluteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export function toIsoString(value: Date | string | undefined): string | undefined {
  if (value == null) return undefined;
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function resolveFetch(fetchImpl?: typeof fetch): typeof fetch {
  const resolved = fetchImpl ?? globalThis.fetch;
  if (!resolved) {
    throw new Error(
      "No fetch implementation available. Pass `{ fetch }` explicitly on runtimes without global fetch.",
    );
  }
  return resolved;
}

export function buildQueryString(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value != null) search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}
