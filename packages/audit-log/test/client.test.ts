import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { SantatiApiError, SantatiRateLimitError } from "../src/errors.js";
import { SantatiServer } from "../src/reader.js";
import { Santati } from "../src/writer.js";

const BASE = "http://localhost:9999";

const sampleEvent = {
  id: "evt_1",
  sink: 1,
  sink_name: "Production",
  action: "invoice.transferred",
  actor: "user_1",
  resource: "inv_1",
  metadata: {},
  occurred_at: null,
  received_at: "2026-09-08T00:00:00Z",
  prev_hash: "0".repeat(64),
  hash: "a".repeat(64),
};

let ingestAttempts = 0;

const server = setupServer(
  http.post(`${BASE}/audit-log/ingest/good-token/`, async ({ request }) => {
    ingestAttempts += 1;
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json({ ...sampleEvent, action: body.action as string }, { status: 201 });
  }),

  http.post(`${BASE}/audit-log/ingest/bad-token/`, () => {
    return HttpResponse.json({ detail: "Not found." }, { status: 404 });
  }),

  http.post(`${BASE}/audit-log/ingest/rate-limited/`, () => {
    ingestAttempts += 1;
    if (ingestAttempts < 3) {
      return HttpResponse.json(
        { detail: "Too many requests." },
        {
          status: 429,
          headers: { "Retry-After": "0" },
        },
      );
    }
    return HttpResponse.json(sampleEvent, { status: 201 });
  }),

  http.get(`${BASE}/audit-log/api/events/`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (auth !== "Api-Key good-api-key") {
      return HttpResponse.json({ detail: "Forbidden." }, { status: 403 });
    }
    const url = new URL(request.url);
    const action = url.searchParams.get("action");
    const page = url.searchParams.get("page") ?? "1";

    if (page === "1") {
      const results =
        action === "invoice.paid" ? [{ ...sampleEvent, action: "invoice.paid" }] : [sampleEvent];
      return HttpResponse.json({
        count: 2,
        next: `${BASE}/audit-log/api/events/?page=2`,
        previous: null,
        results,
      });
    }

    return HttpResponse.json({
      count: 2,
      next: null,
      previous: `${BASE}/audit-log/api/events/?page=1`,
      results: [{ ...sampleEvent, id: "evt_2", action: "invoice.paid" }],
    });
  }),

  http.get(`${BASE}/audit-log/api/events/evt_1/`, ({ request }) => {
    const auth = request.headers.get("Authorization");
    if (auth !== "Api-Key good-api-key") {
      return HttpResponse.json({ detail: "Forbidden." }, { status: 403 });
    }
    return HttpResponse.json(sampleEvent);
  }),
);

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  server.resetHandlers();
  ingestAttempts = 0;
});
afterAll(() => server.close());

describe("Santati (write client)", () => {
  it("posts events using a bare token + baseUrl", async () => {
    const santati = new Santati({ writeKey: "good-token", baseUrl: BASE });
    const event = await santati.log({
      action: "invoice.transferred",
      actor: "user_1",
      resource: "inv_1",
    });
    expect(event.action).toBe("invoice.transferred");
  });

  it("accepts a full ingest URL as writeKey", async () => {
    const santati = new Santati({ writeKey: `${BASE}/audit-log/ingest/good-token/` });
    const event = await santati.log({ action: "invoice.transferred" });
    expect(event.action).toBe("invoice.transferred");
  });

  it("serializes occurredAt as ISO string on the wire", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    server.use(
      http.post(`${BASE}/audit-log/ingest/good-token/`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(sampleEvent, { status: 201 });
      }),
    );

    const santati = new Santati({ writeKey: "good-token", baseUrl: BASE });
    await santati.log({
      action: "invoice.paid",
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    expect(capturedBody?.occurred_at).toBe("2026-01-01T00:00:00.000Z");
  });

  it("requires action", async () => {
    const santati = new Santati({ writeKey: "good-token", baseUrl: BASE });
    await expect(santati.log({ action: "" })).rejects.toThrow(/`action` is required/);
  });

  it("requires writeKey in constructor", () => {
    expect(() => new Santati({ writeKey: "" })).toThrow(/`writeKey` is required/);
  });

  it("throws SantatiApiError on failed write", async () => {
    const santati = new Santati({ writeKey: "bad-token", baseUrl: BASE, retries: 0 });
    await expect(santati.log({ action: "x" })).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(SantatiApiError);
      expect((error as SantatiApiError).status).toBe(404);
      return true;
    });
  });

  it("retries on 429 and succeeds", async () => {
    const santati = new Santati({ writeKey: "rate-limited", baseUrl: BASE, retries: 3 });
    const event = await santati.log({ action: "invoice.transferred" });
    expect(event.id).toBe("evt_1");
    expect(ingestAttempts).toBe(3);
  });

  it("throws SantatiRateLimitError when retries exhausted", async () => {
    server.use(
      http.post(`${BASE}/audit-log/ingest/always-limited/`, () =>
        HttpResponse.json(
          { detail: "Too many requests." },
          {
            status: 429,
            headers: { "Retry-After": "2" },
          },
        ),
      ),
    );
    const santati = new Santati({ writeKey: "always-limited", baseUrl: BASE, retries: 0 });
    await expect(santati.log({ action: "x" })).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(SantatiRateLimitError);
      expect((error as SantatiRateLimitError).retryAfterMs).toBe(2000);
      return true;
    });
  });
});

describe("SantatiServer (read client)", () => {
  it("lists events with an API key", async () => {
    const client = new SantatiServer({ apiKey: "good-api-key", baseUrl: BASE });
    const page = await client.listEvents();
    expect(page.results).toHaveLength(1);
    expect(page.results[0]?.action).toBe("invoice.transferred");
  });

  it("filters by action", async () => {
    const client = new SantatiServer({ apiKey: "good-api-key", baseUrl: BASE });
    const page = await client.listEvents({ action: "invoice.paid" });
    expect(page.results[0]?.action).toBe("invoice.paid");
  });

  it("fetches a single event by id", async () => {
    const client = new SantatiServer({ apiKey: "good-api-key", baseUrl: BASE });
    const event = await client.getEvent("evt_1");
    expect(event.id).toBe("evt_1");
  });

  it("requires apiKey in constructor", () => {
    expect(() => new SantatiServer({ apiKey: "" })).toThrow(/`apiKey` is required/);
  });

  it("rejects invalid API key", async () => {
    const client = new SantatiServer({ apiKey: "wrong-key", baseUrl: BASE, retries: 0 });
    await expect(client.listEvents()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(SantatiApiError);
      expect((error as SantatiApiError).status).toBe(403);
      return true;
    });
  });

  it("iterateEvents walks all pages", async () => {
    const client = new SantatiServer({ apiKey: "good-api-key", baseUrl: BASE });
    const events = [];
    for await (const event of client.iterateEvents()) {
      events.push(event);
    }
    expect(events).toHaveLength(2);
    expect(events.map((e) => e.id)).toEqual(["evt_1", "evt_2"]);
  });
});
