import i18n from "@code-proxy/i18n";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { HoverTooltip } from "../../overlays/Tooltip";
import { DataGrid } from "../DataGrid";
import { GridRowActions } from "../GridRowActions";
import { moveGridRow } from "../gridOrder";
import type { DataGridColumn } from "../types";

/**
 * 旧 DataTable 有、迁移时不能丢的能力：非受控排序、拖动换列（键盘路径）与持久化、拖动排行、
 * 点行、当前行、行类名、截断全文提示、行操作列的空位与「更多」。
 */

type Row = { id: string; name: string; tokens: number };

const ROWS: Row[] = [
  { id: "r1", name: "bravo", tokens: 20 },
  { id: "r2", name: "alpha", tokens: 300 },
  { id: "r3", name: "charlie", tokens: 1 },
];

const COLUMNS: DataGridColumn<Row>[] = [
  {
    id: "name",
    header: "Name",
    width: 120,
    sortable: true,
    sortValue: (row) => row.name,
    cell: (row) => row.name,
  },
  {
    id: "tokens",
    header: "Tokens",
    align: "end",
    width: 90,
    sortable: true,
    sortValue: (row) => row.tokens,
    cell: (row) => row.tokens,
  },
  {
    id: "note",
    header: "Note",
    width: 90,
    cell: (row) => <span className="truncate">{`note ${row.id}`}</span>,
  },
];

const tr = (key: string, options?: Record<string, unknown>) => i18n.t(key, options) as string;
const headerIds = (container: HTMLElement) =>
  [...container.querySelectorAll("th[data-col]")].map((cell) => cell.getAttribute("data-col"));

afterEach(() => {
  window.localStorage.clear();
});

describe("非受控排序", () => {
  test("不传 sort 时点表头在本地排好再显示", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <DataGrid label="t" columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} />,
    );
    const keys = () =>
      [...container.querySelectorAll("tr[data-row-key]")].map((row) =>
        row.getAttribute("data-row-key"),
      );
    expect(keys()).toEqual(["r1", "r2", "r3"]);
    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(keys()).toEqual(["r2", "r1", "r3"]);
    // 数字列第一次点是降序，再点一次升序
    await user.click(screen.getByRole("button", { name: "Tokens" }));
    expect(keys()).toEqual(["r2", "r1", "r3"]);
    await user.click(screen.getByRole("button", { name: "Tokens" }));
    expect(keys()).toEqual(["r3", "r1", "r2"]);
  });
});

describe("拖动换列", () => {
  test("聚焦把手按 → 把列往后挪一格，写进视图偏好并报出新位置", async () => {
    const { container } = render(
      <DataGrid
        id="parity-order"
        label="t"
        columns={COLUMNS}
        rows={ROWS}
        rowKey={(row) => row.id}
      />,
    );
    expect(headerIds(container)).toEqual(["name", "tokens", "note"]);
    const grip = screen.getByRole("button", {
      name: tr("common.reorder_column", { column: "Name" }),
    });
    grip.focus();
    fireEvent.keyDown(grip, { key: "ArrowRight" });
    expect(headerIds(container)).toEqual(["tokens", "name", "note"]);
    expect(
      JSON.parse(window.localStorage.getItem("cp-grid:parity-order:v1") ?? "{}").order,
    ).toEqual(["tokens", "name", "note"]);
    expect(screen.getByRole("status")).toHaveTextContent(
      tr("data_grid.announce_column_moved", { column: "Name", position: 2 }),
    );
    // 焦点留在被移动那一列的把手上，可以接着按
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: tr("common.reorder_column", { column: "Name" }) }),
    );
    fireEvent.keyDown(document.activeElement as Element, { key: "End" });
    expect(headerIds(container)).toEqual(["tokens", "note", "name"]);
  });

  test("重新挂载时沿用存下的顺序；冻结列和 reorderable: false 的列没有把手", () => {
    window.localStorage.setItem(
      "cp-grid:parity-saved:v1",
      JSON.stringify({ order: ["note", "name", "tokens"] }),
    );
    const columns: DataGridColumn<Row>[] = [
      { ...COLUMNS[0], pin: "start" },
      { ...COLUMNS[1], reorderable: false },
      COLUMNS[2],
    ];
    const { container } = render(
      <DataGrid
        id="parity-saved"
        label="t"
        columns={columns}
        rows={ROWS}
        rowKey={(row) => row.id}
      />,
    );
    expect(headerIds(container)).toEqual(["name", "note", "tokens"]);
    expect(
      screen.queryByRole("button", { name: tr("common.reorder_column", { column: "Name" }) }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: tr("common.reorder_column", { column: "Tokens" }) }),
    ).toBeNull();
    expect(
      screen.getByRole("button", { name: tr("common.reorder_column", { column: "Note" }) }),
    ).toBeInTheDocument();
  });

  test("columnReorder={false} 或没有 id 时不能换列", () => {
    render(<DataGrid label="t" columns={COLUMNS} rows={ROWS} rowKey={(row) => row.id} />);
    expect(
      screen.queryByRole("button", { name: tr("common.reorder_column", { column: "Name" }) }),
    ).toBeNull();
  });
});

