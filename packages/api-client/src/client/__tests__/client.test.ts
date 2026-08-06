import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  ApiClient,
  ApiError,
  AUTH_STORAGE_KEY,
  unwrapApiEnvelope,
  writePersistedAuthSnapshot,
} from "@code-proxy/api-client";
import {
  computeManagementApiBase,
  normalizeApiBase,
  REFRESH_TOTAL_BUDGET_MS,
} from "../constants";

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

  test("does not suspend the session for tenant override scope errors", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "tenant_expired", message: "tenant expired" },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    globalThis.fetch = fetchMock;
    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "cps_test" });
    let unauthorizedEvents = 0;
    const onUnauthorized = () => {
      unauthorizedEvents += 1;
    };
    window.addEventListener("unauthorized", onUnauthorized);
    try {
      await expect(client.get("/dashboard-summary")).rejects.toThrow("tenant expired");
      expect(unauthorizedEvents).toBe(0);
      // Session stays active so AuthProvider can drop the override and retry.
      await expect(client.get("/auth-files")).resolves.toEqual({ ok: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
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

  test("setConfig with an empty key leaves the gate shut instead of resuming", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "missing management key" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    );
    globalThis.fetch = fetchMock;

    const client = new ApiClient();
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "old-key" });
    await expect(client.get("/config")).rejects.toThrow("missing management key");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Clearing the credential must not be read as "the suspension is over":
    // an open gate with no key is exactly the state that leaked credential-less
    // requests after logout.
    client.setConfig({ apiBase: "http://localhost:8317", managementKey: "" });
    await expect(client.get("/config")).rejects.toMatchObject({
      status: 0,
      isAuthError: false,
      payload: { code: "auth_not_configured" },
    });
    expect(client.getAuthState()).toBe("anonymous");
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

const API_BASE = "http://localhost:8317";

const jsonResponse = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });

const readStoredAuthRecord = (): Record<string, unknown> | null => {
  for (const storage of [window.sessionStorage, window.localStorage]) {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Record<string, unknown>;
  }
  return null;
};

const countUnauthorized = () => {
  let count = 0;
  const listener = () => {
    count += 1;
  };
  window.addEventListener("unauthorized", listener);
  return {
    get count() {
      return count;
    },
    dispose: () => window.removeEventListener("unauthorized", listener),
  };
};

describe("ApiClient credential gating", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  test("a request with no management key never reaches the network", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const client = new ApiClient();
    client.setConfig({ apiBase: API_BASE, managementKey: "" });
    const unauthorized = countUnauthorized();

    try {
      await expect(client.get("/config")).rejects.toMatchObject({
        status: 0,
        // A false isAuthError is load-bearing: treating this as an auth failure
        // would suspend the gate, which produces the same error forever.
        isAuthError: false,
        payload: { code: "auth_not_configured" },
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(unauthorized.count).toBe(0);
    } finally {
      unauthorized.dispose();
    }
  });

  test("the login endpoint is the one call allowed through an empty gate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ access_token: "a1" }));
    globalThis.fetch = fetchMock;
    const client = new ApiClient();
    client.setConfig({ apiBase: API_BASE, managementKey: "" });

    await client.post("/../auth/login", { username: "u", password: "p" }, { auth: "anonymous" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const headers = new Headers((fetchMock.mock.calls[0]?.[1] as RequestInit).headers);
    expect(headers.get("Authorization")).toBeNull();
  });

  test("streamSSE and downloadToFile are gated too", async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    const client = new ApiClient();
    client.setConfig({ apiBase: API_BASE, managementKey: "" });

    await expect(client.streamSSE("/update/events", () => undefined)).rejects.toMatchObject({
      status: 0,
      isAuthError: false,
    });
    await expect(client.downloadToFile("/logs/export", "logs.txt")).rejects.toMatchObject({
      status: 0,
      isAuthError: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("a suspended session reports itself through the public auth state", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: "nope" }, 401));
    const client = new ApiClient();
    client.setConfig({ apiBase: API_BASE, managementKey: "k" });
    const unauthorized = countUnauthorized();
    try {
      await expect(client.get("/config")).rejects.toThrow();
      expect(client.getAuthState()).toBe("suspended");
      expect(client.isAuthUsable()).toBe(false);
      expect(unauthorized.count).toBe(1);
    } finally {
      unauthorized.dispose();
    }
  });
});

