import { describe, expect, test } from "vitest";
import { ApiClientError } from "@code-proxy/api-client";
import {
  RELEASE_NOTE_MAX_LENGTH,
  describeFreezeError,
  formatFreezeTime,
  freezeProviderName,
  isFreezeGone,
  isFreezeUnavailable,
  shortKeyId,
} from "../format";

const t = (key: string, options?: Record<string, unknown>) =>
  options ? `${key}:${JSON.stringify(options)}` : key;

/** An error the way the client raises it for `{"error":{"code","message"}}`. */
const apiError = (status: number, code: string, message = `${code} message`) =>
  new ApiClientError({ message, status, data: { error: { code, message } } });

describe("freezeProviderName", () => {
  test("is the vendor's name, and never an operator's own name for an upstream", () => {
    expect(freezeProviderName(t, { provider_name: "Codex" })).toBe("Codex");
    expect(freezeProviderName(t, { provider_name: "" })).toBe("access_freeze.other_provider");
    expect(freezeProviderName(t, { provider_name: "  " })).toBe("access_freeze.other_provider");
  });
});

describe("formatFreezeTime", () => {
  test("shows a dash for no time, the text itself for one it cannot read, and the local time otherwise", () => {
    expect(formatFreezeTime(undefined)).toBe("—");
    expect(formatFreezeTime("")).toBe("—");
    expect(formatFreezeTime("last Tuesday")).toBe("last Tuesday");
    expect(formatFreezeTime("2026-11-13T02:00:00Z", "en")).toBe(
      new Date("2026-11-13T02:00:00Z").toLocaleString("en"),
    );
  });

  test("falls back to the browser's language when the one asked for is not a language", () => {
    expect(formatFreezeTime("2026-11-13T02:00:00Z", "not a language tag!")).toBe(
      new Date("2026-11-13T02:00:00Z").toLocaleString(),
    );
  });
});

describe("shortKeyId", () => {
  test("is the first eight characters, enough to tell keys apart in a list", () => {
    expect(shortKeyId("0123456789abcdef")).toBe("01234567");
    expect(shortKeyId("abc")).toBe("abc");
  });
});

describe("describeFreezeError", () => {
  test.each([
    ["access_freeze_not_found", 404, "access_freeze.error_not_found"],
    ["access_freeze_already_released", 409, "access_freeze.error_already_released"],
    ["access_freezes_unavailable", 503, "access_freeze.error_unavailable"],
    ["invalid_threshold", 400, "access_freeze.error_invalid_threshold"],
  ])("puts the backend's code %s into the panel's own words", (code, status, key) => {
    expect(describeFreezeError(t, apiError(status, code), "fallback")).toBe(key);
  });

  test("tells how long a note may be", () => {
    expect(describeFreezeError(t, apiError(400, "note_too_long"), "fallback")).toBe(
      `access_freeze.error_note_too_long:${JSON.stringify({ max: RELEASE_NOTE_MAX_LENGTH })}`,
    );
  });

  test("shows the backend's own text for a code it does not know, and the fallback for no text", () => {
    expect(
      describeFreezeError(t, apiError(500, "access_freeze_failed", "disk full"), "fallback"),
    ).toBe("disk full");
    expect(describeFreezeError(t, new Error("network down"), "fallback")).toBe("network down");
    expect(describeFreezeError(t, new Error("  "), "fallback")).toBe("fallback");
    expect(describeFreezeError(t, "boom", "fallback")).toBe("fallback");
    expect(describeFreezeError(t, null, "fallback")).toBe("fallback");
  });
});

describe("isFreezeUnavailable and isFreezeGone", () => {
  test("a backend without a database is unavailable, and nothing else is", () => {
    expect(isFreezeUnavailable(apiError(503, "access_freezes_unavailable"))).toBe(true);
    expect(isFreezeUnavailable(apiError(503, "something_else"))).toBe(false);
    expect(isFreezeUnavailable(new Error("503"))).toBe(false);
    expect(isFreezeUnavailable(null)).toBe(false);
  });

  test("a freeze that was already released, or is not there, is gone: the screen only needs refreshing", () => {
    expect(isFreezeGone(apiError(409, "access_freeze_already_released"))).toBe(true);
    expect(isFreezeGone(apiError(404, "access_freeze_not_found"))).toBe(true);
    expect(isFreezeGone(apiError(400, "note_too_long"))).toBe(false);
    expect(isFreezeGone(new Error("x"))).toBe(false);
  });
});
