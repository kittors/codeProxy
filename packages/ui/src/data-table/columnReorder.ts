import type { DataTableColumn } from "./DataTable.types";
import {
  COLUMN_REORDER_SETTLE_CLEANUP_MS,
  NON_REORDERABLE_COLUMN_KEYS,
  type ColumnOrder,
  type ColumnReorderGeometry,
  type ColumnReorderState,
} from "./dataTableModel";
import { resolveColumnOrderLock } from "./tableStorage";

export function shouldAllowColumnReorder<T>(column: DataTableColumn<T>) {
  if (resolveColumnOrderLock(column) !== null) return false;
  if (column.reorderable !== undefined) return column.reorderable;
  if (NON_REORDERABLE_COLUMN_KEYS.has(column.key)) return false;
  return true;
}

export function normalizeColumnOrder<T>(columns: DataTableColumn<T>[], storedOrder: ColumnOrder) {
  const validKeys = new Set(columns.map((column) => column.key));
  const seen = new Set<string>();
  const storedValid = storedOrder.filter((key) => {
    if (!validKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const missing = columns.map((column) => column.key).filter((key) => !seen.has(key));
  const merged = [...storedValid, ...missing];

  const startLocked = columns
    .filter((column) => resolveColumnOrderLock(column) === "start")
    .map((column) => column.key);
  const endLocked = columns
    .filter((column) => resolveColumnOrderLock(column) === "end")
    .map((column) => column.key);
  const locked = new Set([...startLocked, ...endLocked]);
  const movable = merged.filter((key) => !locked.has(key));

  return [...startLocked, ...movable, ...endLocked];
}

export function moveColumnKey(order: ColumnOrder, fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return order;
  const normalizedTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
  next.splice(Math.max(0, Math.min(next.length, normalizedTo)), 0, item);
  return next;
}

export function clampColumnReorderTarget(
  toIndex: number,
  minIndex: number,
  maxIndex: number,
  columnCount: number,
) {
  return Math.max(minIndex, Math.min(Math.min(maxIndex, columnCount), toIndex));
}

export function getColumnReorderDragOffset(
  active: ColumnReorderState,
  clientX: number,
  scrollLeft: number,
) {
  return clientX - active.startClientX + (scrollLeft - active.startScrollLeft);
}

export function findColumnReorderTargetIndex(active: ColumnReorderState, dragOffsetX: number) {
  const origin = active.columns[active.originIndex];
  if (!origin) return active.originIndex;

  const draggedCenter = origin.left + origin.width / 2 + dragOffsetX;
  let nextIndex = active.allowedMaxIndex;
  const maxMeasuredIndex = Math.min(active.allowedMaxIndex, active.columns.length);

  for (let index = active.allowedMinIndex; index < maxMeasuredIndex; index += 1) {
    const geometry = active.columns[index];
    if (!geometry) continue;
    const midpoint = geometry.left + geometry.width / 2;
    if (draggedCenter < midpoint) {
      nextIndex = index;
      break;
    }
    nextIndex = index + 1;
  }

  return clampColumnReorderTarget(
    nextIndex,
    active.allowedMinIndex,
    active.allowedMaxIndex,
    active.columns.length,
  );
}

export function getColumnReorderShift(active: ColumnReorderState, geometry: ColumnReorderGeometry) {
  if (geometry.key === active.columnKey) return null;
  const toIndex = active.currentToIndex;
  const originIndex = active.originIndex;

  if (toIndex < originIndex && geometry.index >= toIndex && geometry.index < originIndex) {
    return active.draggedWidth;
  }

  if (toIndex > originIndex + 1 && geometry.index > originIndex && geometry.index < toIndex) {
    return -active.draggedWidth;
  }

  return 0;
}

export function formatColumnReorderTransform(offsetX: number) {
  if (Math.abs(offsetX) < 0.1) return "";
  const rounded = Math.round(offsetX * 100) / 100;
  return `translate3d(${rounded}px, 0, 0)`;
}

export function getColumnReorderCellBackground(element: HTMLElement, isDragged: boolean) {
  const isHeader = element.tagName === "TH";
  const isDark = document.documentElement.classList.contains("dark");
  const base = isHeader
    ? isDark
      ? "rgb(38 38 38)"
      : "rgb(241 245 249)"
    : isDark
      ? "rgb(10 10 10)"
      : "rgb(255 255 255)";

  if (!isDragged) return base;

  const accent = isDark
    ? isHeader
      ? "linear-gradient(90deg, rgba(59, 130, 246, 0.24), rgba(34, 211, 238, 0.12))"
      : "linear-gradient(90deg, rgba(59, 130, 246, 0.16), rgba(34, 211, 238, 0.08))"
    : isHeader
      ? "linear-gradient(90deg, rgba(37, 99, 235, 0.2), rgba(14, 165, 233, 0.1))"
      : "linear-gradient(90deg, rgba(37, 99, 235, 0.1), rgba(14, 165, 233, 0.05))";

  return `${accent}, ${base}`;
}

export function scheduleColumnReorderSettleCleanup(element: HTMLElement) {
  window.setTimeout(() => {
    if (
      element.hasAttribute("data-vt-column-dragging-cell") ||
      element.hasAttribute("data-vt-column-shifted-cell") ||
      element.style.transform
    ) {
      return;
    }

    element.style.transition = "";
    element.style.willChange = "";
    element.style.position = "";
    element.style.zIndex = "";
    element.style.background = "";
    element.style.overflow = "";
    element.style.contain = "";
    element.style.isolation = "";
    element.style.borderRadius = "";
  }, COLUMN_REORDER_SETTLE_CLEANUP_MS);
}
