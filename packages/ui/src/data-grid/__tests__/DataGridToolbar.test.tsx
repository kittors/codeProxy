import i18n from "@code-proxy/i18n";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, test } from "vitest";
import { GridFacetFilter, GridFilterChips } from "../DataGridToolbar";
import type { DataGridColumn, GridFilters } from "../types";

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

const OPTIONS = [
  { value: "a", label: "Alpha", count: 3 },
  { value: "b", label: "Bravo", count: 1 },
];

const COLUMNS: DataGridColumn<{ id: string }>[] = [
  { id: "model", header: "Model", filter: { type: "options", options: OPTIONS }, cell: () => null },
];

function Harness({ initial = {} }: { initial?: GridFilters }) {
  const [filters, setFilters] = useState<GridFilters>(initial);
  return (
    <>
      <GridFacetFilter
        columnId="model"
        label="Model"
        options={OPTIONS}
        filters={filters}
        onFiltersChange={setFilters}
      />
      <GridFilterChips
        columns={COLUMNS}
        filters={filters}
        onFiltersChange={setFilters}
        placeholder="No filters yet"
      />
    </>
  );
}

describe("GridFacetFilter", () => {
  test("筛了以后只亮出个数徽标，不写选中的值（按钮宽度不随值长短变化）", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const button = screen.getByRole("button", { name: /^Model/ });
    expect(button).not.toHaveAttribute("data-active");
    expect(button).toHaveTextContent(/^Model$/);

    await user.click(button);
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("checkbox", { name: /Alpha/ }));
    await user.click(within(dialog).getByRole("checkbox", { name: /Bravo/ }));
    await user.click(within(dialog).getByRole("button", { name: tr("data_grid.apply") }));

    expect(button).toHaveAttribute("data-active", "true");
    expect(button).toHaveTextContent(/^Model2$/);
    expect(button).not.toHaveTextContent("Alpha");
  });
});

describe("GridFilterChips", () => {
  test("没有筛选时这一行仍在，显示占位；有筛选时显示芯片和清除全部", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<Harness />);
    expect(screen.getByText("No filters yet")).toBeInTheDocument();
    const list = screen.getByRole("list", { name: tr("data_grid.active_filters") });
    expect(within(list).queryAllByRole("listitem")).toHaveLength(0);

    rerender(<Harness initial={{ model: { type: "options", values: ["a"] } }} key="with-filter" />);
    const filtered = screen.getByRole("list", { name: tr("data_grid.active_filters") });
    expect(within(filtered).getByText(/Alpha/)).toBeInTheDocument();
    await user.click(
      within(filtered).getByRole("button", { name: tr("data_grid.clear_all_filters") }),
    );
    expect(await screen.findByText("No filters yet")).toBeInTheDocument();
  });
});
