import { render, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
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
});
