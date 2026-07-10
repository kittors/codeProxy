import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, GripVertical } from "lucide-react";
import { DropdownMenu } from "../primitives/DropdownMenu";
import { TableCellOverflowTooltip } from "./TableCellOverflowTooltip";

export type {
  DataTableColumn,
  DataTableColumnSort,
  DataTableProps,
  DataTableRowsChangeAction,
  DataTableSortDirection,
  DataTableSortState,
  DataTableSortValue,
} from "./DataTable.types";
import type {
  DataTableColumn,
  DataTableProps,
  DataTableSortDirection,
  DataTableSortState,
  DataTableSortValue,
} from "./DataTable.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_ROW_HEIGHT = 44;
const DEFAULT_OVERSCAN = 12;
const DEFAULT_SCROLL_THRESHOLD = 100;
const DEFAULT_BOTTOM_DEBOUNCE_MS = 120;
const COLUMN_WIDTH_STORAGE_PREFIX = "codeProxy.dataTable.columnWidths.v1";
const COLUMN_RESIZE_DEBUG_STORAGE_KEY = "codeProxy.dataTable.debugResize";
const DEFAULT_MIN_COLUMN_WIDTH = 72;
const DEFAULT_MAX_COLUMN_WIDTH = 640;
const COLUMN_RESIZE_PREVIEW_LINE_WIDTH = 2;
const STICKY_EDGE_SHADOW_WIDTH = 28;

function getStickyEdgeShadowOpacity(metrics: ScrollMetrics, edge: "start" | "end") {
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  if (maxScrollLeft <= 1) return 0;
  if (edge === "start") return metrics.scrollLeft > 1 ? 1 : 0;
  return metrics.scrollLeft < maxScrollLeft - 1 ? 1 : 0;
}
const NON_RESIZABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);
const TAILWIND_SPACING_UNIT_PX = 4;

// ---------------------------------------------------------------------------
// Column Reorder
// ---------------------------------------------------------------------------
const COLUMN_ORDER_STORAGE_PREFIX = "codeProxy.dataTable.columnOrder.v1";
const COLUMN_REORDER_ACTIVATION_DELAY_MS = 90;
const COLUMN_REORDER_MIN_DRAG_DISTANCE_PX = 4;
const COLUMN_REORDER_AUTOSCROLL_EDGE_PX = 72;
const COLUMN_REORDER_AUTOSCROLL_MAX_PX_PER_FRAME = 22;
const COLUMN_REORDER_SHIFT_TRANSITION = "transform 72ms cubic-bezier(0.2, 0, 0, 1)";
const COLUMN_REORDER_SETTLE_CLEANUP_MS = 110;
const COLUMN_REORDER_SETTLE_FEEDBACK_MS = 900;
const NON_REORDERABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);

const ROW_REORDER_COLUMN_KEY = "__data-table-row-reorder__";
const ROW_REORDER_MIN_DRAG_DISTANCE_PX = 4;
const ROW_REORDER_AUTOSCROLL_EDGE_PX = 56;
const ROW_REORDER_AUTOSCROLL_MAX_PX_PER_FRAME = 18;

type ColumnOrder = string[];

interface ColumnReorderGeometry {
  key: string;
  index: number;
  left: number;
  width: number;
  elements: HTMLElement[];
  appliedDragging: boolean;
  appliedShift: number | null;
  appliedTransform: string;
}

interface ColumnReorderState {
  pointerId: number;
  columnKey: string;
  originIndex: number;
  currentToIndex: number;
  startClientX: number;
  startClientY: number;
  startScrollLeft: number;
  lastClientX: number;
  lastClientY: number;
  activated: boolean;
  activationTimer: number | null;
  allowedMinIndex: number;
  allowedMaxIndex: number;
  columns: ColumnReorderGeometry[];
  draggedWidth: number;
}

interface RowReorderState {
  pointerId: number;
  fromIndex: number;
  insertionIndex: number;
  startClientY: number;
  lastClientY: number;
  activated: boolean;
  scrollContainer: HTMLElement | null;
}

type ColumnWidthMap = Record<string, number>;

interface ColumnResizeState {
  pointerId: number;
  columnKey: string;
  startLeftClientX: number;
  pointerBoundaryOffsetClientX: number;
  minWidth: number;
  maxWidth: number;
  previewTop: number;
  previewBottom: number;
  previewMinClientX: number;
  previewMaxClientX: number;
  currentWidth: number;
  lastDebugAtMs: number;
  debugEnabled: boolean;
}

interface ColumnResizePreview {
  width: number;
  left: number;
  top: number;
  height: number;
  tooltipTop: number;
  visible: boolean;
}

interface ScrollMetrics {
  scrollTop: number;
  scrollLeft: number;
  scrollHeight: number;
  scrollWidth: number;
  clientHeight: number;
  clientWidth: number;
}

type StickyColumnPlacement = {
  edge: "start" | "end";
  offset: number;
};

type DataTableColumnStyle = CSSProperties & {
  "--vt-sticky-left"?: string;
  "--vt-sticky-right"?: string;
};

function hasHorizontalOverflow(metrics: ScrollMetrics) {
  return metrics.scrollWidth > metrics.clientWidth + 1;
}

function hasVerticalOverflow(metrics: ScrollMetrics, headerHeight: number) {
  const effectiveViewportY = Math.max(0, metrics.clientHeight - headerHeight);
  const effectiveContentY = Math.max(effectiveViewportY, metrics.scrollHeight - headerHeight);
  return effectiveContentY > effectiveViewportY + 1;
}

function calculateScrollbarThumbs(scrollMetrics: ScrollMetrics, headerHeight: number) {
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

function clampColumnWidth<T>(column: DataTableColumn<T>, width: number) {
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

function resolveColumnMinWidth<T>(column: DataTableColumn<T>) {
  return (
    column.minWidthPx ?? resolveWidthClassPx(column.width, "min-w") ?? DEFAULT_MIN_COLUMN_WIDTH
  );
}

function resolveColumnMaxWidth<T>(
  column: DataTableColumn<T>,
  minWidth = resolveColumnMinWidth(column),
) {
  return Math.max(minWidth, column.maxWidthPx ?? DEFAULT_MAX_COLUMN_WIDTH);
}

function hasStickyColumnClass<T>(column: DataTableColumn<T>) {
  return `${column.headerClassName ?? ""} ${column.cellClassName ?? ""}`
    .split(/\s+/)
    .some((className) => className === "sticky" || className.endsWith(":sticky"));
}

function resolveColumnLayoutWidth<T>(column: DataTableColumn<T>, widths: ColumnWidthMap) {
  const resizedWidth = widths[column.key];
  return resizedWidth ? clampColumnWidth(column, resizedWidth) : resolveColumnMinWidth(column);
}

function resolveStickyRailWidth<T>(
  columns: DataTableColumn<T>[],
  widths: ColumnWidthMap,
  edge: "start" | "end",
) {
  const edgeColumns = edge === "start" ? columns : [...columns].reverse();
  let width = 0;

  for (const column of edgeColumns) {
    if (resolveColumnOrderLock(column) !== edge || !hasStickyColumnClass(column)) break;
    width += resolveColumnLayoutWidth(column, widths);
  }

  return width;
}

function resolveStickyColumnPlacements<T>(columns: DataTableColumn<T>[], widths: ColumnWidthMap) {
  const placements: Record<string, StickyColumnPlacement> = {};

  let startOffset = 0;
  for (const column of columns) {
    if (resolveColumnOrderLock(column) !== "start" || !hasStickyColumnClass(column)) break;
    placements[column.key] = { edge: "start", offset: startOffset };
    startOffset += resolveColumnLayoutWidth(column, widths);
  }

  let endOffset = 0;
  for (const column of [...columns].reverse()) {
    if (resolveColumnOrderLock(column) !== "end" || !hasStickyColumnClass(column)) break;
    placements[column.key] = { edge: "end", offset: endOffset };
    endOffset += resolveColumnLayoutWidth(column, widths);
  }

  return placements;
}

function normalizeColumnWidths<T>(columns: DataTableColumn<T>[], widths: ColumnWidthMap) {
  const next: ColumnWidthMap = {};
  columns.forEach((column) => {
    const width = widths[column.key];
    if (width !== undefined) next[column.key] = clampColumnWidth(column, width);
  });
  return next;
}

function areColumnWidthMapsEqual(left: ColumnWidthMap, right: ColumnWidthMap) {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => left[key] === right[key]);
}

function getColumnWidthStorageKey(tableId?: string) {
  const trimmed = tableId?.trim();
  return trimmed ? `${COLUMN_WIDTH_STORAGE_PREFIX}.${trimmed}` : null;
}

function readStoredColumnWidths(tableId?: string): ColumnWidthMap {
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

function writeStoredColumnWidths(tableId: string | undefined, widths: ColumnWidthMap) {
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

function shouldDebugColumnResize() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLUMN_RESIZE_DEBUG_STORAGE_KEY) === "1";
}

function logColumnResizeDebug(event: string, payload: Record<string, unknown>) {
  if (!shouldDebugColumnResize()) return;
  // eslint-disable-next-line no-console
  console.debug("[DataTable resize]", event, payload);
}

function resolveColumnResizeWidth(active: ColumnResizeState, pointerClientX: number) {
  const rawBoundaryClientX = pointerClientX + active.pointerBoundaryOffsetClientX;
  return Math.max(
    active.minWidth,
    Math.min(active.maxWidth, Math.round(rawBoundaryClientX - active.startLeftClientX)),
  );
}

function shouldAllowColumnResize<T>(
  column: DataTableColumn<T>,
  columnIndex: number,
  columns: DataTableColumn<T>[],
) {
  if (columnIndex >= columns.length - 1) return false;
  if (column.resizable !== undefined) return column.resizable;
  return !NON_RESIZABLE_COLUMN_KEYS.has(column.key);
}

function resolveCellOverflowTooltip<T>(column: DataTableColumn<T>, row: T, index: number) {
  if (column.overflowTooltip === false) return false;

  if (typeof column.overflowTooltip === "function") {
    const value = column.overflowTooltip(row, index);
    return value === null || value === undefined ? null : String(value);
  }

  return undefined;
}

function safeSetPointerCapture(element: Element, pointerId: number) {
  try {
    if ("setPointerCapture" in element) {
      element.setPointerCapture(pointerId);
    }
  } catch {
    // Synthetic pointer events in automated checks may not create an active browser pointer.
  }
}

function isEmptySortValue(value: DataTableSortValue) {
  return value === null || value === undefined || (typeof value === "string" && !value.trim());
}

function compareSortValues(
  left: DataTableSortValue,
  right: DataTableSortValue,
  collator: Intl.Collator,
) {
  const leftEmpty = isEmptySortValue(left);
  const rightEmpty = isEmptySortValue(right);
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return collator.compare(String(left), String(right));
}

function moveRow<T>(rows: readonly T[], fromIndex: number, toIndex: number): T[] {
  const next = Array.from(rows);
  const [moved] = next.splice(fromIndex, 1);
  if (moved === undefined) return next;
  next.splice(toIndex, 0, moved);
  return next;
}

function findVerticalScrollContainer(element: HTMLElement | null): HTMLElement | null {
  let current = element?.parentElement ?? null;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    if (/(auto|scroll)/.test(overflowY) && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  const scrollingElement = document.scrollingElement;
  return scrollingElement instanceof HTMLElement ? scrollingElement : null;
}

// ---------------------------------------------------------------------------
// Column Order Helpers
// ---------------------------------------------------------------------------

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
  } catch {
    // localStorage can be unavailable in private browsing or embedded contexts.
  }
}

function resolveColumnOrderLock<T>(column: DataTableColumn<T>) {
  if (column.lockOrder) return column.lockOrder;
  if (column.key === "select") return "start";
  if (column.key === "action" || column.key === "actions") return "end";
  return null;
}

function shouldAllowColumnReorder<T>(column: DataTableColumn<T>) {
  if (resolveColumnOrderLock(column) !== null) return false;
  if (column.reorderable !== undefined) return column.reorderable;
  if (NON_REORDERABLE_COLUMN_KEYS.has(column.key)) return false;
  return true;
}