describe("ApiClient token refresh", () => {
  const originalFetch = globalThis.fetch;

  const seedSnapshot = (overrides: Record<string, unknown> = {}) => {
    writePersistedAuthSnapshot({
      apiBase: API_BASE,
      managementKey: "a1",
      refreshToken: "r1",
      rememberPassword: true,
      accountId: "acct-1",
      expiresAtMs: Date.now() + 60_000,
      refreshExpiresAtMs: Date.now() + 3_600_000,
      rotationSeq: 1,
      ...overrides,
    });
  };

  const signedInClient = () => {
    const client = new ApiClient();
    client.setConfig({ apiBase: API_BASE, managementKey: "a1", refreshToken: "r1" });
    return client;
  };

  beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    window.sessionStorage.clear();
    window.localStorage.clear();
  });

  test("a 401 triggers one refresh and one retry with the rotated key", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "a2", refresh_token: "r2" }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    globalThis.fetch = fetchMock;
    const client = signedInClient();

    await expect(client.get("/config")).resolves.toEqual({ ok: true });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(`${API_BASE}/v0/auth/refresh`);
    expect((fetchMock.mock.calls[1]?.[1] as RequestInit).body).toBe(
      JSON.stringify({ refresh_token: "r1" }),
    );
    const retryHeaders = new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer a2");
  });

  test("a rate-limited refresh keeps the session alive", async () => {
    vi.useFakeTimers();
    seedSnapshot();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValue(jsonResponse({ code: "login_rate_limited" }, 429));
    globalThis.fetch = fetchMock;
    const client = signedInClient();
    const unauthorized = countUnauthorized();

    try {
      const settled = client.get("/config").catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(5_000);
      const error = (await settled) as ApiError;

      // Signing out on 429 is the defect this asserts against: the login
      // endpoint is rate-limited too, so a logout locks the user out entirely.
      expect(error.isAuthError).toBe(false);
      expect(error.payload).toMatchObject({ code: "auth_refresh_unavailable" });
      expect(unauthorized.count).toBe(0);
      expect(client.getAuthState()).toBe("active");
      expect(readStoredAuthRecord()).not.toBeNull();
    } finally {
      unauthorized.dispose();
    }
  });

  test("a network failure during refresh keeps the session alive", async () => {
    vi.useFakeTimers();
    seedSnapshot();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockRejectedValue(new TypeError("Failed to fetch"));
    globalThis.fetch = fetchMock;
    const client = signedInClient();
    const unauthorized = countUnauthorized();

    try {
      const settled = client.get("/config").catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(5_000);
      const error = (await settled) as ApiError;

      expect(error.isAuthError).toBe(false);
      expect(error.payload).toMatchObject({ code: "auth_refresh_unavailable" });
      expect(unauthorized.count).toBe(0);
      expect(client.getAuthState()).toBe("active");
      expect(readStoredAuthRecord()).not.toBeNull();
    } finally {
      unauthorized.dispose();
    }
  });

  test("a refresh that never answers times out without ending the session", async () => {
    vi.useFakeTimers();
    seedSnapshot();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockReturnValue(new Promise<Response>(() => undefined));
    globalThis.fetch = fetchMock;
    const client = signedInClient();
    const unauthorized = countUnauthorized();

    try {
      const settled = client.get("/config").catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(REFRESH_TOTAL_BUDGET_MS + 2_000);
      const error = (await settled) as ApiError;

      expect(error.isAuthError).toBe(false);
      expect(error.payload).toMatchObject({ code: "auth_refresh_unavailable" });
      expect(unauthorized.count).toBe(0);
      expect(client.getAuthState()).toBe("active");
      expect(readStoredAuthRecord()).not.toBeNull();
    } finally {
      unauthorized.dispose();
    }
  });

  test("an explicitly rejected grant signs the session out without retrying", async () => {
    seedSnapshot();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValue(jsonResponse({ code: "session_revoked" }, 401));
    globalThis.fetch = fetchMock;
    const client = signedInClient();
    const unauthorized = countUnauthorized();

    try {
      await expect(client.get("/config")).rejects.toMatchObject({ status: 401 });
      expect(unauthorized.count).toBe(1);
      expect(client.getAuthState()).toBe("suspended");
      // invalid is terminal: retrying a rejected grant only burns the budget.
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      unauthorized.dispose();
    }
  });

  test("a legacy key without a refresh token signs out without any refresh call", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ error: "unauthorized" }, 401));
    globalThis.fetch = fetchMock;
    const client = new ApiClient();
    client.setConfig({ apiBase: API_BASE, managementKey: "cps_legacy", refreshToken: "" });
    const unauthorized = countUnauthorized();

    try {
      await expect(client.get("/config")).rejects.toMatchObject({ status: 401 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(unauthorized.count).toBe(1);
    } finally {
      unauthorized.dispose();
    }
  });

  test("streamSSE refreshes and replays the stream request", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"run_id":3,"status":"running"}\n\n'));
        controller.close();
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "a2", refresh_token: "r2" }))
      .mockResolvedValueOnce(
        new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream" } }),
      );
    globalThis.fetch = fetchMock;
    const client = signedInClient();
    const events: Array<{ data: { run_id: number; status: string } }> = [];

    await client.streamSSE<{ run_id: number; status: string }>("/update/events", (event) =>
      events.push(event),
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(events).toHaveLength(1);
    expect(events[0]?.data).toEqual({ run_id: 3, status: "running" });
  });

  test("streamSSE drops a 401 that belongs to a replaced session", async () => {
    const client = signedInClient();
    const fetchMock = vi.fn().mockImplementation(() => {
      // Simulate an account switch landing while the stream request is in flight.
      client.setConfig({ apiBase: API_BASE, managementKey: "a9", refreshToken: "r9" });
      return Promise.resolve(jsonResponse({ code: "session_revoked" }, 401));
    });
    globalThis.fetch = fetchMock;
    const unauthorized = countUnauthorized();

    try {
      await expect(client.streamSSE("/update/events", () => undefined)).rejects.toMatchObject({
        status: 0,
      });
      expect(unauthorized.count).toBe(0);
      expect(client.getAuthState()).toBe("active");
    } finally {
      unauthorized.dispose();
    }
  });

  test("downloadToFile refreshes and replays the download", async () => {
    const clicks = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(clicks);
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock");
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(jsonResponse({ access_token: "a2", refresh_token: "r2" }))
      .mockResolvedValueOnce(
        new Response("payload", {
          status: 200,
          headers: { "Content-Type": "text/plain" },
        }),
      );
    globalThis.fetch = fetchMock;
    const client = signedInClient();

    await client.downloadToFile("/logs/export", "logs.txt");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(clicks).toHaveBeenCalledTimes(1);
    const retryHeaders = new Headers((fetchMock.mock.calls[2]?.[1] as RequestInit).headers);
    expect(retryHeaders.get("Authorization")).toBe("Bearer a2");
  });

  test("a rotation writes the new expiry back into the persisted session", async () => {
    seedSnapshot();
    const expiresAt = new Date(Date.now() + 900_000).toISOString();
    const refreshExpiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "a2",
          refresh_token: "r2",
          expires_at: expiresAt,
          refresh_expires_at: refreshExpiresAt,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await signedInClient().get("/config");

    const record = readStoredAuthRecord();
    expect(record).toMatchObject({
      managementKey: "a2",
      refreshToken: "r2",
      expiresAtMs: Date.parse(expiresAt),
      refreshExpiresAtMs: Date.parse(refreshExpiresAt),
      // Rotation sequence is the only orderable freshness signal across tabs.
      rotationSeq: 2,
    });
  });

  test("a rotation revives a snapshot whose stored expiry already lapsed", async () => {
    // The read path deletes expired records, which is exactly wrong here: the
    // record is expired precisely when the refresh that fixes it just succeeded.
    seedSnapshot({ expiresAtMs: Date.now() - 5_000, refreshExpiresAtMs: Date.now() - 1_000 });
    const refreshExpiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "expired" }, 401))
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "a2",
          refresh_token: "r2",
          expires_at: new Date(Date.now() + 900_000).toISOString(),
          refresh_expires_at: refreshExpiresAt,
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ ok: true }));

    await signedInClient().get("/config");

    const record = readStoredAuthRecord();
    expect(record).not.toBeNull();
    expect(record?.managementKey).toBe("a2");
    expect(record?.refreshExpiresAtMs).toBe(Date.parse(refreshExpiresAt));
    expect(Number(record?.expiresAtMs)).toBeGreaterThan(Date.now());
    expect(record?.rotationSeq).toBe(2);
  });
});
