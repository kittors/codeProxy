import type { ScrollMetrics } from "./dataTableModel";

export function getStickyEdgeShadowOpacity(metrics: ScrollMetrics, edge: "start" | "end") {
  const maxScrollLeft = Math.max(0, metrics.scrollWidth - metrics.clientWidth);
  if (maxScrollLeft <= 1) return 0;
  if (edge === "start") return metrics.scrollLeft > 1 ? 1 : 0;
  return metrics.scrollLeft < maxScrollLeft - 1 ? 1 : 0;
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
  const trackInset = 8;
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

export function findVerticalScrollContainer(element: HTMLElement | null): HTMLElement | null {
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

export function findVerticalScrollTarget(element: HTMLElement, deltaY: number): HTMLElement | null {
  let current = element.parentElement;
  while (current) {
    const overflowY = window.getComputedStyle(current).overflowY;
    const maxScrollTop = Math.max(0, current.scrollHeight - current.clientHeight);
    const canMove =
      /(auto|scroll)/.test(overflowY) &&
      ((deltaY < 0 && current.scrollTop > 0) || (deltaY > 0 && current.scrollTop < maxScrollTop));
    if (canMove) return current;
    current = current.parentElement;
  }

  const scrollingElement = document.scrollingElement;
  if (!(scrollingElement instanceof HTMLElement)) return null;
  const maxScrollTop = Math.max(0, scrollingElement.scrollHeight - scrollingElement.clientHeight);
  return (deltaY < 0 && scrollingElement.scrollTop > 0) ||
    (deltaY > 0 && scrollingElement.scrollTop < maxScrollTop)
    ? scrollingElement
    : null;
}
