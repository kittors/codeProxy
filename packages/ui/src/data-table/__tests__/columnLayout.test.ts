import { afterEach, describe, expect, test } from "vitest";
import type { DataTableColumn } from "../DataTable.types";
import {
  resolveColumnLayoutWidth,
  resolveStickyColumnPlacements,
  resolveStickyRailWidth,
} from "../columnLayout";

/**
 * 固定列的轨道和边缘阴影按这里算出来的宽度绝对定位，所以它必须等于列在 DOM 上
 * 的真实渲染宽度。面板用根字号做整体缩放（`--ui-scale`，再叠加用户自己的浏览器
 * 默认字号），rem 刻度跟着变，写死的任意值 px 不变——两种来源混在一张表里时最容易
 * 算偏，下面按根字号逐档验证。
 */

const STICKY_HEADER_CLASS = "md:sticky md:z-40 md:bg-slate-100";
const STICKY_CELL_CLASS = "md:sticky md:z-30 md:bg-white";

const column = (overrides: Partial<DataTableColumn<unknown>>): DataTableColumn<unknown> => ({
  key: "column",
  label: "Column",
  render: () => null,
  ...overrides,
});

const stickyColumn = (overrides: Partial<DataTableColumn<unknown>>) =>
  column({
    headerClassName: STICKY_HEADER_CLASS,
    cellClassName: STICKY_CELL_CLASS,
    ...overrides,
  });

/** 缓存只活一帧；等两帧确保上一次读取注册的释放回调已经跑过。 */
async function setRootFontSize(px: number) {
  document.documentElement.style.fontSize = `${px}px`;
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
}

afterEach(async () => {
  await setRootFontSize(16);
});

describe("sticky rail width tracks the rendered column width", () => {
  // `w-40 min-w-40` = 10rem。16px 根字号下是 160px，0.9 缩放（14.4px）下是 144px。
  // 修复前这里恒为 160，轨道会盖住左邻列 16px，表头（sticky，压在轨道上）和数据行
  // （static，被轨道盖住）于是在差开 16px 的两个位置被截断。
  const actionsColumn = stickyColumn({
    key: "actions",
    width: "w-40 min-w-40",
    lockOrder: "end",
  });
  const columns = [column({ key: "name", width: "w-52 min-w-52" }), actionsColumn];

  test("uses the design width at the 16px baseline", async () => {
    await setRootFontSize(16);

    expect(resolveStickyRailWidth(columns, {}, "end")).toBe(160);
  });

  test("follows the scaled root font size", async () => {
    await setRootFontSize(14.4);

    expect(resolveStickyRailWidth(columns, {}, "end")).toBe(144);
  });

  test("follows a root font size the user enlarged", async () => {
    await setRootFontSize(20);

    expect(resolveStickyRailWidth(columns, {}, "end")).toBe(200);
  });

  test("keeps arbitrary px widths literal across root font sizes", async () => {
    const pinned = [
      stickyColumn({ key: "select", width: "w-[52px] min-w-[52px]", lockOrder: "start" }),
      column({ key: "name", width: "w-52" }),
    ];

    await setRootFontSize(16);
    expect(resolveStickyRailWidth(pinned, {}, "start")).toBe(52);

    await setRootFontSize(14.4);
    expect(resolveStickyRailWidth(pinned, {}, "start")).toBe(52);
  });

  test("scales arbitrary rem widths", async () => {
    const pinned = [
      stickyColumn({ key: "select", width: "w-[14rem] min-w-[14rem]", lockOrder: "start" }),
      column({ key: "name", width: "w-52" }),
    ];

    await setRootFontSize(14.4);

    expect(resolveStickyRailWidth(pinned, {}, "start")).toBe(202);
  });
});

describe("sticky rail width uses the layout width, not the minimum", () => {
  // `w-[360px] min-w-[280px]` 两个值差 80px。轨道量的是「这列实际占多宽」，
  // 取 min-w 会让轨道短一截，固定列右边缘外漏出下层内容。
  const pinned = [
    stickyColumn({ key: "name", width: "w-[360px] min-w-[280px]", lockOrder: "start" }),
    column({ key: "status", width: "w-28 min-w-28" }),
  ];

  test("prefers the w- class over the min-w- class", async () => {
    await setRootFontSize(16);

    expect(resolveStickyRailWidth(pinned, {}, "start")).toBe(360);
  });

  test("falls back to the minimum when no w- class is declared", async () => {
    const minOnly = [
      stickyColumn({ key: "name", width: "min-w-[300px]", lockOrder: "start" }),
      column({ key: "status", width: "w-28 min-w-28" }),
    ];

    await setRootFontSize(16);

    expect(resolveStickyRailWidth(minOnly, {}, "start")).toBe(300);
  });

  test("falls back to the default minimum when the column declares no width", async () => {
    const bare = [
      stickyColumn({ key: "name", lockOrder: "start" }),
      column({ key: "status", width: "w-28 min-w-28" }),
    ];

    await setRootFontSize(16);
    expect(resolveStickyRailWidth(bare, {}, "start")).toBe(72);

    await setRootFontSize(14.4);
    expect(resolveStickyRailWidth(bare, {}, "start")).toBe(65);
  });
});

