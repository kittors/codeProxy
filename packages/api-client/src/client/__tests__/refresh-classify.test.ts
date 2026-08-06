import { describe, expect, test } from "vitest";
import {
  classifyRefreshResponse,
  classifyRefreshThrow,
  refreshBackoffMs,
  retryAfterMs,
} from "../refresh-classify";

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const abortError = (): Error => {
  const error = new Error("aborted");
  error.name = "AbortError";
  return error;
};

describe("classifyRefreshResponse", () => {
  test("200 with a full payload yields refreshed tokens and parsed expiries", async () => {
    const outcome = await classifyRefreshResponse(
      jsonResponse(200, {
        access_token: "cps_a2",
        refresh_token: "cpr_adm_r2",
        expires_at: "2026-08-06T12:00:00Z",
        refresh_expires_at: "2026-09-05T12:00:00Z",
      }),
    );

    expect(outcome).toEqual({
      kind: "refreshed",
      accessToken: "cps_a2",
      refreshToken: "cpr_adm_r2",
      expiresAtMs: Date.parse("2026-08-06T12:00:00Z"),
      refreshExpiresAtMs: Date.parse("2026-09-05T12:00:00Z"),
    });
  });

  test.each([
    [401, { code: "session_revoked" }, "session_revoked"],
    [400, { error: { code: "validation_failed" } }, "validation_failed"],
    [403, {}, ""],
  ])("%i is an explicit grant rejection", async (status, body, code) => {
    expect(await classifyRefreshResponse(jsonResponse(status, body))).toEqual({
      kind: "invalid",
      code,
    });
  });

  // Regression anchor: treating a rate-limited refresh as an invalid grant signs
  // the user out and then blocks them from signing back in for the cooldown.
  test("429 login_rate_limited stays transient and never invalidates the session", async () => {
    expect(
      await classifyRefreshResponse(jsonResponse(429, { code: "login_rate_limited" })),
    ).toEqual({ kind: "transient", reason: "http_429" });
  });

  test.each([500, 502, 503, 504, 404, 405, 501])("%i is transient", async (status) => {
    expect(await classifyRefreshResponse(jsonResponse(status, { code: "whatever" }))).toMatchObject({
      kind: "transient",
    });
  });

  test("a 200 HTML body (captive portal / proxy error page) is transient", async () => {
    const response = new Response("<!doctype html><html><body>gateway</body></html>", {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
    expect(await classifyRefreshResponse(response)).toEqual({
      kind: "transient",
      reason: "html_response",
    });
  });

  test("a 200 without access_token is transient", async () => {
    expect(await classifyRefreshResponse(jsonResponse(200, {}))).toEqual({
      kind: "transient",
      reason: "missing_access_token",
    });
  });

  test("a 200 with an unparseable body is transient", async () => {
    const response = new Response("not json", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    expect(await classifyRefreshResponse(response)).toEqual({
      kind: "transient",
      reason: "unparseable_body",
    });
  });
});

describe("classifyRefreshThrow", () => {
  test("network failures are transient", () => {
    expect(classifyRefreshThrow(new TypeError("Failed to fetch"))).toEqual({
      kind: "transient",
      reason: "network",
    });
  });

  test("our own timeout abort is transient", () => {
    expect(classifyRefreshThrow(abortError())).toEqual({ kind: "transient", reason: "timeout" });
  });

  test("an abort from the caller's signal is re-thrown instead of judged", () => {
    const controller = new AbortController();
    controller.abort();
    expect(() => classifyRefreshThrow(abortError(), controller.signal)).toThrow(/aborted/);
  });

  test("unknown throwables are transient", () => {
    expect(classifyRefreshThrow(new Error("boom"))).toEqual({
      kind: "transient",
      reason: "unknown",
    });
  });
});

describe("refresh retry timing", () => {
  test("backoff jitters ±25% around the base delay", () => {
    expect(refreshBackoffMs(0, () => 0.5)).toBe(500);
    expect(refreshBackoffMs(0, () => 0)).toBe(375);
    expect(refreshBackoffMs(0, () => 1)).toBe(625);
  });

  test("Retry-After is parsed in seconds and clamped", () => {
    expect(retryAfterMs("2")).toBe(2000);
    expect(retryAfterMs("999")).toBe(5000);
    expect(retryAfterMs(null)).toBeNull();
    expect(retryAfterMs("abc")).toBeNull();
  });
});
