import { afterEach, describe, expect, test } from "vitest";
import type { DataTableColumn } from "../DataTable.types";
import {
  clampColumnWidth,
  resolveColumnDefaultWidth,
  resolveColumnMaxWidth,
  resolveColumnMinWidth,
  scaleDesignPx,
} from "../tableStorage";

const column = (overrides: Partial<DataTableColumn<unknown>> = {}): DataTableColumn<unknown> => ({
  key: "name",
  label: "Name",
  render: () => null,
  ...overrides,
});

/** 缓存只活一帧；等两帧确保上一次读取注册的释放回调已经跑过。 */
async function setRootFontSize(value: string) {
  document.documentElement.style.fontSize = value;
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
}

afterEach(async () => {
  await setRootFontSize("16px");
});

describe("tableStorage column widths", () => {
  test("uses explicit minWidthPx before width classes", () => {
    const target = column({ minWidthPx: 180, width: "w-[320px] min-w-[320px]" });

    expect(resolveColumnMinWidth(target)).toBe(180);
    expect(clampColumnWidth(target, 120)).toBe(180);
  });

  test("clamps drag resize to the min-w width class", () => {
    const target = column({ width: "w-[320px] min-w-[320px]" });

    expect(resolveColumnMinWidth(target)).toBe(320);
    expect(clampColumnWidth(target, 72)).toBe(320);
  });

  test("keeps the default minimum when no min-w class is provided", () => {
    const target = column({ width: "w-52" });

    expect(resolveColumnMinWidth(target)).toBe(72);
    expect(clampColumnWidth(target, 48)).toBe(72);
  });

  test("reads the last width class of each prefix", () => {
    const target = column({ width: "w-20 w-52 min-w-20 min-w-52" });

    expect(resolveColumnDefaultWidth(target)).toBe(208);
    expect(resolveColumnMinWidth(target)).toBe(208);
  });

  test("reads w-px as a single literal pixel", () => {
    const target = column({ width: "w-px min-w-px" });

    expect(resolveColumnDefaultWidth(target)).toBe(1);
  });

  test("ignores width classes it cannot parse", () => {
    const target = column({ width: "w-full min-w-fit" });

    expect(resolveColumnDefaultWidth(target)).toBe(72);
  });
});

/**
 * 面板整体缩放是靠根字号做的（`--ui-scale`，再叠加用户自己调过的浏览器默认字号），
 * 所以 rem 刻度和写死的设计 px 都得跟着换算——否则固定列的轨道会按 16px 的尺度算，
 * 比真实列宽多出一截，压到相邻列上。
 */
describe("tableStorage width scaling", () => {
  test("scales design px by the live root font size", async () => {
    await setRootFontSize("14.4px");
    expect(scaleDesignPx(160)).toBe(144);

    await setRootFontSize("20px");
    expect(scaleDesignPx(160)).toBe(200);
  });

  test("scales rem-based width classes but not arbitrary px", async () => {
    await setRootFontSize("14.4px");

    expect(resolveColumnMinWidth(column({ width: "min-w-40" }))).toBe(144);
    expect(resolveColumnMinWidth(column({ width: "min-w-[14rem]" }))).toBe(202);
    expect(resolveColumnMinWidth(column({ width: "min-w-[280px]" }))).toBe(280);
  });

  test("scales explicit minWidthPx and maxWidthPx", async () => {
    const target = column({ minWidthPx: 160, maxWidthPx: 400 });

    await setRootFontSize("14.4px");

    expect(resolveColumnMinWidth(target)).toBe(144);
    expect(resolveColumnMaxWidth(target)).toBe(360);
    expect(clampColumnWidth(target, 120)).toBe(144);
    expect(clampColumnWidth(target, 500)).toBe(360);
  });

  test("keeps maxWidth at or above minWidth when the two invert", async () => {
    const target = column({ minWidthPx: 400, maxWidthPx: 100 });

    await setRootFontSize("14.4px");

    expect(resolveColumnMaxWidth(target)).toBe(360);
    expect(clampColumnWidth(target, 200)).toBe(360);
  });

  test("falls back to the 16px baseline when the root font size is unreadable", async () => {
    await setRootFontSize("0px");
    expect(scaleDesignPx(160)).toBe(160);

    await setRootFontSize("inherit");
    expect(scaleDesignPx(160)).toBe(160);
  });

  test("picks up a root font size change on the next frame", async () => {
    await setRootFontSize("16px");
    expect(scaleDesignPx(160)).toBe(160);

    await setRootFontSize("12.8px");
    expect(scaleDesignPx(160)).toBe(128);
  });
});
