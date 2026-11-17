import { describe, expect, test } from "vitest";
import { findDropTarget, mergeColumnOrder, moveColumnBefore, moveGridRow } from "../gridOrder";

describe("mergeColumnOrder", () => {
  test("没存过就是定义顺序", () => {
    expect(mergeColumnOrder(["a", "b", "c"], undefined)).toEqual(["a", "b", "c"]);
    expect(mergeColumnOrder(["a", "b", "c"], [])).toEqual(["a", "b", "c"]);
  });

  test("存储里已经没有的列丢掉，重复的只留一个", () => {
    expect(mergeColumnOrder(["a", "c"], ["c", "gone", "a", "c"])).toEqual(["c", "a"]);
  });

  test("后来才出现的列插到定义里它前面那一列之后，不被甩到最后", () => {
    // 用户把 model 拖到了最前；后来能力探测回来，定义里 agent 紧跟在 status 后面
    const stored = ["model", "time", "status", "cost"];
    const definition = ["time", "status", "agent", "model", "cost"];
    expect(mergeColumnOrder(definition, stored)).toEqual([
      "model",
      "time",
      "status",
      "agent",
      "cost",
    ]);
  });

  test("新列前面没有已知列时放在最前", () => {
    expect(mergeColumnOrder(["new", "a", "b"], ["b", "a"])).toEqual(["new", "b", "a"]);
  });
});

describe("moveColumnBefore", () => {
  test("挪到某列前面、挪到最后", () => {
    expect(moveColumnBefore(["a", "b", "c", "d"], "d", "b")).toEqual(["a", "d", "b", "c"]);
    expect(moveColumnBefore(["a", "b", "c", "d"], "a", null)).toEqual(["b", "c", "d", "a"]);
    expect(moveColumnBefore(["a", "b", "c"], "b", "b")).toEqual(["a", "b", "c"]);
  });
});

describe("moveGridRow", () => {
  test("toIndex 是移动后所在的位置", () => {
    expect(moveGridRow(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
    expect(moveGridRow(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
    expect(moveGridRow(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("findDropTarget", () => {
  const items = [
    { id: "a", start: 0, end: 100 },
    { id: "b", start: 100, end: 200 },
    { id: "c", start: 200, end: 300 },
  ];

  test("指针在格子前半段就插到它前面", () => {
    expect(findDropTarget(items, "a", 220)).toEqual({ beforeId: "c", edge: 200 });
    expect(findDropTarget(items, "c", 40)).toEqual({ beforeId: "a", edge: 0 });
  });

  test("过了最后一格的中线就是放到最后", () => {
    expect(findDropTarget(items, "a", 280)).toEqual({ beforeId: null, edge: 300 });
  });

  test("落点就是自己或紧挨着的下一格时算放回原处", () => {
    expect(findDropTarget(items, "b", 120)).toBeNull();
    expect(findDropTarget(items, "b", 180)).toBeNull();
    expect(findDropTarget(items, "c", 290)).toBeNull();
  });
});
