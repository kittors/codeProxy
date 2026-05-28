import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useTranslation } from "react-i18next";
import { TableCellOverflowTooltip } from "@/modules/ui/TableCellOverflowTooltip";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Column definition for DataTable */
export interface DataTableColumn<T> {
  /** Unique key for this column */
  key: string;
  /** Header label */
  label: string;
  /** Fixed width class (Tailwind), e.g. "w-52" */
  width?: string;
  /** Whether users can drag this column's right edge to resize it. */
  resizable?: boolean;
  /** Minimum drag-resize width in px. */
  minWidthPx?: number;
  /** Maximum drag-resize width in px. */
  maxWidthPx?: number;
  /** Extra header class (e.g. "text-right") */
  headerClassName?: string;
  /** Extra cell class */
  cellClassName?: string;
  /** Overflow tooltip text for a truncated cell. Primitive render output is used by default. */
  overflowTooltip?: boolean | ((row: T, index: number) => string | null | undefined);
  /** Custom header render function (overrides label) */
  headerRender?: () => ReactNode;
  /** Render function for cell content */
  render: (row: T, index: number) => ReactNode;
}

export interface DataTableProps<T> {
  /** Stable id used to keep each table's column widths isolated in localStorage. */
  tableId?: string;
  /** Row data array */
  rows: readonly T[];
  /** Column definitions */
  columns: DataTableColumn<T>[];
  /** Unique key extractor for each row */
  rowKey: (row: T, index: number) => string;
  /** Whether the initial data is loading */
  loading?: boolean;
  /** Whether more data is available for infinite scroll */
  hasMore?: boolean;
  /** Whether a next-page load is in progress */
  loadingMore?: boolean;
  /** Callback when scrolled near bottom (triggers next page load) */
  onScrollBottom?: () => void;
  /** Legacy row windowing mode. Most management tables keep this disabled for finite row sets. */
  virtualize?: boolean;
  /** Row height in px (default 44) */
  rowHeight?: number;
  /** Overscan rows above/below viewport (default 12) */
  overscan?: number;
  /** Distance from bottom to trigger onScrollBottom (default 100) */
  scrollThreshold?: number;
  /** Debounce ms before triggering onScrollBottom (default 120) */
  bottomDebounceMs?: number;
  /** Minimum table width class (default "min-w-[1320px]") */
  minWidth?: string;
  /** Container height class (default "h-[calc(100dvh-260px)]") */
  height?: string;
  /** Container minimum height class (default "min-h-[360px]") */
  minHeight?: string;
  /** Screen-reader caption */
  caption?: string;
  /** Empty state message */
  emptyText?: string;
  /** Show the "all records loaded" footer when there is no next page. */
  showAllLoadedMessage?: boolean;
  /** Extra row className */
  rowClassName?: string | ((row: T, index: number) => string);
  /** Let parent scroll containers handle wheel events when this table is already at an edge. */
  allowWheelPropagationAtBoundary?: boolean;
  /** Render the table in normal document flow without any internal table scrollbars. */
  naturalFlow?: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_ROW_HEIGHT = 44;
const DEFAULT_OVERSCAN = 12;
const DEFAULT_SCROLL_THRESHOLD = 100;
const DEFAULT_BOTTOM_DEBOUNCE_MS = 120;
const COLUMN_WIDTH_STORAGE_PREFIX = "codeProxy.dataTable.columnWidths.v1";
const DEFAULT_MIN_COLUMN_WIDTH = 72;
const DEFAULT_MAX_COLUMN_WIDTH = 640;
const NON_RESIZABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);

type ColumnWidthMap = Record<string, number>;

interface ColumnResizeState {
  pointerId: number;
  columnKey: string;
  startClientX: number;
  startEdgeClientX: number;
  startWidth: number;
  minWidth: number;
  maxWidth: number;
}

interface ColumnResizePreview {
  width: number;
  left: number;
  top: number;
  height: number;
  tooltipTop: number;
}

