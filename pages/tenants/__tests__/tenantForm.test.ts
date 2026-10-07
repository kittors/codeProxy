import { describe, expect, it } from "vitest";
import {
  describeDuration,
  extendExpiry,
  isTenantNameTooLong,
  TENANT_NAME_MAX_LENGTH,
  toIsoDateTime,
  toLocalDateTimeInput,
} from "../tenantForm";

describe("tenant name length", () => {
  it("allows names within the UTF-8 byte limit", () => {
    expect(isTenantNameTooLong("a".repeat(TENANT_NAME_MAX_LENGTH))).toBe(false);
    expect(isTenantNameTooLong("无境科技AI开发小组")).toBe(false);
  });

  it("rejects names over the UTF-8 byte limit", () => {
    expect(isTenantNameTooLong("a".repeat(TENANT_NAME_MAX_LENGTH + 1))).toBe(true);
    // 43 CJK chars * 3 bytes = 129 > 128
    expect(isTenantNameTooLong("开".repeat(43))).toBe(true);
  });
});

describe("toIsoDateTime", () => {
  it("returns null for empty expiry instead of throwing Invalid time value", () => {
    expect(toIsoDateTime("")).toBeNull();
    expect(toIsoDateTime("   ")).toBeNull();
  });

  it("returns null for non-date strings", () => {
    expect(toIsoDateTime("not-a-date")).toBeNull();
    expect(toIsoDateTime("YYYY-MM-DD HH:mm")).toBeNull();
  });

  it("converts a valid local datetime string to ISO", () => {
    const iso = toIsoDateTime("2026-12-31T23:59");
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(Number.isNaN(Date.parse(iso!))).toBe(false);
  });
});

describe("toLocalDateTimeInput", () => {
  it("returns empty string for null or invalid input", () => {
    expect(toLocalDateTimeInput(null)).toBe("");
    expect(toLocalDateTimeInput("not-a-date")).toBe("");
  });

  it("formats a valid ISO timestamp for the datetime picker", () => {
    const value = toLocalDateTimeInput("2026-07-01T12:30:00.000Z");
    expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });
});

describe("describeDuration", () => {
  it("turns TTL seconds into at most two readable units", () => {
    expect(describeDuration(43200, "en")).toEqual({ text: "12 hours", exact: true });
    expect(describeDuration(2592000, "en")).toEqual({ text: "30 days", exact: true });
    expect(describeDuration(90061, "en")).toEqual({ text: "1 day 1 hour", exact: false });
    expect(describeDuration(0, "en").text).toBe("0 seconds");
  });
});

describe("extendExpiry", () => {
  const now = new Date(2026, 0, 15, 9, 30);

  it("extends from the current expiry when it is still in the future", () => {
    const current = new Date(2026, 2, 1, 12, 0).toISOString();
    expect(extendExpiry(current, 1, now)).toBe(
      toLocalDateTimeInput(new Date(2026, 3, 1, 12, 0).toISOString()),
    );
  });

  it("extends from now when the tenant has already expired", () => {
    const expired = new Date(2025, 11, 1).toISOString();
    expect(extendExpiry(expired, 12, now)).toBe(
      toLocalDateTimeInput(new Date(2027, 0, 15, 9, 30).toISOString()),
    );
  });

  it("clamps to the end of a shorter month", () => {
    const current = new Date(2026, 0, 31, 8, 0).toISOString();
    expect(extendExpiry(current, 1, new Date(2026, 0, 1))).toBe(
      toLocalDateTimeInput(new Date(2026, 1, 28, 8, 0).toISOString()),
    );
  });
});
