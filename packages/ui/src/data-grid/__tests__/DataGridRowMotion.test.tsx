import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DataGrid } from "../DataGrid";
import type { DataGridColumn } from "../types";
import { ROW_LEAVE_MS } from "../useRowMotion";

/**
 * 行怎么动（useRowMotion）：刷新时留下的行不重挂、不重播入场，只有新行浮入；整组换掉时依次浮入；
 * 持续刷新的表里离开的行先原地淡出收起，再从 DOM 里拿掉。在途请求每 5 秒刷新一次都整表闪一下，
 * 就是表体按行集合整体重挂造成的。
 */

type Row = { id: string; name: string };

const COLUMNS: DataGridColumn<Row>[] = [{ id: "name", header: "Name", width: 160, cell: (row) => row.name }];
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
const rowEl = (id: string) => screen.getByRole("table").querySelector<HTMLElement>(`tr[data-row-key="${id}"]`);
const keys = () =>
  [...screen.getByRole("table").querySelectorAll<HTMLElement>("tbody > tr[data-row-key]")].map((tr) => tr.dataset.rowKey);

afterEach(() => {
  vi.useRealTimers();
});

describe("DataGrid row motion", () => {
  test("a first load enters row by row", () => {
    render(<Grid rows={[row("a"), row("b"), row("c")]} />);
    expect(rowEl("a")).toHaveAttribute("data-entering", "true");
    expect(rowEl("c")?.style.getPropertyValue("--row-index")).toBe("2");
  });

  test("a refresh keeps the rows that stay; only the new one enters", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b")]} />);
    const tbody = body();
    const a = rowEl("a");
    const b = rowEl("b");
    rerender(<Grid rows={[row("x"), row("a"), row("b")]} />);
    // Same body, same row elements: nothing remounts, nothing replays its entrance.
    expect(body()).toBe(tbody);
    expect(rowEl("a")).toBe(a);
    expect(rowEl("b")).toBe(b);
    expect(rowEl("x")).toHaveAttribute("data-entering", "true");
    expect(rowEl("x")?.style.getPropertyValue("--row-index")).toBe("0");
    expect(rowEl("a")).not.toHaveAttribute("data-entering");
    expect(rowEl("b")).not.toHaveAttribute("data-entering");
  });

  test("a live table's first load still enters row by row", () => {
    render(<Grid live rows={[row("a"), row("b")]} />);
    expect(rowEl("b")).toHaveAttribute("data-entering", "true");
    expect(rowEl("b")?.style.getPropertyValue("--row-index")).toBe("1");
  });

  test("a whole new set (another page) enters row by row again", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b")]} />);
    rerender(<Grid rows={[row("d"), row("e")]} />);
    expect(rowEl("d")).toHaveAttribute("data-entering", "true");
    expect(rowEl("e")).toHaveAttribute("data-entering", "true");
    expect(rowEl("e")?.style.getPropertyValue("--row-index")).toBe("1");
  });

  test("outside a live table a removed row goes at once", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b"), row("c")]} />);
    rerender(<Grid rows={[row("a"), row("c")]} />);
    expect(keys()).toEqual(["a", "c"]);
  });

  test("in a live table a row that leaves fades and folds in place, then goes", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Grid live rows={[row("a"), row("b"), row("c")]} />);
    rerender(<Grid live rows={[row("x"), row("a"), row("c")]} />);
    // b stays where it was (under a), unreachable, while it fades; x comes in on top.
    expect(keys()).toEqual(["x", "a", "b", "c"]);
    const leaving = rowEl("b");
    expect(leaving).toHaveAttribute("data-leaving", "true");
    expect(leaving).toHaveAttribute("inert");
    expect(leaving?.style.getPropertyValue("--leave-h")).not.toBe("");
    // x unfolds from no height while b folds, so the table keeps its height.
    expect(rowEl("x")).toHaveAttribute("data-entering", "live");
    expect(rowEl("x")?.style.getPropertyValue("--enter-h")).not.toBe("");

    act(() => {
      vi.advanceTimersByTime(ROW_LEAVE_MS);
    });
    expect(keys()).toEqual(["x", "a", "c"]);
  });

  test("a row that leaves from the top holds still on top while it fades", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Grid live rows={[row("a"), row("b")]} />);
    rerender(<Grid live rows={[row("x"), row("b")]} />);
    // a does not move while it fades; x rises to the top as a folds away.
    expect(keys()).toEqual(["a", "x", "b"]);
    act(() => {
      vi.advanceTimersByTime(ROW_LEAVE_MS);
    });
    expect(keys()).toEqual(["x", "b"]);
  });
});
