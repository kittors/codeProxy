import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ApiClient } from "@code-proxy/api-client";

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
});
