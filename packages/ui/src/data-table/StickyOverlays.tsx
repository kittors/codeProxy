import { useLayoutEffect, useMemo, useState, type RefObject } from "react";
import {
  areColumnWidthMapsEqual,
  resolveStickyColumnKeys,
  resolveStickyColumnPlacements,
  resolveStickyRailWidth,
} from "./columnLayout";
import type { DataTableColumn } from "./DataTable.types";
import {
  STICKY_EDGE_SHADOW_WIDTH,
  type ColumnWidthMap,
  type StickyColumnPlacement,
} from "./dataTableModel";

export interface StickyOverlayHeights {
  /** Edge shadow: starts at the top of the viewport, header included. */
  boundary: number;
  /** Opaque backing behind the fixed cells: starts below the header. */
  rail: number;
}

/**
 * How far down the viewport the fixed-column rail and edge shadow reach.
 *
 * They used to span the whole viewport, so a table with fewer rows than fit
 * left the shadow hanging past the last row into the empty area below it — the
 * fixed "actions" column looked detached from its rows. They now stop where
 * the table does (the table sits at the top of the scroll content, so its
 * bottom in the viewport is tableHeight - scrollTop), which also keeps them off
 * the "all records loaded" footer when scrolled to the end.
 *
 * tableHeight 0 means "not measured yet" and keeps the full-height behaviour.
 */
export function resolveStickyOverlayHeights({
  clientHeight,
  headerHeight,
  bottomInset,
  tableHeight,
  scrollTop,
}: {
  clientHeight: number;
  headerHeight: number;
  bottomInset: number;
  tableHeight: number;
  scrollTop: number;
}): StickyOverlayHeights {
  const viewportBottom = Math.max(0, clientHeight - bottomInset);
  const tableBottom = tableHeight > 0 ? Math.max(0, tableHeight - scrollTop) : viewportBottom;
  const boundary = Math.min(viewportBottom, tableBottom);
  return { boundary, rail: Math.max(0, boundary - headerHeight) };
}

/**
 * Applies the heights during scrolling, which DataTable deliberately keeps out
 * of React state. Overlays that render() skipped (height 0) are left alone.
 */
export function syncStickyOverlayHeights(
  root: HTMLElement,
  input: Parameters<typeof resolveStickyOverlayHeights>[0],
) {
  const heights = resolveStickyOverlayHeights(input);
  const set = (selector: string, height: number) => {
    const element = root.querySelector<HTMLElement>(selector);
    if (element) element.style.height = `${height}px`;
  };
  set("[data-vt-sticky-start-rail]", heights.rail);
  set("[data-vt-sticky-end-rail]", heights.rail);
  set("[data-vt-sticky-start-boundary]", heights.boundary);
  set("[data-vt-sticky-end-boundary]", heights.boundary);
}

/** Border-box height of an element, kept current with a ResizeObserver. */
export function useObservedHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => setHeight(Math.ceil(element.offsetHeight)));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return height;
}

/**
 * Rendered widths of the sticky columns, measured from their header cells.
 *
 * Rails, edge shadows and sticky offsets used to come from the nominal column
 * widths. A fixed-layout table wider than the sum of its columns (a page whose
 * min-width outgrew its columns, or just a wide screen) hands the surplus to
 * every column, so a sticky column rendered wider than its nominal width and
 * the edge shadow landed inside it, over its first action button.
 *
 * Sizes come from ResizeObserver's border box rather than getBoundingClientRect,
 * which would report a scaled size while an opening modal is still animating.
 */
export function useRenderedStickyWidths<T>(
  headerCellsRef: RefObject<Record<string, HTMLTableCellElement | null>>,
  columns: DataTableColumn<T>[],
  enabled: boolean,
): ColumnWidthMap {
  const [widths, setWidths] = useState<ColumnWidthMap>({});
  useLayoutEffect(() => {
    const keyByCell = new Map<Element, string>();
    if (enabled) {
      for (const key of resolveStickyColumnKeys(columns)) {
        const cell = headerCellsRef.current[key];
        if (cell) keyByCell.set(cell, key);
      }
    }
    if (keyByCell.size === 0 || typeof ResizeObserver === "undefined") {
      setWidths((prev) => (Object.keys(prev).length === 0 ? prev : {}));
      return;
    }
    const sizes = new Map<string, number>();
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const key = keyByCell.get(entry.target);
        const width =
          entry.borderBoxSize?.[0]?.inlineSize ?? (entry.target as HTMLElement).offsetWidth;
        if (key) sizes.set(key, width);
      }
      const next = Object.fromEntries(sizes);
      setWidths((prev) => (areColumnWidthMapsEqual(prev, next) ? prev : next));
    });
    keyByCell.forEach((_, cell) => observer.observe(cell));
    return () => observer.disconnect();
  }, [columns, enabled, headerCellsRef]);
  return widths;
}

