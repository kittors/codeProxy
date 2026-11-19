import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { DataGrid } from "../DataGrid";
import type { DataGridColumn } from "../types";
import { LIVE_TURN_MS, LIVE_TURNS_WITHIN_MS, ROW_FOLD_AFTER_MS, ROW_FOLD_MS, ROW_LEAVE_MS } from "../useRowMotion";

/**
 * 行怎么动（useRowMotion）：刷新时留下的行不重挂、不重播入场，只有新行浮入；整组换掉时依次浮入；
 * 持续刷新的表里离开的行先原地淡出收起，再从 DOM 里拿掉；一次进出好几行时轮流展开、收起。在途请求
 * 每 5 秒刷新一次都整表闪一下，就是表体按行集合整体重挂造成的。
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
const delay = (id: string) => rowEl(id)?.style.getPropertyValue("--motion-delay");
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

  test("rows that only leave still get the height their fold starts from", () => {
    const { rerender } = render(<Grid live rows={[row("a"), row("b"), row("c")]} />);
    rerender(<Grid live rows={[row("a"), row("c")]} />);
    // Nothing comes in, so the drawn order (a, b, c) is the same as before; b must be measured anyway.
    expect(keys()).toEqual(["a", "b", "c"]);
    expect(rowEl("b")).toHaveAttribute("data-leaving", "true");
    expect(rowEl("b")?.style.getPropertyValue("--leave-h")).not.toBe("");
    expect(rowEl("b")?.querySelector<HTMLElement>("[data-cell-inner]")?.style.getPropertyValue("--leave-inner-h")).not.toBe("");
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

  test("a burst of new rows unfolds one at a time, the oldest of them first", () => {
    const { rerender } = render(<Grid live rows={[row("a")]} />);
    rerender(<Grid live rows={[row("n3"), row("n2"), row("n1"), row("a")]} />);
    // Nothing leaves, so nothing waits for a fade. n1 lands on top of a first, then n2 on top of it.
    expect(delay("n1")).toBe("0ms");
    expect(delay("n2")).toBe(`${LIVE_TURN_MS}ms`);
    expect(delay("n3")).toBe(`${2 * LIVE_TURN_MS}ms`);
    expect(delay("a")).toBe("");
  });

  test("rows that leave together fade together, then fold in turn, each with a row that enters", () => {
    vi.useFakeTimers();
    const { rerender } = render(<Grid live rows={[row("a"), row("b"), row("c"), row("d")]} />);
    rerender(<Grid live rows={[row("x"), row("y"), row("a"), row("d")]} />);
    // Folds go from the top, unfolds from the bottom new row up; the k-th of each run together.
    expect(delay("b")).toBe(`${ROW_FOLD_AFTER_MS}ms`);
    expect(delay("y")).toBe(`${ROW_FOLD_AFTER_MS}ms`);
    expect(delay("c")).toBe(`${ROW_FOLD_AFTER_MS + LIVE_TURN_MS}ms`);
    expect(delay("x")).toBe(`${ROW_FOLD_AFTER_MS + LIVE_TURN_MS}ms`);
    // The second fold ends a turn after a lone row would have gone.
    act(() => {
      vi.advanceTimersByTime(ROW_LEAVE_MS);
    });
    expect(keys()).toEqual(["x", "y", "a", "b", "c", "d"]);
    act(() => {
      vi.advanceTimersByTime(LIVE_TURN_MS);
    });
    expect(keys()).toEqual(["x", "y", "a", "d"]);
    expect(ROW_LEAVE_MS).toBe(ROW_FOLD_AFTER_MS + ROW_FOLD_MS);
  });

  test("a large burst squeezes its turns into a fixed window", () => {
    const { rerender } = render(<Grid live rows={[row("a")]} />);
    const burst = Array.from({ length: 9 }, (_, i) => row(`n${9 - i}`));
    rerender(<Grid live rows={[...burst, row("a")]} />);
    expect(delay("n1")).toBe("0ms");
    expect(delay("n9")).toBe(`${LIVE_TURNS_WITHIN_MS}ms`);
  });
});

describe("DataGrid row slide (RowSlide)", () => {
  /** jsdom has no layout: a row sits 40px under the one above it, all moved down by `shift`. */
  let shift = 0;
  let slides: { key: string; from: string }[] = [];

  beforeEach(() => {
    shift = 0;
    slides = [];
    vi.spyOn(HTMLElement.prototype, "offsetTop", "get").mockImplementation(function (this: HTMLElement) {
      if (!this.dataset.rowKey || !this.parentElement) return 0;
      return shift + [...this.parentElement.querySelectorAll(":scope > tr[data-row-key]")].indexOf(this) * 40;
    });
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value(this: HTMLElement, frames: Keyframe[]) {
        if (this.dataset.rowKey) slides.push({ key: this.dataset.rowKey, from: String(frames[0].transform) });
        return { cancel() {}, finished: Promise.resolve() };
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
  });

  test("a reorder slides each row from its old place to its new one", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b")]} />);
    rerender(<Grid rows={[row("b"), row("a")]} />);
    expect(slides).toEqual(
      expect.arrayContaining([
        { key: "b", from: "translateY(40px)" },
        { key: "a", from: "translateY(-40px)" },
      ]),
    );
  });

  test("rows slide from where they are right before the change, not from where the last one left them", () => {
    const { rerender } = render(<Grid rows={[row("a"), row("b")]} />);
    // Since then something moved both rows down 40px (a row above them unfolded, say).
    shift = 40;
    rerender(<Grid rows={[row("a"), row("b"), row("c")]} />);
    // Adding c under them moves neither. Positions kept from the last change made both jump back
    // up 40px and slide down again; in the in-flight table that happened on most refreshes.
    expect(slides).toEqual([]);
  });
});
