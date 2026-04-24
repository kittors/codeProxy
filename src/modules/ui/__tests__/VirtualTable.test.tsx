import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";

interface DemoRow {
  id: string;
  name: string;
  value: string;
}

const columns: VirtualTableColumn<DemoRow>[] = [
  {
    key: "name",
    label: "Name",
    width: "w-40",
    render: (row) => row.name,
  },
  {
    key: "value",
    label: "Value",
    width: "w-40",
    render: (row) => row.value,
  },
];

const rows: DemoRow[] = Array.from({ length: 18 }, (_, index) => ({
  id: `row-${index}`,
  name: `Row ${index + 1}`,
  value: `Value ${index + 1}`,
}));

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

describe("VirtualTable scroll indicators", () => {
  test("shows overflow indicators and updates thumb position while scrolling", async () => {
    const { container } = render(
      <VirtualTable
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
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

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    const verticalScrollbar = await screen.findByTestId("virtual-table-scrollbar-y");
    const horizontalScrollbar = await screen.findByTestId("virtual-table-scrollbar-x");
    const verticalThumb = screen.getByTestId("virtual-table-scrollbar-y-thumb");
    const horizontalThumb = screen.getByTestId("virtual-table-scrollbar-x-thumb");

    expect(verticalScrollbar).toBeInTheDocument();
    expect(horizontalScrollbar).toBeInTheDocument();

    const initialVerticalTransform = verticalThumb.style.transform;
    const initialHorizontalTransform = horizontalThumb.style.transform;

    act(() => {
      scrollContainer!.scrollTop = 240;
      scrollContainer!.scrollLeft = 260;
      fireEvent.scroll(scrollContainer!);
    });

    await waitFor(() => {
      expect(screen.getByTestId("virtual-table-scrollbar-y-thumb").style.transform).not.toBe(
        initialVerticalTransform,
      );
      expect(screen.getByTestId("virtual-table-scrollbar-x-thumb").style.transform).not.toBe(
        initialHorizontalTransform,
      );
    });
  });

  test("hides overflow indicators when content fits in the viewport", async () => {
    const { container } = render(
      <VirtualTable
        rows={rows.slice(0, 2)}
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
      scrollWidth: 260,
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(screen.queryByTestId("virtual-table-scrollbar-y")).not.toBeInTheDocument();
      expect(screen.queryByTestId("virtual-table-scrollbar-x")).not.toBeInTheDocument();
    });
  });
});
