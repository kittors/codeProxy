import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { DataTable } from "../DataTable";
import type { DataTableColumn } from "../DataTable.types";

type Row = { id: string; name: string; status: string; note: string };

const rows: Row[] = [
  { id: "a", name: "alpha", status: "on", note: "first" },
  { id: "b", name: "bravo", status: "off", note: "second" },
];

// jsdom 的根字号是 16px，所以 w-72 = 288px、w-28 = 112px、w-40 = 160px。
const columns: DataTableColumn<Row>[] = [
  { key: "name", label: "Name", width: "w-72 min-w-72", render: (row) => row.name },
  { key: "status", label: "Status", width: "w-28 min-w-28", render: (row) => row.status },
  { key: "note", label: "Note", width: "w-40 min-w-40", render: (row) => row.note },
];

const root = () => document.querySelector<HTMLElement>(".isolate");
const viewport = () => {
  const node = document.querySelector<HTMLElement>("[data-scrollbar-visibility='hover']");
  if (!node) throw new Error("table viewport missing");
  return node;
};
const header = (key: string) => {
  const node = document.querySelector<HTMLElement>(`th[data-vt-column-key="${key}"]`);
  if (!node) throw new Error(`header ${key} missing`);
  return node;
};
const resizer = (key: string) => header(key).querySelector<HTMLElement>("[data-vt-column-resizer]");

/** 让表格「量到」一个视口高度：DataTable 在滚动事件里重新读 clientHeight。 */
function measureViewport(clientHeight: number) {
  const node = viewport();
  Object.defineProperties(node, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: clientHeight },
  });
  fireEvent.scroll(node);
}

afterEach(() => {
  window.localStorage.clear();
});

describe("DataTable fill (full-page lists)", () => {
  test("takes the box the page gives it instead of the height of its rows", () => {
    const { rerender } = render(
      <DataTable fill rows={rows} columns={columns} rowKey={(row) => row.id} showAllLoadedMessage={false} />,
    );
    expect(root()).toHaveClass("h-full", "min-h-0", "flex-1", "max-h-full");
    expect(root()).not.toHaveClass("h-auto");

    // Same frame when there is nothing to show.
    rerender(<DataTable fill rows={[]} columns={columns} rowKey={(row) => row.id} showAllLoadedMessage={false} />);
    expect(root()).toHaveClass("h-full", "flex-1");
  });

  test("the empty state fills the body under the header and stays centred in the frame", () => {
    render(
      <DataTable
        fill
        rows={[]}
        columns={columns}
        rowKey={(row) => row.id}
        emptyText="Nothing here"
        showAllLoadedMessage={false}
      />,
    );
    measureViewport(480);

    const box = document.querySelector<HTMLElement>("[data-vt-empty-row] td > div");
    expect(box?.style.height).toBe("480px");
    expect(box).toHaveClass("items-center", "justify-center");
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  test("without fill the empty state keeps its own minimum height", () => {
    render(
      <DataTable rows={[]} columns={columns} rowKey={(row) => row.id} emptyText="Nothing" showAllLoadedMessage={false} />,
    );
    measureViewport(480);

    const box = document.querySelector<HTMLElement>("[data-vt-empty-row] td > div");
    expect(box?.style.height).toBe("");
    expect(box?.className).toMatch(/min-h-\[min\(18rem/);
  });

  test("the first-load skeleton fills the frame, so nothing jumps when the rows arrive", () => {
    render(
      <DataTable fill loading rows={[]} columns={columns} rowKey={(row) => row.id} showAllLoadedMessage={false} />,
    );
    measureViewport(600);

    // (600 - 16) / 40 → 14 rows, not the five a row-sized table draws.
    expect(document.querySelectorAll("tbody tr[aria-hidden='true']")).toHaveLength(14);
  });

  test("a short frame still gets five skeleton rows instead of shrinking round after round", () => {
    render(
      <DataTable fill loading rows={[]} columns={columns} rowKey={(row) => row.id} showAllLoadedMessage={false} />,
    );
    measureViewport(120);

    expect(document.querySelectorAll("tbody tr[aria-hidden='true']")).toHaveLength(5);
  });
});

describe("DataTable column widths", () => {
  test("the widest regular column takes the leftover width; the others keep theirs", () => {
    render(
      <DataTable rows={rows} columns={columns} rowKey={(row) => row.id} minWidth="min-w-0" showAllLoadedMessage={false} />,
    );

    // The flex column has no width of its own on the header or the <col>.
    expect(header("name").className).not.toMatch(/\bw-72\b/);
    expect(document.querySelectorAll<HTMLElement>("colgroup col")[0]?.style.width).toBe("");
    // The others keep their width, so table-fixed no longer stretches them.
    expect(header("status")).toHaveClass("w-28");
    // Every column can still be dragged, the flex one included (that sets its floor).
    expect(resizer("name")).not.toBeNull();
    expect(resizer("status")).not.toBeNull();
    // Floor: every column at its width.
    expect(document.querySelector("table")?.style.minWidth).toBe(`${288 + 112 + 160}px`);
  });

  test("a width stored for the flex column is its floor, not a width pinned on the column", () => {
    window.localStorage.setItem(
      "codeProxy.dataTable.columnWidths.v3.flex-floor",
      JSON.stringify({ name: 400 }),
    );
    render(
      <DataTable
        tableId="flex-floor"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        minWidth="min-w-0"
        showAllLoadedMessage={false}
      />,
    );

    expect(document.querySelectorAll<HTMLElement>("colgroup col")[0]?.style.width).toBe("");
    expect(document.querySelector("table")?.style.minWidth).toBe(`${400 + 112 + 160}px`);
  });

  test("a page's minWidth wins when it is wider than the columns", () => {
    render(
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        minWidth="min-w-[980px]"
        showAllLoadedMessage={false}
      />,
    );
    expect(document.querySelector("table")?.style.minWidth).toBe("980px");
  });

  test("a press on a resize handle without a drag stores nothing", () => {
    render(
      <DataTable
        tableId="press-only"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        minWidth="min-w-0"
        showAllLoadedMessage={false}
      />,
    );
    const handle = resizer("status");
    if (!handle) throw new Error("status resizer missing");

    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 200 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 200 });

    // It used to write the column's current (stretched) width here.
    expect(window.localStorage.getItem("codeProxy.dataTable.columnWidths.v3.press-only")).toBeNull();
    expect(document.querySelectorAll("colgroup col")[1]?.getAttribute("style") ?? "").not.toMatch(/width/);
  });

  test("double-clicking a resize handle puts the column back to its default width", () => {
    const key = "codeProxy.dataTable.columnWidths.v3.reset-width";
    window.localStorage.setItem(key, JSON.stringify({ status: 300 }));
    render(
      <DataTable
        tableId="reset-width"
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        minWidth="min-w-0"
        showAllLoadedMessage={false}
      />,
    );
    const statusCol = () => document.querySelectorAll<HTMLElement>("colgroup col")[1];
    expect(statusCol()?.style.width).toBe("300px");

    const handle = resizer("status");
    if (!handle) throw new Error("status resizer missing");
    fireEvent.doubleClick(handle);

    expect(JSON.parse(window.localStorage.getItem(key) ?? "null")).toEqual({});
    expect(statusCol()?.style.width).toBe("");
    expect(document.querySelector("table")?.style.minWidth).toBe(`${288 + 112 + 160}px`);
  });
});
