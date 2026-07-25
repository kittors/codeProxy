import { describe, expect, it } from "vitest";
import {
  alignAuthFilesPageSizeToColumns,
  AUTH_FILES_PAGE_SIZE,
  AUTH_FILES_PAGE_SIZE_OPTIONS,
  normalizeAuthFilesPageSize,
} from "../authFiles";

describe("auth files page size", () => {
  it("normalizes persisted values to the configured range", () => {
    expect(normalizeAuthFilesPageSize(9)).toBe(9);
    expect(normalizeAuthFilesPageSize("12")).toBe(12);
    expect(normalizeAuthFilesPageSize(10)).toBe(10);
    expect(normalizeAuthFilesPageSize(11)).toBe(11);
    expect(normalizeAuthFilesPageSize(1)).toBe(AUTH_FILES_PAGE_SIZE_OPTIONS[0]);
    expect(normalizeAuthFilesPageSize(100)).toBe(
      AUTH_FILES_PAGE_SIZE_OPTIONS[AUTH_FILES_PAGE_SIZE_OPTIONS.length - 1],
    );
  });

  it("falls back to the default for invalid persisted values", () => {
    expect(normalizeAuthFilesPageSize(null)).toBe(AUTH_FILES_PAGE_SIZE);
    expect(normalizeAuthFilesPageSize(undefined)).toBe(AUTH_FILES_PAGE_SIZE);
    expect(normalizeAuthFilesPageSize("")).toBe(AUTH_FILES_PAGE_SIZE);
    expect(normalizeAuthFilesPageSize("nope")).toBe(AUTH_FILES_PAGE_SIZE);
    expect(normalizeAuthFilesPageSize({})).toBe(AUTH_FILES_PAGE_SIZE);
  });

  it("aligns the page size to complete card rows", () => {
    expect(alignAuthFilesPageSizeToColumns(9, 3)).toBe(9);
    expect(alignAuthFilesPageSizeToColumns(9, 6)).toBe(12);
    expect(alignAuthFilesPageSizeToColumns(10, 4)).toBe(12);
    expect(alignAuthFilesPageSizeToColumns(15, 4)).toBe(16);
    expect(alignAuthFilesPageSizeToColumns(24, 5)).toBe(25);
    expect(alignAuthFilesPageSizeToColumns(6, 5)).toBe(5);
  });

  it("uses the default column count when the persisted value is invalid", () => {
    expect(alignAuthFilesPageSizeToColumns(12, "nope")).toBe(12);
  });
});
