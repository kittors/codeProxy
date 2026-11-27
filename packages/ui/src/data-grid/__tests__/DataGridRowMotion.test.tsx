import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DataGrid } from "../DataGrid";
import type { DataGridColumn } from "../types";

/**
 * Satin 原生表格增量行调和与 live 动效：
 * - 刷新时留下的行复用原 <tr> DOM 节点（不销毁、不重播入场），只有新行标记入场；
 * - 整组替换（翻页、换筛选）时新行依次交错浮入；
 * - 持续刷新表（rowMotion="live"）里离开的行先原地淡出并 inert，过渡结束后再移除。
 */

type Row = { id: string; name: string };

const COLUMNS: DataGridColumn<Row>[] = [
  { id: "name", header: "Name", width: 160, cell: (row) => row.name },
];
const row = (id: string): Row => ({ id, name: `name-${id}` });

function Grid({ rows, live }: { rows: Row[]; live?: boolean }) {
  return (
    <DataGrid<Row>
      label="Rows"
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      frame={false}
      rowMotion={live ? "live" : undefined}
    />
  );
}

const body = () => screen.getByRole("table").querySelector("tbody") as HTMLElement;
const rowEl = (id: string) =>
  screen.getByRole("table").querySelector<HTMLElement>(`tr[data-row-key="${id}"]`);
const keys = () =>
  [...screen.getByRole("table").querySelectorAll<HTMLElement>("tbody > tr[data-row-key]")].map(
    (tr) => tr.dataset.rowKey,
  );

afterEach(() => {
  vi.useRealTimers();
});

describe("DataGrid Satin incremental row motion", () => {
  test("局部刷新保留既有行 DOM 节点，仅新行标记入场", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b")]} />);
    const tbody = body();
    const a = rowEl("a");
    const b = rowEl("b");

    rerender(<Grid rows={[row("x"), row("a"), row("b")]} />);
    expect(body()).toBe(tbody);
    expect(rowEl("a")).toBe(a);
    expect(rowEl("b")).toBe(b);
    expect(keys()).toEqual(["x", "a", "b"]);
    expect(rowEl("x")).toHaveAttribute("data-entering", "true");
    expect(rowEl("a")).not.toHaveAttribute("data-entering");
    expect(rowEl("b")).not.toHaveAttribute("data-entering");
  });

  test("整组替换为新一页数据时交错标记入场序号", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b")]} />);
    rerender(<Grid rows={[row("d"), row("e")]} />);
    expect(keys()).toEqual(["d", "e"]);
    expect(rowEl("d")).toHaveAttribute("data-entering", "true");
    expect(rowEl("e")).toHaveAttribute("data-entering", "true");
    expect(rowEl("d")?.style.getPropertyValue("--sn-enter-i")).toBe("0");
    expect(rowEl("e")?.style.getPropertyValue("--sn-enter-i")).toBe("1");
  });

  test("普通表格移除的行立刻离场", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b"), row("c")]} />);
    rerender(<Grid rows={[row("a"), row("c")]} />);
    expect(keys()).toEqual(["a", "c"]);
  });

  test("live 持续刷新表离开的行先原地淡出且 inert，过渡后自动移除", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Grid live rows={[row("a"), row("b"), row("c")]} />);
    rerender(<Grid live rows={[row("x"), row("a"), row("c")]} />);

    const leaving = rowEl("b");
    expect(leaving).toHaveAttribute("data-leaving", "true");
    expect(leaving).toHaveAttribute("inert");
    expect(rowEl("x")).toHaveAttribute("data-entering", "live");

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(keys()).toEqual(["x", "a", "c"]);
  });

  test("顺序重排保留原 DOM 节点并按新顺序排列", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b"), row("c")]} />);
    const a = rowEl("a");
    const b = rowEl("b");
    rerender(<Grid rows={[row("b"), row("c"), row("a")]} />);
    expect(keys()).toEqual(["b", "c", "a"]);
    expect(rowEl("a")).toBe(a);
    expect(rowEl("b")).toBe(b);
  });
});
