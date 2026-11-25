import i18n from "@code-proxy/i18n";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DataGrid } from "../DataGrid";
import type { DataGridColumn, DataGridProps, GridFilters, GridSort } from "../types";

type Row = { id: string; name: string; tokens: number; status: "ok" | "failed" };

const ROWS: Row[] = [
  { id: "r1", name: "alpha", tokens: 120, status: "ok" },
  { id: "r2", name: "bravo", tokens: 5_400, status: "failed" },
  { id: "r3", name: "charlie", tokens: 90, status: "ok" },
  { id: "r4", name: "delta", tokens: 18_000, status: "ok" },
];

const COLUMNS: DataGridColumn<Row>[] = [
  { id: "name", header: "Name", pin: "start", width: 120, sortable: true, cell: (row) => row.name },
  {
    id: "tokens",
    header: "Tokens",
    align: "end",
    width: 90,
    sortable: true,
    headerHint: "Input tokens",
    cell: (row) => row.tokens,
  },
  {
    id: "status",
    header: "Status",
    pin: "end",
    width: 100,
    filter: {
      type: "options",
      options: [
        { value: "ok", label: "OK", count: 3 },
        { value: "failed", label: "Failed", count: 1 },
      ],
    },
    cell: (row) => row.status,
  },
];

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;

function Harness({
  onSort,
  onFiltersChange,
  ...rest
}: Partial<DataGridProps<Row>> & { onSort?: (sort: GridSort | null) => void }) {
  const [sort, setSort] = useState<GridSort | null>(null);
  const [filters, setFilters] = useState<GridFilters>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  return (
    <DataGrid
      label="Test grid"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(row) => row.id}
      sort={sort}
      onSortChange={(next) => {
        setSort(next);
        onSort?.(next);
      }}
      filters={filters}
      onFiltersChange={(next) => {
        setFilters(next);
        onFiltersChange?.(next);
      }}
      selectable
      selectedKeys={selected}
      onSelectedKeysChange={setSelected}
      renderExpanded={(row) => <div>Details of {row.name}</div>}
      expandedKeys={expanded}
      onExpandedKeysChange={setExpanded}
      {...rest}
    />
  );
}

const bodyRows = () => screen.getAllByRole("row").filter((row) => row.hasAttribute("data-row-key"));

afterEach(() => {
  window.localStorage.clear();
});

describe("DataGrid header", () => {
  test("点击表头排序：数字列先降序、再升序、再取消，并同步 aria-sort", async () => {
    const onSort = vi.fn();
    render(<Harness onSort={onSort} />);
    const header = screen.getByRole("columnheader", { name: /Tokens/ });
    expect(header).toHaveAttribute("aria-sort", "none");
    const button = within(header).getByRole("button", { name: /Tokens/ });

    await userEvent.click(button);
    expect(onSort).toHaveBeenLastCalledWith({ columnId: "tokens", direction: "desc" });
    expect(header).toHaveAttribute("aria-sort", "descending");

    await userEvent.click(button);
    expect(onSort).toHaveBeenLastCalledWith({ columnId: "tokens", direction: "asc" });
    expect(header).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(button);
    expect(onSort).toHaveBeenLastCalledWith(null);
    expect(header).toHaveAttribute("aria-sort", "none");
  });

  test("固定列是 sticky：左侧列的偏移算上复选框与展开列，右侧列贴右边", () => {
    render(<Harness />);
    const name = screen.getByRole("columnheader", { name: /Name/ });
    const status = screen.getByRole("columnheader", { name: /Status/ });
    expect(name).toHaveAttribute("data-pin", "start");
    // 复选框 40 + 展开 28 个设计像素，jsdom 根字号 16px 时比例为 1
    expect(name.style.left).toBe("68px");
    expect(status.style.right).toBe("0px");
    expect(name).toHaveAttribute("data-pin-edge", "start");
    expect(status).toHaveAttribute("data-pin-edge", "end");
  });

  test("列宽把手可以用方向键调整并持久化，回车按内容自适应", async () => {
    render(<Harness id="grid-test" />);
    const handle = screen.getByRole("separator", {
      name: tr("data_grid.resize_column", { column: "Tokens" }),
    });
    expect(handle).toHaveAttribute("aria-valuenow", "90");
    handle.focus();
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(handle).toHaveAttribute("aria-valuenow", "98");
    fireEvent.keyDown(handle, { key: "ArrowLeft", shiftKey: true });
    expect(handle).toHaveAttribute("aria-valuenow", "66");
    const stored = JSON.parse(window.localStorage.getItem("cp-grid:grid-test:v1") ?? "{}");
    expect(stored.widths).toEqual({ tokens: 66 });
    // 没有被截断的内容时，回车恢复默认宽度
    fireEvent.keyDown(handle, { key: "Enter" });
    expect(handle).toHaveAttribute("aria-valuenow", "90");
  });

  test("表头筛选：勾选后点应用才生效，表头出现激活标记", async () => {
    const onFiltersChange = vi.fn();
    render(<Harness onFiltersChange={onFiltersChange} />);
    const trigger = screen.getByRole("button", {
      name: tr("data_grid.filter_column", { column: "Status" }),
    });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", {
      name: tr("data_grid.column_menu", { column: "Status" }),
    });
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Failed/ }));
    expect(onFiltersChange).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole("button", { name: tr("data_grid.apply") }));
    expect(onFiltersChange).toHaveBeenCalledWith({
      status: { type: "options", values: ["failed"] },
    });
    expect(trigger).toHaveAttribute("data-active", "true");
  });
});