function normalizeColumnOrder<T>(columns: DataTableColumn<T>[], storedOrder: ColumnOrder) {
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

function moveColumnKey(order: ColumnOrder, fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return order;
  const normalizedTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
  next.splice(Math.max(0, Math.min(next.length, normalizedTo)), 0, item);
  return next;
}

function clampColumnReorderTarget(
  toIndex: number,
  minIndex: number,
  maxIndex: number,
  columnCount: number,
) {
  return Math.max(minIndex, Math.min(Math.min(maxIndex, columnCount), toIndex));
}

function getColumnReorderDragOffset(
  active: ColumnReorderState,
  clientX: number,
  scrollLeft: number,
) {
  return clientX - active.startClientX + (scrollLeft - active.startScrollLeft);
}

function findColumnReorderTargetIndex(active: ColumnReorderState, dragOffsetX: number) {
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

function getColumnReorderShift(active: ColumnReorderState, geometry: ColumnReorderGeometry) {
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

function formatColumnReorderTransform(offsetX: number) {
  if (Math.abs(offsetX) < 0.1) return "";
  const rounded = Math.round(offsetX * 100) / 100;
  return `translate3d(${rounded}px, 0, 0)`;
}

function getColumnReorderCellBackground(element: HTMLElement, isDragged: boolean) {
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

function scheduleColumnReorderSettleCleanup(element: HTMLElement) {
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataTable<T>({
  tableId,
  rows,
  columns: providedColumns,
  rowKey,
  loading = false,
  hasMore = false,
  loadingMore = false,
  onScrollBottom,
  virtualize = false,
  rowHeight = DEFAULT_ROW_HEIGHT,
  overscan = DEFAULT_OVERSCAN,
  scrollThreshold = DEFAULT_SCROLL_THRESHOLD,
  bottomDebounceMs = DEFAULT_BOTTOM_DEBOUNCE_MS,
  minWidth = "min-w-[1320px]",
  height = "h-[calc(100dvh-260px)]",
  minHeight = "min-h-[360px]",
  caption = "data table",
  emptyText = "",
  showAllLoadedMessage = true,
  rowClassName,
  onRowClick,
  rowAriaSelected,
  allowWheelPropagationAtBoundary = false,
  naturalFlow = false,
  scrollContentClassName,
  columnReorderable = true,
  persistColumnOrder = true,
  sortState,
  defaultSortState = null,
  onSortStateChange,
  rowReorderable = false,
  onRowsChange,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const columns = useMemo<DataTableColumn<T>[]>(() => {
    if (!rowReorderable) return providedColumns;
    const stickyClassName = naturalFlow ? "" : "sticky";
    return [
      {
        key: ROW_REORDER_COLUMN_KEY,
        label: t("common.row_order"),
        width: "w-12",
        minWidthPx: 48,
        maxWidthPx: 48,
        resizable: false,
        reorderable: false,
        lockOrder: "start",
        headerClassName: stickyClassName,
        cellClassName: stickyClassName,
        overflowTooltip: false,
        render: () => null,
      },
      ...providedColumns,
    ];
  }, [naturalFlow, providedColumns, rowReorderable, t]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tableRef = useRef<HTMLTableElement | null>(null);
  const headerRef = useRef<HTMLTableSectionElement | null>(null);
  const headerCellsRef = useRef<Record<string, HTMLTableCellElement | null>>({});
  const columnElementsRef = useRef<Record<string, HTMLTableColElement | null>>({});
  const headerHeightRef = useRef(0);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() =>
    normalizeColumnWidths(columns, readStoredColumnWidths(tableId)),
  );
  const columnWidthsRef = useRef<ColumnWidthMap>(columnWidths);
  const [resizePreview, setResizePreview] = useState<ColumnResizePreview | null>(null);
  const [activeResizeColumnKey, setActiveResizeColumnKey] = useState<string | null>(null);
  const resizePreviewLineRef = useRef<HTMLDivElement | null>(null);
  const resizePreviewTooltipRef = useRef<HTMLDivElement | null>(null);
  const stickyRailWidthsRef = useRef({ start: 0, end: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [scrollMetrics, setScrollMetrics] = useState<ScrollMetrics>(() => ({
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    scrollWidth: 0,
    clientHeight: 0,
    clientWidth: 0,
  }));
  const scrollMetricsRef = useRef(scrollMetrics);
  const rafRef = useRef<number | null>(null);
  const metricsRafRef = useRef<number | null>(null);
  const verticalThumbRef = useRef<HTMLDivElement | null>(null);
  const horizontalThumbRef = useRef<HTMLDivElement | null>(null);
  const columnResizeRafRef = useRef<number | null>(null);
  const pendingColumnResizePointerRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const bottomTimeoutRef = useRef<number | null>(null);
  const bottomPendingRef = useRef(false);
  const prevLoadingMoreRef = useRef(loadingMore);
  const latestRef = useRef({
    hasMore,
    loadingMore,
    onScrollBottom,
    scrollThreshold,
    bottomDebounceMs,
  });
  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);

  const canUseColumnOrder = Boolean(tableId && columnReorderable);
  const canPersistColumnOrder = canUseColumnOrder && persistColumnOrder;

  const [columnOrder, setColumnOrder] = useState<ColumnOrder>(() =>
    canUseColumnOrder
      ? normalizeColumnOrder(columns, canPersistColumnOrder ? readStoredColumnOrder(tableId) : [])
      : [],
  );
  const columnOrderRef = useRef<ColumnOrder>(columnOrder);
  const [activeReorderColumnKey, setActiveReorderColumnKey] = useState<string | null>(null);
  const [settledReorderColumnKey, setSettledReorderColumnKey] = useState<string | null>(null);
  const [rowHoverOverlay, setRowHoverOverlay] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const columnReorderRef = useRef<ColumnReorderState | null>(null);
  const columnReorderRafRef = useRef<number | null>(null);
  const columnReorderAutoScrollRafRef = useRef<number | null>(null);
  const columnReorderSettleTimeoutRef = useRef<number | null>(null);
  const hoveredRowRef = useRef<HTMLTableRowElement | null>(null);
  const [internalSortState, setInternalSortState] = useState<DataTableSortState | null>(
    defaultSortState,
  );
  const activeSortState = sortState === undefined ? internalSortState : sortState;
  const rowReorderRef = useRef<RowReorderState | null>(null);
  const rowReorderAutoScrollRafRef = useRef<number | null>(null);
  const [activeRowReorderIndex, setActiveRowReorderIndex] = useState<number | null>(null);
  const [rowReorderInsertionIndex, setRowReorderInsertionIndex] = useState<number | null>(null);

  const orderedColumns = useMemo(() => {
    if (!canUseColumnOrder) return columns;
    const byKey = new Map(columns.map((col) => [col.key, col]));
    return normalizeColumnOrder(columns, columnOrder)
      .map((key) => byKey.get(key))
      .filter((col): col is DataTableColumn<T> => Boolean(col));
  }, [canUseColumnOrder, columnOrder, columns]);

  const colCount = orderedColumns.length;

  useEffect(() => {
    setColumnWidths(normalizeColumnWidths(columns, readStoredColumnWidths(tableId)));
    if (canUseColumnOrder) {
      setColumnOrder(
        normalizeColumnOrder(columns, canPersistColumnOrder ? readStoredColumnOrder(tableId) : []),
      );
    }
    // Only re-initialize when switching tables; columns identity changes should
    // preserve the user's current order and just normalize for new/removed keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tableId, canUseColumnOrder, canPersistColumnOrder]);

  useEffect(() => {
    if (canUseColumnOrder) {
      setColumnOrder((prev) => normalizeColumnOrder(columns, prev));
    }
  }, [canUseColumnOrder, columns]);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  useEffect(() => {
    scrollMetricsRef.current = scrollMetrics;
  }, [scrollMetrics]);

  useEffect(() => {
    columnOrderRef.current = columnOrder;
  }, [columnOrder]);

  const orderedColumnsRef = useRef(orderedColumns);
  useEffect(() => {
    orderedColumnsRef.current = orderedColumns;
  }, [orderedColumns]);

  useEffect(() => {
    const validKeys = new Set(columns.map((column) => column.key));
    setColumnWidths((prev) => {
      const next = normalizeColumnWidths(columns, prev);
      const removedStaleKey = Object.keys(prev).some((key) => !validKeys.has(key));
      return removedStaleKey || !areColumnWidthMapsEqual(prev, next) ? next : prev;
    });
  }, [columns]);

  const sortCollator = useMemo(
    () => new Intl.Collator(undefined, { numeric: true, sensitivity: "base" }),
    [],
  );

  const updateSortState = useCallback(
    (nextSortState: DataTableSortState | null) => {
      if (sortState === undefined) setInternalSortState(nextSortState);
      onSortStateChange?.(nextSortState);
    },
    [onSortStateChange, sortState],
  );

  const handleColumnSort = useCallback(
    (column: DataTableColumn<T>, direction: DataTableSortDirection) => {
      if (!column.sort || !onRowsChange) return;
      const nextSortState = { columnKey: column.key, direction };
      const indexedRows = rows.map((row, index) => ({ row, index }));
      indexedRows.sort((left, right) => {
        let compared: number;
        if (column.sort?.compare) {
          compared = column.sort.compare(left.row, right.row);
          if (!Number.isFinite(compared)) compared = 0;
          compared = direction === "asc" ? compared : -compared;
        } else {
          const leftValue = column.sort?.getValue(left.row, left.index);
          const rightValue = column.sort?.getValue(right.row, right.index);
          const leftEmpty = isEmptySortValue(leftValue);
          const rightEmpty = isEmptySortValue(rightValue);
          if (leftEmpty || rightEmpty) {
            compared = leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
          } else {
            compared = compareSortValues(leftValue, rightValue, sortCollator);
            compared = direction === "asc" ? compared : -compared;
          }
        }
        return compared || left.index - right.index;
      });
      updateSortState(nextSortState);
      onRowsChange(
        indexedRows.map((item) => item.row),
        { type: "sort", sort: nextSortState },
      );
    },
    [onRowsChange, rows, sortCollator, updateSortState],
  );

  const resolveRowInsertionIndex = useCallback((clientY: number) => {
    const rowElements = Array.from(
      tableRef.current?.querySelectorAll<HTMLTableRowElement>("tbody tr[data-vt-row-index]") ?? [],
    );
    if (rowElements.length === 0) return 0;

    for (const rowElement of rowElements) {
      const rowIndex = Number(rowElement.dataset.vtRowIndex);
      if (!Number.isInteger(rowIndex)) continue;
      const rect = rowElement.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return rowIndex;
    }

    const lastRowIndex = Number(rowElements.at(-1)?.dataset.vtRowIndex);
    return Number.isInteger(lastRowIndex) ? lastRowIndex + 1 : 0;
  }, []);

  const stopRowReorderAutoScroll = useCallback(() => {
    if (rowReorderAutoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(rowReorderAutoScrollRafRef.current);
      rowReorderAutoScrollRafRef.current = null;
    }
  }, []);

  const updateRowReorderTarget = useCallback(
    (clientY: number) => {
      const active = rowReorderRef.current;
      if (!active?.activated) return;
      const insertionIndex = Math.max(0, Math.min(rows.length, resolveRowInsertionIndex(clientY)));
      if (insertionIndex === active.insertionIndex) return;
      active.insertionIndex = insertionIndex;
      setRowReorderInsertionIndex(insertionIndex);
    },
    [resolveRowInsertionIndex, rows.length],
  );

  const runRowReorderAutoScroll = useCallback(() => {
    rowReorderAutoScrollRafRef.current = null;
    const active = rowReorderRef.current;
    const scrollContainer = active?.scrollContainer;
    if (!active?.activated || !scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight);
    if (maxScrollTop <= 0) return;

    const topIntensity = Math.max(
      0,
      Math.min(
        1,
        (ROW_REORDER_AUTOSCROLL_EDGE_PX - (active.lastClientY - rect.top)) /
          ROW_REORDER_AUTOSCROLL_EDGE_PX,
      ),
    );
    const bottomIntensity = Math.max(
      0,
      Math.min(
        1,
        (ROW_REORDER_AUTOSCROLL_EDGE_PX - (rect.bottom - active.lastClientY)) /
          ROW_REORDER_AUTOSCROLL_EDGE_PX,
      ),
    );
    const direction =
      topIntensity > 0 && scrollContainer.scrollTop > 0
        ? -1
        : bottomIntensity > 0 && scrollContainer.scrollTop < maxScrollTop
          ? 1
          : 0;
    if (direction === 0) return;

    const intensity = direction < 0 ? topIntensity : bottomIntensity;
    const delta =
      direction *
      Math.max(1, Math.round(ROW_REORDER_AUTOSCROLL_MAX_PX_PER_FRAME * intensity * intensity));
    const nextScrollTop = Math.max(0, Math.min(maxScrollTop, scrollContainer.scrollTop + delta));
    if (nextScrollTop !== scrollContainer.scrollTop) {
      scrollContainer.scrollTop = nextScrollTop;
      updateRowReorderTarget(active.lastClientY);
    }
    rowReorderAutoScrollRafRef.current = window.requestAnimationFrame(runRowReorderAutoScroll);
  }, [updateRowReorderTarget]);

  const ensureRowReorderAutoScroll = useCallback(() => {
    if (rowReorderAutoScrollRafRef.current !== null) return;
    rowReorderAutoScrollRafRef.current = window.requestAnimationFrame(runRowReorderAutoScroll);
  }, [runRowReorderAutoScroll]);

  const clearRowReorder = useCallback(() => {
    stopRowReorderAutoScroll();
    rowReorderRef.current = null;
    setActiveRowReorderIndex(null);
    setRowReorderInsertionIndex(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.documentElement.style.cursor = "";
  }, [stopRowReorderAutoScroll]);

  const cancelRowReorder = useCallback(() => {
    clearRowReorder();
  }, [clearRowReorder]);

  const finishRowReorder = useCallback(
    (event?: PointerEvent) => {
      const active = rowReorderRef.current;
      if (!active || (event && event.pointerId !== active.pointerId)) return;
      const shouldCommit = active.activated;
      const fromIndex = active.fromIndex;
      const insertionIndex = active.insertionIndex;
      clearRowReorder();
      if (!shouldCommit || !onRowsChange || rows.length < 2) return;

      const toIndex = Math.max(
        0,
        Math.min(rows.length - 1, insertionIndex > fromIndex ? insertionIndex - 1 : insertionIndex),
      );
      if (toIndex === fromIndex) return;
      if (activeSortState) updateSortState(null);
      onRowsChange(moveRow(rows, fromIndex, toIndex), {
        type: "row-reorder",
        fromIndex,
        toIndex,
      });
    },
    [activeSortState, clearRowReorder, onRowsChange, rows, updateSortState],
  );

  const activateRowReorder = useCallback((active: RowReorderState) => {
    if (active.activated) return;
    active.activated = true;
    setActiveRowReorderIndex(active.fromIndex);
    setRowReorderInsertionIndex(active.insertionIndex);
    document.body.style.cursor = "grabbing";
    document.body.style.userSelect = "none";
    document.documentElement.style.cursor = "grabbing";
  }, []);

  const handleRowReorderPointerDown = useCallback(
    (rowIndex: number, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || !rowReorderable || !onRowsChange || rows.length < 2 || loading) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      safeSetPointerCapture(event.currentTarget, event.pointerId);
      rowReorderRef.current = {
        pointerId: event.pointerId,
        fromIndex: rowIndex,
        insertionIndex: rowIndex,
        startClientY: event.clientY,
        lastClientY: event.clientY,
        activated: false,
        scrollContainer:
          !naturalFlow && containerRef.current
            ? containerRef.current
            : findVerticalScrollContainer(rootRef.current),
      };
    },
    [loading, naturalFlow, onRowsChange, rowReorderable, rows.length],
  );

  const handleRowReorderKeyDown = useCallback(
    (rowIndex: number, event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!onRowsChange || rows.length < 2) return;
      const toIndex =
        event.key === "ArrowUp"
          ? Math.max(0, rowIndex - 1)
          : event.key === "ArrowDown"
            ? Math.min(rows.length - 1, rowIndex + 1)
            : rowIndex;
      if (toIndex === rowIndex) return;
      event.preventDefault();
      event.stopPropagation();
      if (activeSortState) updateSortState(null);
      onRowsChange(moveRow(rows, rowIndex, toIndex), {
        type: "row-reorder",
        fromIndex: rowIndex,
        toIndex,
      });
    },
    [activeSortState, onRowsChange, rows, updateSortState],
  );

  useEffect(() => {
    if (!rowReorderable) return;

    const handlePointerMove = (event: PointerEvent) => {
      const active = rowReorderRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      event.preventDefault();
      active.lastClientY = event.clientY;
      if (
        !active.activated &&
        Math.abs(event.clientY - active.startClientY) >= ROW_REORDER_MIN_DRAG_DISTANCE_PX
      ) {
        activateRowReorder(active);
      }
      if (!active.activated) return;
      updateRowReorderTarget(event.clientY);
      ensureRowReorderAutoScroll();
    };
    const handleWindowBlur = () => cancelRowReorder();

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishRowReorder);
    window.addEventListener("pointercancel", cancelRowReorder);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishRowReorder);
      window.removeEventListener("pointercancel", cancelRowReorder);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    activateRowReorder,
    cancelRowReorder,
    ensureRowReorderAutoScroll,
    finishRowReorder,
    rowReorderable,
    updateRowReorderTarget,
  ]);

  const syncScrollbarThumbs = useCallback(
    (metrics: ScrollMetrics, measuredHeaderHeight = headerHeightRef.current) => {
      const { vThumb: nextVThumb, hThumb: nextHThumb } = calculateScrollbarThumbs(
        metrics,
        measuredHeaderHeight,
      );

      const verticalThumb = verticalThumbRef.current;
      if (verticalThumb && nextVThumb) {
        verticalThumb.style.top = `${nextVThumb.top}px`;
        verticalThumb.style.height = `${nextVThumb.height}px`;
      }

      const horizontalThumb = horizontalThumbRef.current;
      if (horizontalThumb && nextHThumb) {
        horizontalThumb.style.left = `${nextHThumb.left}px`;
        horizontalThumb.style.width = `${nextHThumb.width}px`;
      }
    },
    [],
  );

  const syncStickyEdgeShadows = useCallback(
    (metrics: ScrollMetrics) => {
      if (naturalFlow) return;
      const root = rootRef.current;
      if (!root) return;

      const startBoundary = root.querySelector<HTMLElement>("[data-vt-sticky-start-boundary]");
      if (startBoundary) {
        startBoundary.style.opacity = String(getStickyEdgeShadowOpacity(metrics, "start"));
      }

      const endBoundary = root.querySelector<HTMLElement>("[data-vt-sticky-end-boundary]");
      if (endBoundary) {
        endBoundary.style.opacity = String(getStickyEdgeShadowOpacity(metrics, "end"));
      }
    },
    [naturalFlow],
  );

  const updateScrollMetrics = useCallback(
    (options?: { forceState?: boolean }) => {
      const el = containerRef.current;
      if (!el) return;

      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const maxScrollLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      if (el.scrollTop > maxScrollTop) el.scrollTop = maxScrollTop;
      if (el.scrollLeft > maxScrollLeft) el.scrollLeft = maxScrollLeft;

      const next = {
        scrollTop: el.scrollTop,
        scrollLeft: el.scrollLeft,
        scrollHeight: el.scrollHeight,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        clientWidth: el.clientWidth,
      };

      syncScrollbarThumbs(next);
      syncStickyEdgeShadows(next);
      scrollMetricsRef.current = next;

      setScrollMetrics((prev) => {
        const measuredHeaderHeight = headerHeightRef.current;
        const overflowChanged =
          hasHorizontalOverflow(prev) !== hasHorizontalOverflow(next) ||
          hasVerticalOverflow(prev, measuredHeaderHeight) !==
            hasVerticalOverflow(next, measuredHeaderHeight);
        const viewportChanged =
          prev.clientHeight !== next.clientHeight || prev.clientWidth !== next.clientWidth;
        if (
          !options?.forceState &&
          !overflowChanged &&
          !viewportChanged &&
          prev.scrollTop === next.scrollTop &&
          prev.scrollLeft === next.scrollLeft
        ) {
          return prev;
        }
        if (!options?.forceState && !overflowChanged && !viewportChanged) return prev;
        return next;
      });
    },
    [syncScrollbarThumbs, syncStickyEdgeShadows],
  );

  const scheduleScrollMetricsUpdate = useCallback(() => {
    if (metricsRafRef.current !== null) return;
    metricsRafRef.current = window.requestAnimationFrame(() => {
      metricsRafRef.current = null;
      updateScrollMetrics();
    });
  }, [updateScrollMetrics]);

  // Keep latest props for timeout callbacks (avoid stale closures)
  useEffect(() => {
    latestRef.current = {
      hasMore,
      loadingMore,
      onScrollBottom,
      scrollThreshold,
      bottomDebounceMs,
    };
  }, [hasMore, loadingMore, onScrollBottom, scrollThreshold, bottomDebounceMs]);

  // Clear the pending gate after a next-page load completes
  useEffect(() => {
    if (prevLoadingMoreRef.current && !loadingMore) {
      bottomPendingRef.current = false;
    }
    prevLoadingMoreRef.current = loadingMore;
  }, [loadingMore]);

  // If there's no more data, never keep a pending gate around
  useEffect(() => {
    if (!hasMore) bottomPendingRef.current = false;
  }, [hasMore]);

  // Scroll handler with infinite-scroll detection
  const onScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const next = el.scrollTop;
    updateScrollMetrics();
    if (hoveredRowRef.current) {
      const rowRect = hoveredRowRef.current.getBoundingClientRect();
      const containerRect = el.getBoundingClientRect();
      setRowHoverOverlay({
        left: el.scrollLeft,
        top: rowRect.top - containerRect.top + el.scrollTop,
        width: el.clientWidth,
        height: rowRect.height,
      });
    }

    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const {
      hasMore: latestHasMore,
      loadingMore: latestLoadingMore,
      onScrollBottom: latestCb,
    } = latestRef.current;
    const threshold = latestRef.current.scrollThreshold;

    const shouldSchedule =
      scrollBottom <= threshold && latestHasMore && !latestLoadingMore && Boolean(latestCb);

    if (!shouldSchedule) {
      if (bottomTimeoutRef.current) {
        window.clearTimeout(bottomTimeoutRef.current);
        bottomTimeoutRef.current = null;
      }
    } else if (!bottomPendingRef.current) {
      if (bottomTimeoutRef.current) window.clearTimeout(bottomTimeoutRef.current);
      bottomTimeoutRef.current = window.setTimeout(() => {
        bottomTimeoutRef.current = null;
        const node = containerRef.current;
        if (!node) return;

        const st = latestRef.current;
        if (!st.hasMore || st.loadingMore || !st.onScrollBottom) return;

        const bottomNow = node.scrollHeight - node.scrollTop - node.clientHeight;
        if (bottomNow > st.scrollThreshold) return;

        bottomPendingRef.current = true;
        st.onScrollBottom();
      }, latestRef.current.bottomDebounceMs);
    }

    if (!rafRef.current) {
      rafRef.current = window.requestAnimationFrame(() => {
        rafRef.current = null;
        if (virtualize) setScrollTop(next);
      });
    }
  }, [updateScrollMetrics, virtualize]);

  const updateRowHoverOverlay = useCallback((row: HTMLTableRowElement | null) => {
    hoveredRowRef.current = row;
    const el = containerRef.current;
    if (!row || !el) {
      setRowHoverOverlay(null);
      return;
    }
    const rowRect = row.getBoundingClientRect();
    const containerRect = el.getBoundingClientRect();
    setRowHoverOverlay({
      left: el.scrollLeft,
      top: rowRect.top - containerRect.top + el.scrollTop,
      width: el.clientWidth,
      height: rowRect.height,
    });
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const el = containerRef.current;
      if (!el) return;

      const canScrollY = el.scrollHeight > el.clientHeight + 1;
      const canScrollX = el.scrollWidth > el.clientWidth + 1;
      const wantsY = e.deltaY !== 0;
      const wantsX = e.deltaX !== 0;

      const maxTop = Math.max(0, el.scrollHeight - el.clientHeight);
      const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth);
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop >= maxTop - 1;
      const atLeft = el.scrollLeft <= 0;
      const atRight = el.scrollLeft >= maxLeft - 1;

      const canMoveY =
        wantsY && canScrollY && ((e.deltaY < 0 && !atTop) || (e.deltaY > 0 && !atBottom));
      const canMoveX =
        wantsX && canScrollX && ((e.deltaX < 0 && !atLeft) || (e.deltaX > 0 && !atRight));

      if (canMoveY || canMoveX) {
        e.stopPropagation();
        return;
      }

      if (wantsY || wantsX) {
        if (allowWheelPropagationAtBoundary) return;
        if (e.cancelable) e.preventDefault();
        e.stopPropagation();
      }
    },
    [allowWheelPropagationAtBoundary],
  );

  useEffect(() => {
    if (naturalFlow) return;

    const el = containerRef.current;
    if (!el) return;

    el.addEventListener("wheel", handleWheel, { capture: true, passive: false });

    return () => {
      el.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [handleWheel, naturalFlow]);

  const dragRef = useRef<null | {
    axis: "x" | "y";
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startScrollTop: number;
    startScrollLeft: number;
    trackLength: number;
    thumbLength: number;
    contentLength: number;
    viewportLength: number;
  }>(null);

  const handleThumbPointerDown = useCallback(
    (axis: "x" | "y", e: ReactPointerEvent<HTMLDivElement>) => {
      const el = containerRef.current;
      if (!el) return;

      const pointerId = e.pointerId;
      safeSetPointerCapture(e.currentTarget, pointerId);

      if (axis === "y") {
        const headerH = headerHeightRef.current;
        const trackLength = Math.max(0, el.clientHeight - headerH - 16);
        const viewportLength = Math.max(0, el.clientHeight - headerH);
        const contentLength = Math.max(viewportLength, el.scrollHeight - headerH);
        const thumbLength = Math.max(
          28,
          Math.round((viewportLength / contentLength) * trackLength),
        );

        dragRef.current = {
          axis,
          pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startScrollTop: el.scrollTop,
          startScrollLeft: el.scrollLeft,
          trackLength,
          thumbLength,
          contentLength,
          viewportLength,
        };
      } else {
        const trackLength = Math.max(0, el.clientWidth - 16);
        const contentLength = el.scrollWidth;
        const viewportLength = el.clientWidth;
        const thumbLength = Math.max(
          28,
          Math.round((viewportLength / contentLength) * trackLength),
        );

        dragRef.current = {
          axis,
          pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          startScrollTop: el.scrollTop,
          startScrollLeft: el.scrollLeft,
          trackLength,
          thumbLength,
          contentLength,
          viewportLength,
        };
      }
    },
    [],
  );

  const handleThumbPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      const el = containerRef.current;
      if (!drag || !el) return;
      if (drag.pointerId !== e.pointerId) return;

      e.preventDefault();

      if (drag.axis === "y") {
        const scrollRange = Math.max(0, drag.contentLength - drag.viewportLength);
        const thumbRange = Math.max(1, drag.trackLength - drag.thumbLength);
        const dy = e.clientY - drag.startClientY;
        const next = drag.startScrollTop + (dy * scrollRange) / thumbRange;
        el.scrollTop = Math.max(0, Math.min(scrollRange, next));
      } else {
        const scrollRange = Math.max(0, drag.contentLength - drag.viewportLength);
        const thumbRange = Math.max(1, drag.trackLength - drag.thumbLength);
        const dx = e.clientX - drag.startClientX;
        const next = drag.startScrollLeft + (dx * scrollRange) / thumbRange;
        el.scrollLeft = Math.max(0, Math.min(scrollRange, next));
      }

      updateScrollMetrics();
    },
    [updateScrollMetrics],
  );

  const handleThumbPointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
  }, []);

  const columnResizeRef = useRef<ColumnResizeState | null>(null);

  const buildColumnResizePreview = useCallback(
    (
      active: ColumnResizeState,
      pointerClientX: number,
      pointerClientY: number,
    ): ColumnResizePreview | null => {
      const width = resolveColumnResizeWidth(active, pointerClientX);
      const headerRect = headerCellsRef.current[active.columnKey]?.getBoundingClientRect();
      const visualLeftClientX = headerRect?.left ?? active.startLeftClientX;
      const minBoundaryClientX = visualLeftClientX + active.minWidth;
      const maxBoundaryClientX = visualLeftClientX + active.maxWidth;
      const lineCenterClientX = Math.max(
        minBoundaryClientX,
        Math.min(maxBoundaryClientX, visualLeftClientX + width),
      );
      const visible =
        lineCenterClientX >= active.previewMinClientX &&
        lineCenterClientX <= active.previewMaxClientX;
      const top = active.previewTop;
      const bottomInset = hasHorizontalOverflow(scrollMetricsRef.current) ? 14 : 0;
      const bottom = Math.max(top, active.previewBottom - bottomInset);
      const height = Math.max(0, bottom - top);
      const tooltipTop = Math.max(
        top + 8,
        Math.min(top + Math.max(0, height - 32), pointerClientY + 10),
      );

      return {
        width,
        left: lineCenterClientX - COLUMN_RESIZE_PREVIEW_LINE_WIDTH / 2,
        top,
        height,
        tooltipTop,
        visible,
      };
    },
    [],
  );

  const applyColumnResizePreview = useCallback(
    (preview: ColumnResizePreview) => {
      const line = resizePreviewLineRef.current;
      if (line) {
        line.style.left = `${preview.left}px`;
        line.style.top = `${preview.top}px`;
        line.style.height = `${preview.height}px`;
        line.style.display = preview.visible ? "" : "none";
      }

      const tooltip = resizePreviewTooltipRef.current;
      if (tooltip) {
        tooltip.style.left = `${preview.left + 10}px`;
        tooltip.style.top = `${preview.tooltipTop}px`;
        tooltip.style.display = preview.visible ? "" : "none";
        tooltip.textContent = t("common.column_width_px", { width: preview.width });
      }
    },
    [t],
  );

  const applyColumnWidthToDom = useCallback((columnKey: string, width: number) => {
    const col = columnElementsRef.current[columnKey];
    if (!col) return;
    const widthPx = `${width}px`;
    col.style.width = widthPx;
    col.style.minWidth = widthPx;
    col.style.maxWidth = widthPx;
  }, []);

  const applyStickyLayoutToDom = useCallback(
    (widths: ColumnWidthMap) => {
      if (naturalFlow) return;

      const columns = orderedColumnsRef.current;
      const startWidth = resolveStickyRailWidth(columns, widths, "start");
      const endWidth = resolveStickyRailWidth(columns, widths, "end");
      stickyRailWidthsRef.current = { start: startWidth, end: endWidth };

      const root = rootRef.current;
      if (!root) return;

      const clientWidth = scrollMetricsRef.current.clientWidth;
      const startRail = root.querySelector<HTMLElement>("[data-vt-sticky-start-rail]");
      if (startRail) startRail.style.width = `${startWidth}px`;

      const endRail = root.querySelector<HTMLElement>("[data-vt-sticky-end-rail]");
      if (endRail) {
        endRail.style.left = `${Math.max(0, clientWidth - endWidth)}px`;
        endRail.style.width = `${endWidth}px`;
      }

      const startBoundary = root.querySelector<HTMLElement>("[data-vt-sticky-start-boundary]");
      if (startBoundary) {
        startBoundary.style.left = `${Math.max(0, startWidth)}px`;
        startBoundary.style.width = `${STICKY_EDGE_SHADOW_WIDTH}px`;
      }

      const endBoundary = root.querySelector<HTMLElement>("[data-vt-sticky-end-boundary]");
      if (endBoundary) {
        endBoundary.style.left = `${Math.max(
          0,
          clientWidth - endWidth - STICKY_EDGE_SHADOW_WIDTH,
        )}px`;
        endBoundary.style.width = `${STICKY_EDGE_SHADOW_WIDTH}px`;
      }
      syncStickyEdgeShadows(scrollMetricsRef.current);

      const placements = resolveStickyColumnPlacements(columns, widths);
      root.querySelectorAll<HTMLElement>("[data-vt-column-key]").forEach((element) => {
        const key = element.dataset.vtColumnKey;
        const placement = key ? placements[key] : undefined;
        if (!placement) return;

        if (placement.edge === "start") {
          element.style.setProperty("--vt-sticky-left", `${placement.offset}px`);
          element.style.removeProperty("--vt-sticky-right");
        } else {
          element.style.setProperty("--vt-sticky-right", `${placement.offset}px`);
          element.style.removeProperty("--vt-sticky-left");
        }
      });
    },
    [naturalFlow, syncStickyEdgeShadows],
  );

  const applyPendingColumnResize = useCallback(() => {
    columnResizeRafRef.current = null;
    const active = columnResizeRef.current;
    const pointer = pendingColumnResizePointerRef.current;
    if (!active || !pointer) return;

    pendingColumnResizePointerRef.current = null;

    const roundedWidth = resolveColumnResizeWidth(active, pointer.clientX);

    active.currentWidth = roundedWidth;
    const nextWidths = { ...columnWidthsRef.current, [active.columnKey]: roundedWidth };
    columnWidthsRef.current = nextWidths;
    applyColumnWidthToDom(active.columnKey, roundedWidth);
    applyStickyLayoutToDom(nextWidths);
    const preview = {
      ...(buildColumnResizePreview(active, pointer.clientX, pointer.clientY) ?? {
        width: roundedWidth,
        left: active.startLeftClientX + roundedWidth - COLUMN_RESIZE_PREVIEW_LINE_WIDTH / 2,
        top: active.previewTop,
        height: Math.max(0, active.previewBottom - active.previewTop),
        tooltipTop: active.previewTop,
        visible: true,
      }),
      width: roundedWidth,
    };
    applyColumnResizePreview(preview);
    scheduleScrollMetricsUpdate();
    if (active.debugEnabled) {
      const now = performance.now();
      if (now - active.lastDebugAtMs >= 125) {
        active.lastDebugAtMs = now;
        const headerCell = headerCellsRef.current[active.columnKey];
        const headerRect = headerCell?.getBoundingClientRect();
        logColumnResizeDebug("move", {
          tableId,
          columnKey: active.columnKey,
          pointerX: Math.round(pointer.clientX),
          previewCenterX: Math.round(preview.left + COLUMN_RESIZE_PREVIEW_LINE_WIDTH / 2),
          renderedHeaderRight: headerRect ? Math.round(headerRect.right) : null,
          renderedHeaderWidth: headerRect ? Math.round(headerRect.width) : null,
          width: roundedWidth,
          deltaPreviewToPointer: Math.round(
            preview.left + COLUMN_RESIZE_PREVIEW_LINE_WIDTH / 2 - pointer.clientX,
          ),
          deltaPreviewToRenderedHeader: headerRect
            ? Math.round(preview.left + COLUMN_RESIZE_PREVIEW_LINE_WIDTH / 2 - headerRect.right)
            : null,
        });
      }
    }
  }, [
    applyColumnResizePreview,
    applyColumnWidthToDom,
    applyStickyLayoutToDom,
    buildColumnResizePreview,
    scheduleScrollMetricsUpdate,
    tableId,
  ]);

  const scheduleColumnResizeFrame = useCallback(() => {
    if (columnResizeRafRef.current !== null) return;
    columnResizeRafRef.current = window.requestAnimationFrame(applyPendingColumnResize);
  }, [applyPendingColumnResize]);

  const flushPendingColumnResize = useCallback(() => {
    if (columnResizeRafRef.current !== null) {
      window.cancelAnimationFrame(columnResizeRafRef.current);
      columnResizeRafRef.current = null;
    }
    applyPendingColumnResize();
  }, [applyPendingColumnResize]);

  const finishColumnResize = useCallback(() => {
    const active = columnResizeRef.current;
    if (!active) return;

    flushPendingColumnResize();

    const nextWidths = {
      ...columnWidthsRef.current,
      [active.columnKey]: active.currentWidth,
    };
    columnWidthsRef.current = nextWidths;
    setColumnWidths(nextWidths);
    writeStoredColumnWidths(tableId, nextWidths);
    updateScrollMetrics();

    columnResizeRef.current = null;
    pendingColumnResizePointerRef.current = null;
    setResizePreview(null);
    setActiveResizeColumnKey(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.documentElement.style.cursor = "";
  }, [flushPendingColumnResize, tableId, updateScrollMetrics]);

  const handleColumnResizePointerDown = useCallback(
    (column: DataTableColumn<T>, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;

      const headerCell = headerCellsRef.current[column.key];
      if (!headerCell) return;

      const rect = headerCell.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      const railWidths = naturalFlow ? { start: 0, end: 0 } : stickyRailWidthsRef.current;
      const startWidth = rect.width;
      const minWidth = resolveColumnMinWidth(column);
      const maxWidth = resolveColumnMaxWidth(column, minWidth);
      const nextStartWidth = Math.max(minWidth, Math.min(maxWidth, startWidth));
      const startLeftClientX = rect.right - nextStartWidth;
      const startBoundaryClientX = startLeftClientX + nextStartWidth;

      e.preventDefault();
      e.stopPropagation();
      safeSetPointerCapture(e.currentTarget, e.pointerId);

      const resizeState = {
        pointerId: e.pointerId,
        columnKey: column.key,
        startLeftClientX,
        pointerBoundaryOffsetClientX: startBoundaryClientX - e.clientX,
        minWidth,
        maxWidth,
        previewTop: Math.max(0, containerRect?.top ?? rect.top),
        previewBottom: Math.max(0, containerRect?.bottom ?? rect.bottom),
        previewMinClientX:
          containerRect && !naturalFlow && railWidths.start > 0
            ? containerRect.left + railWidths.start
            : Number.NEGATIVE_INFINITY,
        previewMaxClientX:
          containerRect && !naturalFlow && railWidths.end > 0
            ? containerRect.right - railWidths.end
            : Number.POSITIVE_INFINITY,
        currentWidth: nextStartWidth,
        lastDebugAtMs: 0,
        debugEnabled: shouldDebugColumnResize(),
      };
      columnResizeRef.current = resizeState;
      document.body.style.cursor = "col-resize";
      document.documentElement.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setActiveResizeColumnKey(column.key);
      applyColumnWidthToDom(column.key, nextStartWidth);
      applyStickyLayoutToDom({ ...columnWidthsRef.current, [column.key]: nextStartWidth });
      pendingColumnResizePointerRef.current = null;
      const preview = buildColumnResizePreview(resizeState, e.clientX, e.clientY);
      setResizePreview(preview);
      if (resizeState.debugEnabled) {
        logColumnResizeDebug("start", {
          tableId,
          columnKey: column.key,
          pointerX: Math.round(e.clientX),
          headerLeft: Math.round(startLeftClientX),
          headerRight: Math.round(rect.right),
          headerWidth: Math.round(rect.width),
          previewCenterX: preview
            ? Math.round(preview.left + COLUMN_RESIZE_PREVIEW_LINE_WIDTH / 2)
            : null,
          width: preview?.width ?? nextStartWidth,
        });
      }
    },
    [applyColumnWidthToDom, applyStickyLayoutToDom, buildColumnResizePreview, naturalFlow, tableId],
  );

  // ---------------------------------------------------------------------------
  // Column Reorder Handlers
  // ---------------------------------------------------------------------------

  const collectColumnReorderGeometry = useCallback(
    (currentColumns: DataTableColumn<T>[]): ColumnReorderGeometry[] | null => {
      const container = containerRef.current;
      const table = tableRef.current;
      if (!container || !table) return null;

      const containerRect = container.getBoundingClientRect();
      const elementsByKey = new Map<string, HTMLElement[]>();
      table.querySelectorAll<HTMLElement>("[data-vt-column-key]").forEach((element) => {
        const key = element.dataset.vtColumnKey;
        if (!key) return;
        const bucket = elementsByKey.get(key);
        if (bucket) {
          bucket.push(element);
        } else {
          elementsByKey.set(key, [element]);
        }
      });

      const geometries = currentColumns.map((column, index) => {
        const headerCell = headerCellsRef.current[column.key];
        const rect = headerCell?.getBoundingClientRect();
        return {
          key: column.key,
          index,
          left: rect ? rect.left - containerRect.left + container.scrollLeft : 0,
          width: rect?.width ?? 0,
          elements: elementsByKey.get(column.key) ?? [],
          appliedDragging: false,
          appliedShift: null,
          appliedTransform: "",
        };
      });

      return geometries.some((geometry) => geometry.width > 0) ? geometries : null;
    },
    [],
  );

  const clearColumnReorderStyles = useCallback((active: ColumnReorderState | null) => {
    active?.columns.forEach((geometry) => {
      geometry.elements.forEach((element) => {
        element.style.transform = "";
        element.style.transition = "";
        element.style.willChange = "";
        element.style.position = "";
        element.style.zIndex = "";
        element.style.pointerEvents = "";
        element.style.opacity = "";
        element.style.filter = "";
        element.style.background = "";
        element.style.boxShadow = "";
        element.style.overflow = "";
        element.style.contain = "";
        element.style.isolation = "";
        element.style.borderRadius = "";
        element.removeAttribute("data-vt-column-dragging-cell");
        element.removeAttribute("data-vt-column-shifted-cell");
      });
    });
  }, []);

  const applyColumnReorderStyles = useCallback(
    (active: ColumnReorderState, dragOffsetX: number) => {
      active.columns.forEach((geometry) => {
        const isDragged = geometry.key === active.columnKey;
        const shift = isDragged ? dragOffsetX : (getColumnReorderShift(active, geometry) ?? 0);
        const transform = formatColumnReorderTransform(shift);
        const stableShift = isDragged ? null : shift;
        const wasShifted = !geometry.appliedDragging && (geometry.appliedShift ?? 0) !== 0;
        if (
          geometry.appliedDragging === isDragged &&
          geometry.appliedShift === stableShift &&
          geometry.appliedTransform === transform
        ) {
          return;
        }
        geometry.appliedDragging = isDragged;
        geometry.appliedShift = stableShift;
        geometry.appliedTransform = transform;

        geometry.elements.forEach((element) => {
          const isSettling = !isDragged && shift === 0 && wasShifted;
          const isMoved = isDragged || shift !== 0 || isSettling;
          element.style.transform = transform;
          element.style.transition = isDragged
            ? "none"
            : shift !== 0 || isSettling
              ? COLUMN_REORDER_SHIFT_TRANSITION
              : "";
          element.style.willChange = isMoved ? "transform" : "";
          element.style.position = isMoved ? "relative" : "";
          element.style.zIndex = isDragged ? "90" : shift || isSettling ? "45" : "";
          element.style.pointerEvents = isDragged ? "none" : "";
          element.style.opacity = "";
          element.style.filter = "";
          element.style.background = isMoved
            ? getColumnReorderCellBackground(element, isDragged)
            : "";
          element.style.overflow = isMoved ? "hidden" : "";
          element.style.contain = isMoved ? "paint" : "";
          element.style.isolation = isMoved ? "isolate" : "";
          element.style.borderRadius = isMoved ? "0" : "";
          element.style.boxShadow = isDragged
            ? "inset 2px 0 0 rgba(37, 99, 235, 0.42), inset -2px 0 0 rgba(14, 165, 233, 0.28), 0 10px 26px -22px rgba(15, 23, 42, 0.65)"
            : "";

          if (isDragged) {
            element.setAttribute("data-vt-column-dragging-cell", "true");
            element.removeAttribute("data-vt-column-shifted-cell");
          } else if (shift) {
            element.setAttribute("data-vt-column-shifted-cell", "true");
            element.removeAttribute("data-vt-column-dragging-cell");
          } else {
            element.removeAttribute("data-vt-column-dragging-cell");
            element.removeAttribute("data-vt-column-shifted-cell");
          }

          if (isSettling) {
            scheduleColumnReorderSettleCleanup(element);
          }
        });
      });
    },
    [],
  );

  const applyColumnReorderFrame = useCallback(() => {
    columnReorderRafRef.current = null;
    const active = columnReorderRef.current;
    const container = containerRef.current;
    if (!active || !active.activated || !container) return;

    const dragOffsetX = getColumnReorderDragOffset(
      active,
      active.lastClientX,
      container.scrollLeft,
    );
    active.currentToIndex = findColumnReorderTargetIndex(active, dragOffsetX);
    applyColumnReorderStyles(active, dragOffsetX);
  }, [applyColumnReorderStyles]);

  const scheduleColumnReorderFrame = useCallback(() => {
    if (columnReorderRafRef.current !== null) return;
    columnReorderRafRef.current = window.requestAnimationFrame(applyColumnReorderFrame);
  }, [applyColumnReorderFrame]);

  const stopColumnReorderAutoScroll = useCallback(() => {
    if (columnReorderAutoScrollRafRef.current !== null) {
      window.cancelAnimationFrame(columnReorderAutoScrollRafRef.current);
      columnReorderAutoScrollRafRef.current = null;
    }
  }, []);

  const runColumnReorderAutoScroll = useCallback(() => {
    columnReorderAutoScrollRafRef.current = null;
    const active = columnReorderRef.current;
    const container = containerRef.current;
    if (!active || !active.activated || !container || naturalFlow) return;

    const rect = container.getBoundingClientRect();
    const maxScrollLeft = Math.max(0, container.scrollWidth - container.clientWidth);
    if (maxScrollLeft <= 0) return;

    const dragOffsetX = getColumnReorderDragOffset(
      active,
      active.lastClientX,
      container.scrollLeft,
    );
    active.currentToIndex = findColumnReorderTargetIndex(active, dragOffsetX);
    const canMoveLeft = active.currentToIndex > active.allowedMinIndex;
    const canMoveRight = active.currentToIndex < active.allowedMaxIndex;

    const leftIntensity = Math.max(
      0,
      Math.min(
        1,
        (COLUMN_REORDER_AUTOSCROLL_EDGE_PX - (active.lastClientX - rect.left)) /
          COLUMN_REORDER_AUTOSCROLL_EDGE_PX,
      ),
    );
    const rightIntensity = Math.max(
      0,
      Math.min(
        1,
        (COLUMN_REORDER_AUTOSCROLL_EDGE_PX - (rect.right - active.lastClientX)) /
          COLUMN_REORDER_AUTOSCROLL_EDGE_PX,
      ),
    );
    const direction =
      canMoveLeft && leftIntensity > 0 && container.scrollLeft > 0
        ? -1
        : canMoveRight && rightIntensity > 0 && container.scrollLeft < maxScrollLeft
          ? 1
          : 0;

    if (direction === 0) return;

    const intensity = direction < 0 ? leftIntensity : rightIntensity;
    const delta =
      direction *
      Math.max(1, Math.round(COLUMN_REORDER_AUTOSCROLL_MAX_PX_PER_FRAME * intensity * intensity));
    const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, container.scrollLeft + delta));

    if (nextScrollLeft !== container.scrollLeft) {
      container.scrollLeft = nextScrollLeft;
      updateScrollMetrics();
      scheduleColumnReorderFrame();
    }

    columnReorderAutoScrollRafRef.current = window.requestAnimationFrame(
      runColumnReorderAutoScroll,
    );
  }, [naturalFlow, scheduleColumnReorderFrame, updateScrollMetrics]);

  const ensureColumnReorderAutoScroll = useCallback(() => {
    if (columnReorderAutoScrollRafRef.current !== null) return;
    columnReorderAutoScrollRafRef.current = window.requestAnimationFrame(
      runColumnReorderAutoScroll,
    );
  }, [runColumnReorderAutoScroll]);

  const clearColumnReorderSettleFeedback = useCallback(() => {
    if (columnReorderSettleTimeoutRef.current !== null) {
      window.clearTimeout(columnReorderSettleTimeoutRef.current);
      columnReorderSettleTimeoutRef.current = null;
    }
    setSettledReorderColumnKey(null);
  }, []);

  const startColumnReorderSettleFeedback = useCallback((columnKey: string) => {
    if (columnReorderSettleTimeoutRef.current !== null) {
      window.clearTimeout(columnReorderSettleTimeoutRef.current);
      columnReorderSettleTimeoutRef.current = null;
    }

    setSettledReorderColumnKey(columnKey);
    columnReorderSettleTimeoutRef.current = window.setTimeout(() => {
      columnReorderSettleTimeoutRef.current = null;
      setSettledReorderColumnKey((current) => (current === columnKey ? null : current));
    }, COLUMN_REORDER_SETTLE_FEEDBACK_MS);
  }, []);

  const activateColumnReorder = useCallback(
    (active: ColumnReorderState) => {
      if (active.activated) return active;
      if (active.activationTimer !== null) {
        window.clearTimeout(active.activationTimer);
      }
      active.activationTimer = null;
      active.activated = true;
      columnReorderRef.current = active;
      document.body.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
      document.documentElement.style.cursor = "grabbing";
      setActiveReorderColumnKey(active.columnKey);
      scheduleColumnReorderFrame();
      ensureColumnReorderAutoScroll();
      return active;
    },
    [ensureColumnReorderAutoScroll, scheduleColumnReorderFrame],
  );

  const ensureColumnReorderActivated = useCallback(
    (active: ColumnReorderState, event: PointerEvent) => {
      if (active.activated) return true;
      const movedEnough =
        Math.abs(event.clientX - active.startClientX) >= COLUMN_REORDER_MIN_DRAG_DISTANCE_PX ||
        Math.abs(event.clientY - active.startClientY) >= COLUMN_REORDER_MIN_DRAG_DISTANCE_PX;
      if (!movedEnough) return false;

      activateColumnReorder(active);
      return true;
    },
    [activateColumnReorder],
  );

  const cancelColumnReorder = useCallback(
    (event?: PointerEvent) => {
      const active = columnReorderRef.current;
      if (!active) return;
      if (event && active.pointerId !== event.pointerId) return;
      if (active.activationTimer !== null) {
        window.clearTimeout(active.activationTimer);
      }
      if (columnReorderRafRef.current !== null) {
        window.cancelAnimationFrame(columnReorderRafRef.current);
        columnReorderRafRef.current = null;
      }
      stopColumnReorderAutoScroll();
      clearColumnReorderStyles(active);
      columnReorderRef.current = null;
      setActiveReorderColumnKey(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.documentElement.style.cursor = "";
    },
    [clearColumnReorderStyles, stopColumnReorderAutoScroll],
  );

  const finishColumnReorder = useCallback(
    (event?: PointerEvent) => {
      const active = columnReorderRef.current;
      if (!active) return;
      if (event && active.pointerId !== event.pointerId) return;

      if (active.activationTimer !== null) {
        window.clearTimeout(active.activationTimer);
      }
      if (columnReorderRafRef.current !== null) {
        window.cancelAnimationFrame(columnReorderRafRef.current);
        columnReorderRafRef.current = null;
      }
      stopColumnReorderAutoScroll();

      const shouldCommit = active.activated;
      const toIndex = active.currentToIndex;
      clearColumnReorderStyles(active);
      columnReorderRef.current = null;
      setActiveReorderColumnKey(null);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.documentElement.style.cursor = "";

      if (!shouldCommit) return;

      const normalizedOrder = normalizeColumnOrder(columnsRef.current, columnOrderRef.current);
      const fromIndex = normalizedOrder.indexOf(active.columnKey);
      if (fromIndex < 0) return;

      const next = moveColumnKey(normalizedOrder, fromIndex, toIndex);
      const orderChanged =
        next.length !== normalizedOrder.length ||
        next.some((value, index) => value !== normalizedOrder[index]);
      if (orderChanged) {
        columnOrderRef.current = next;
        if (canPersistColumnOrder) {
          writeStoredColumnOrder(tableId, next);
        }
        setColumnOrder(next);
      }
      startColumnReorderSettleFeedback(active.columnKey);
      window.requestAnimationFrame(() => updateScrollMetrics());
    },
    [
      canPersistColumnOrder,
      clearColumnReorderStyles,
      startColumnReorderSettleFeedback,
      stopColumnReorderAutoScroll,
      tableId,
      updateScrollMetrics,
    ],
  );

  const handleColumnReorderPointerDown = useCallback(
    (column: DataTableColumn<T>, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      if (!canUseColumnOrder || !shouldAllowColumnReorder(column)) return;
      if (columnResizeRef.current) return;

      e.preventDefault();
      e.stopPropagation();
      safeSetPointerCapture(e.currentTarget, e.pointerId);
      clearColumnReorderSettleFeedback();

      const currentColumns = orderedColumnsRef.current;
      const columnIndex = currentColumns.indexOf(column);
      if (columnIndex < 0) return;
      const geometries = collectColumnReorderGeometry(currentColumns);
      const draggedGeometry = geometries?.[columnIndex];
      if (!geometries || !draggedGeometry || draggedGeometry.width <= 0) return;

      const movableKeys = normalizeColumnOrder(currentColumns, columnOrderRef.current);
      const startLocked = currentColumns.filter(
        (c) => resolveColumnOrderLock(c) === "start",
      ).length;
      const endLocked = currentColumns.filter((c) => resolveColumnOrderLock(c) === "end").length;
      const maxMovable = Math.max(0, movableKeys.length - endLocked);

      const state: ColumnReorderState = {
        pointerId: e.pointerId,
        columnKey: column.key,
        originIndex: columnIndex,
        currentToIndex: columnIndex,
        startClientX: e.clientX,
        startClientY: e.clientY,
        startScrollLeft: containerRef.current?.scrollLeft ?? 0,
        lastClientX: e.clientX,
        lastClientY: e.clientY,
        activated: false,
        activationTimer: window.setTimeout(() => {
          const active = columnReorderRef.current;
          if (!active || active.pointerId !== e.pointerId) return;
          activateColumnReorder(active);
        }, COLUMN_REORDER_ACTIVATION_DELAY_MS),
        allowedMinIndex: startLocked,
        allowedMaxIndex: maxMovable,
        columns: geometries,
        draggedWidth: draggedGeometry.width,
      };

      columnReorderRef.current = state;
    },
    [
      activateColumnReorder,
      canUseColumnOrder,
      clearColumnReorderSettleFeedback,
      collectColumnReorderGeometry,
    ],
  );

  useEffect(() => {
    if (!canUseColumnOrder) return;

    const handlePointerMove = (event: PointerEvent) => {
      const active = columnReorderRef.current;
      if (!active || active.pointerId !== event.pointerId) return;

      event.preventDefault();
      active.lastClientX = event.clientX;
      active.lastClientY = event.clientY;

      const activated = ensureColumnReorderActivated(active, event);
      if (!activated) return;

      scheduleColumnReorderFrame();
      ensureColumnReorderAutoScroll();
    };

    const handleWindowBlur = () => cancelColumnReorder();

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishColumnReorder);
    window.addEventListener("pointercancel", cancelColumnReorder);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishColumnReorder);
      window.removeEventListener("pointercancel", cancelColumnReorder);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [
    canUseColumnOrder,
    ensureColumnReorderActivated,
    scheduleColumnReorderFrame,
    ensureColumnReorderAutoScroll,
    finishColumnReorder,
    cancelColumnReorder,
  ]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const active = columnResizeRef.current;
      if (!active) return;
      if (active.pointerId !== event.pointerId) return;

      event.preventDefault();
      pendingColumnResizePointerRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
      };
      scheduleColumnResizeFrame();
    };

    const handlePointerUp = () => finishColumnResize();
    const handleWindowBlur = () => finishColumnResize();

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    window.addEventListener("blur", handleWindowBlur);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, [finishColumnResize, scheduleColumnResizeFrame]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.documentElement.style.cursor = "";
    };
  }, []);

  const measureHeaderHeight = useCallback(() => {
    const node = headerRef.current;
    if (!node) return 0;
    const next = Math.max(0, Math.ceil(node.getBoundingClientRect().height || 0));
    if (next !== headerHeightRef.current) {
      headerHeightRef.current = next;
      setHeaderHeight(next);
    }
    return next;
  }, []);

  // Track viewport/scroll metrics
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const headerH = measureHeaderHeight();
      setViewportHeight(Math.max(0, (el.clientHeight || 480) - headerH));
      updateScrollMetrics();
    };
    update();

    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);

    return () => {
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [measureHeaderHeight, updateScrollMetrics]);

  useLayoutEffect(() => {
    measureHeaderHeight();
    updateScrollMetrics();
  }, [columnWidths, measureHeaderHeight, minWidth, orderedColumns, updateScrollMetrics]);

  // Content size can change without the scroll container's box size changing (e.g. rows loaded after refresh).
  // ResizeObserver won't fire for scrollHeight/scrollWidth changes, so re-measure on data/structure changes.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      measureHeaderHeight();
      updateScrollMetrics();
    });
    return () => {
      window.cancelAnimationFrame(id);
    };
  }, [
    measureHeaderHeight,
    updateScrollMetrics,
    rows.length,
    colCount,
    loading,
    loadingMore,
    hasMore,
    showAllLoadedMessage,
    virtualize,
    rowHeight,
    minWidth,
    columnWidths,
    orderedColumns,
  ]);

  // Cleanup rAF
  useEffect(() => {
    return () => {
      if (bottomTimeoutRef.current) {
        window.clearTimeout(bottomTimeoutRef.current);
        bottomTimeoutRef.current = null;
      }
      if (rafRef.current) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      if (metricsRafRef.current) {
        window.cancelAnimationFrame(metricsRafRef.current);
        metricsRafRef.current = null;
      }
      if (columnResizeRafRef.current) {
        window.cancelAnimationFrame(columnResizeRafRef.current);
        columnResizeRafRef.current = null;
      }
      if (columnReorderRafRef.current) {
        window.cancelAnimationFrame(columnReorderRafRef.current);
        columnReorderRafRef.current = null;
      }
      if (columnReorderAutoScrollRafRef.current) {
        window.cancelAnimationFrame(columnReorderAutoScrollRafRef.current);
        columnReorderAutoScrollRafRef.current = null;
      }
      if (columnReorderSettleTimeoutRef.current) {
        window.clearTimeout(columnReorderSettleTimeoutRef.current);
        columnReorderSettleTimeoutRef.current = null;
      }
      if (rowReorderAutoScrollRafRef.current) {
        window.cancelAnimationFrame(rowReorderAutoScrollRafRef.current);
        rowReorderAutoScrollRafRef.current = null;
      }
      rowReorderRef.current = null;
      pendingColumnResizePointerRef.current = null;
    };
  }, []);

  // Virtual window calculation
  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = useMemo(() => {
    if (!virtualize) {
      return {
        startIndex: 0,
        endIndex: rows.length,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };
    }
    const total = rows.length;
    if (!total)
      return {
        startIndex: 0,
        endIndex: 0,
        topSpacerHeight: 0,
        bottomSpacerHeight: 0,
      };

    const visibleStart = Math.floor(scrollTop / rowHeight);
    const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
    const visibleEnd = visibleStart + visibleCount;

    const start = Math.max(0, visibleStart - overscan);
    const end = Math.min(total, visibleEnd + overscan);

    return {
      startIndex: start,
      endIndex: end,
      topSpacerHeight: start * rowHeight,
      bottomSpacerHeight: (total - end) * rowHeight,
    };
  }, [overscan, rowHeight, rows.length, scrollTop, viewportHeight, virtualize]);

  const visibleRows = useMemo(
    () => (virtualize ? rows.slice(startIndex, endIndex) : rows),
    [endIndex, rows, startIndex, virtualize],
  );

  const { vThumb, hThumb } = useMemo(() => {
    return calculateScrollbarThumbs(scrollMetrics, headerHeight);
  }, [headerHeight, scrollMetrics]);
  const stickyStartRailWidth = useMemo(
    () => resolveStickyRailWidth(orderedColumns, columnWidths, "start"),
    [columnWidths, orderedColumns],
  );
  const stickyEndRailWidth = useMemo(
    () => resolveStickyRailWidth(orderedColumns, columnWidths, "end"),
    [columnWidths, orderedColumns],
  );
  stickyRailWidthsRef.current = { start: stickyStartRailWidth, end: stickyEndRailWidth };
  const stickyColumnPlacements = useMemo(
    () => resolveStickyColumnPlacements(orderedColumns, columnWidths),
    [columnWidths, orderedColumns],
  );
  const stickyRailBottomInset = hThumb ? 14 : 0;
  const stickyRailTop = headerHeight;
  const stickyRailHeight = Math.max(
    0,
    scrollMetrics.clientHeight - headerHeight - stickyRailBottomInset,
  );
  const stickyBoundaryHeight = Math.max(0, scrollMetrics.clientHeight - stickyRailBottomInset);
  const stickyStartShadowOpacity = getStickyEdgeShadowOpacity(scrollMetrics, "start");
  const stickyEndShadowOpacity = getStickyEdgeShadowOpacity(scrollMetrics, "end");
  const stickyStartBoundaryLeft = Math.max(0, stickyStartRailWidth);
  const stickyEndBoundaryLeft = Math.max(
    0,
    scrollMetrics.clientWidth - stickyEndRailWidth - STICKY_EDGE_SHADOW_WIDTH,
  );
  const stickyEndRailLeft = Math.max(0, scrollMetrics.clientWidth - stickyEndRailWidth);

  const resolveColumnStyle = useCallback(
    (column: DataTableColumn<T>, area: "header" | "cell" = "cell"): DataTableColumnStyle => {
      const width = columnWidths[column.key];
      const placement = naturalFlow ? undefined : stickyColumnPlacements[column.key];
      const style: DataTableColumnStyle = {};

      if (width) {
        const clampedWidth = clampColumnWidth(column, width);
        style.width = clampedWidth;
        style.minWidth = clampedWidth;
        style.maxWidth = clampedWidth;
      }

      if (placement) {
        style.zIndex = area === "header" ? 70 : 30;
        if (placement.edge === "start") {
          style["--vt-sticky-left"] = `${placement.offset}px`;
        } else {
          style["--vt-sticky-right"] = `${placement.offset}px`;
        }
      }

      return style;
    },
    [columnWidths, naturalFlow, stickyColumnPlacements],
  );

  const resizePreviewOverlay =
    resizePreview && typeof document !== "undefined"
      ? createPortal(
          <>
            <div
              ref={resizePreviewLineRef}
              data-vt-column-resize-preview-line
              aria-hidden="true"
              className="pointer-events-none fixed z-[1000] w-0.5 bg-slate-500/70"
              style={{
                left: resizePreview.left,
                top: resizePreview.top,
                height: resizePreview.height,
                display: resizePreview.visible ? undefined : "none",
              }}
            />
            <div
              ref={resizePreviewTooltipRef}
              data-vt-column-resize-preview-tooltip
              role="status"
              className="pointer-events-none fixed z-[1001] rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-neutral-950"
              style={{
                left: resizePreview.left + 10,
                top: resizePreview.tooltipTop,
                display: resizePreview.visible ? undefined : "none",
              }}
            >
              {t("common.column_width_px", { width: resizePreview.width })}
            </div>
          </>,
          document.body,
        )
      : null;

  return (
    <div
      ref={rootRef}
      aria-busy={loading || loadingMore ? true : undefined}
      data-vt-natural-flow={naturalFlow ? true : undefined}
      className={
        naturalFlow
          ? `${height} ${minHeight} relative min-w-0 overflow-visible`
          : `${height} ${minHeight} group relative isolate grid min-w-0 overflow-hidden rounded-xl ${vThumb ? "grid-cols-[minmax(0,1fr)_0.75rem]" : "grid-cols-1"}`
      }
    >
      {naturalFlow ? null : (
        <div
          data-vt-header-chrome
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 top-0 z-40 ${
            vThumb ? "rounded-l-xl" : "rounded-xl"
          } bg-slate-100 dark:bg-neutral-800`}
          style={{
            width: scrollMetrics.clientWidth || "100%",
            height: headerHeight,
          }}
        />
      )}
      {!naturalFlow && stickyStartRailWidth > 0 && stickyRailHeight > 0 ? (
        <div
          data-vt-sticky-start-rail
          aria-hidden="true"
          className="pointer-events-none absolute z-0 hidden bg-white md:block dark:bg-neutral-950"
          style={{
            left: 0,
            top: stickyRailTop,
            width: stickyStartRailWidth,
            height: stickyRailHeight,
          }}
        />
      ) : null}
      {!naturalFlow && stickyEndRailWidth > 0 && stickyRailHeight > 0 ? (
        <div
          data-vt-sticky-end-rail
          aria-hidden="true"
          className="pointer-events-none absolute z-0 hidden bg-white md:block dark:bg-neutral-950"
          style={{
            left: stickyEndRailLeft,
            top: stickyRailTop,
            width: stickyEndRailWidth,
            height: stickyRailHeight,
          }}
        />
      ) : null}
      <div
        ref={containerRef}
        onScroll={naturalFlow ? undefined : onScroll}
        tabIndex={naturalFlow ? undefined : 0}
        data-scrollbar-visibility={naturalFlow ? undefined : "hover"}
        className={
          naturalFlow
            ? "relative z-10 min-h-0 overflow-visible rounded-xl"
            : `relative col-start-1 row-start-1 h-full min-h-0 table-scrollbar overflow-auto overscroll-x-none ${
                allowWheelPropagationAtBoundary ? "overscroll-y-auto" : "overscroll-y-none"
              }`
        }
      >
        <div
          data-vt-scroll-content
          className={`relative min-h-full ${scrollContentClassName ?? ""}`}
        >
          {!naturalFlow && rowHoverOverlay ? (
            <div
              data-vt-row-hover-overlay
              aria-hidden="true"
              className="pointer-events-none absolute z-0 rounded-lg bg-slate-50 dark:bg-white/[0.04]"
              style={{
                transform: `translate(${rowHoverOverlay.left}px, ${rowHoverOverlay.top}px)`,
                width: rowHoverOverlay.width,
                height: rowHoverOverlay.height,
              }}
            />
          ) : null}
          <table
            ref={tableRef}
            className={`relative w-full ${minWidth} table-fixed border-separate border-spacing-0 text-sm`}
          >
            <caption className="sr-only">{caption}</caption>
            <colgroup>
              {orderedColumns.map((col) => (
                <col
                  key={col.key}
                  ref={(node) => {
                    columnElementsRef.current[col.key] = node;
                  }}
                  style={resolveColumnStyle(col)}
                />
              ))}
            </colgroup>

            {/* ── HeroUI-styled header ── */}
            <thead
              ref={headerRef}
              className={naturalFlow ? "bg-slate-100 dark:bg-neutral-800" : "sticky top-0 z-50"}
            >
              <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
                {orderedColumns.map((col, colIndex) => {
                  const isRowReorderColumn = col.key === ROW_REORDER_COLUMN_KEY;
                  const canResize = shouldAllowColumnResize(col, colIndex, orderedColumns);
                  const canReorder = canUseColumnOrder && shouldAllowColumnReorder(col);
                  const canSort = Boolean(col.sort && onRowsChange);
                  const sortDirection =
                    activeSortState?.columnKey === col.key ? activeSortState.direction : null;
                  const isResizingThisColumn = activeResizeColumnKey === col.key;
                  const isSettledReorderColumn = settledReorderColumnKey === col.key;
                  const stickyPlacement = naturalFlow ? undefined : stickyColumnPlacements[col.key];
                  const headerChromeClass = naturalFlow ? "bg-slate-100 dark:bg-neutral-800" : "";
                  const headerCornerClass = [
                    naturalFlow && colIndex === 0 ? "rounded-l-xl" : "",
                    naturalFlow && colIndex === orderedColumns.length - 1 ? "rounded-r-xl" : "",
                    !naturalFlow && colIndex === 0 ? "rounded-l-xl" : "",
                    !naturalFlow && !vThumb && colIndex === orderedColumns.length - 1
                      ? "rounded-r-xl"
                      : "",
                  ]
                    .filter(Boolean)
                    .join(" ");
                  return (
                    <th
                      key={col.key}
                      aria-label={col.label}
                      data-vt-column-key={col.key}
                      data-vt-column-settled-cell={isSettledReorderColumn ? true : undefined}
                      ref={(node) => {
                        headerCellsRef.current[col.key] = node;
                      }}
                      style={resolveColumnStyle(col, "header")}
                      className={`group/column relative overflow-hidden px-4 py-3 whitespace-nowrap ${
                        stickyPlacement?.edge === "start" ? "md:left-[var(--vt-sticky-left)]" : ""
                      } ${
                        stickyPlacement?.edge === "end" ? "md:right-[var(--vt-sticky-right)]" : ""
                      } ${headerChromeClass} ${headerCornerClass} ${col.width ?? ""} ${col.headerClassName ?? ""} ${
                        activeReorderColumnKey === col.key
                          ? "cursor-grabbing bg-slate-100 text-slate-700 shadow-[inset_2px_0_0_rgba(37,99,235,0.42),inset_-2px_0_0_rgba(14,165,233,0.28)] dark:bg-neutral-800 dark:text-white/80"
                          : ""
                      }`}
                    >
                      {canReorder ? (
                        <button
                          type="button"
                          data-vt-column-reorder-handle
                          className={`absolute left-1 top-1/2 z-10 -translate-y-1/2 inline-flex h-5 w-5 items-center justify-center rounded-md cursor-grab touch-none text-slate-400/55 opacity-0 transition-opacity hover:bg-slate-200/60 hover:text-slate-600 focus-visible:opacity-100 active:cursor-grabbing dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white/65 ${
                            activeResizeColumnKey !== null
                              ? "pointer-events-none"
                              : activeReorderColumnKey === col.key
                                ? "pointer-events-none"
                                : "group-hover/column:opacity-100"
                          }`}
                          onPointerDown={(event) => handleColumnReorderPointerDown(col, event)}
                        >
                          <GripVertical size={13} aria-hidden="true" />
                          <span className="sr-only">
                            {t("common.reorder_column", { column: col.label })}
                          </span>
                        </button>
                      ) : null}
                      <div
                        data-vt-column-header-content
                        className={`min-w-0 max-w-full overflow-hidden ${
                          canReorder
                            ? "group-hover/column:pl-5 group-hover/column:transition-[padding] group-focus-within/column:pl-5 data-[vt-reorder-active=true]:pl-5"
                            : ""
                        }`}
                        data-vt-reorder-active={
                          activeReorderColumnKey === col.key ? "true" : undefined
                        }
                      >
                        {isRowReorderColumn ? (
                          <span className="flex items-center justify-center text-slate-400/70 dark:text-white/35">
                            <GripVertical size={14} aria-hidden="true" />
                            <span className="sr-only">{col.label}</span>
                          </span>
                        ) : (
                          <span className="flex min-w-0 items-center gap-1.5">
                            <span className="min-w-0 truncate">
                              {col.headerRender ? col.headerRender() : col.label}
                            </span>
                            {canSort ? (
                              <DropdownMenu.Root size="sm">
                                <DropdownMenu.Trigger asChild>
                                  <button
                                    type="button"
                                    data-vt-sort-trigger={col.key}
                                    data-vt-sort-direction={sortDirection ?? "none"}
                                    aria-label={t("common.sort_column", { column: col.label })}
                                    title={t("common.sort_column", { column: col.label })}
                                    className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md outline-none transition-colors hover:bg-slate-200/75 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:hover:bg-white/10 dark:focus-visible:ring-white/15 ${
                                      sortDirection
                                        ? "text-slate-900 dark:text-white"
                                        : "text-slate-400 dark:text-white/35"
                                    }`}
                                    onPointerDown={(event) => event.stopPropagation()}
                                  >
                                    {sortDirection === "asc" ? (
                                      <ArrowUp size={14} aria-hidden="true" />
                                    ) : sortDirection === "desc" ? (
                                      <ArrowDown size={14} aria-hidden="true" />
                                    ) : (
                                      <ArrowUpDown size={14} aria-hidden="true" />
                                    )}
                                  </button>
                                </DropdownMenu.Trigger>
                                <DropdownMenu.Portal>
                                  <DropdownMenu.Content align="start">
                                    <DropdownMenu.Item
                                      onSelect={() => handleColumnSort(col, "asc")}
                                    >
                                      <ArrowUp size={13} aria-hidden="true" />
                                      <span>{t("common.sort_ascending")}</span>
                                      {sortDirection === "asc" ? (
                                        <Check className="ml-auto" size={13} aria-hidden="true" />
                                      ) : null}
                                    </DropdownMenu.Item>
                                    <DropdownMenu.Item
                                      onSelect={() => handleColumnSort(col, "desc")}
                                    >
                                      <ArrowDown size={13} aria-hidden="true" />
                                      <span>{t("common.sort_descending")}</span>
                                      {sortDirection === "desc" ? (
                                        <Check className="ml-auto" size={13} aria-hidden="true" />
                                      ) : null}
                                    </DropdownMenu.Item>
                                  </DropdownMenu.Content>
                                </DropdownMenu.Portal>
                              </DropdownMenu.Root>
                            ) : null}
                          </span>
                        )}
                      </div>
                      {canResize ? (
                        <button
                          type="button"
                          data-vt-column-resizer
                          aria-label={t("common.resize_column", { column: col.label })}
                          title={t("common.resize_column", { column: col.label })}
                          className="group/resize absolute -right-2 top-0 z-30 h-full w-4 cursor-col-resize touch-none bg-transparent outline-none"
                          style={{ cursor: "col-resize" }}
                          onPointerDown={(event) => handleColumnResizePointerDown(col, event)}
                        >
                          <span
                            aria-hidden="true"
                            className={`mx-auto block h-6 w-px rounded-full bg-slate-300/80 transition-[width,background-color,opacity] dark:bg-white/25 ${
                              isResizingThisColumn
                                ? "opacity-0"
                                : "opacity-70 group-hover/resize:w-0.5 group-hover/resize:bg-slate-500 group-hover/resize:opacity-100 group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-slate-500 group-focus-visible/resize:opacity-100 dark:group-hover/resize:bg-white/55 dark:group-focus-visible/resize:bg-white/55"
                            }`}
                          />
                        </button>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody className="relative z-0 text-slate-900 dark:text-white">
              {loading && rows.length === 0 ? (
                <>
                  <tr>
                    <td colSpan={colCount} className="p-0">
                      <span role="status" className="sr-only">
                        {t("common.loading")}
                      </span>
                    </td>
                  </tr>
                  {Array.from({ length: 5 }, (_, rowIndex) => (
                    <tr key={`loading-${rowIndex}`} aria-hidden="true">
                      {orderedColumns.map((col, colIndex) => (
                        <td
                          key={col.key}
                          data-vt-column-key={col.key}
                          className={`overflow-hidden px-4 py-3 align-middle ${col.cellClassName ?? ""}`}
                        >
                          <div
                            className={[
                              "h-3 animate-pulse rounded-full bg-slate-200 dark:bg-white/10",
                              colIndex === 0 ? "w-2/3" : "w-4/5",
                            ].join(" ")}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </>
              ) : !loading && rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={colCount}
                    className="px-4 py-12 text-center text-sm text-slate-600 dark:text-white/70"
                  >
                    {emptyText}
                  </td>
                </tr>
              ) : (
                <>
                  {virtualize ? (
                    <tr aria-hidden="true">
                      <td colSpan={colCount} height={topSpacerHeight} className="p-0" />
                    </tr>
                  ) : null}
                  {visibleRows.map((row, localIdx) => {
                    const globalIdx = virtualize ? startIndex + localIdx : localIdx;
                    const key = rowKey(row, globalIdx);
                    const extraCls =
                      typeof rowClassName === "function"
                        ? rowClassName(row, globalIdx)
                        : (rowClassName ?? "");
                    const rowSelected = rowAriaSelected?.(row, globalIdx);
                    const rowInteractive = Boolean(onRowClick);
                    const isActiveRowReorder = activeRowReorderIndex === globalIdx;
                    const showDropBefore = rowReorderInsertionIndex === globalIdx;
                    const showDropAfter =
                      rowReorderInsertionIndex === rows.length && globalIdx === rows.length - 1;
                    return (
                      <tr
                        key={key}
                        data-vt-row-index={globalIdx}
                        data-vt-row-key={key}
                        data-vt-row-reorder-active={isActiveRowReorder ? true : undefined}
                        tabIndex={rowInteractive ? 0 : undefined}
                        aria-selected={rowSelected}
                        className={`group/row relative z-0 text-sm transition-[opacity,background-color] ${
                          rowInteractive ? "cursor-pointer outline-none" : ""
                        } ${naturalFlow ? "hover:bg-slate-50 dark:hover:bg-white/[0.04]" : ""} ${
                          isActiveRowReorder
                            ? "z-20 bg-slate-100/90 opacity-75 dark:bg-white/10"
                            : ""
                        } ${extraCls}`}
                        style={virtualize ? { height: rowHeight } : undefined}
                        onClick={
                          rowInteractive
                            ? () => {
                                onRowClick?.(row, globalIdx);
                              }
                            : undefined
                        }
                        onKeyDown={
                          rowInteractive
                            ? (event) => {
                                if (event.key !== "Enter" && event.key !== " ") return;
                                event.preventDefault();
                                onRowClick?.(row, globalIdx);
                              }
                            : undefined
                        }
                        onMouseEnter={
                          naturalFlow
                            ? undefined
                            : (event) => updateRowHoverOverlay(event.currentTarget)
                        }
                        onMouseLeave={naturalFlow ? undefined : () => updateRowHoverOverlay(null)}
                      >
                        {orderedColumns.map((col, colIdx) => {
                          const isFirst = colIdx === 0;
                          const isLast = colIdx === orderedColumns.length - 1;
                          const isRowReorderColumn = col.key === ROW_REORDER_COLUMN_KEY;
                          const isSettledReorderColumn = settledReorderColumnKey === col.key;
                          const stickyPlacement = naturalFlow
                            ? undefined
                            : stickyColumnPlacements[col.key];
                          const content = col.render(row, globalIdx);
                          const overflowTooltip = resolveCellOverflowTooltip(col, row, globalIdx);
                          const roundCls = [
                            isFirst ? "first:rounded-l-lg" : "",
                            isLast ? "last:rounded-r-lg" : "",
                          ]
                            .filter(Boolean)
                            .join(" ");
                          const hoverChromeClass = naturalFlow
                            ? ""
                            : stickyPlacement
                              ? "group-hover/row:bg-slate-50 dark:group-hover/row:bg-neutral-900"
                              : "group-hover/row:bg-slate-50 dark:group-hover/row:bg-white/[0.04]";
                          const dropIndicatorClass = showDropBefore
                            ? "border-t-2 border-t-blue-500"
                            : showDropAfter
                              ? "border-b-2 border-b-blue-500"
                              : "";
                          return (
                            <td
                              key={col.key}
                              data-vt-column-key={col.key}
                              data-vt-column-settled-cell={
                                isSettledReorderColumn ? true : undefined
                              }
                              style={resolveColumnStyle(col, "cell")}
                              className={`overflow-hidden align-middle ${
                                isRowReorderColumn ? "px-1 py-2.5 text-center" : "px-4 py-2.5"
                              } ${
                                stickyPlacement?.edge === "start"
                                  ? "md:left-[var(--vt-sticky-left)]"
                                  : ""
                              } ${
                                stickyPlacement?.edge === "end"
                                  ? "md:right-[var(--vt-sticky-right)]"
                                  : ""
                              } ${
                                hoverChromeClass
                              } ${dropIndicatorClass} ${col.cellClassName ?? ""} ${roundCls}`}
                            >
                              {isRowReorderColumn ? (
                                <button
                                  type="button"
                                  data-vt-row-reorder-handle
                                  aria-label={t("common.reorder_row", { index: globalIdx + 1 })}
                                  title={t("common.reorder_row", { index: globalIdx + 1 })}
                                  disabled={!onRowsChange || rows.length < 2 || loading}
                                  className={`inline-flex h-7 w-7 touch-none items-center justify-center rounded-lg text-slate-400 outline-none transition-colors hover:bg-slate-200/80 hover:text-slate-700 focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-default disabled:opacity-35 dark:text-white/35 dark:hover:bg-white/10 dark:hover:text-white/75 dark:focus-visible:ring-white/15 ${
                                    isActiveRowReorder
                                      ? "cursor-grabbing bg-slate-200 text-slate-800 dark:bg-white/15 dark:text-white"
                                      : "cursor-grab"
                                  }`}
                                  onPointerDown={(event) =>
                                    handleRowReorderPointerDown(globalIdx, event)
                                  }
                                  onKeyDown={(event) => handleRowReorderKeyDown(globalIdx, event)}
                                >
                                  <GripVertical size={15} aria-hidden="true" />
                                </button>
                              ) : (
                                <div
                                  data-vt-cell-content-clip
                                  className="min-w-0 max-w-full overflow-hidden"
                                >
                                  <TableCellOverflowTooltip
                                    tooltipContent={overflowTooltip}
                                    className={col.cellClassName}
                                  >
                                    {content}
                                  </TableCellOverflowTooltip>
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                  {virtualize ? (
                    <tr aria-hidden="true">
                      <td colSpan={colCount} height={bottomSpacerHeight} className="p-0" />
                    </tr>
                  ) : null}
                </>
              )}
            </tbody>
          </table>

          {/* Infinite scroll loading indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <div className="inline-flex items-center gap-2 text-sm text-slate-500 dark:text-white/55">
                <span
                  className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/80"
                  aria-hidden="true"
                />
                {t("common.loading_more")}
              </div>
            </div>
          )}

          {/* All data loaded */}
          {showAllLoadedMessage && !hasMore && rows.length > 0 && !loading && (
            <div className="py-3 text-center text-xs text-slate-400 dark:text-white/30">
              {t("common.all_records_loaded", { count: rows.length })}
            </div>
          )}
        </div>
      </div>

      {!naturalFlow && stickyStartRailWidth > 0 && stickyBoundaryHeight > 0 ? (
        <div
          data-vt-sticky-start-boundary
          aria-hidden="true"
          className="pointer-events-none absolute top-0 z-[75] hidden bg-gradient-to-r from-slate-950/[0.07] to-transparent transition-opacity duration-150 md:block dark:from-black/35"
          style={{
            left: stickyStartBoundaryLeft,
            width: STICKY_EDGE_SHADOW_WIDTH,
            height: stickyBoundaryHeight,
            opacity: stickyStartShadowOpacity,
          }}
        />
      ) : null}
      {!naturalFlow && stickyEndRailWidth > 0 && stickyBoundaryHeight > 0 ? (
        <div
          data-vt-sticky-end-boundary
          aria-hidden="true"
          className="pointer-events-none absolute top-0 z-[75] hidden bg-gradient-to-l from-slate-950/[0.07] to-transparent transition-opacity duration-150 md:block dark:from-black/35"
          style={{
            left: stickyEndBoundaryLeft,
            width: STICKY_EDGE_SHADOW_WIDTH,
            height: stickyBoundaryHeight,
            opacity: stickyEndShadowOpacity,
          }}
        />
      ) : null}

      {!naturalFlow && vThumb ? (
        <div
          data-vt-scrollbar-gutter
          className="relative z-30 col-start-2 row-start-1 h-full w-3 justify-self-end"
        >
          <div
            data-vt-header-gutter
            className="absolute inset-x-0 top-0 rounded-r-xl bg-slate-100 dark:bg-neutral-800"
            style={{ height: headerHeight }}
          />
          <div
            data-vt-scrollbar="y"
            className="group/scrollbar pointer-events-auto absolute right-0 z-30 w-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
            style={{ top: headerHeight + 8, bottom: 8 }}
          >
            <div
              ref={verticalThumbRef}
              role="presentation"
              className="pointer-events-auto absolute right-0 w-1.5 cursor-pointer rounded-full bg-[#C7C7C7] transition-[width] duration-150 ease-out hover:w-2 active:w-2 group-hover/scrollbar:w-2"
              style={{ top: vThumb.top, height: vThumb.height }}
              onPointerDown={(e) => handleThumbPointerDown("y", e)}
              onPointerMove={handleThumbPointerMove}
              onPointerUp={handleThumbPointerUp}
              onPointerCancel={handleThumbPointerUp}
            />
          </div>
        </div>
      ) : null}

      {!naturalFlow && hThumb ? (
        <div
          data-vt-scrollbar="x"
          className={`group/scrollbar pointer-events-auto absolute bottom-1 left-2 ${vThumb ? "right-5" : "right-2"} z-30 h-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100`}
        >
          <div
            ref={horizontalThumbRef}
            role="presentation"
            className="pointer-events-auto absolute bottom-0 h-1.5 cursor-pointer rounded-full bg-[#C7C7C7] transition-[height] duration-150 ease-out hover:h-2 active:h-2 group-hover/scrollbar:h-2"
            style={{ left: hThumb.left, width: hThumb.width }}
            onPointerDown={(e) => handleThumbPointerDown("x", e)}
            onPointerMove={handleThumbPointerMove}
            onPointerUp={handleThumbPointerUp}
            onPointerCancel={handleThumbPointerUp}
          />
        </div>
      ) : null}

      {resizePreviewOverlay}
    </div>
  );
}
