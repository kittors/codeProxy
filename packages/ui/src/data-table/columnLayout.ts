import type { DataTableColumn } from "./DataTable.types";
import {
  ROW_REORDER_COLUMN_KEY,
  type ColumnResizeState,
  type ColumnWidthMap,
  type StickyColumnPlacement,
} from "./dataTableModel";
import {
  clampColumnWidth,
  resolveColumnDefaultWidth,
  resolveColumnOrderLock,
  resolveWidthClassPx,
} from "./tableStorage";

export function hasStickyColumnClass<T>(column: DataTableColumn<T>) {
  return `${column.headerClassName ?? ""} ${column.cellClassName ?? ""}`
    .split(/\s+/)
    .some((className) => className === "sticky" || className.endsWith(":sticky"));
}

/**
 * Map Tailwind text-align utilities on the header cell to flex justify on the
 * header content row. `th` may carry `text-center` / `text-right`, but the label
 * wrapper is `display: flex`, so text-align alone never centers/right-aligns it.
 */
export function resolveHeaderContentJustifyClass(headerClassName?: string) {
  let justifyClass = "";
  for (const className of (headerClassName ?? "").split(/\s+/).filter(Boolean)) {
    if (/(?:^|:)text-center$/.test(className)) {
      justifyClass = "justify-center";
      continue;
    }
    if (/(?:^|:)text-right$/.test(className)) {
      justifyClass = "justify-end";
      continue;
    }
    if (/(?:^|:)text-left$/.test(className)) {
      justifyClass = "justify-start";
    }
  }
  return justifyClass;
}

export function resolveColumnLayoutWidth<T>(column: DataTableColumn<T>, widths: ColumnWidthMap) {
  const resizedWidth = widths[column.key];
  return resizedWidth ? clampColumnWidth(column, resizedWidth) : resolveColumnDefaultWidth(column);
}

/** Sticky columns pinned to one edge, outermost first. */
function stickyEdgeColumns<T>(columns: DataTableColumn<T>[], edge: "start" | "end") {
  const edgeColumns = edge === "start" ? columns : [...columns].reverse();
  const pinned: DataTableColumn<T>[] = [];
  for (const column of edgeColumns) {
    if (resolveColumnOrderLock(column) !== edge || !hasStickyColumnClass(column)) break;
    pinned.push(column);
  }
  return pinned;
}

export function resolveStickyColumnKeys<T>(columns: DataTableColumn<T>[]) {
  return [...stickyEdgeColumns(columns, "start"), ...stickyEdgeColumns(columns, "end")].map(
    (column) => column.key,
  );
}

/**
 * Width a sticky column occupies on screen. `rendered` holds widths measured
 * from the header cells; they win over the nominal width because a fixed-layout
 * table wider than its columns stretches every column, sticky ones included.
 */
function resolveStickyWidth<T>(
  column: DataTableColumn<T>,
  widths: ColumnWidthMap,
  rendered?: ColumnWidthMap,
) {
  return rendered?.[column.key] ?? resolveColumnLayoutWidth(column, widths);
}

export function resolveStickyRailWidth<T>(
  columns: DataTableColumn<T>[],
  widths: ColumnWidthMap,
  edge: "start" | "end",
  rendered?: ColumnWidthMap,
) {
  return stickyEdgeColumns(columns, edge).reduce(
    (width, column) => width + resolveStickyWidth(column, widths, rendered),
    0,
  );
}

export function resolveStickyColumnPlacements<T>(
  columns: DataTableColumn<T>[],
  widths: ColumnWidthMap,
  rendered?: ColumnWidthMap,
) {
  const placements: Record<string, StickyColumnPlacement> = {};
  for (const edge of ["start", "end"] as const) {
    let offset = 0;
    for (const column of stickyEdgeColumns(columns, edge)) {
      placements[column.key] = { edge, offset };
      offset += resolveStickyWidth(column, widths, rendered);
    }
  }
  return placements;
}

export function normalizeColumnWidths<T>(columns: DataTableColumn<T>[], widths: ColumnWidthMap) {
  const next: ColumnWidthMap = {};
  columns.forEach((column) => {
    const width = widths[column.key];
    if (width !== undefined) next[column.key] = clampColumnWidth(column, width);
  });
  return next;
}