describe("sticky rail width honours resized columns", () => {
  const actionsColumn = stickyColumn({
    key: "actions",
    width: "w-40 min-w-40",
    lockOrder: "end",
  });
  const columns = [column({ key: "name", width: "w-52 min-w-52" }), actionsColumn];

  test("a stored width wins over the width class", async () => {
    await setRootFontSize(16);

    expect(resolveStickyRailWidth(columns, { actions: 240 }, "end")).toBe(240);
  });

  test("a stored width below the scaled minimum is clamped to it", async () => {
    await setRootFontSize(14.4);

    // min-w-40 在 14.4px 根字号下是 144px，存下来的 90px 会被夹上去。
    expect(resolveStickyRailWidth(columns, { actions: 90 }, "end")).toBe(144);
  });
});

describe("sticky rail width stops at the first unpinned column", () => {
  test("ignores columns that are not locked to the edge", async () => {
    const columns = [
      column({ key: "name", width: "w-52 min-w-52" }),
      stickyColumn({ key: "actions", width: "w-40 min-w-40", lockOrder: "end" }),
    ];

    await setRootFontSize(16);

    // 只有末尾那一列被钉住，name 不该计入。
    expect(resolveStickyRailWidth(columns, {}, "end")).toBe(160);
    expect(resolveStickyRailWidth(columns, {}, "start")).toBe(0);
  });

  test("ignores a locked column that carries no sticky class", async () => {
    const columns = [
      column({ key: "name", width: "w-52 min-w-52" }),
      column({ key: "actions", width: "w-40 min-w-40", lockOrder: "end" }),
    ];

    await setRootFontSize(16);

    expect(resolveStickyRailWidth(columns, {}, "end")).toBe(0);
  });

  test("accumulates every consecutive pinned column at the edge", async () => {
    const columns = [
      stickyColumn({ key: "select", width: "w-14 min-w-14", lockOrder: "start" }),
      stickyColumn({ key: "name", width: "w-[360px] min-w-[280px]", lockOrder: "start" }),
      column({ key: "status", width: "w-28 min-w-28" }),
    ];

    await setRootFontSize(16);

    expect(resolveStickyRailWidth(columns, {}, "start")).toBe(56 + 360);
  });
});

describe("sticky column placements", () => {
  const columns = [
    stickyColumn({ key: "select", width: "w-14 min-w-14", lockOrder: "start" }),
    stickyColumn({ key: "name", width: "w-[360px] min-w-[280px]", lockOrder: "start" }),
    column({ key: "status", width: "w-28 min-w-28" }),
    stickyColumn({ key: "actions", width: "w-40 min-w-40", lockOrder: "end" }),
  ];

  test("offsets each pinned column by the ones before it", async () => {
    await setRootFontSize(16);

    expect(resolveStickyColumnPlacements(columns, {})).toEqual({
      select: { edge: "start", offset: 0 },
      name: { edge: "start", offset: 56 },
      actions: { edge: "end", offset: 0 },
    });
  });

  test("scales the offsets with the root font size", async () => {
    await setRootFontSize(14.4);

    // w-14 = 3.5rem → 50px；写死的 360px 不跟着缩。
    expect(resolveStickyColumnPlacements(columns, {})).toEqual({
      select: { edge: "start", offset: 0 },
      name: { edge: "start", offset: 50 },
      actions: { edge: "end", offset: 0 },
    });
  });

  test("offsets follow a resized neighbour", async () => {
    await setRootFontSize(16);

    expect(resolveStickyColumnPlacements(columns, { select: 96 }).name).toEqual({
      edge: "start",
      offset: 96,
    });
  });
});

describe("resolveColumnLayoutWidth", () => {
  test("scales the width class and keeps stored widths literal", async () => {
    const target = column({ key: "actions", width: "w-40 min-w-40" });

    await setRootFontSize(14.4);

    expect(resolveColumnLayoutWidth(target, {})).toBe(144);
    expect(resolveColumnLayoutWidth(target, { actions: 300 })).toBe(300);
  });
});