describe("DataGrid selection", () => {
  test("全选、半选与 Shift 连选，选择条显示条数并能取消", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const selectPage = screen.getByRole("checkbox", { name: tr("data_grid.select_page") });
    const rowBoxes = screen.getAllByRole("checkbox", { name: tr("data_grid.select_row") });

    await user.click(rowBoxes[0]);
    expect(selectPage).toHaveAttribute("aria-checked", "mixed");
    expect(bodyRows()[0]).toHaveAttribute("aria-selected", "true");

    await user.keyboard("{Shift>}");
    await user.click(rowBoxes[2]);
    await user.keyboard("{/Shift}");
    expect(bodyRows().map((row) => row.getAttribute("aria-selected"))).toEqual([
      "true",
      "true",
      "true",
      "false",
    ]);
    const bar = document.querySelector<HTMLElement>("[data-grid-selection-bar]");
    expect(bar).not.toBeNull();
    expect(
      within(bar as HTMLElement).getByText(tr("data_grid.selected_rows", { count: 3 })),
    ).toBeInTheDocument();

    await user.click(selectPage);
    expect(selectPage).toBeChecked();
    expect(bodyRows().every((row) => row.getAttribute("aria-selected") === "true")).toBe(true);

    await user.click(screen.getByRole("button", { name: tr("data_grid.clear_selection") }));
    expect(bodyRows().every((row) => row.getAttribute("aria-selected") === "false")).toBe(true);
  });
});

describe("DataGrid rows", () => {
  test("点行展开详情，回车与 Esc 也能开合，方向键在行之间移动焦点", async () => {
    render(<Harness />);
    const [first, second] = bodyRows();
    await userEvent.click(within(first).getByText("alpha"));
    expect(first).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("Details of alpha")).toBeInTheDocument();

    first.focus();
    fireEvent.keyDown(first, { key: "Escape" });
    expect(first).toHaveAttribute("aria-expanded", "false");

    fireEvent.keyDown(first, { key: "ArrowDown" });
    expect(second).toHaveFocus();
    fireEvent.keyDown(second, { key: "Enter" });
    expect(second).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(second, { key: " " });
    expect(second).toHaveAttribute("aria-selected", "true");
  });

  test("只有一行可以 Tab 进入（漫游焦点）", () => {
    render(<Harness />);
    const tabbable = bodyRows().filter((row) => row.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
  });
});

describe("DataGrid states", () => {
  test("首次加载显示骨架，表格标记忙碌", () => {
    render(<Harness rows={[]} loading />);
    expect(screen.getByRole("grid", { name: "Test grid" })).toHaveAttribute("aria-busy", "true");
    expect(bodyRows()).toHaveLength(0);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  test("已有数据时刷新：保留行，表头下沿出现进度条", () => {
    render(<Harness loading />);
    expect(bodyRows()).toHaveLength(4);
    expect(screen.getByRole("progressbar", { name: tr("data_grid.loading") })).toBeInTheDocument();
  });

  test("空态显示页面给的标题和操作", () => {
    render(
      <Harness
        rows={[]}
        empty={{ title: "Nothing here", action: <button type="button">Reset</button> }}
      />,
    );
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: tr("data_grid.select_page") })).toBeDisabled();
  });

  test("错误态保留表头，点重试回调页面", async () => {
    const onRetry = vi.fn();
    render(<Harness error="Gateway timeout" onRetry={onRetry} />);
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Gateway timeout");
    expect(screen.getByRole("columnheader", { name: /Tokens/ })).toBeInTheDocument();
    await userEvent.click(within(alert).getByRole("button", { name: tr("data_grid.retry") }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  test("默认是四边封闭的圆角外框，嵌入小表可以关掉", () => {
    const { container, rerender } = render(<Harness />);
    const root = container.querySelector(".cp-grid");
    expect(root).toHaveClass("cp-grid-frame", "cp-edge", "rounded-xl", "overflow-hidden");
    rerender(<Harness frame={false} />);
    expect(container.querySelector(".cp-grid")).not.toHaveClass("cp-grid-frame");
  });

  test("空态可以在标题和操作之间写出补充内容（例如生效的筛选条件）", () => {
    render(
      <Harness
        rows={[]}
        empty={{
          title: "No matches",
          details: <span>Model: Alpha</span>,
          action: <button type="button">Clear</button>,
        }}
      />,
    );
    expect(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByText("Model: Alpha")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();
  });

  test("隐藏列不渲染", () => {
    render(<Harness hiddenColumnIds={new Set(["tokens"])} />);
    expect(screen.queryByRole("columnheader", { name: /Tokens/ })).not.toBeInTheDocument();
  });
});

describe("DataGrid column menu", () => {
  test("列菜单里能排序，也能隐藏非固定列", async () => {
    const onHidden = vi.fn();
    const onSort = vi.fn();
    const columns: DataGridColumn<Row>[] = COLUMNS.map((column) =>
      column.id === "tokens"
        ? {
            ...column,
            filter: { type: "range", unit: "tokens", presets: [{ label: "≥ 1K", min: 1000 }] },
          }
        : column,
    );
    render(<Harness columns={columns} onSort={onSort} onHiddenColumnIdsChange={onHidden} />);
    await userEvent.click(
      screen.getByRole("button", { name: tr("data_grid.filter_column", { column: "Tokens" }) }),
    );
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: tr("data_grid.sort_asc") }));
    expect(onSort).toHaveBeenLastCalledWith({ columnId: "tokens", direction: "asc" });

    await userEvent.click(within(dialog).getByRole("button", { name: "≥ 1K" }));
    expect(within(dialog).getByRole("textbox", { name: tr("data_grid.min") })).toHaveValue("1000");

    await userEvent.click(
      within(dialog).getByRole("button", { name: tr("data_grid.hide_column") }),
    );
    expect(onHidden).toHaveBeenCalledWith(new Set(["tokens"]));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
});
