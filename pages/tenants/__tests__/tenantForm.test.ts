import { describe, expect, it } from "vitest";
import {
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
