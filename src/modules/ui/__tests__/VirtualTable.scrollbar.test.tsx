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
      expect(container.querySelector('[data-vt-scrollbar="y"]')).not.toBeNull();
      expect(container.querySelector('[data-vt-scrollbar="x"]')).not.toBeNull();
    });
  });
});
