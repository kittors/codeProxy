import { describe, expect, test } from "vitest";
import {
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  normalizeQuotaAutoRefreshMs,
  readAndMigrateQuotaAutoRefreshMs,
} from "@code-proxy/domain";

describe("normalizeQuotaAutoRefreshMs", () => {
  test("defaults to off", () => {
    expect(normalizeQuotaAutoRefreshMs(undefined)).toBe(0);
    expect(normalizeQuotaAutoRefreshMs(null)).toBe(0);
    expect(normalizeQuotaAutoRefreshMs("nope")).toBe(0);
  });

  test("migrates legacy 5s/10s/30s to 60s", () => {
    expect(normalizeQuotaAutoRefreshMs(5000)).toBe(60_000);
    expect(normalizeQuotaAutoRefreshMs(10000)).toBe(60_000);
    expect(normalizeQuotaAutoRefreshMs(30000)).toBe(60_000);
  });

  test("keeps allowed Off/60s/300s", () => {
    expect(normalizeQuotaAutoRefreshMs(0)).toBe(0);
    expect(normalizeQuotaAutoRefreshMs(60_000)).toBe(60_000);
    expect(normalizeQuotaAutoRefreshMs(300_000)).toBe(300_000);
  });

  test("readAndMigrate writes back immediately", () => {
    window.localStorage.setItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY, JSON.stringify(5000));
    expect(readAndMigrateQuotaAutoRefreshMs()).toBe(60_000);
    expect(
      JSON.parse(window.localStorage.getItem(AUTH_FILES_QUOTA_AUTO_REFRESH_KEY) ?? "null"),
    ).toBe(60_000);
  });
});
