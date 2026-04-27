import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { useTranslation } from "react-i18next";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Column definition for VirtualTable */
export interface VirtualTableColumn<T> {
  /** Unique key for this column */
  key: string;
  /** Header label */
  label: string;
  /** Fixed width class (Tailwind), e.g. "w-52" */
  width?: string;
  /** Extra header class (e.g. "text-right") */
  headerClassName?: string;
  /** Extra cell class */
  cellClassName?: string;
  /** Custom header render function (overrides label) */
  headerRender?: () => ReactNode;
  /** Render function for cell content */
  render: (row: T, index: number) => ReactNode;
}

export interface VirtualTableProps<T> {
  /** Row data array */
  rows: readonly T[];
  /** Column definitions */
  columns: VirtualTableColumn<T>[];
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
  /** Enable row virtualization (default true). Disable to allow natural row height. */
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
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const DEFAULT_ROW_HEIGHT = 44;
const DEFAULT_OVERSCAN = 12;
const DEFAULT_SCROLL_THRESHOLD = 100;
const DEFAULT_BOTTOM_DEBOUNCE_MS = 120;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function VirtualTable<T>({
  rows,
  columns,
  rowKey,
  loading = false,
  hasMore = false,
  loadingMore = false,
  onScrollBottom,
  virtualize = true,
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
}: VirtualTableProps<T>) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLTableSectionElement | null>(null);
  const headerHeightRef = useRef(0);
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

  const onWheelCapture = useCallback((e: ReactWheelEvent<HTMLDivElement>) => {
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
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

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
      e.currentTarget.setPointerCapture(pointerId);

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

  return (
    <div
      className={`${height} ${minHeight} relative grid min-w-0 grid-cols-[minmax(0,1fr)_0.75rem] overflow-hidden group`}
    >
      <div
        data-vt-header-backdrop
        className="pointer-events-none absolute inset-x-0 top-0 z-0 rounded-xl bg-slate-100 dark:bg-neutral-800"
        style={{ height: headerHeight }}
      />
      <div
        ref={containerRef}
        onScroll={onScroll}
        onWheelCapture={onWheelCapture}
        tabIndex={0}
        data-scrollbar-visibility="hover"
        className="relative z-10 col-start-1 row-start-1 h-full min-h-0 table-scrollbar overflow-auto overscroll-x-none overscroll-y-none rounded-tl-xl"
      >
        <div
          data-vt-header-overlay
          className="pointer-events-none sticky left-0 top-0 z-10 w-full rounded-l-xl bg-slate-100 dark:bg-neutral-800"
          style={{ height: headerHeight, marginBottom: -headerHeight }}
        />
        <table
          className={`w-full ${minWidth} table-fixed border-separate border-spacing-0 text-sm`}
        >
          <caption className="sr-only">{caption}</caption>

          {/* ── HeroUI-styled header ── */}
          <thead ref={headerRef} className="sticky top-0 z-20">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
              {columns.map((col) => {
                return (
                  <th
                    key={col.key}
                    className={`whitespace-nowrap px-4 py-3 ${col.width ?? ""} ${col.headerClassName ?? ""}`}
                  >
                    {col.headerRender ? col.headerRender() : col.label}
                  </th>
                );
              })}
            </tr>
          </thead>

          {/* ── Body ── */}
          <tbody className="text-slate-900 dark:text-white">
            {!loading && rows.length === 0 ? (
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
                        const roundCls = [
                          isFirst ? "first:rounded-l-lg" : "",
                          isLast ? "last:rounded-r-lg" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-2.5 align-middle ${col.cellClassName ?? ""} ${roundCls}`}
                          >
                            {col.render(row, globalIdx)}
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

      <div
        data-vt-scrollbar-gutter
        className="relative z-20 col-start-2 row-start-1 h-full w-3 justify-self-end"
      >
        <div
          data-vt-header-gutter
          className="absolute inset-x-0 top-0 rounded-r-xl bg-slate-100 dark:bg-neutral-800"
          style={{ height: headerHeight }}
        />
        {vThumb ? (
          <div
            data-vt-scrollbar="y"
            className="pointer-events-auto absolute right-0 w-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
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
        ) : null}
      </div>

      {hThumb ? (
        <div
          data-vt-scrollbar="x"
          className="pointer-events-auto absolute bottom-1 left-2 right-5 h-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
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
    </div>
  );
}