export function areColumnWidthMapsEqual(left: ColumnWidthMap, right: ColumnWidthMap) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

export function resolveColumnResizeWidth(active: ColumnResizeState, pointerClientX: number) {
  const rawBoundaryClientX = pointerClientX + active.pointerBoundaryOffsetClientX;
  return Math.max(
    active.minWidth,
    Math.min(active.maxWidth, Math.round(rawBoundaryClientX - active.startLeftClientX)),
  );
}

/**
 * 吸收剩余宽度的那一列（弹性列）：<col> 上不写宽度，表格比各列加起来宽时多出来的都给它，
 * 其它列保持自己的宽度。它照样能拖：拖出来的宽度是它的下限（空间不够时它就是这么宽），
 * 只改表格的 min-width，见 resolveTableMinWidthPx。
 *
 * 以前 `table-fixed w-full` 把所有列按比例拉伸，拖列宽又从拉伸后的宽度起算、按像素存下来：
 * 在宽屏上拖过一次，回到窄窗口就横向溢出（见 COLUMN_WIDTH_STORAGE_PREFIX）。
 *
 * 声明了 flex 的列优先；已经有不写宽度的普通列就用它（它本来就在吸收剩余宽度）；否则取默认
 * 宽度最大的普通列，通常是名称、描述这类主内容列，一样宽取靠前的。固定列、锁在两端的列
 * （复选框、操作）和拖拽排序列不参与。
 */
export function resolveFlexColumnKey<T>(columns: DataTableColumn<T>[]): string | null {
  const candidates = columns.filter(
    (column) =>
      column.key !== ROW_REORDER_COLUMN_KEY &&
      !resolveColumnOrderLock(column) &&
      !hasStickyColumnClass(column),
  );
  const chosen =
    candidates.find((column) => column.flex) ??
    candidates.find((column) => !column.width) ??
    candidates.reduce<DataTableColumn<T> | null>(
      (widest, column) =>
        !widest || resolveColumnDefaultWidth(column) > resolveColumnDefaultWidth(widest)
          ? column
          : widest,
      null,
    );
  return chosen?.key ?? null;
}

/**
 * 表格最窄多宽：各列按自己的宽度，拖过的按拖过的，弹性列也一样（那是它的下限）。table-fixed 里
 * 不写宽度的列在空间不够时会被挤成 0，只能靠表格的 min-width 给弹性列保底。页面传的 minWidth
 * 类更宽时以它为准。
 */
export function resolveTableMinWidthPx<T>(
  columns: DataTableColumn<T>[],
  widths: ColumnWidthMap,
  minWidthClassName?: string,
) {
  // 没拖过的列按 rem 换算的原值算、不取整：它们渲染出来就是这个小数宽度，十几列四舍五入的误差
  // 加起来能让弹性列比它的下限窄上一两 px。拖过的列本来就按整数像素写在 <col> 上。
  const columnsWidth = columns.reduce((total, column) => {
    const stored = widths[column.key];
    return (
      total + (stored ? clampColumnWidth(column, stored) : resolveColumnDefaultWidth(column, false))
    );
  }, 0);
  return Math.max(Math.ceil(columnsWidth), resolveWidthClassPx(minWidthClassName, "min-w") ?? 0);
}

/**
 * 拖列宽时直接写 <col> 和表格的 min-width，不等 React 渲染；width 为 null 时清掉 <col> 的内联
 * 宽度、交还给渲染。表格的 min-width 跟着改，弹性列在拖动过程中也不会被挤到保底以下。
 */
export function writeColumnWidthToDom(
  col: HTMLElement | null | undefined,
  table: HTMLElement | null,
  width: number | null,
  tableMinWidthPx: number,
) {
  if (col) {
    const value = width === null ? "" : `${width}px`;
    col.style.width = value;
    col.style.minWidth = value;
    col.style.maxWidth = value;
  }
  // 空表不设 min-width（表格收到视口宽），这里也不给它加上。
  if (table?.style.minWidth) table.style.minWidth = `${tableMinWidthPx}px`;
}
