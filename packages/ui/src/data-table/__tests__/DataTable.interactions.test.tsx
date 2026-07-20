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
    cellClassName: "border-b data-table-test-cell",
    cellContentClassName: "data-table-test-content",
    sort: { getValue: (row) => row.name },
    render: (row) => <span data-testid="row-name">{row.name}</span>,
  },
];

const plainColumns: DataTableColumn<TestRow>[] = [
  {
    key: "name",
    label: "Name",
    render: (row) => <span>{row.name}</span>,
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

    const firstNameCell = document.querySelector<HTMLTableCellElement>(
      'td[data-vt-column-key="name"]',
    );
    expect(firstNameCell).toHaveClass("border-b", "data-table-test-cell");
    expect(firstNameCell?.querySelector("[data-table-cell-overflow]")).toHaveClass(
      "data-table-test-content",
    );
    expect(firstNameCell?.querySelector("[data-table-cell-overflow]")).not.toHaveClass(
      "border-b",
      "data-table-test-cell",
    );

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

    const firstHandle = screen.getByRole("button", {
      name: "Drag to reorder row 1",
    });
    expect(firstHandle).toHaveAttribute("data-tooltip-managed", "true");
    fireEvent.pointerDown(firstHandle, {
      button: 0,
      pointerId: 7,
      clientY: 20,
    });
    fireEvent.pointerMove(window, { pointerId: 7, clientY: 115 });

    const dragPreview = document.querySelector<HTMLElement>("[data-vt-row-reorder-preview]");
    expect(dragPreview).toHaveTextContent("alpha");
    expect(dragPreview).toHaveClass("border", "border-slate-200/90");
    expect(
      Array.from(dragPreview?.querySelectorAll("td") ?? []).every(
        (cell) => cell.style.borderTopWidth === "0px" && cell.style.borderBottomWidth === "0px",
      ),
    ).toBe(true);
    expect(document.querySelector("[data-vt-row-reorder-drop-indicator]")).toBeNull();
    expect(tableRows[0]).toHaveStyle({ opacity: "0" });
    expect(tableRows[1]).toHaveStyle({ transform: "translate3d(0, -40px, 0)" });
    expect(tableRows[2]).toHaveStyle({ transform: "translate3d(0, -40px, 0)" });

    fireEvent.pointerUp(window, { pointerId: 7, clientY: 115 });

    await waitFor(() => expect(visibleRowNames()).toEqual(["bravo", "charlie", "alpha"]));
    expect(document.querySelector("[data-vt-row-reorder-preview]")).toBeNull();
    tableRows.forEach((row) => {
      expect(row.style.opacity).toBe("");
      expect(row.style.transform).toBe("");
    });
    expect(sortTrigger).toHaveAttribute("data-vt-sort-direction", "none");
  });
});

describe("DataTable column reorder handle layout", () => {
  test("reserves symmetric gutters so the grip never covers the header label", () => {
    render(
      <DataTable
        tableId="column-reorder-overlap"
        rows={initialRows}
        columns={plainColumns}
        rowKey={(row) => row.id}
        naturalFlow
        height="h-auto"
        minHeight="min-h-0"
        minWidth="min-w-[320px]"
        showAllLoadedMessage={false}
      />,
    );

    const header = document.querySelector<HTMLElement>('th[data-vt-column-key="name"]');
    const content = header?.querySelector<HTMLElement>("[data-vt-column-header-content]");
    const handle = header?.querySelector<HTMLElement>("[data-vt-column-reorder-handle]");
    expect(header).not.toBeNull();
    expect(content).not.toBeNull();
    expect(handle).not.toBeNull();
    expect(content).toHaveClass("px-5");
    expect(content).not.toHaveClass("group-hover/column:pl-5", "group-focus-within/column:pl-5");
    expect(handle).toHaveClass("absolute", "left-1");
  });
});

