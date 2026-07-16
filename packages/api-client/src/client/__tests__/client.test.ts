import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiClient, ApiError, unwrapApiEnvelope } from "@code-proxy/api-client";
import { computeManagementApiBase, normalizeApiBase } from "../constants";

describe("API base normalization", () => {
  test("normalizes full management panel URLs back to the service root", () => {
    expect(normalizeApiBase("https://relay.example.com/manage/ccswitch-import-settings")).toBe(
      "https://relay.example.com",
    );
    expect(normalizeApiBase("https://relay.example.com/manage/login?next=/config#section")).toBe(
      "https://relay.example.com",
    );
    expect(computeManagementApiBase("https://relay.example.com/manage")).toBe(
      "https://relay.example.com/v0/management",
    );
  });

  test("preserves deployment prefixes before the management panel path", () => {
    expect(normalizeApiBase("https://example.com/relay/manage/ccswitch-import-settings")).toBe(
      "https://example.com/relay",
    );
    expect(computeManagementApiBase("https://example.com/relay/v0/management/config")).toBe(
      "https://example.com/relay/v0/management",
    );
  });

  test("defaults scheme-less remote hosts to https and loopback to http", () => {
    expect(normalizeApiBase("relay.example.com")).toBe("https://relay.example.com");
    expect(normalizeApiBase("relay.example.com/manage/login")).toBe("https://relay.example.com");
    expect(normalizeApiBase("localhost:8317")).toBe("http://localhost:8317");
    expect(normalizeApiBase("127.0.0.1:8317")).toBe("http://127.0.0.1:8317");
    expect(normalizeApiBase("[::1]:8317")).toBe("http://[::1]:8317");
    // Explicit remote http is preserved for controlled intranet use.
    expect(normalizeApiBase("http://relay.example.com")).toBe("http://relay.example.com");
  });
});

describe("ApiClient request standardization", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("unwraps standardized API envelopes when data helpers are used", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ code: 0, data: { enabled: true } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "test-key" });

    await expect(client.getData("/config")).resolves.toEqual({ enabled: true });
    expect(unwrapApiEnvelope<{ ok: boolean }>({ result: { ok: true } })).toEqual({ ok: true });
  });

  test("keeps management Authorization controlled by the configured key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "expected-key" });
    await client.get("/config", {
      headers: {
        Authorization: "Bearer stale-key",
        "X-Request-Source": "unit-test",
      },
    });

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer expected-key");
    expect(headers.get("X-Request-Source")).toBe("unit-test");
  });

  test("parses authenticated JSON server-sent events", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(": keep-alive\n\nid: 7\nevent: update\n"));
        controller.enqueue(encoder.encode('data: {"run_id":3,"status":"running"}\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(stream, {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "test-key" });
    const events: Array<{
      id?: string;
      event?: string;
      data: { run_id: number; status: string };
    }> = [];
    await client.streamSSE<{ run_id: number; status: string }>("/update/events", (event) =>
      events.push(event),
    );

    expect(events).toEqual([
      {
        id: "7",
        event: "update",
        data: { run_id: 3, status: "running" },
      },
    ]);
    const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const headers = new Headers(requestInit?.headers);
    expect(headers.get("Authorization")).toBe("Bearer test-key");
    expect(headers.get("Accept")).toBe("text/event-stream");
  });

  test("rejects absolute request paths before they can be fetched", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "test-key" });

    await expect(client.get("https://evil.example/config")).rejects.toThrow(
      "Management API paths must be relative",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("surfaces HTTP metadata through ApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: "bad request" }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "test-key" });

    await expect(client.get("/config")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      statusText: "Bad Request",
      isAuthError: false,
    } satisfies Partial<ApiError>);
  });

  test("sanitizes HTML error pages returned by upstream proxies", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<!doctype html><html><head><title>502 Bad Gateway</title></head></html>", {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "test-key" });

    await expect(client.get("/dashboard-summary")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "Management API temporarily returned an HTML error page (502 Bad Gateway).",
      payload: expect.stringContaining("<!doctype html>"),
    } satisfies Partial<ApiError>);
  });
});

describe("ApiClient authentication failure handling", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("dispatches unauthorized and suppresses later fetches after management IP ban", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "IP banned due to too many failed attempts. Try again in 30m0s",
        }),
        {
          status: 403,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({
      apiBase: "http://localhost:8317",
      managementKey: "stale-key",
    });

    let unauthorizedEvents = 0;
    const onUnauthorized = () => {
      unauthorizedEvents += 1;
    };
    window.addEventListener("unauthorized", onUnauthorized);

    try {
      await expect(client.get("/api-keys")).rejects.toThrow(
        "IP banned due to too many failed attempts",
      );
      expect(unauthorizedEvents).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      await expect(client.get("/auth-files")).rejects.toThrow(
        "Management session is no longer valid",
      );
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener("unauthorized", onUnauthorized);
    }
  });

  test("suspends an expired tenant session and exposes the server error code", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "tenant_expired", message: "tenant expired" },
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      ),
    );
    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "cps_test" });
    let code = "";
    const onUnauthorized = (event: Event) => {
      code = (event as CustomEvent<{ code?: string }>).detail?.code ?? "";
    };
    window.addEventListener("unauthorized", onUnauthorized);
    try {
      await expect(client.get("/dashboard-summary")).rejects.toThrow("tenant expired");
      expect(code).toBe("tenant_expired");
      await expect(client.get("/auth-files")).rejects.toThrow(
        "Management session is no longer valid",
      );
    } finally {
      window.removeEventListener("unauthorized", onUnauthorized);
    }
  });

  test("setConfig resumes requests after an authentication suspension", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "missing management key" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({
      apiBase: "http://localhost:8317",
      managementKey: "old-key",
    });

    await expect(client.get("/config")).rejects.toThrow("missing management key");
    await expect(client.get("/config")).rejects.toThrow("Management session is no longer valid");

    client.setConfig({
      apiBase: "http://localhost:8317",
      managementKey: "new-key",
    });

    await expect(client.get("/config")).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("rejects management panel HTML returned from a misconfigured API base", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("<!doctype html><html><body>panel</body></html>", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({
      apiBase: "http://localhost:8317",
      managementKey: "test-key",
    });

    await expect(client.get("/config")).rejects.toThrow("web panel HTML instead of JSON");
  });
});