describe("拖动排行", () => {
  function Reorderable({ onMove }: { onMove: (from: number, to: number) => void }) {
    const [rows, setRows] = useState(ROWS);
    return (
      <DataGrid
        label="t"
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.id}
        rowReorder={{
          onMove: (from, to) => {
            onMove(from, to);
            setRows((current) => moveGridRow(current, from, to));
          },
        }}
      />
    );
  }

  test("聚焦行首把手按 ↓ / Home 移动这一行，焦点跟着走", () => {
    const onMove = vi.fn();
    const { container } = render(<Reorderable onMove={onMove} />);
    const keys = () =>
      [...container.querySelectorAll("tr[data-row-key]")].map((row) =>
        row.getAttribute("data-row-key"),
      );
    expect(screen.getByRole("columnheader", { name: tr("common.row_order") })).toBeInTheDocument();
    const grip = screen.getByRole("button", { name: tr("common.reorder_row", { index: 1 }) });
    grip.focus();
    fireEvent.keyDown(grip, { key: "ArrowDown" });
    expect(onMove).toHaveBeenLastCalledWith(0, 1);
    expect(keys()).toEqual(["r2", "r1", "r3"]);
    const moved = document.activeElement as HTMLElement;
    expect(moved.closest("tr")?.getAttribute("data-row-key")).toBe("r1");
    fireEvent.keyDown(moved, { key: "Home" });
    expect(onMove).toHaveBeenLastCalledWith(1, 0);
    expect(keys()).toEqual(["r1", "r2", "r3"]);
  });

  test("有排序生效时把手不可用", async () => {
    const user = userEvent.setup();
    render(<Reorderable onMove={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Name" }));
    expect(
      screen.getByRole("button", { name: tr("common.reorder_row", { index: 1 }) }),
    ).toBeDisabled();
  });
});

describe("点行、当前行、行类名", () => {
  test("点行调用 onRowClick，点行里的按钮不调用；回车也调用", async () => {
    const user = userEvent.setup();
    const onRowClick = vi.fn();
    const columns: DataGridColumn<Row>[] = [
      ...COLUMNS,
      {
        id: "act",
        header: "Act",
        width: 80,
        cell: (row) => <button type="button">{`edit ${row.id}`}</button>,
      },
    ];
    render(
      <DataGrid
        label="t"
        columns={columns}
        rows={ROWS}
        rowKey={(row) => row.id}
        onRowClick={onRowClick}
        isRowActive={(row) => row.id === "r2"}
        rowClassName={(row) => (row.id === "r3" ? "opacity-60" : undefined)}
      />,
    );
    const rows = screen.getAllByRole("row").slice(1);
    await user.click(within(rows[0]).getByText("bravo"));
    expect(onRowClick).toHaveBeenCalledWith(ROWS[0]);
    onRowClick.mockClear();
    await user.click(within(rows[0]).getByRole("button", { name: "edit r1" }));
    expect(onRowClick).not.toHaveBeenCalled();
    act(() => rows[2].focus());
    fireEvent.keyDown(rows[2], { key: "Enter" });
    expect(onRowClick).toHaveBeenCalledWith(ROWS[2]);
    expect(rows[1]).toHaveAttribute("aria-selected", "true");
    expect(rows[1]).toHaveAttribute("data-active", "true");
    expect(rows[0]).toHaveAttribute("aria-selected", "false");
    expect(rows[2].className).toContain("opacity-60");
    expect(screen.getByRole("grid")).toBeInTheDocument();
  });
});

describe("截断全文提示", () => {
  test("纯文本与只含文字的元素自动套提示；自带提示或关掉时不套", () => {
    const columns: DataGridColumn<Row>[] = [
      COLUMNS[0],
      COLUMNS[2],
      {
        id: "off",
        header: "Off",
        width: 80,
        overflowTooltip: false,
        cell: (row) => `off ${row.id}`,
      },
      {
        id: "own",
        header: "Own",
        width: 80,
        cell: (row) => (
          <HoverTooltip content="exact">
            <span>{`own ${row.id}`}</span>
          </HoverTooltip>
        ),
      },
      {
        id: "custom",
        header: "Custom",
        width: 80,
        overflowTooltip: (row) => `full ${row.name}`,
        cell: () => <i />,
      },
    ];
    const { container } = render(
      <DataGrid label="t" columns={columns} rows={ROWS.slice(0, 1)} rowKey={(row) => row.id} />,
    );
    const cell = (id: string) =>
      container.querySelector(`td[data-col="${id}"] [data-cell-inner]`) as HTMLElement;
    const managed = (id: string) =>
      cell(id).querySelectorAll('[data-tooltip-managed="true"]').length;
    expect(managed("name")).toBe(1);
    expect(cell("name").querySelector(".truncate")).toHaveTextContent("bravo");
    expect(managed("note")).toBe(1);
    expect(managed("off")).toBe(0);
    // 自带的 HoverTooltip 只有它自己一层
    expect(managed("own")).toBe(1);
    expect(managed("custom")).toBe(1);
  });
});

describe("GridRowActions", () => {
  test("只是这一行用不了的动作留空位；放不下的收进「更多」", () => {
    const noop = () => undefined;
    render(
      <GridRowActions
        actions={[
          { key: "view", label: "View", icon: <i />, onClick: noop },
          { key: "edit", label: "Edit", icon: <i />, onClick: noop, unavailable: true },
          { key: "copy", label: "Copy", icon: <i />, onClick: noop },
          { key: "hidden", label: "Hidden", icon: <i />, onClick: noop, visible: false },
          { key: "delete", label: "Delete", icon: <i />, onClick: noop, destructive: true },
          { key: "audit", label: "Audit", icon: <i />, onClick: noop },
        ]}
      />,
    );
    expect(screen.getByRole("button", { name: "View" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hidden" })).toBeNull();
    expect(
      screen.getByRole("button", { name: tr("data_grid.more_row_actions") }),
    ).toBeInTheDocument();
  });
});