describe("DataTable header text alignment", () => {
  test("maps headerClassName text-align utilities onto the flex label row", () => {
    const alignedColumns: DataTableColumn<TestRow>[] = [
      {
        key: "left",
        label: "Left",
        headerClassName: "text-left",
        render: (row) => row.name,
      },
      {
        key: "center",
        label: "Center",
        headerClassName: "text-center md:sticky",
        render: (row) => row.name,
      },
      {
        key: "right",
        label: "Right",
        headerClassName: "text-right",
        render: (row) => row.name,
      },
    ];

    render(
      <DataTable
        tableId="header-align-table"
        rows={initialRows}
        columns={alignedColumns}
        rowKey={(row) => row.id}
        naturalFlow
        height="h-auto"
        minHeight="min-h-0"
        minWidth="min-w-[320px]"
        showAllLoadedMessage={false}
      />,
    );

    const labelRow = (key: string) =>
      document
        .querySelector<HTMLElement>(`th[data-vt-column-key="${key}"]`)
        ?.querySelector<HTMLElement>("[data-vt-column-header-content] > span");

    expect(labelRow("left")).toHaveClass("justify-start");
    expect(labelRow("center")).toHaveClass("justify-center");
    expect(labelRow("center")).not.toHaveClass("justify-start");
    expect(labelRow("right")).toHaveClass("justify-end");
  });
});

describe("DataTable empty state", () => {
  test("renders EmptyState and collapses min-width so empty tables do not scroll sideways", () => {
    const wideColumns: DataTableColumn<TestRow>[] = [
      {
        key: "id",
        label: "ID",
        width: "w-[320px] min-w-[320px]",
        render: (row) => row.id,
      },
      {
        key: "name",
        label: "Name",
        width: "w-[480px] min-w-[480px]",
        render: (row) => row.name,
      },
      {
        key: "extra",
        label: "Extra",
        width: "w-[640px] min-w-[640px]",
        render: () => "extra",
      },
    ];

    render(
      <DataTable
        tableId="empty-state-table"
        rows={[]}
        columns={wideColumns}
        rowKey={(row) => row.id}
        height="h-[240px]"
        minHeight="min-h-[240px]"
        minWidth="min-w-[1800px]"
        emptyText="No request logs"
        emptyDescription="Try a different filter range"
        showAllLoadedMessage={false}
      />,
    );

    const table = document.querySelector<HTMLTableElement>("table[data-vt-empty='true']");
    const viewport = document.querySelector<HTMLElement>("[data-scrollbar-visibility='hover']");
    const emptyRow = document.querySelector<HTMLTableRowElement>("tr[data-vt-empty-row]");

    expect(table).not.toBeNull();
    expect(table).toHaveClass("min-w-0");
    expect(table).not.toHaveClass("min-w-[1800px]");
    expect(viewport).toHaveClass("overflow-x-hidden");
    expect(emptyRow).not.toBeNull();
    expect(screen.getByText("No request logs")).toBeInTheDocument();
    expect(screen.getByText("Try a different filter range")).toBeInTheDocument();
    // Default EmptyState icon well (Inbox) when emptyIcon is omitted.
    expect(document.querySelector("[data-empty-icon]")).not.toBeNull();

    const firstHeader = document.querySelector<HTMLElement>('th[data-vt-column-key="id"]');
    expect(firstHeader).not.toBeNull();
    expect(firstHeader?.className).not.toMatch(/min-w-\[320px\]/);
    expect(firstHeader).not.toHaveClass("sticky");
  });
});

