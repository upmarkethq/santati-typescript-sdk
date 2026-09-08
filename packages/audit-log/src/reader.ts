import { buildQueryString, normalizeBaseUrl, request, resolveFetch } from "./http.js";
import type {
  AuditLogEvent,
  ListEventsFilters,
  PaginatedResponse,
  SantatiServerOptions,
} from "./types.js";
import { DEFAULT_BASE_URL } from "./types.js";

/**
 * Server-side read client for fetching audit log events with an API key.
 *
 * Import from `@santati/audit-log/server` to keep API keys out of browser bundles.
 */
export class SantatiServer {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number | undefined;
  private readonly retries: number | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SantatiServerOptions) {
    if (!options.apiKey) {
      throw new Error("SantatiServer: `apiKey` is required.");
    }
    this.apiKey = options.apiKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.timeoutMs = options.timeoutMs;
    this.retries = options.retries;
    this.fetchImpl = resolveFetch(options.fetch);
  }

  private eventsUrl(filters?: ListEventsFilters): string {
    const query = buildQueryString({
      sink: filters?.sink,
      action: filters?.action,
      actor: filters?.actor,
      page: filters?.page,
    });
    return `${this.baseUrl}/audit-log/api/events/${query}`;
  }

  private authHeaders(): Record<string, string> {
    return { Authorization: `Api-Key ${this.apiKey}` };
  }

  /** List events with optional filters. Returns one page of DRF-paginated results. */
  async listEvents(filters?: ListEventsFilters): Promise<PaginatedResponse<AuditLogEvent>> {
    const body = await request(this.eventsUrl(filters), {
      headers: this.authHeaders(),
      timeoutMs: this.timeoutMs,
      retries: this.retries,
      fetch: this.fetchImpl,
    });
    return body as PaginatedResponse<AuditLogEvent>;
  }

  /** Fetch a single event by id. */
  async getEvent(id: string): Promise<AuditLogEvent> {
    const body = await request(`${this.baseUrl}/audit-log/api/events/${id}/`, {
      headers: this.authHeaders(),
      timeoutMs: this.timeoutMs,
      retries: this.retries,
      fetch: this.fetchImpl,
    });
    return body as AuditLogEvent;
  }

  /**
   * Async generator that walks all pages of matching events.
   * Yields each event individually — useful for export or batch processing.
   */
  async *iterateEvents(
    filters?: Omit<ListEventsFilters, "page">,
  ): AsyncGenerator<AuditLogEvent, void, undefined> {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await this.listEvents({ ...filters, page });
      for (const event of response.results) {
        yield event;
      }
      hasMore = response.next != null;
      page += 1;
    }
  }
}
