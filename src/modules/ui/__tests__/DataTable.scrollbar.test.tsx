import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { DataTable, type DataTableColumn } from "@/modules/ui/DataTable";

interface DemoRow {
  id: string;
  name: string;
}

const columns: DataTableColumn<DemoRow>[] = [
  { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
];

function setScrollMetrics(
  element: HTMLDivElement,
  metrics: {
    clientHeight: number;
    scrollHeight: number;
    clientWidth: number;
    scrollWidth: number;
    scrollTop?: number;
    scrollLeft?: number;
  },
) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: metrics.clientHeight },
    scrollHeight: { configurable: true, value: metrics.scrollHeight },
    clientWidth: { configurable: true, value: metrics.clientWidth },
    scrollWidth: { configurable: true, value: metrics.scrollWidth },
    scrollTop: { configurable: true, writable: true, value: metrics.scrollTop ?? 0 },
    scrollLeft: { configurable: true, writable: true, value: metrics.scrollLeft ?? 0 },
  });
}

function setElementOverflow(
  element: HTMLElement,
  metrics: {
    clientWidth: number;
    scrollWidth: number;
  },
) {
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: metrics.clientWidth },
    scrollWidth: { configurable: true, value: metrics.scrollWidth },
  });
}

describe("DataTable scrollbar wrapper", () => {
  test("renders subtle resizers between columns but not after the last column", () => {
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        tableId="test-resizer-render"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const resizers = container.querySelectorAll("[data-vt-column-resizer]");
    expect(resizers).toHaveLength(1);
    expect(resizers[0]).toHaveAttribute("title", "Drag to resize Name column");
    expect(resizers[0]).toHaveClass("cursor-col-resize");
  });

  test("does not render a resizer for selection columns", () => {
    const selectionColumns: DataTableColumn<DemoRow>[] = [
      { key: "select", label: "Select", width: "w-12", render: () => "x" },
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        rows={[{ id: "1", name: "Row 1" }]}
        columns={selectionColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    expect(container.querySelectorAll("[data-vt-column-resizer]")).toHaveLength(1);
    expect(container.querySelector("[title='Drag to resize Select column']")).toBeNull();
  });

  test("persists resized column widths by table id", async () => {
    window.localStorage.clear();
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", minWidthPx: 90, render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container, unmount } = render(
      <DataTable
        tableId="test-column-widths"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 160,
          bottom: 40,
          width: 160,
          height: 40,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    const resizer = container.querySelector("[data-vt-column-resizer]") as HTMLButtonElement | null;
    expect(resizer).not.toBeNull();

    fireEvent.pointerDown(resizer!, { button: 0, pointerId: 1, clientX: 160 });
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 212 }));

    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Width: 212 px");
    });

    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 212 }));

    await waitFor(() => {
      expect(
        window.localStorage.getItem("codeProxy.dataTable.columnWidths.v1.test-column-widths"),
      ).toBe(JSON.stringify({ name: 212 }));
    });

    unmount();

    const { container: secondContainer } = render(
      <DataTable
        tableId="test-column-widths"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const storedCol = secondContainer.querySelector("col") as HTMLTableColElement | null;
    expect(storedCol).not.toBeNull();
    expect(storedCol!.style.width).toBe("212px");
  });

  test("bounds the resize preview to the table scroll area", async () => {
    window.localStorage.clear();
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        tableId="test-resize-preview-bounds"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[220px]"
        minHeight="min-h-0"
        minWidth="min-w-[900px]"
        virtualize={false}
      />,
    );

    const root = container.firstElementChild as HTMLDivElement;
    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    expect(scrollContainer).not.toBeNull();

    Object.defineProperty(root, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 20,
          y: 80,
          top: 80,
          left: 20,
          right: 620,
          bottom: 340,
          width: 600,
          height: 260,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    Object.defineProperty(scrollContainer!, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 20,
          y: 100,
          top: 100,
          left: 20,
          right: 600,
          bottom: 320,
          width: 580,
          height: 220,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 40,
          y: 100,
          top: 100,
          left: 40,
          right: 200,
          bottom: 140,
          width: 160,
          height: 40,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    setScrollMetrics(scrollContainer!, {
      clientHeight: 220,
      scrollHeight: 560,
      clientWidth: 580,
      scrollWidth: 900,
    });

    const resizer = container.querySelector("[data-vt-column-resizer]") as HTMLButtonElement | null;
    expect(resizer).not.toBeNull();

    fireEvent.pointerDown(resizer!, { button: 0, pointerId: 2, clientX: 200, clientY: 120 });
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 2, clientX: 240, clientY: 250 }),
    );

    const status = await screen.findByRole("status");
    const previewLine = status.previousElementSibling as HTMLDivElement | null;
    expect(previewLine).not.toBeNull();
    expect(previewLine!.style.left).toBe("220px");
    expect(previewLine!.style.top).toBe("20px");
    expect(previewLine!.style.height).toBe("206px");
    expect(status).toHaveTextContent("Width: 200 px");
  });

  test("keeps column width caches isolated between table ids", () => {
    window.localStorage.clear();
    window.localStorage.setItem(
      "codeProxy.dataTable.columnWidths.v1.first-table",
      JSON.stringify({ name: 240 }),
    );
    window.localStorage.setItem(
      "codeProxy.dataTable.columnWidths.v1.second-table",
      JSON.stringify({ name: 120 }),
    );

    const { container } = render(
      <DataTable
        tableId="second-table"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={[
          { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
          { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
        ]}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const firstCol = container.querySelector("col") as HTMLTableColElement | null;
    expect(firstCol).not.toBeNull();
    expect(firstCol!.style.width).toBe("120px");
  });

  test("truncates primitive cell content and shows the full value on overflow hover", () => {
    const longName = "Very long table cell value that should be visible in the tooltip";

    render(
      <DataTable
        rows={[{ id: "1", name: longName }]}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const cellContent = screen
      .getByText(longName)
      .closest("[data-vt-cell-content]") as HTMLElement | null;
    expect(cellContent).not.toBeNull();
    expect(cellContent).toHaveClass("truncate");

    setElementOverflow(cellContent!, { clientWidth: 120, scrollWidth: 420 });
    fireEvent.mouseEnter(cellContent!);

    expect(screen.getByRole("tooltip")).toHaveTextContent(longName);
  });

  test("does not show a primitive cell tooltip when the content fits", () => {
    render(
      <DataTable
        rows={[{ id: "1", name: "Short" }]}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const cellContent = screen
      .getByText("Short")
      .closest("[data-vt-cell-content]") as HTMLElement | null;
    expect(cellContent).not.toBeNull();

    setElementOverflow(cellContent!, { clientWidth: 120, scrollWidth: 120 });
    fireEvent.mouseEnter(cellContent!);

    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  test("uses column-provided overflow tooltip text for complex cell content", () => {
    const fullValue = "Complex rendered value with supporting markup";
    const complexColumns: DataTableColumn<DemoRow>[] = [
      {
        key: "name",
        label: "Name",
        width: "w-40",
        overflowTooltip: (row) => row.name,
        render: (row) => (
          <span>
            <strong>{row.name}</strong>
          </span>
        ),
      },
    ];

    render(
      <DataTable
        rows={[{ id: "1", name: fullValue }]}
        columns={complexColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const cellContent = screen
      .getByText(fullValue)
      .closest("[data-vt-cell-content]") as HTMLElement | null;
    expect(cellContent).not.toBeNull();

    setElementOverflow(cellContent!, { clientWidth: 120, scrollWidth: 420 });
    fireEvent.mouseEnter(cellContent!);

    expect(screen.getByRole("tooltip")).toHaveTextContent(fullValue);
  });

  test("infers overflow tooltip text from JSX cell content", () => {
    const fullValue = "JSX-rendered table cell value";
    const jsxColumns: DataTableColumn<DemoRow>[] = [
      {
        key: "name",
        label: "Name",
        width: "w-40",
        render: (row) => (
          <span className="block min-w-0 truncate">
            <strong>{row.name}</strong>
          </span>
        ),
      },
    ];

    render(
      <DataTable
        rows={[{ id: "1", name: fullValue }]}
        columns={jsxColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const cellContent = screen
      .getByText(fullValue)
      .closest("[data-table-cell-overflow]") as HTMLElement | null;
    expect(cellContent).not.toBeNull();
    const innerContent = screen.getByText(fullValue).closest("span") as HTMLElement | null;
    expect(innerContent).not.toBeNull();

    setElementOverflow(cellContent!, { clientWidth: 120, scrollWidth: 120 });
    setElementOverflow(innerContent!, { clientWidth: 120, scrollWidth: 420 });
    fireEvent.mouseEnter(cellContent!);

    expect(screen.getByRole("tooltip")).toHaveTextContent(fullValue);
  });

  test("uses a focusable scroll container with hover-reveal metadata", () => {
    const { container } = render(
      <DataTable
        rows={[
          { id: "1", name: "Row 1" },
          { id: "2", name: "Row 2" },
        ]}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();
    expect(scrollContainer).toHaveClass("overflow-auto");
    expect(scrollContainer).toHaveAttribute("data-scrollbar-visibility", "hover");
    expect(scrollContainer).toHaveAttribute("tabindex", "0");

    // Height must be applied on the outer wrapper so `h-full` works when the caller
    // constrains the table area; otherwise the inner scroll container can expand to content.
    const root = scrollContainer!.parentElement as HTMLDivElement | null;
    expect(root).not.toBeNull();
    expect(root).toHaveClass("h-[160px]");
    expect(root).toHaveClass("min-h-0");
  });

  test("renders an in-table initial loading state", () => {
    render(
      <DataTable
        rows={[]}
        columns={columns}
        rowKey={(row) => row.id}
        caption="Demo table"
        emptyText="No data"
        loading
      />,
    );

    const table = screen.getByRole("table", { name: "Demo table" });
    expect(table.closest("[aria-busy='true']")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });

  test("renders DOM scrollbars only when overflow exists", async () => {
    const { container } = render(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 780,
    });

    window.dispatchEvent(new Event("resize"));
    scrollContainer!.scrollTop = 40;
    scrollContainer!.scrollLeft = 20;
    scrollContainer!.dispatchEvent(new Event("scroll"));

    await waitFor(() => {
      const y = container.querySelector('[data-vt-scrollbar="y"]') as HTMLDivElement | null;
      const x = container.querySelector('[data-vt-scrollbar="x"]') as HTMLDivElement | null;
      expect(y).not.toBeNull();
      expect(x).not.toBeNull();
      expect(y).toHaveClass("right-0");
    });
  });

  test("reveals scrollbars from their hover zones and marks thumbs as draggable", async () => {
    const { container } = render(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 780,
    });

    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      const yTrack = container.querySelector('[data-vt-scrollbar="y"]') as HTMLDivElement | null;
      const xTrack = container.querySelector('[data-vt-scrollbar="x"]') as HTMLDivElement | null;
      const yThumb = yTrack?.querySelector('[role="presentation"]') as HTMLDivElement | null;
      const xThumb = xTrack?.querySelector('[role="presentation"]') as HTMLDivElement | null;

      expect(yTrack).not.toBeNull();
      expect(xTrack).not.toBeNull();
      expect(yTrack).toHaveClass("pointer-events-auto", "hover:opacity-100");
      expect(xTrack).toHaveClass("pointer-events-auto", "hover:opacity-100");
      expect(yThumb).toHaveClass("cursor-pointer", "hover:bg-slate-500/70");
      expect(xThumb).toHaveClass("cursor-pointer", "hover:bg-slate-500/70");
    });
  });

  test("keeps custom scrollbar layers above row content badges", async () => {
    const { container } = render(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 780,
    });

    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      const root = scrollContainer!.parentElement as HTMLDivElement | null;
      const gutter = container.querySelector("[data-vt-scrollbar-gutter]") as HTMLDivElement | null;
      const yTrack = container.querySelector('[data-vt-scrollbar="y"]') as HTMLDivElement | null;
      const xTrack = container.querySelector('[data-vt-scrollbar="x"]') as HTMLDivElement | null;

      expect(root).toHaveClass("isolate");
      expect(scrollContainer).toHaveClass("z-10");
      expect(gutter).toHaveClass("z-30");
      expect(yTrack).toHaveClass("z-30");
      expect(xTrack).toHaveClass("z-30");
    });
  });

  test("keeps the vertical scrollbar in a gutter outside the table viewport", async () => {
    const { container } = render(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 260,
    });

    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      const gutter = container.querySelector("[data-vt-scrollbar-gutter]") as HTMLDivElement | null;
      const headerBackdrop = container.querySelector(
        "[data-vt-header-backdrop]",
      ) as HTMLDivElement | null;
      const headerOverlay = container.querySelector(
        "[data-vt-header-overlay]",
      ) as HTMLDivElement | null;
      const headerGutter = container.querySelector(
        "[data-vt-header-gutter]",
      ) as HTMLDivElement | null;
      const y = container.querySelector('[data-vt-scrollbar="y"]') as HTMLDivElement | null;

      expect(gutter).not.toBeNull();
      expect(scrollContainer).toHaveClass("overscroll-x-none");
      expect(scrollContainer).toHaveClass("overscroll-y-none");
      expect(scrollContainer).toHaveClass("rounded-tl-xl");
      expect(headerBackdrop).not.toBeNull();
      expect(scrollContainer!.parentElement).toContainElement(headerBackdrop);
      expect(headerBackdrop).toHaveClass("rounded-xl", "bg-slate-100");
      expect(headerOverlay).not.toBeNull();
      expect(scrollContainer).toContainElement(headerOverlay);
      expect(headerOverlay).toHaveClass(
        "sticky",
        "left-0",
        "top-0",
        "z-10",
        "rounded-l-xl",
        "bg-slate-100",
      );
      expect(gutter).toContainElement(y);
      expect(gutter).toContainElement(headerGutter);
      expect(headerGutter).toHaveClass("rounded-r-xl", "bg-slate-100");
      expect(scrollContainer).not.toHaveClass("pr-4");
      expect(scrollContainer!.parentElement).toHaveClass("grid-cols-[minmax(0,1fr)_0.75rem]");
    });
  });

  test("keeps the header corner fixed to the viewport instead of scrolling cells", () => {
    const wideColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-40", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        rows={[{ id: "1", name: "Row 1" }]}
        columns={wideColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        minWidth="min-w-[760px]"
        virtualize={false}
      />,
    );

    const firstHeader = container.querySelector("th") as HTMLTableCellElement | null;
    const headerOverlay = container.querySelector(
      "[data-vt-header-overlay]",
    ) as HTMLDivElement | null;
    expect(firstHeader).not.toBeNull();
    expect(headerOverlay).not.toBeNull();
    expect(firstHeader!.className).not.toContain("rounded-l-xl");
    expect(firstHeader!.className).not.toContain("bg-slate-100");
    expect(firstHeader!.className).not.toContain("dark:bg-neutral-800");
    expect(headerOverlay).toHaveClass("bg-slate-100", "dark:bg-neutral-800");
  });

  test("prevents vertical wheel bounce when already at a scroll boundary", () => {
    const { container } = render(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 780,
      scrollTop: 0,
      scrollLeft: 0,
    });

    const event = createEvent.wheel(scrollContainer!, {
      deltaY: -80,
      bubbles: true,
      cancelable: true,
    });
    const preventDefault = vi.spyOn(event, "preventDefault");

    fireEvent(scrollContainer!, event);

    expect(preventDefault).toHaveBeenCalled();
  });

  test("registers wheel interception as a non-passive native listener", () => {
    const addEventListener = vi.spyOn(HTMLDivElement.prototype, "addEventListener");

    render(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    expect(addEventListener).toHaveBeenCalledWith("wheel", expect.any(Function), {
      capture: true,
      passive: false,
    });

    addEventListener.mockRestore();
  });

  test("shows vertical scrollbar after data change without requiring a user scroll", async () => {
    const { container, rerender } = render(
      <DataTable
        rows={[{ id: "1", name: "Row 1" }]}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 160,
      clientWidth: 260,
      scrollWidth: 780,
    });

    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      // only horizontal overflow so far
      expect(container.querySelector('[data-vt-scrollbar="y"]')).toBeNull();
      expect(container.querySelector('[data-vt-scrollbar="x"]')).not.toBeNull();
    });

    rerender(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer2 = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer2).not.toBeNull();
    setScrollMetrics(scrollContainer2!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 780,
    });

    await waitFor(() => {
      expect(container.querySelector('[data-vt-scrollbar="y"]')).not.toBeNull();
    });
  });

  test("thumb aligns to track edges at scroll start/end", async () => {
    const { container } = render(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 780,
      scrollTop: 0,
      scrollLeft: 0,
    });

    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      const yThumb = container.querySelector(
        '[data-vt-scrollbar="y"] [role="presentation"]',
      ) as HTMLDivElement | null;
      const xThumb = container.querySelector(
        '[data-vt-scrollbar="x"] [role="presentation"]',
      ) as HTMLDivElement | null;
      expect(yThumb).not.toBeNull();
      expect(xThumb).not.toBeNull();
      expect(yThumb!.style.top).toBe("0px");
      expect(xThumb!.style.left).toBe("0px");
    });

    // Scroll to end and verify thumb stays within track (>= 0px).
    scrollContainer!.scrollTop = 99999;
    scrollContainer!.scrollLeft = 99999;
    scrollContainer!.dispatchEvent(new Event("scroll"));

    await waitFor(() => {
      const yThumb = container.querySelector(
        '[data-vt-scrollbar="y"] [role="presentation"]',
      ) as HTMLDivElement | null;
      const xThumb = container.querySelector(
        '[data-vt-scrollbar="x"] [role="presentation"]',
      ) as HTMLDivElement | null;
      expect(yThumb).not.toBeNull();
      expect(xThumb).not.toBeNull();
      expect(parseFloat(yThumb!.style.top)).toBeGreaterThanOrEqual(0);
      expect(parseFloat(xThumb!.style.left)).toBeGreaterThanOrEqual(0);
    });
  });

  test("vertical track starts below sticky header", async () => {
    const { container } = render(
      <DataTable
        rows={Array.from({ length: 60 }, (_, i) => ({ id: String(i), name: `Row ${i}` }))}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    expect(scrollContainer).not.toBeNull();

    const thead = container.querySelector("thead") as HTMLTableSectionElement | null;
    expect(thead).not.toBeNull();
    Object.defineProperty(thead!, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          right: 0,
          bottom: 40,
          width: 0,
          height: 40,
          toJSON: () => ({}),
        }) as DOMRect,
    });

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 780,
    });

    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      const track = container.querySelector('[data-vt-scrollbar="y"]') as HTMLDivElement | null;
      expect(track).not.toBeNull();
      expect(track!.style.top).toBe("48px"); // header 40 + inset 8
    });
  });
});