describe("DataTable scroll chrome and row dividers", () => {
  test("keeps header cells attached and forwards boundary wheel scrolling to the parent", () => {
    render(
      <div data-testid="parent-scroll" style={{ height: 160, overflowY: "auto" }}>
        <DataTable
          rows={initialRows}
          columns={plainColumns}
          rowKey={(row) => row.id}
          height="h-[120px]"
          minHeight="min-h-[120px]"
          minWidth="min-w-[320px]"
          allowWheelPropagationAtBoundary
          showAllLoadedMessage={false}
        />
      </div>,
    );

    const parent = screen.getByTestId("parent-scroll");
    const viewport = document.querySelector<HTMLElement>("[data-scrollbar-visibility='hover']");
    expect(viewport).not.toBeNull();
    if (!viewport) return;

    Object.defineProperties(viewport, {
      clientHeight: { configurable: true, value: 120 },
      scrollHeight: { configurable: true, value: 360 },
    });
    Object.defineProperties(parent, {
      clientHeight: { configurable: true, value: 160 },
      scrollHeight: { configurable: true, value: 480 },
    });
    viewport.scrollTop = 240;
    parent.scrollTop = 80;

    fireEvent.wheel(viewport, { deltaY: 40 });

    expect(viewport.scrollTop).toBe(240);
    expect(parent.scrollTop).toBe(120);
    // Wheel handoff is JS-driven; keep overscroll contained so sticky headers never bounce.
    expect(viewport).toHaveClass("overscroll-y-none");
    expect(viewport).not.toHaveClass("overscroll-y-auto");
    const headerChrome = document.querySelector("[data-vt-header-chrome]");
    expect(headerChrome).not.toBeNull();
    expect(headerChrome).toHaveClass("absolute", "left-0", "top-0");

    const headerCells = Array.from(document.querySelectorAll("thead th"));
    expect(headerCells).not.toHaveLength(0);
    headerCells.forEach((cell) => {
      // Free-scroll headers stay transparent; viewport chrome owns the plate fill.
      expect(cell).toHaveClass("sticky", "top-0", "bg-transparent");
    });
  });

  test("renders straight full-width dividers without rounded cell edges", () => {
    render(
      <DataTable
        rows={initialRows}
        columns={plainColumns}
        rowKey={(row) => row.id}
        rowReorderable
        onRowsChange={() => undefined}
        rowDividers
        naturalFlow
        height="h-auto"
        minHeight="min-h-0"
        minWidth="min-w-[320px]"
        showAllLoadedMessage={false}
      />,
    );

    const rows = Array.from(
      document.querySelectorAll<HTMLTableRowElement>("tr[data-vt-row-index]"),
    );
    expect(rows).toHaveLength(3);

    rows.slice(0, -1).forEach((row) => {
      const cells = Array.from(row.cells);
      expect(cells).toHaveLength(2);
      cells.forEach((cell) => {
        expect(cell).toHaveClass("border-b", "border-slate-200");
        expect(cell).not.toHaveClass("first:rounded-l-lg", "last:rounded-r-lg");
      });
    });
    Array.from(rows.at(-1)?.cells ?? []).forEach((cell) => {
      expect(cell).not.toHaveClass("border-b", "first:rounded-l-lg", "last:rounded-r-lg");
    });
  });

  test("keeps sticky header corners rounded via header chrome and outer sticky cells", () => {
    const stickyColumns: DataTableColumn<TestRow>[] = [
      {
        key: "select",
        label: "Select",
        lockOrder: "start",
        headerClassName: "md:sticky",
        cellClassName: "md:sticky",
        render: () => null,
      },
      {
        key: "name",
        label: "Name",
        render: (row) => <span>{row.name}</span>,
      },
      {
        key: "actions",
        label: "Actions",
        lockOrder: "end",
        headerClassName: "md:sticky",
        cellClassName: "md:sticky",
        render: () => null,
      },
    ];

    render(
      <DataTable
        rows={initialRows}
        columns={stickyColumns}
        rowKey={(row) => row.id}
        height="h-[240px]"
        minHeight="min-h-[240px]"
        minWidth="min-w-[960px]"
        showAllLoadedMessage={false}
      />,
    );

    const headerChrome = document.querySelector("[data-vt-header-chrome]");
    expect(headerChrome).not.toBeNull();

    const selectHeader = document.querySelector('th[data-vt-column-key="select"]');
    const nameHeader = document.querySelector('th[data-vt-column-key="name"]');
    const actionsHeader = document.querySelector('th[data-vt-column-key="actions"]');
    const headerGutter = document.querySelector("[data-vt-header-gutter]");
    // Sticky cells stay opaque; free middle headers stay transparent over chrome.
    // Outer sticky headers own side radius (top+bottom) so fixed columns don't square corners.
    // Stack: chrome z-40 < free z-50 < locked z-70.
    expect(selectHeader).toHaveClass("bg-slate-100", "rounded-l-xl", "z-[70]");
    expect(selectHeader).toHaveStyle({ zIndex: "70" });
    expect(nameHeader).toHaveClass("bg-transparent", "z-50");
    expect(nameHeader).not.toHaveClass("rounded-l-xl", "rounded-r-xl", "z-[70]");
    expect(actionsHeader).toHaveClass("bg-slate-100", "rounded-r-xl", "z-[70]");
    expect(actionsHeader).toHaveStyle({ zIndex: "70" });
    expect(headerChrome).toHaveClass("absolute", "left-0", "top-0");
    // With a vertical gutter, chrome is left-only; otherwise full rounded-xl.
    if (headerGutter) {
      expect(headerGutter).toHaveClass("rounded-r-xl");
      expect(headerChrome).toHaveClass("rounded-l-xl");
    } else {
      expect(headerChrome).toHaveClass("rounded-xl");
    }
  });
});
