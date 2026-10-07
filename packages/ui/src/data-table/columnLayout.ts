import type { DataTableColumn } from "./DataTable.types";
import type { ColumnResizeState, ColumnWidthMap, StickyColumnPlacement } from "./dataTableModel";
import {
  clampColumnWidth,
  resolveColumnDefaultWidth,
  resolveColumnOrderLock,
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
