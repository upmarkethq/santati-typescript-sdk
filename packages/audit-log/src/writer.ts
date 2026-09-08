import { isAbsoluteUrl, normalizeBaseUrl, request, resolveFetch, toIsoString } from "./http.js";
import type { AuditLogEvent, LogEventInput, SantatiWriterOptions } from "./types.js";
import { DEFAULT_BASE_URL } from "./types.js";

/**
 * Write client for sending audit log events to a configured sink.
 *
 * The sink's secret ingest URL (or token + baseUrl) is the credential — no
 * separate API key is needed to write.
 */
export class Santati {
  private readonly writeKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number | undefined;
  private readonly retries: number | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SantatiWriterOptions) {
    if (!options.writeKey) {
      throw new Error("Santati: `writeKey` is required.");
    }
    this.writeKey = options.writeKey;
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
    this.timeoutMs = options.timeoutMs;
    this.retries = options.retries;
    this.fetchImpl = resolveFetch(options.fetch);
  }

  private ingestUrl(): string {
    if (isAbsoluteUrl(this.writeKey)) {
      return this.writeKey;
    }
    return `${this.baseUrl}/audit-log/ingest/${this.writeKey}/`;
  }

  /**
   * Write a `santati.log` event to your sink.
   *
   * @returns The created, hash-chained event as stored by Santati.
   */
  async log(event: LogEventInput): Promise<AuditLogEvent> {
    if (!event.action) {
      throw new Error(
        "Santati: `action` is required, e.g. santati.log({ action: 'invoice.transferred' }).",
      );
    }

    const body = await request(this.ingestUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: event.action,
        actor: event.actor,
        resource: event.resource,
        metadata: event.metadata,
        occurred_at: toIsoString(event.occurredAt),
      }),
      timeoutMs: this.timeoutMs,
      retries: this.retries,
      fetch: this.fetchImpl,
    });

    return body as AuditLogEvent;
  }
}
