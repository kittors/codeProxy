import { createEvent, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";

interface DemoRow {
  id: string;
  name: string;
}

const columns: VirtualTableColumn<DemoRow>[] = [
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

describe("VirtualTable scrollbar wrapper", () => {
  test("uses a focusable scroll container with hover-reveal metadata", () => {
    const { container } = render(
      <VirtualTable
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

  test("renders DOM scrollbars only when overflow exists", async () => {
    const { container } = render(
      <VirtualTable
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
      <VirtualTable
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
      <VirtualTable
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
      <VirtualTable
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
    const wideColumns: VirtualTableColumn<DemoRow>[] = [
      { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
      { key: "id", label: "ID", width: "w-40", render: (row) => row.id },
    ];

    const { container } = render(
      <VirtualTable
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
      <VirtualTable
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

  test("shows vertical scrollbar after data change without requiring a user scroll", async () => {
    const { container, rerender } = render(
      <VirtualTable
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
      <VirtualTable
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
      <VirtualTable
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
      <VirtualTable
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
