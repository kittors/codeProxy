import type { DataTableColumn } from "./DataTable.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const DEFAULT_ROW_HEIGHT = 44;
export const DEFAULT_OVERSCAN = 12;
export const DEFAULT_SCROLL_THRESHOLD = 100;
export const DEFAULT_BOTTOM_DEBOUNCE_MS = 120;
export const COLUMN_WIDTH_STORAGE_PREFIX = "codeProxy.dataTable.columnWidths.v1";
export const COLUMN_RESIZE_DEBUG_STORAGE_KEY = "codeProxy.dataTable.debugResize";
export const DEFAULT_MIN_COLUMN_WIDTH = 72;
export const DEFAULT_MAX_COLUMN_WIDTH = 640;
export const COLUMN_RESIZE_PREVIEW_LINE_WIDTH = 2;
export const NON_RESIZABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);
const TAILWIND_SPACING_UNIT_PX = 4;

// ---------------------------------------------------------------------------
// Column Reorder
// ---------------------------------------------------------------------------
export const COLUMN_ORDER_STORAGE_PREFIX = "codeProxy.dataTable.columnOrder.v1";
export const COLUMN_REORDER_ACTIVATION_DELAY_MS = 180;
export const COLUMN_REORDER_MIN_DRAG_DISTANCE_PX = 4;
export const NON_REORDERABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);

export type ColumnOrder = string[];

export interface ColumnReorderState {
  pointerId: number;
  columnKey: string;
  originIndex: number;
  currentIndex: number;
  startClientX: number;
  startClientY: number;
  activated: boolean;
  activationTimer: number | null;
  allowedMinIndex: number;
  allowedMaxIndex: number;
}

export interface ColumnReorderPreview {
  fromIndex: number;
  toIndex: number;
  left: number;
  top: number;
  height: number;
}

export type ColumnWidthMap = Record<string, number>;

export interface ColumnResizeState {
  pointerId: number;
  columnKey: string;
  startLeftClientX: number;
  pointerBoundaryOffsetClientX: number;
  minWidth: number;
  maxWidth: number;
  previewTop: number;
  previewBottom: number;
  currentWidth: number;
  lastDebugAtMs: number;
  debugEnabled: boolean;
}

export interface ColumnResizePreview {
  width: number;
  left: number;
  top: number;
  height: number;
  tooltipTop: number;
}

export interface ScrollMetrics {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

export function hasHorizontalOverflow(metrics: ScrollMetrics) {
  return metrics.scrollWidth > metrics.clientWidth + 1;
}

export function hasVerticalOverflow(metrics: ScrollMetrics, headerHeight: number) {
  const effectiveViewportY = Math.max(0, metrics.clientHeight - headerHeight);
  const effectiveContentY = Math.max(effectiveViewportY, metrics.scrollHeight - headerHeight);
  return effectiveContentY > effectiveViewportY + 1;
}

export function calculateScrollbarThumbs(scrollMetrics: ScrollMetrics, headerHeight: number) {
  const trackInset = 8; // matches `inset-y-2` / `inset-x-2` (8px)
  const effectiveViewportY = Math.max(0, scrollMetrics.clientHeight - headerHeight);
  const effectiveContentY = Math.max(effectiveViewportY, scrollMetrics.scrollHeight - headerHeight);
  const hasV = hasVerticalOverflow(scrollMetrics, headerHeight);
  const hasH = hasHorizontalOverflow(scrollMetrics);

  const v = (() => {
    if (!hasV) return null;
    const trackLength = Math.max(0, scrollMetrics.clientHeight - headerHeight - trackInset * 2);
    const viewport = Math.max(1, effectiveViewportY);
    const content = Math.max(viewport, effectiveContentY);
    const thumbLength = Math.max(28, Math.round((viewport / content) * trackLength));
    const maxThumbOffset = Math.max(0, trackLength - thumbLength);
    const scrollRange = Math.max(1, scrollMetrics.scrollHeight - scrollMetrics.clientHeight);
    const offset = Math.min(
      maxThumbOffset,
      Math.max(0, Math.round((scrollMetrics.scrollTop / scrollRange) * maxThumbOffset)),
    );
    return { top: offset, height: thumbLength };
  })();

  const h = (() => {
    if (!hasH) return null;
    const trackLength = Math.max(0, scrollMetrics.clientWidth - trackInset * 2);
    const viewport = scrollMetrics.clientWidth;
    const content = scrollMetrics.scrollWidth;
    const thumbLength = Math.max(28, Math.round((viewport / content) * trackLength));
    const maxThumbOffset = Math.max(0, trackLength - thumbLength);
    const scrollRange = Math.max(1, content - viewport);
    const offset = Math.min(
      maxThumbOffset,
      Math.max(0, Math.round((scrollMetrics.scrollLeft / scrollRange) * maxThumbOffset)),
    );
    return { left: offset, width: thumbLength };
  })();

  return { vThumb: v, hThumb: h };
}

export function clampColumnWidth<T>(column: DataTableColumn<T>, width: number) {
  const minWidth = resolveColumnMinWidth(column);
  const maxWidth = resolveColumnMaxWidth(column, minWidth);
  return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
}

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
  return column.minWidthPx ?? resolveWidthClassPx(column.width, "min-w") ?? DEFAULT_MIN_COLUMN_WIDTH;
}

export function resolveColumnMaxWidth<T>(
  column: DataTableColumn<T>,
  minWidth = resolveColumnMinWidth(column),
) {
  return Math.max(minWidth, column.maxWidthPx ?? DEFAULT_MAX_COLUMN_WIDTH);
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

function getColumnOrderStorageKey(tableId?: string) {
  const trimmed = tableId?.trim();
  return trimmed ? `${COLUMN_ORDER_STORAGE_PREFIX}.${trimmed}` : null;
}

function readStoredColumnOrder(tableId?: string): ColumnOrder {
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

function writeStoredColumnOrder(tableId: string | undefined, order: ColumnOrder) {
  const key = getColumnOrderStorageKey(tableId);
  if (!key || typeof window === "undefined") return;
  try {
    const normalized = Array.from(new Set(order.filter((value) => value.trim() !== "")));
    window.localStorage.setItem(key, JSON.stringify(normalized));
  } catch {}
}

function resolveColumnOrderLock<T>(column: DataTableColumn<T>) {
  if (column.lockOrder) return column.lockOrder;
  if (column.key === "select") return "start";
  if (column.key === "action" || column.key === "actions") return "end";
  return null;
}

export {
  getColumnOrderStorageKey,
  readStoredColumnOrder,
  writeStoredColumnOrder,
  resolveColumnOrderLock,
};
