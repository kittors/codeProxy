import { describe, expect, test } from "vitest";
import type { DataTableColumn } from "../DataTable.types";
import { clampColumnWidth } from "../tableStorage";

describe("tableStorage", () => {
  test("clamps stored widths to arbitrary min-width classes", () => {
    const column: DataTableColumn<{ key: string }> = {
      key: "key",
      label: "Key",
      width: "w-[320px] min-w-[320px]",
      render: () => null,
    };

    expect(clampColumnWidth(column, 88)).toBe(320);
  });

  test("lets explicit minWidthPx override width class inference", () => {
    const column: DataTableColumn<{ key: string }> = {
      key: "key",
      label: "Key",
      width: "w-[320px] min-w-[320px]",
      minWidthPx: 180,
      render: () => null,
    };

    expect(clampColumnWidth(column, 88)).toBe(180);
  });
});
