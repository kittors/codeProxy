import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { readRootScale } from "./useColumnSizing";

export interface GridViewportSize {
  width: number;
  height: number;
  headerHeight: number;
  /** 实际根字号 / 16。 */
  scale: number;
  xOverflow: boolean;
}

const INITIAL: GridViewportSize = {
  width: 0,
  height: 0,
  headerHeight: 0,
  scale: 1,
  xOverflow: false,
};

/** 停止滚动多久后把纵向滚动条藏回去。 */
const SCROLL_IDLE_MS = 900;

/**
 * 量视口与表头尺寸，并把滚动状态写到根节点的 data-* 上（DataGrid.css 据此画冻结列阴影、
 * 表头投影、显示纵向滚动条）。滚动时只改属性不 setState：几十行的表每帧重渲染会掉帧。
 *
 * 量尺寸放在 layout effect 里同步做一次：首帧就拿到视口宽度，grow 列不会先窄后宽地跳一下。
 */
export function useGridViewport(
  rootRef: RefObject<HTMLDivElement | null>,
  viewportRef: RefObject<HTMLDivElement | null>,
): GridViewportSize & { syncScrollState: () => void } {
  const [size, setSize] = useState<GridViewportSize>(INITIAL);
  const idleTimer = useRef<number | null>(null);

  const syncScrollState = useCallback(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    if (!root || !viewport) return;
    const maxX = viewport.scrollWidth - viewport.clientWidth;
    root.dataset.xOverflow = String(maxX > 1);
    root.dataset.xScrolled = String(viewport.scrollLeft > 0.5);
    root.dataset.xAtEnd = String(viewport.scrollLeft >= maxX - 1);
    root.dataset.yScrolled = String(viewport.scrollTop > 0.5);
  }, [rootRef, viewportRef]);

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const head = viewport.querySelector("thead");
    const next: GridViewportSize = {
      width: viewport.clientWidth,
      height: viewport.clientHeight,
      headerHeight: head?.getBoundingClientRect().height ?? 0,
      scale: readRootScale(),
      xOverflow: viewport.scrollWidth - viewport.clientWidth > 1,
    };
    setSize((prev) =>
      prev.width === next.width &&
      prev.height === next.height &&
      prev.headerHeight === next.headerHeight &&
      prev.scale === next.scale &&
      prev.xOverflow === next.xOverflow
        ? prev
        : next,
    );
    syncScrollState();
  }, [syncScrollState, viewportRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const onScroll = () => {
      syncScrollState();
      const root = rootRef.current;
      if (!root) return;
      root.dataset.scrolling = "true";
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
      idleTimer.current = window.setTimeout(() => {
        idleTimer.current = null;
        delete root.dataset.scrolling;
      }, SCROLL_IDLE_MS);
    };
    viewport.addEventListener("scroll", onScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    const table = viewport.firstElementChild;
    if (table) observer?.observe(table);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer?.disconnect();
      if (idleTimer.current !== null) window.clearTimeout(idleTimer.current);
    };
  }, [measure, rootRef, syncScrollState, viewportRef]);

  return { ...size, syncScrollState };
}
