import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
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
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(480);
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

    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const {
      hasMore: latestHasMore,
      loadingMore: latestLoadingMore,
      onScrollBottom: latestCb,
    } = latestRef.current;
    const threshold = latestRef.current.scrollThreshold;

    const shouldSchedule =
      scrollBottom <= threshold &&
      latestHasMore &&
      !latestLoadingMore &&
      Boolean(latestCb);

    if (!shouldSchedule) {
      if (bottomTimeoutRef.current) {
        window.clearTimeout(bottomTimeoutRef.current);
        bottomTimeoutRef.current = null;
      }
    } else if (!bottomPendingRef.current) {
      if (bottomTimeoutRef.current)
        window.clearTimeout(bottomTimeoutRef.current);
      bottomTimeoutRef.current = window.setTimeout(() => {
        bottomTimeoutRef.current = null;
        const node = containerRef.current;
        if (!node) return;

        const st = latestRef.current;
        if (!st.hasMore || st.loadingMore || !st.onScrollBottom) return;

        const bottomNow =
          node.scrollHeight - node.scrollTop - node.clientHeight;
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
  }, [hasMore, loadingMore, onScrollBottom, scrollThreshold]);

  // Track viewport height
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight || 480);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

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
  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } =
    useMemo(() => {
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
    }, [
      overscan,
      rowHeight,
      rows.length,
      scrollTop,
      viewportHeight,
      virtualize,
    ]);

  const visibleRows = useMemo(
    () => (virtualize ? rows.slice(startIndex, endIndex) : rows),
    [endIndex, rows, startIndex, virtualize],
  );

  return (
    <div className="min-w-0 overflow-hidden">
      <div
        ref={containerRef}
        onScroll={onScroll}
        className={`${height} ${minHeight} overflow-auto`}
      >
        <table
          className={`w-full ${minWidth} table-fixed border-separate border-spacing-0 text-sm`}
        >
          <caption className="sr-only">{caption}</caption>

          {/* ── HeroUI-styled header ── */}
          <thead className="sticky top-0 z-10">
            <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
              {columns.map((col, i) => {
                const isFirst = i === 0;
                const isLast = i === columns.length - 1;
                const roundCls = [
                  isFirst ? "first:rounded-l-xl" : "",
                  isLast ? "last:rounded-r-xl" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <th
                    key={col.key}
                    className={`whitespace-nowrap bg-slate-100 px-4 py-3 dark:bg-neutral-800 ${col.width ?? ""} ${col.headerClassName ?? ""} ${roundCls}`}
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
                    <td
                      colSpan={colCount}
                      height={topSpacerHeight}
                      className="p-0"
                    />
                  </tr>
                ) : null}
                {visibleRows.map((row, localIdx) => {
                  const globalIdx = virtualize
                    ? startIndex + localIdx
                    : localIdx;
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
                    <td
                      colSpan={colCount}
                      height={bottomSpacerHeight}
                      className="p-0"
                    />
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
  );
}
