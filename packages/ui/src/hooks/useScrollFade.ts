import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import "../primitives/ScrollArea.css";

export interface ScrollFadeEdges {
  /** 内容高过容器（真的需要滚动）。 */
  overflow: boolean;
  /** 上方还有内容（已经往下滚过）。 */
  top: boolean;
  /** 下方还有内容。 */
  bottom: boolean;
}

/**
 * 普通滚动容器的上下渐隐：上面还有内容时顶部淡出，下面还有内容时底部淡出，到顶 / 到底就收起。
 * 用来替代「内容在边缘被一刀切断」或「滚动后浮出一条分隔线」——渐隐告诉用户「还能滚」，
 * 又不会在头尾留下割裂的硬边。
 *
 * 和 ScrollArea 的 `edgeFade` 共用同一个 CSS（`code-proxy-scroll-edge-fade`）。只在内容确实溢出时
 * 才挂类：mask 会把子孙的绘制裁到盒子以内，fixed 定位、伸出盒子的浮层也会被裁，
 * 所以容器里不该有不走 portal 的浮层（下拉、日期选择器、提示气泡都走 portal，不受影响）。
 *
 * 用法：`const fade = useScrollFade();` →
 * `<div ref={fade.ref} onScroll={fade.onScroll} className={cn("overflow-y-auto", fade.className)} style={fade.style}>`
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>({
  size = 28,
  enabled = true,
  axis = "y",
}: {
  size?: number;
  enabled?: boolean;
  /** `x`：横向滚动（胶囊条、横向页签），左右两端渐隐；`top` / `bottom` 对应左 / 右。 */
  axis?: "x" | "y";
} = {}) {
  const ref = useRef<T | null>(null);
  const [edges, setEdges] = useState<ScrollFadeEdges>({ overflow: false, top: false, bottom: false });

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    const scrollSize = axis === "x" ? node.scrollWidth : node.scrollHeight;
    const clientSize = axis === "x" ? node.clientWidth : node.clientHeight;
    const offset = axis === "x" ? Math.abs(node.scrollLeft) : node.scrollTop;
    const overflow = scrollSize - clientSize > 1;
    const top = overflow && offset > 1;
    const bottom = overflow && offset + clientSize < scrollSize - 1;
    setEdges((previous) =>
      previous.overflow === overflow && previous.top === top && previous.bottom === bottom
        ? previous
        : { overflow, top, bottom },
    );
  }, [axis]);

  useEffect(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    measure();
    const frame = window.requestAnimationFrame(measure);
    if (typeof ResizeObserver === "undefined") {
      return () => window.cancelAnimationFrame(frame);
    }
    // 容器自身尺寸变化、子元素增删或长高（展开一段内容、异步数据到达）都要重新量一次。
    const resize = new ResizeObserver(measure);
    resize.observe(node);
    const observeChildren = () => {
      for (const child of Array.from(node.children)) resize.observe(child);
    };
    observeChildren();
    const mutation =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(() => {
            observeChildren();
            measure();
          });
    mutation?.observe(node, { childList: true });
    return () => {
      window.cancelAnimationFrame(frame);
      resize.disconnect();
      mutation?.disconnect();
    };
  }, [enabled, measure]);

  const active = enabled && edges.overflow;
  const start = edges.top ? `${size}px` : "0px";
  const end = edges.bottom ? `${size}px` : "0px";
  const style: CSSProperties | undefined = active
    ? ((axis === "x"
        ? { "--scroll-fade-left": start, "--scroll-fade-right": end }
        : { "--scroll-fade-top": start, "--scroll-fade-bottom": end }) as unknown as CSSProperties)
    : undefined;

  return {
    ref,
    onScroll: measure,
    className: active ? (axis === "x" ? "code-proxy-scroll-edge-fade-x" : "code-proxy-scroll-edge-fade") : "",
    style,
    edges,
    /** 内容变化后手动重新测量（例如切换分组后内容整体替换）。 */
    measure,
  };
}
