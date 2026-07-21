import { describe, expect, test } from "vitest";
import {
  DEFAULT_AUTH_FILES_CARD_COLUMNS,
  normalizeAuthFilesCardColumns,
} from "../authFiles";

describe("normalizeAuthFilesCardColumns", () => {
  test("keeps allowed discrete columns", () => {
    for (const count of [2, 3, 4, 5, 6] as const) {
      expect(normalizeAuthFilesCardColumns(count)).toBe(count);
      expect(normalizeAuthFilesCardColumns(String(count))).toBe(count);
    }
  });

  test("falls back to default for invalid values", () => {
    expect(normalizeAuthFilesCardColumns(1)).toBe(DEFAULT_AUTH_FILES_CARD_COLUMNS);
    expect(normalizeAuthFilesCardColumns(7)).toBe(DEFAULT_AUTH_FILES_CARD_COLUMNS);
    expect(normalizeAuthFilesCardColumns(null)).toBe(DEFAULT_AUTH_FILES_CARD_COLUMNS);
    expect(normalizeAuthFilesCardColumns(undefined)).toBe(DEFAULT_AUTH_FILES_CARD_COLUMNS);
    expect(normalizeAuthFilesCardColumns({})).toBe(DEFAULT_AUTH_FILES_CARD_COLUMNS);
    expect(normalizeAuthFilesCardColumns("nope")).toBe(DEFAULT_AUTH_FILES_CARD_COLUMNS);
  });
});
