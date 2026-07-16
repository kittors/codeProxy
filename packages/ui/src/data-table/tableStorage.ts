import type { DataTableColumn } from "./DataTable.types";
import {
  COLUMN_ORDER_STORAGE_PREFIX,
  COLUMN_RESIZE_DEBUG_STORAGE_KEY,
  COLUMN_WIDTH_STORAGE_PREFIX,
  DEFAULT_MAX_COLUMN_WIDTH,
  DEFAULT_MIN_COLUMN_WIDTH,
  NON_RESIZABLE_COLUMN_KEYS,
  TAILWIND_SPACING_UNIT_PX,
  type ColumnOrder,
  type ColumnWidthMap,
} from "./dataTableModel";

export {
  DEFAULT_ROW_HEIGHT,
  DEFAULT_OVERSCAN,
  DEFAULT_SCROLL_THRESHOLD,
  DEFAULT_BOTTOM_DEBOUNCE_MS,
  COLUMN_WIDTH_STORAGE_PREFIX,
  COLUMN_RESIZE_DEBUG_STORAGE_KEY,
  DEFAULT_MIN_COLUMN_WIDTH,
  DEFAULT_MAX_COLUMN_WIDTH,
  COLUMN_RESIZE_PREVIEW_LINE_WIDTH,
  NON_RESIZABLE_COLUMN_KEYS,
  COLUMN_ORDER_STORAGE_PREFIX,
  COLUMN_REORDER_ACTIVATION_DELAY_MS,
  COLUMN_REORDER_MIN_DRAG_DISTANCE_PX,
  NON_REORDERABLE_COLUMN_KEYS,
  type ColumnOrder,
  type ColumnWidthMap,
  type ColumnResizeState,
  type ColumnResizePreview,
  type ScrollMetrics,
} from "./dataTableModel";

export {
  hasHorizontalOverflow,
  hasVerticalOverflow,
  calculateScrollbarThumbs,
} from "./scrollMetrics";

function parseTailwindSizePx(token: string) {
  const arbitrary = token.match(/^\[(\d+(?:\.\d+)?)(px|rem)\]$/);
  if (arbitrary) {
    const value = Number(arbitrary[1]);
    if (!Number.isFinite(value)) return null;
    return arbitrary[2] === "rem" ? Math.round(value * 16) : Math.round(value);
  }
  if (token === "px") return 1;
  const numeric = Number(token);
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric * TAILWIND_SPACING_UNIT_PX);
}

function resolveWidthClassPx(width: string | undefined, prefix: string) {
  if (!width) return null;
  const classes = width.split(/\s+/).filter(Boolean).reverse();
  for (const className of classes) {
    if (!className.startsWith(`${prefix}-`)) continue;
    const parsed = parseTailwindSizePx(className.slice(prefix.length + 1));
    if (parsed !== null) return parsed;
  }
  return null;
}

export function resolveColumnMinWidth<T>(column: DataTableColumn<T>) {
  return (
    column.minWidthPx ?? resolveWidthClassPx(column.width, "min-w") ?? DEFAULT_MIN_COLUMN_WIDTH
  );
}

export function resolveColumnMaxWidth<T>(
  column: DataTableColumn<T>,
  minWidth = resolveColumnMinWidth(column),
) {
  return Math.max(minWidth, column.maxWidthPx ?? DEFAULT_MAX_COLUMN_WIDTH);
}

export function clampColumnWidth<T>(column: DataTableColumn<T>, width: number) {
  const minWidth = resolveColumnMinWidth(column);
  const maxWidth = resolveColumnMaxWidth(column, minWidth);
  return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
}

export function getColumnWidthStorageKey(tableId?: string) {
  const trimmed = tableId?.trim();
  return trimmed ? `${COLUMN_WIDTH_STORAGE_PREFIX}.${trimmed}` : null;
}

export function readStoredColumnWidths(tableId?: string): ColumnWidthMap {
  const key = getColumnWidthStorageKey(tableId);
  if (!key || typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === "number" && Number.isFinite(value))
        .map(([columnKey, value]) => [columnKey, Math.round(value as number)]),
    );
  } catch {
    return {};
  }
}

export function writeStoredColumnWidths(tableId: string | undefined, widths: ColumnWidthMap) {
  const key = getColumnWidthStorageKey(tableId);
  if (!key || typeof window === "undefined") return;
  try {
    const normalized = Object.fromEntries(
      Object.entries(widths).filter(([, value]) => Number.isFinite(value) && value > 0),
    );
    window.localStorage.setItem(key, JSON.stringify(normalized));
  } catch {
    // localStorage can be unavailable in private browsing or embedded contexts.
  }
}

export function shouldDebugColumnResize() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLUMN_RESIZE_DEBUG_STORAGE_KEY) === "1";
}

export function logColumnResizeDebug(event: string, payload: Record<string, unknown>) {
  if (!shouldDebugColumnResize()) return;
  // eslint-disable-next-line no-console
  console.debug("[DataTable resize]", event, payload);
}

export function shouldAllowColumnResize<T>(
  column: DataTableColumn<T>,
  columnIndex: number,
  columns: DataTableColumn<T>[],
) {
  if (columnIndex >= columns.length - 1) return false;
  if (column.resizable !== undefined) return column.resizable;
  return !NON_RESIZABLE_COLUMN_KEYS.has(column.key);
}

export function resolveCellOverflowTooltip<T>(column: DataTableColumn<T>, row: T, index: number) {
  if (column.overflowTooltip === false) return false;
  if (typeof column.overflowTooltip === "function") {
    const value = column.overflowTooltip(row, index);
    return value === null || value === undefined ? null : String(value);
  }
  return undefined;
}

export function safeSetPointerCapture(element: Element, pointerId: number) {
  try {
    if ("setPointerCapture" in element) {
      element.setPointerCapture(pointerId);
    }
  } catch {
    // Synthetic pointer events in automated checks may not create an active browser pointer.
  }
}

export function getColumnOrderStorageKey(tableId?: string) {
  const trimmed = tableId?.trim();
  return trimmed ? `${COLUMN_ORDER_STORAGE_PREFIX}.${trimmed}` : null;
}

export function readStoredColumnOrder(tableId?: string): ColumnOrder {
  const key = getColumnOrderStorageKey(tableId);
  if (!key || typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (value): value is string => typeof value === "string" && value.trim() !== "",
    );
  } catch {
    return [];
  }
}

export function writeStoredColumnOrder(tableId: string | undefined, order: ColumnOrder) {
  const key = getColumnOrderStorageKey(tableId);
  if (!key || typeof window === "undefined") return;
  try {
    const normalized = Array.from(new Set(order.filter((value) => value.trim() !== "")));
    window.localStorage.setItem(key, JSON.stringify(normalized));
  } catch {
    // localStorage can be unavailable in private browsing or embedded contexts.
  }
}

export function resolveColumnOrderLock<T>(column: DataTableColumn<T>) {
  if (column.lockOrder) return column.lockOrder;
  if (column.key === "select") return "start";
  if (column.key === "action" || column.key === "actions") return "end";
  return null;
}
