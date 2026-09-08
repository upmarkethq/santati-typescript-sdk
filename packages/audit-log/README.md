# @santati/audit-log

Write and read [Santati](https://santati.com) audit log events. Zero runtime dependencies — uses the global `fetch` API (Node 20+, edge runtimes, browsers).

## Install

```bash
pnpm add @santati/audit-log
# or
npm install @santati/audit-log
```

## Writing events

Create a sink from your team's **Audit Log Sinks** dashboard — it generates a unique, secret ingest URL. That URL (or its token + your instance's base URL) is your `writeKey`. Anyone holding it can write events, so treat it as a secret.

```typescript
import { Santati } from "@santati/audit-log";

const santati = new Santati({
  writeKey: process.env.SANTATI_WRITE_KEY!, // full ingest URL from dashboard
});

await santati.log({
  action: "invoice.transferred",
  actor: user.id,
  resource: invoice.id,
  metadata: { amount: invoice.amount },
});
```

If you only have the bare token:

```typescript
const santati = new Santati({
  writeKey: process.env.SANTATI_SINK_TOKEN!,
  baseUrl: "https://app.santati.com",
});
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `writeKey` | — | Full ingest URL or bare token (required) |
| `baseUrl` | `https://app.santati.com` | Santati instance URL |
| `timeoutMs` | `30000` | Request timeout |
| `retries` | `3` | Retries on 429/5xx with backoff |
| `fetch` | `globalThis.fetch` | Custom fetch implementation |

## Reading events (server-side)

Import from `@santati/audit-log/server` to keep API keys out of browser bundles. Requires an Audit API key from your team's Audit Log settings page.

```typescript
import { SantatiServer } from "@santati/audit-log/server";

const server = new SantatiServer({
  apiKey: process.env.SANTATI_API_KEY!,
  baseUrl: "https://app.santati.com",
});

// One page
const page = await server.listEvents({ action: "invoice.transferred" });
console.log(page.results);

// Single event
const event = await server.getEvent("evt_abc123");

// Walk all pages
for await (const event of server.iterateEvents({ sink: "1" })) {
  console.log(event.action, event.received_at);
}
```

## Errors

Failed requests throw typed errors:

```typescript
import { Santati, SantatiApiError, SantatiRateLimitError } from "@santati/audit-log";

try {
  await santati.log({ action: "invoice.transferred" });
} catch (error) {
  if (error instanceof SantatiRateLimitError) {
    console.error("Rate limited, retry after", error.retryAfterMs, "ms");
  } else if (error instanceof SantatiApiError) {
    console.error("API error", error.status, error.body);
  }
}
```

## Development

```bash
pnpm test
pnpm build
```
