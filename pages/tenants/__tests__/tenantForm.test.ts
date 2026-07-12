import { describe, expect, it } from "vitest";
import { toIsoDateTime, toLocalDateTimeInput } from "../tenantForm";

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
