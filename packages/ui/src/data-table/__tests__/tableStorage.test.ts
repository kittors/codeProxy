import { describe, expect, test } from "vitest";
import type { DataTableColumn } from "../DataTable.types";
import { clampColumnWidth, resolveColumnMinWidth } from "../tableStorage";

const column = (overrides: Partial<DataTableColumn<unknown>> = {}): DataTableColumn<unknown> => ({
  key: "name",
  label: "Name",
  render: () => null,
  ...overrides,
});

describe("tableStorage column widths", () => {
  test("uses explicit minWidthPx before width classes", () => {
    const target = column({ minWidthPx: 180, width: "w-[320px] min-w-[320px]" });

    expect(resolveColumnMinWidth(target)).toBe(180);
    expect(clampColumnWidth(target, 120)).toBe(180);
  });

  test("clamps drag resize to the min-w width class", () => {
    const target = column({ width: "w-[320px] min-w-[320px]" });

    expect(resolveColumnMinWidth(target)).toBe(320);
    expect(clampColumnWidth(target, 72)).toBe(320);
  });

  test("keeps the default minimum when no min-w class is provided", () => {
    const target = column({ width: "w-52" });

    expect(resolveColumnMinWidth(target)).toBe(72);
    expect(clampColumnWidth(target, 48)).toBe(72);
  });
});
