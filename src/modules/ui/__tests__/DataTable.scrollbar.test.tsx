import { createEvent, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi, beforeEach } from "vitest";
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
    const resizer = container.querySelector("[data-vt-column-resizer]") as HTMLButtonElement | null;
    expect(scrollContainer).not.toBeNull();
    expect(resizer).not.toBeNull();

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
    Object.defineProperties(resizer!, {
      getBoundingClientRect: {
        configurable: true,
        value: () =>
          ({
            x: 196,
            y: 100,
            top: 100,
            left: 196,
            right: 212,
            bottom: 140,
            width: 16,
            height: 40,
            toJSON: () => ({}),
          }) as DOMRect,
      },
      offsetWidth: { configurable: true, value: 16 },
    });
    setScrollMetrics(scrollContainer!, {
      clientHeight: 220,
      scrollHeight: 560,
      clientWidth: 580,
      scrollWidth: 900,
    });

    fireEvent.pointerDown(resizer!, { button: 0, pointerId: 2, clientX: 200, clientY: 120 });
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 2, clientX: 240, clientY: 250 }),
    );

    const status = await screen.findByRole("status");
    const previewLine = status.previousElementSibling as HTMLDivElement | null;
    expect(previewLine).not.toBeNull();
    expect(previewLine!.style.left).toBe("239px");
    expect(previewLine!.style.top).toBe("100px");
    expect(previewLine!.style.height).toBe("206px");
    expect(status).toHaveTextContent("Width: 200 px");
  });

  test("keeps the resize preview aligned to the live pointer instead of stale table layout", async () => {
    window.localStorage.clear();
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", minWidthPx: 80, render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        tableId="test-resize-preview-live-pointer"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[180px]"
        minHeight="min-h-0"
        minWidth="min-w-[760px]"
        virtualize={false}
      />,
    );

    const root = container.firstElementChild as HTMLDivElement;
    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    const resizer = container.querySelector("[data-vt-column-resizer]") as HTMLButtonElement | null;
    expect(scrollContainer).not.toBeNull();
    expect(resizer).not.toBeNull();

    Object.defineProperty(root, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 100,
          y: 40,
          top: 40,
          left: 100,
          right: 700,
          bottom: 260,
          width: 600,
          height: 220,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    Object.defineProperty(scrollContainer!, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 100,
          y: 40,
          top: 40,
          left: 100,
          right: 700,
          bottom: 220,
          width: 600,
          height: 180,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({
          x: 120,
          y: 40,
          top: 40,
          left: 120,
          right: 280,
          bottom: 80,
          width: 160,
          height: 40,
          toJSON: () => ({}),
        }) as DOMRect,
    });
    Object.defineProperties(resizer!, {
      getBoundingClientRect: {
        configurable: true,
        value: () =>
          ({
            x: 500,
            y: 40,
            top: 40,
            left: 500,
            right: 516,
            bottom: 80,
            width: 16,
            height: 40,
            toJSON: () => ({}),
          }) as DOMRect,
      },
      offsetWidth: { configurable: true, value: 16 },
    });
    setScrollMetrics(scrollContainer!, {
      clientHeight: 180,
      scrollHeight: 320,
      clientWidth: 600,
      scrollWidth: 760,
    });

    fireEvent.pointerDown(resizer!, { button: 0, pointerId: 8, clientX: 280, clientY: 60 });
    window.dispatchEvent(
      new PointerEvent("pointermove", { pointerId: 8, clientX: 360, clientY: 100 }),
    );

    const status = await screen.findByRole("status");
    const previewLine = status.previousElementSibling as HTMLDivElement | null;
    expect(previewLine).not.toBeNull();
    expect(previewLine!.style.left).toBe("359px");
    expect(status).toHaveTextContent("Width: 240 px");
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

  test("updates horizontal scrollbar immediately as resized columns cross overflow boundary", async () => {
    window.localStorage.clear();
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", minWidthPx: 80, render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        tableId="test-column-width-scroll-metrics"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        minWidth="min-w-[240px]"
        virtualize={false}
      />,
    );

    const scrollContainer = container.querySelector(".table-scrollbar") as HTMLDivElement | null;
    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    const resizer = container.querySelector("[data-vt-column-resizer]") as HTMLButtonElement | null;
    expect(scrollContainer).not.toBeNull();
    expect(resizer).not.toBeNull();

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
    Object.defineProperties(resizer!, {
      getBoundingClientRect: {
        configurable: true,
        value: () =>
          ({
            x: 156,
            y: 0,
            top: 0,
            left: 156,
            right: 172,
            bottom: 40,
            width: 16,
            height: 40,
            toJSON: () => ({}),
          }) as DOMRect,
      },
      offsetWidth: { configurable: true, value: 16 },
    });

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 160,
      clientWidth: 300,
      scrollWidth: 300,
    });
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      expect(container.querySelector('[data-vt-scrollbar="x"]')).toBeNull();
    });

    fireEvent.pointerDown(resizer!, { button: 0, pointerId: 7, clientX: 160, clientY: 20 });
    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 160,
      clientWidth: 300,
      scrollWidth: 380,
    });
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 240 }));

    await waitFor(() => {
      expect(container.querySelector('[data-vt-scrollbar="x"]')).not.toBeNull();
    });

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 160,
      clientWidth: 300,
      scrollWidth: 300,
      scrollLeft: 80,
    });
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 7, clientX: 100 }));

    await waitFor(() => {
      expect(scrollContainer!.scrollLeft).toBe(0);
      expect(container.querySelector('[data-vt-scrollbar="x"]')).toBeNull();
    });

    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 7, clientX: 100 }));
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
        "z-40",
        "rounded-xl",
        "bg-slate-100",
      );
      expect(gutter).toContainElement(y);
      expect(gutter).toContainElement(headerGutter);
      expect(headerGutter).toHaveClass("rounded-r-xl", "bg-slate-100");
      expect(scrollContainer).not.toHaveClass("pr-4");
      expect(scrollContainer!.parentElement).toHaveClass("grid-cols-[minmax(0,1fr)_0.75rem]");
    });
  });

  test("keeps the sticky header opaque above scrolling body cells", () => {
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

    const header = container.querySelector("thead") as HTMLTableSectionElement | null;
    const firstHeader = container.querySelector("th") as HTMLTableCellElement | null;
    const lastHeader = container.querySelectorAll("th").item(1) as HTMLTableCellElement | null;
    const headerOverlay = container.querySelector(
      "[data-vt-header-overlay]",
    ) as HTMLDivElement | null;
    expect(header).not.toBeNull();
    expect(firstHeader).not.toBeNull();
    expect(lastHeader).not.toBeNull();
    expect(headerOverlay).not.toBeNull();
    expect(header).toHaveClass("sticky", "top-0", "z-50");
    expect(header).not.toHaveClass("bg-slate-100");
    expect(firstHeader).not.toHaveClass("rounded-l-xl");
    expect(lastHeader).not.toHaveClass("rounded-r-xl");
    expect(firstHeader).not.toHaveClass("bg-slate-100");
    expect(headerOverlay).toHaveClass(
      "sticky",
      "left-0",
      "top-0",
      "z-40",
      "rounded-xl",
      "bg-slate-100",
      "dark:bg-neutral-800",
    );
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

// ---------------------------------------------------------------------------
// Column reorder tests
// ---------------------------------------------------------------------------
describe("DataTable column reorder", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test("renders reorder handles only for movable columns", () => {
    const threeColumns: DataTableColumn<DemoRow>[] = [
      { key: "select", label: "Select", width: "w-12", render: () => "x" },
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "actions", label: "Actions", width: "w-24", render: () => "..." },
    ];

    const { container } = render(
      <DataTable
        tableId="test-reorder-handles"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={threeColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const handles = container.querySelectorAll("[data-vt-column-reorder-handle]");
    expect(handles).toHaveLength(1);
    expect(handles[0]).toHaveAttribute("title", "Drag to reorder Name column");
  });

  test("reserves header label space for the reorder handle", () => {
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    render(
      <DataTable
        tableId="test-reorder-header-padding"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    const headerContent = nameHeader.querySelector("[data-vt-column-header-content]");
    expect(nameHeader.querySelector("[data-vt-column-reorder-handle]")).not.toBeNull();
    expect(headerContent).toHaveClass("pl-5");
  });

  test("does not render reorder handles for select and actions columns", () => {
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "select", label: "Select", width: "w-12", render: () => "x" },
      { key: "actions", label: "Actions", width: "w-24", render: () => "..." },
    ];

    const { container } = render(
      <DataTable
        tableId="test-no-reorder-handles"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    expect(container.querySelectorAll("[data-vt-column-reorder-handle]")).toHaveLength(0);
  });

  test("does not render reorder handles when tableId is missing", () => {
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    expect(container.querySelectorAll("[data-vt-column-reorder-handle]")).toHaveLength(0);
  });

  test("reorders header, body cells, and colgroup after dragging a column handle", async () => {
    window.localStorage.clear();
    const columns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        tableId="test-column-reorder"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    const idHeader = screen.getByRole("columnheader", { name: /ID/ });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({ left: 0, width: 160, top: 0, height: 40, right: 160 }) as DOMRect,
    });
    Object.defineProperty(idHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({ left: 160, width: 96, top: 0, height: 40, right: 256 }) as DOMRect,
    });

    const handle = container.querySelector("[data-vt-column-reorder-handle]") as HTMLButtonElement;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 20, clientY: 20 });
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 220, clientY: 20 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 220, clientY: 20 }));

    await waitFor(() => {
      const headers = screen.getAllByRole("columnheader").map((node) => node.textContent);
      expect(headers.join("|")).toContain("ID|Name");
    });

    // Verify body cells are also reordered (now id before name)
    const cells = container.querySelectorAll("tbody td");
    expect(cells).toHaveLength(2);
    expect(cells[0].textContent).toBe("1");
    expect(cells[1].textContent).toContain("Row 1");

    // Verify colgroup has the correct number of elements (order verified by col+header+body consistency)
    const cols = container.querySelectorAll("colgroup col");
    expect(cols).toHaveLength(2);

    expect(
      window.localStorage.getItem("codeProxy.dataTable.columnOrder.v1.test-column-reorder"),
    ).toBe(JSON.stringify(["id", "name"]));
  });

  test("normalizes stale column order cache against current columns", () => {
    window.localStorage.setItem(
      "codeProxy.dataTable.columnOrder.v1.test-column-order-normalize",
      JSON.stringify(["stale", "id"]),
    );

    const { container } = render(
      <DataTable
        tableId="test-column-order-normalize"
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

    const colElements = container.querySelectorAll("col");
    expect(colElements).toHaveLength(2);
    expect(
      screen
        .getAllByRole("columnheader")
        .map((node) => node.textContent)
        .join("|"),
    ).toContain("ID|Name");
  });

  test("keeps column order caches isolated between table ids", () => {
    window.localStorage.setItem(
      "codeProxy.dataTable.columnOrder.v1.first-table",
      JSON.stringify(["id", "name"]),
    );
    window.localStorage.setItem(
      "codeProxy.dataTable.columnOrder.v1.second-table",
      JSON.stringify(["name", "id"]),
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

    const headers = container.querySelectorAll("thead th");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("Name");
    expect(headers[1]).toHaveTextContent("ID");
  });

  test("suppresses reorder handles when columnReorderable is false", () => {
    const twoColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        tableId="test-no-reorder"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={twoColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
        columnReorderable={false}
      />,
    );

    expect(container.querySelectorAll("[data-vt-column-reorder-handle]")).toHaveLength(0);
  });

  test("restores persisted column order on re-mount", () => {
    window.localStorage.setItem(
      "codeProxy.dataTable.columnOrder.v1.test-restore",
      JSON.stringify(["id", "name"]),
    );

    const { container } = render(
      <DataTable
        tableId="test-restore"
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

    const headers = container.querySelectorAll("thead th");
    expect(headers).toHaveLength(2);
    expect(headers[0]).toHaveTextContent("ID");
    expect(headers[1]).toHaveTextContent("Name");
  });

  test("persistColumnOrder=false ignores cache but reorder still works in-session", async () => {
    window.localStorage.clear();
    const SENTINEL = ["STALE_CACHE_MARKER"];
    window.localStorage.setItem(
      "codeProxy.dataTable.columnOrder.v1.test-persist-off",
      JSON.stringify(SENTINEL),
    );

    const { container } = render(
      <DataTable
        tableId="test-persist-off"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={[
          { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
          { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
        ]}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
        persistColumnOrder={false}
      />,
    );

    // Should ignore cache and use default (name, id) order
    const headers = container.querySelectorAll("thead th");
    expect(headers[0]).toHaveTextContent("Name");
    expect(headers[1]).toHaveTextContent("ID");

    // Drag Name column past ID to verify in-session reorder still works
    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    const idHeader = screen.getByRole("columnheader", { name: /ID/ });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({ left: 0, width: 160, top: 0, height: 40, right: 160 }) as DOMRect,
    });
    Object.defineProperty(idHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({ left: 160, width: 96, top: 0, height: 40, right: 256 }) as DOMRect,
    });

    const handle = container.querySelector("[data-vt-column-reorder-handle]") as HTMLButtonElement;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 220, clientY: 10 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 220, clientY: 10 }));

    await waitFor(() => {
      const updatedHeaders = container.querySelectorAll("thead th");
      expect(updatedHeaders[0]).toHaveTextContent("ID");
      expect(updatedHeaders[1]).toHaveTextContent("Name");
    });

    // Verify localStorage was NOT written (persistColumnOrder=false).
    // Sentinel value ensures the assertion catches false writes, even if
    // the written value happens to match the drag result.
    expect(
      window.localStorage.getItem("codeProxy.dataTable.columnOrder.v1.test-persist-off"),
    ).toBe(JSON.stringify(SENTINEL));
  });

  test("does not render reorder handles for columns with custom lockOrder", () => {
    const threeColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", lockOrder: "start", render: (row) => row.name },
      { key: "email", label: "Email", width: "w-40", render: () => "a@b.com" },
      { key: "actions", label: "Actions", width: "w-24", lockOrder: "end", render: () => "..." },
    ];

    const { container } = render(
      <DataTable
        tableId="test-lock-order"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={threeColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const handles = container.querySelectorAll("[data-vt-column-reorder-handle]");
    expect(handles).toHaveLength(1);
    expect(handles[0]).toHaveAttribute("data-vt-column-reorder-handle");
  });

  test("reorders columns correctly when dragging three columns rightward", async () => {
    window.localStorage.clear();
    const threeColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "email", label: "Email", width: "w-40", render: () => "a@b.com" },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container } = render(
      <DataTable
        tableId="test-three-col-drag"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={threeColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    const emailHeader = screen.getByRole("columnheader", { name: /Email/ });
    const idHeader = screen.getByRole("columnheader", { name: /ID/ });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, width: 160, top: 0, height: 40, right: 160 }) as DOMRect,
    });
    Object.defineProperty(emailHeader, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 160, width: 160, top: 0, height: 40, right: 320 }) as DOMRect,
    });
    Object.defineProperty(idHeader, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 320, width: 96, top: 0, height: 40, right: 416 }) as DOMRect,
    });

    // Drag the first column (Name) rightward past Email to position 2
    const handle = container.querySelector("[data-vt-column-reorder-handle]") as HTMLButtonElement;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 300, clientY: 10 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 300, clientY: 10 }));

    await waitFor(() => {
      const headers = screen.getAllByRole("columnheader");
      expect(headers[0]).toHaveTextContent("Email");
      expect(headers[1]).toHaveTextContent("Name");
      expect(headers[2]).toHaveTextContent("ID");
    });

    // Verify localStorage
    expect(
      window.localStorage.getItem("codeProxy.dataTable.columnOrder.v1.test-three-col-drag"),
    ).toBe(JSON.stringify(["email", "name", "id"]));
  });

  test("respects end-locked boundary when dragging near actions column", async () => {
    window.localStorage.clear();
    const columns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "email", label: "Email", width: "w-40", render: () => "a@b.com" },
      { key: "actions", label: "Actions", width: "w-24", render: () => "..." },
    ];

    const { container } = render(
      <DataTable
        tableId="test-end-locked-boundary"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
      />,
    );

    const actionHeader = screen.getByRole("columnheader", { name: /Actions/ });
    const emailHeader = screen.getByRole("columnheader", { name: /Email/ });
    Object.defineProperty(actionHeader, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 320, width: 96, top: 0, height: 40, right: 416 }) as DOMRect,
    });
    Object.defineProperty(emailHeader, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 160, width: 160, top: 0, height: 40, right: 320 }) as DOMRect,
    });

    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 0, width: 160, top: 0, height: 40, right: 160 }) as DOMRect,
    });

    // Drag Name column past the movable boundary (toward actions, should stop before actions)
    const handle = container.querySelector("[data-vt-column-reorder-handle]") as HTMLButtonElement;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 400, clientY: 10 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 400, clientY: 10 }));

    await waitFor(() => {
      const headers = screen.getAllByRole("columnheader");
      // Name should swap with Email but not cross past actions
      expect(headers[0]).toHaveTextContent("Email");
      expect(headers[1]).toHaveTextContent("Name");
      expect(headers[2]).toHaveTextContent("Actions");
    });
  });

  test("persistColumnOrder=false preserves reorder across columns array identity change", async () => {
    window.localStorage.clear();
    const baseColumns: DataTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
    ];

    const { container, rerender } = render(
      <DataTable
        tableId="test-identity-preserve"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={baseColumns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
        persistColumnOrder={false}
      />,
    );

    const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
    const idHeader = screen.getByRole("columnheader", { name: /ID/ });
    Object.defineProperty(nameHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({ left: 0, width: 160, top: 0, height: 40, right: 160 }) as DOMRect,
    });
    Object.defineProperty(idHeader, "getBoundingClientRect", {
      configurable: true,
      value: () =>
        ({ left: 160, width: 96, top: 0, height: 40, right: 256 }) as DOMRect,
    });

    // Reorder: drag Name right past ID
    const handle = container.querySelector("[data-vt-column-reorder-handle]") as HTMLButtonElement;
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 10, clientY: 10 });
    window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 220, clientY: 10 }));
    window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 220, clientY: 10 }));

    await waitFor(() => {
      const updatedHeaders = container.querySelectorAll("thead th");
      expect(updatedHeaders[0]).toHaveTextContent("ID");
      expect(updatedHeaders[1]).toHaveTextContent("Name");
    });

    // Rerender with new columns array reference (same keys)
    rerender(
      <DataTable
        tableId="test-identity-preserve"
        rows={[{ id: "1", name: "Row 1" }]}
        columns={[...baseColumns]}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
        persistColumnOrder={false}
      />,
    );

    // In-session reorder should survive the columns identity change
    const finalHeaders = container.querySelectorAll("thead th");
    expect(finalHeaders[0]).toHaveTextContent("ID");
    expect(finalHeaders[1]).toHaveTextContent("Name");
  });
});