/**
 * Rail widths and sticky offsets for a table. Empty tables have none; tables
 * that do not pin anything (natural flow) skip the measurement.
 */
export function useStickyColumnLayout<T>({
  headerCellsRef,
  columns,
  widths,
  isEmpty,
  measure,
}: {
  headerCellsRef: RefObject<Record<string, HTMLTableCellElement | null>>;
  columns: DataTableColumn<T>[];
  widths: ColumnWidthMap;
  isEmpty: boolean;
  measure: boolean;
}) {
  const rendered = useRenderedStickyWidths(headerCellsRef, columns, measure && !isEmpty);
  return useMemo(
    () => ({
      rendered,
      startWidth: isEmpty ? 0 : resolveStickyRailWidth(columns, widths, "start", rendered),
      endWidth: isEmpty ? 0 : resolveStickyRailWidth(columns, widths, "end", rendered),
      placements: (isEmpty
        ? {}
        : resolveStickyColumnPlacements(columns, widths, rendered)) as Record<
        string,
        StickyColumnPlacement
      >,
    }),
    [columns, isEmpty, rendered, widths],
  );
}

// 背衬跟随表格所在的底色（内容区 / 卡片 / 弹窗，见 styles/index.css 的 --cp-backdrop）。
const RAIL_CLASS = "pointer-events-none absolute z-0 hidden bg-backdrop md:block";
const BOUNDARY_CLASS =
  "pointer-events-none absolute top-0 z-[75] hidden to-transparent transition-opacity duration-150 md:block dark:from-black/35";

/** Opaque backing behind the fixed columns, so scrolled cells never show through. */
export function StickyRails({
  startWidth,
  endWidth,
  endLeft,
  top,
  height,
}: {
  startWidth: number;
  endWidth: number;
  endLeft: number;
  top: number;
  height: number;
}) {
  if (height <= 0) return null;
  return (
    <>
      {startWidth > 0 ? (
        <div
          data-vt-sticky-start-rail
          aria-hidden="true"
          className={RAIL_CLASS}
          style={{ left: 0, top, width: startWidth, height }}
        />
      ) : null}
      {endWidth > 0 ? (
        <div
          data-vt-sticky-end-rail
          aria-hidden="true"
          className={RAIL_CLASS}
          style={{ left: endLeft, top, width: endWidth, height }}
        />
      ) : null}
    </>
  );
}

/** Edge shadows that appear while content scrolls under a fixed column. */
export function StickyBoundaries({
  startWidth,
  endWidth,
  startLeft,
  endLeft,
  height,
  startOpacity,
  endOpacity,
}: {
  startWidth: number;
  endWidth: number;
  startLeft: number;
  endLeft: number;
  height: number;
  startOpacity: number;
  endOpacity: number;
}) {
  if (height <= 0) return null;
  return (
    <>
      {startWidth > 0 ? (
        <div
          data-vt-sticky-start-boundary
          aria-hidden="true"
          className={`${BOUNDARY_CLASS} bg-gradient-to-r from-slate-950/[0.07]`}
          style={{
            left: startLeft,
            width: STICKY_EDGE_SHADOW_WIDTH,
            height,
            opacity: startOpacity,
          }}
        />
      ) : null}
      {endWidth > 0 ? (
        <div
          data-vt-sticky-end-boundary
          aria-hidden="true"
          className={`${BOUNDARY_CLASS} bg-gradient-to-l from-slate-950/[0.07]`}
          style={{
            left: endLeft,
            width: STICKY_EDGE_SHADOW_WIDTH,
            height,
            opacity: endOpacity,
          }}
        />
      ) : null}
    </>
  );
}
