export const DEFAULT_BASE_URL = "https://app.santati.com";

/** A single audit log event as stored by Santati. */
export interface AuditLogEvent {
  id: string;
  sink: number;
  sink_name: string;
  action: string;
  actor: string;
  resource: string;
  metadata: Record<string, unknown>;
  occurred_at: string | null;
  received_at: string;
  prev_hash: string;
  hash: string;
}

/** Input for writing a new audit log event (camelCase in the SDK). */
export interface LogEventInput {
  action: string;
  actor?: string;
  resource?: string;
  metadata?: Record<string, unknown>;
  occurredAt?: Date | string;
}

/** Filters for listing audit log events. */
export interface ListEventsFilters {
  sink?: string;
  action?: string;
  actor?: string;
  page?: number;
}

/** DRF paginated response shape. */
export interface PaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface HttpOptions {
  /** Request timeout in milliseconds. Default: 30_000. */
  timeoutMs?: number;
  /** Max retry attempts on 429/5xx. Default: 3. */
  retries?: number;
  /** Override the fetch implementation (for testing or custom runtimes). */
  fetch?: typeof fetch;
}

export interface SantatiWriterOptions extends HttpOptions {
  /** A sink's full ingest URL, or bare token if `baseUrl` is also set. */
  writeKey: string;
  /** Base URL of your Santati instance. Defaults to `https://app.santati.com`. */
  baseUrl?: string;
}

export interface SantatiServerOptions extends HttpOptions {
  /** Audit API key from your team's Audit Log settings page. */
  apiKey: string;
  /** Base URL of your Santati instance. Defaults to `https://app.santati.com`. */
  baseUrl?: string;
}