function clampColumnWidth<T>(column: DataTableColumn<T>, width: number) {
  const minWidth = column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH;
  const maxWidth = column.maxWidthPx ?? DEFAULT_MAX_COLUMN_WIDTH;
  return Math.max(minWidth, Math.min(maxWidth, Math.round(width)));
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DataTable<T>({
  tableId,
  rows,
  columns,
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
  allowWheelPropagationAtBoundary = false,
  naturalFlow = false,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLTableSectionElement | null>(null);
  const headerCellsRef = useRef<Record<string, HTMLTableCellElement | null>>({});
  const headerHeightRef = useRef(0);
  const [columnWidths, setColumnWidths] = useState<ColumnWidthMap>(() =>
    readStoredColumnWidths(tableId),
  );
  const columnWidthsRef = useRef<ColumnWidthMap>(columnWidths);
  const [resizePreview, setResizePreview] = useState<ColumnResizePreview | null>(null);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
  const [scrollMetrics, setScrollMetrics] = useState(() => ({
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 0,
    scrollWidth: 0,
    clientHeight: 0,
    clientWidth: 0,
  }));
  const rafRef = useRef<number | null>(null);
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

  const colCount = columns.length;

  useEffect(() => {
    setColumnWidths(readStoredColumnWidths(tableId));
  }, [tableId]);

  useEffect(() => {
    columnWidthsRef.current = columnWidths;
  }, [columnWidths]);

  useEffect(() => {
    const validKeys = new Set(columns.map((column) => column.key));
    setColumnWidths((prev) => {
      let changed = false;
      const next: ColumnWidthMap = {};
      columns.forEach((column) => {
        const width = prev[column.key];
        if (width !== undefined) next[column.key] = clampColumnWidth(column, width);
      });
      Object.keys(prev).forEach((key) => {
        if (!validKeys.has(key)) changed = true;
      });
      columns.forEach((column) => {
        if (next[column.key] !== prev[column.key]) changed = true;
      });
      return changed ? next : prev;
    });
  }, [columns]);

  const updateScrollMetrics = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const next = {
      scrollTop: el.scrollTop,
      scrollLeft: el.scrollLeft,
      scrollHeight: el.scrollHeight,
      scrollWidth: el.scrollWidth,
      clientHeight: el.clientHeight,
      clientWidth: el.clientWidth,
    };

    setScrollMetrics((prev) => {
      if (
        prev.scrollTop === next.scrollTop &&
        prev.scrollLeft === next.scrollLeft &&
        prev.scrollHeight === next.scrollHeight &&
        prev.scrollWidth === next.scrollWidth &&
        prev.clientHeight === next.clientHeight &&
        prev.clientWidth === next.clientWidth
      ) {
        return prev;
      }
      return next;
    });
  }, []);

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
        setScrollTop(next);
      });
    }
  }, [updateScrollMetrics]);

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
      width: number,
      pointerClientY: number,
    ): ColumnResizePreview | null => {
      const rootRect = rootRef.current?.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!rootRect || !containerRect) return null;

      const scroller = containerRef.current;
      const hasHorizontalOverflow = scroller
        ? scroller.scrollWidth > scroller.clientWidth + 1
        : false;
      const edgeClientX = active.startEdgeClientX + width - active.startWidth;
      const top = Math.max(0, containerRect.top - rootRect.top);
      const bottomInset = hasHorizontalOverflow ? 14 : 0;
      const bottom = Math.min(rootRect.height, containerRect.bottom - rootRect.top - bottomInset);
      const height = Math.max(0, bottom - top);
      const tooltipTop = Math.max(
        top + 8,
        Math.min(top + Math.max(0, height - 32), pointerClientY - rootRect.top + 10),
      );

      return {
        width,
        left: edgeClientX - rootRect.left,
        top,
        height,
        tooltipTop,
      };
    },
    [],
  );

  const finishColumnResize = useCallback(() => {
    const active = columnResizeRef.current;
    if (!active) return;

    columnResizeRef.current = null;
    setResizePreview(null);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    document.documentElement.style.cursor = "";
    const latestWidths = columnWidthsRef.current;
    writeStoredColumnWidths(tableId, {
      ...latestWidths,
      [active.columnKey]: latestWidths[active.columnKey] ?? active.startWidth,
    });
  }, [tableId]);

  const handleColumnResizePointerDown = useCallback(
    (column: DataTableColumn<T>, e: ReactPointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;

      const headerCell = headerCellsRef.current[column.key];
      if (!headerCell) return;

      const rect = headerCell.getBoundingClientRect();
      const startWidth = columnWidths[column.key] ?? rect.width;
      const minWidth = column.minWidthPx ?? DEFAULT_MIN_COLUMN_WIDTH;
      const maxWidth = column.maxWidthPx ?? DEFAULT_MAX_COLUMN_WIDTH;
      const nextStartWidth = Math.max(minWidth, Math.min(maxWidth, startWidth));

      e.preventDefault();
      e.stopPropagation();
      safeSetPointerCapture(e.currentTarget, e.pointerId);

      const resizeState = {
        pointerId: e.pointerId,
        columnKey: column.key,
        startClientX: e.clientX,
        startEdgeClientX: rect.right,
        startWidth: nextStartWidth,
        minWidth,
        maxWidth,
      };
      columnResizeRef.current = resizeState;
      document.body.style.cursor = "col-resize";
      document.documentElement.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setColumnWidths((prev) => ({ ...prev, [column.key]: nextStartWidth }));
      setResizePreview(buildColumnResizePreview(resizeState, nextStartWidth, e.clientY));
    },
    [buildColumnResizePreview, columnWidths],
  );

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      const active = columnResizeRef.current;
      if (!active) return;

      event.preventDefault();
      const nextWidth = Math.max(
        active.minWidth,
        Math.min(active.maxWidth, active.startWidth + event.clientX - active.startClientX),
      );
      const roundedWidth = Math.round(nextWidth);

      columnWidthsRef.current = { ...columnWidthsRef.current, [active.columnKey]: roundedWidth };
      setColumnWidths((prev) => ({ ...prev, [active.columnKey]: roundedWidth }));
      setResizePreview(buildColumnResizePreview(active, roundedWidth, event.clientY));
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
  }, [buildColumnResizePreview, finishColumnResize]);

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
    const trackInset = 8; // matches `inset-y-2` / `inset-x-2` (8px)
    const effectiveViewportY = Math.max(0, scrollMetrics.clientHeight - headerHeight);
    const effectiveContentY = Math.max(
      effectiveViewportY,
      scrollMetrics.scrollHeight - headerHeight,
    );
    const hasV = effectiveContentY > effectiveViewportY + 1;
    const hasH = scrollMetrics.scrollWidth > scrollMetrics.clientWidth + 1;

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
      // NOTE: thumb is positioned *inside* the track element, so offset is relative to track's top.
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
  }, [headerHeight, scrollMetrics]);

  const resolveColumnStyle = useCallback(
    (column: DataTableColumn<T>): CSSProperties | undefined => {
      const width = columnWidths[column.key];
      if (!width) return undefined;
      return { width, minWidth: width, maxWidth: width };
    },
    [columnWidths],
  );

  return (
    <div
      ref={rootRef}
      aria-busy={loading || loadingMore ? true : undefined}
      data-vt-natural-flow={naturalFlow ? true : undefined}
      className={
        naturalFlow
          ? `${height} ${minHeight} relative min-w-0 overflow-visible`
          : `${height} ${minHeight} group relative isolate grid min-w-0 ${vThumb ? "grid-cols-[minmax(0,1fr)_0.75rem]" : "grid-cols-1"} overflow-hidden`
      }
    >
      {naturalFlow ? null : (
        <div
          data-vt-header-backdrop
          className="pointer-events-none absolute inset-x-0 top-0 z-0 rounded-xl bg-slate-100 dark:bg-neutral-800"
          style={{ height: headerHeight }}
        />
      )}
      <div
        ref={containerRef}
        onScroll={naturalFlow ? undefined : onScroll}
        tabIndex={naturalFlow ? undefined : 0}
        data-scrollbar-visibility={naturalFlow ? undefined : "hover"}
        className={
          naturalFlow
            ? "relative z-10 min-h-0 overflow-visible rounded-xl"
            : "relative z-10 col-start-1 row-start-1 h-full min-h-0 table-scrollbar overflow-auto overscroll-x-none overscroll-y-none rounded-tl-xl"
        }
      >
        {naturalFlow ? null : (
          <div
            data-vt-header-overlay
            className={`pointer-events-none sticky left-0 top-0 z-10 w-full ${vThumb ? "rounded-l-xl" : "rounded-xl"} bg-slate-100 dark:bg-neutral-800`}
            style={{ height: headerHeight, marginBottom: -headerHeight }}
          />
        )}
        <table
          className={`w-full ${minWidth} table-fixed border-separate border-spacing-0 text-sm`}
        >
          <caption className="sr-only">{caption}</caption>
          <colgroup>
            {columns.map((col) => (
              <col key={col.key} style={resolveColumnStyle(col)} />
            ))}
          </colgroup>

          {/* ── HeroUI-styled header ── */}
          <thead ref={headerRef} className={naturalFlow ? undefined : "sticky top-0 z-20"}>
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
              {columns.map((col, colIndex) => {
                const canResize = shouldAllowColumnResize(col, colIndex, columns);
                return (
                  <th
                    key={col.key}
                    aria-label={col.label}
                    ref={(node) => {
                      headerCellsRef.current[col.key] = node;
                    }}
                    style={resolveColumnStyle(col)}
                    className={`group/column relative whitespace-nowrap px-4 py-3 ${col.width ?? ""} ${col.headerClassName ?? ""}`}
                  >
                    {col.headerRender ? col.headerRender() : col.label}
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
                          className="mx-auto block h-6 w-px rounded-full bg-slate-300/80 opacity-70 transition-[width,background-color,opacity] group-hover/resize:w-0.5 group-hover/resize:bg-slate-500 group-hover/resize:opacity-100 group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-slate-500 group-focus-visible/resize:opacity-100 dark:bg-white/25 dark:group-hover/resize:bg-white/55 dark:group-focus-visible/resize:bg-white/55"
                        />
                      </button>
                    ) : null}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody className="text-slate-900 dark:text-white">
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
                    {columns.map((col, colIndex) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 align-middle ${col.cellClassName ?? ""}`}
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
                  return (
                    <tr
                      key={key}
                      className={`text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04] ${extraCls}`}
                      style={virtualize ? { height: rowHeight } : undefined}
                    >
                      {columns.map((col, colIdx) => {
                        const isFirst = colIdx === 0;
                        const isLast = colIdx === columns.length - 1;
                        const content = col.render(row, globalIdx);
                        const overflowTooltip = resolveCellOverflowTooltip(col, row, globalIdx);
                        const roundCls = [
                          isFirst ? "first:rounded-l-lg" : "",
                          isLast ? "last:rounded-r-lg" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <td
                            key={col.key}
                            style={resolveColumnStyle(col)}
                            className={`px-4 py-2.5 align-middle ${col.cellClassName ?? ""} ${roundCls}`}
                          >
                            <TableCellOverflowTooltip
                              tooltipContent={overflowTooltip}
                              className={col.cellClassName}
                            >
                              {content}
                            </TableCellOverflowTooltip>
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
            className="pointer-events-auto absolute right-0 z-30 w-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
            style={{ top: headerHeight + 8, bottom: 8 }}
          >
            <div className="absolute inset-0 rounded-full bg-slate-200/40 dark:bg-white/10" />
            <div
              role="presentation"
              className="pointer-events-auto absolute left-0 right-0 cursor-pointer rounded-full bg-slate-500/40 transition-colors hover:bg-slate-500/70 dark:bg-white/25 dark:hover:bg-white/50"
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
          className="pointer-events-auto absolute bottom-1 left-2 right-5 z-30 h-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          <div className="absolute inset-0 rounded-full bg-slate-200/40 dark:bg-white/10" />
          <div
            role="presentation"
            className="pointer-events-auto absolute top-0 bottom-0 cursor-pointer rounded-full bg-slate-500/40 transition-colors hover:bg-slate-500/70 dark:bg-white/25 dark:hover:bg-white/50"
            style={{ left: hThumb.left, width: hThumb.width }}
            onPointerDown={(e) => handleThumbPointerDown("x", e)}
            onPointerMove={handleThumbPointerMove}
            onPointerUp={handleThumbPointerUp}
            onPointerCancel={handleThumbPointerUp}
          />
        </div>
      ) : null}

      {resizePreview ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-20 w-0.5 bg-slate-500/70"
            style={{
              left: resizePreview.left,
              top: resizePreview.top,
              height: resizePreview.height,
            }}
          />
          <div
            role="status"
            className="pointer-events-none absolute z-40 rounded-md bg-slate-900 px-2 py-1 text-xs font-medium text-white shadow-lg dark:bg-white dark:text-neutral-950"
            style={{
              left: resizePreview.left + 10,
              top: resizePreview.tooltipTop,
            }}
          >
            {t("common.column_width_px", { width: resizePreview.width })}
          </div>
        </>
      ) : null}
    </div>
  );
}
