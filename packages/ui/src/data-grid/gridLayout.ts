import type { GridDensity } from "./types";

/**
 * 密度与尺寸。三档密度下表头都约为行高的 0.8：表头和行一样高显得笨重，
 * 比行矮太多（magpie 那种 40px 表头配 70px 两行单元格）又显得局促、像一条漂浮的胶囊。
 * 数值写成 rem，跟着面板根字号一起缩放。
 */

/** 合成列：行拖动把手、复选框与展开按钮（从左到右依次排在数据列前面）。 */
export const GRID_REORDER_COLUMN_ID = "__reorder";
export const GRID_SELECT_COLUMN_ID = "__select";
export const GRID_EXPAND_COLUMN_ID = "__expand";

export const HEAD_HEIGHT: Record<GridDensity, string> = {
  compact: "h-9",
  default: "h-11",
  comfortable: "h-12",
};

export const ROW_HEIGHT: Record<GridDensity, string> = {
  compact: "h-10",
  default: "h-[3.25rem]",
  comfortable: "h-15",
};

/** 行高（rem），骨架屏按它算铺满表体需要几行。 */
export const ROW_HEIGHT_REM: Record<GridDensity, number> = {
  compact: 2.5,
  default: 3.25,
  comfortable: 3.75,
};

/**
 * 单元格左右内边距：首列离表格左缘多留一点（和上方筛选区、标题的左缘对齐），
 * 末列同理；中间列 12px。前面有复选框 / 展开列时，首个数据列不再额外加宽。
 */
export function cellPadding(index: number, count: number, hasLeading: boolean): string {
  const first = index === 0 && !hasLeading;
  const last = index === count - 1;
  if (first && last) return "px-4";
  if (first) return "pl-4 pr-3";
  if (last) return "pl-3 pr-4";
  return "px-3";
}
