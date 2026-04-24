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

describe("VirtualTable", () => {
  test("renders the shared scroll container for overflow tables", async () => {
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
    expect(scrollContainer).toHaveClass("overflow-auto");
    expect(scrollContainer).toHaveAttribute("data-scrollbar-visibility", "hover");
    expect(scrollContainer).toHaveAttribute("tabindex", "0");

    setScrollMetrics(scrollContainer!, {
      clientHeight: 160,
      scrollHeight: 640,
      clientWidth: 260,
      scrollWidth: 780,
    });

    act(() => {
      window.dispatchEvent(new Event("resize"));
    });

    act(() => {
      fireEvent.scroll(scrollContainer!);
    });

    await waitFor(() => {
      expect(screen.getByRole("table", { name: "data table" })).toBeInTheDocument();
    });
  });

  test("renders empty text when there are no rows", async () => {
    render(
      <VirtualTable
        rows={[]}
        columns={columns}
        rowKey={(row) => row.id}
        height="h-[160px]"
        minHeight="min-h-0"
        virtualize={false}
        emptyText="No rows"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No rows")).toBeInTheDocument();
    });
  });
});
