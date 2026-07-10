import { useState } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, test } from "vitest";
import { DataTable } from "../DataTable";
import type { DataTableColumn, DataTableSortState } from "../DataTable.types";

type TestRow = {
  id: string;
  name: string;
};

const initialRows: TestRow[] = [
  { id: "charlie", name: "charlie" },
  { id: "alpha", name: "alpha" },
  { id: "bravo", name: "bravo" },
];

const columns: DataTableColumn<TestRow>[] = [
  {
    key: "name",
    label: "Name",
    sort: { getValue: (row) => row.name },
    render: (row) => <span data-testid="row-name">{row.name}</span>,
  },
];

function DataTableHarness() {
  const [rows, setRows] = useState(initialRows);
  const [sortState, setSortState] = useState<DataTableSortState | null>(null);
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(row) => row.id}
      rowReorderable
      onRowsChange={(nextRows) => setRows(nextRows)}
      sortState={sortState}
      onSortStateChange={setSortState}
      naturalFlow
      height="h-auto"
      minHeight="min-h-0"
      minWidth="min-w-[320px]"
      showAllLoadedMessage={false}
    />
  );
}

function visibleRowNames() {
  return screen.getAllByTestId("row-name").map((element) => element.textContent);
}

describe("DataTable sorting and row reordering", () => {
  test("uses the small dropdown menu and updates the sort icon and row order", async () => {
    const user = userEvent.setup();
    render(<DataTableHarness />);

    const sortTrigger = screen.getByRole("button", { name: "Sort Name" });
    expect(sortTrigger).toHaveAttribute("data-vt-sort-direction", "none");

    await user.click(sortTrigger);
    const menu = screen.getByRole("menu");
    expect(menu).toHaveClass("min-w-28");
    expect(screen.getByRole("menuitem", { name: "Ascending" })).toHaveClass("text-xs");
    await user.click(screen.getByRole("menuitem", { name: "Ascending" }));

    expect(visibleRowNames()).toEqual(["alpha", "bravo", "charlie"]);
    expect(sortTrigger).toHaveAttribute("data-vt-sort-direction", "asc");

    await user.click(sortTrigger);
    await user.click(screen.getByRole("menuitem", { name: "Descending" }));

    expect(visibleRowNames()).toEqual(["charlie", "bravo", "alpha"]);
    expect(sortTrigger).toHaveAttribute("data-vt-sort-direction", "desc");
  });

  test("dragging a row persists the manual order and resets the active sort icon", async () => {
    const user = userEvent.setup();
    render(<DataTableHarness />);

    const sortTrigger = screen.getByRole("button", { name: "Sort Name" });
    await user.click(sortTrigger);
    await user.click(screen.getByRole("menuitem", { name: "Ascending" }));
    expect(visibleRowNames()).toEqual(["alpha", "bravo", "charlie"]);

    const tableRows = Array.from(
      document.querySelectorAll<HTMLTableRowElement>("tr[data-vt-row-index]"),
    );
    tableRows.forEach((row, index) => {
      row.getBoundingClientRect = () =>
        ({
          x: 0,
          y: index * 40,
          top: index * 40,
          right: 320,
          bottom: index * 40 + 40,
          left: 0,
          width: 320,
          height: 40,
          toJSON: () => ({}),
        }) as DOMRect;
    });

    const firstHandle = screen.getByRole("button", { name: "Drag to reorder row 1" });
    fireEvent.pointerDown(firstHandle, { button: 0, pointerId: 7, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 7, clientY: 115 });
    fireEvent.pointerUp(window, { pointerId: 7, clientY: 115 });

    await waitFor(() => expect(visibleRowNames()).toEqual(["bravo", "charlie", "alpha"]));
    expect(sortTrigger).toHaveAttribute("data-vt-sort-direction", "none");
  });
});
