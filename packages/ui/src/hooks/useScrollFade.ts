import { useCallback, useEffect, useRef, type RefObject } from "react";
import "../primitives/ScrollArea.css";
import {
  clearScrollFade,
  SCROLL_FADE_HOST_ATTR,
  SCROLL_FADE_MEASURE_EVENT,
  syncScrollFade,
  type ScrollFadeAxis,
} from "./scrollFadeDom";

/**
 * 滚动容器的边缘渐隐，全站唯一的实现（ScrollFade 组件、ScrollArea 的 edgeFade、弹窗 / 抽屉正文、
 * 主内容区和表格都走这里）：上面还有内容时顶部淡出，下面还有时底部淡出，到顶 / 到底那一侧不淡，
 * 滚不动的区域完全不淡。替代「内容在边缘被一刀切断」或「滚动后浮出一条分隔线」。
 *
 * 宿主上会带 `data-scroll-more-top` / `data-scroll-more-bottom`（横向是 left / right）两个标记，
 * 由 scrollFadeDom 直接写 DOM，滚动时不触发重渲染。
 *
 * 遮罩会把宿主子孙的绘制一起裁到盒子以内：没走 portal 的 fixed 浮层、视觉上伸出盒子的浮层都会被裁。
 * 下拉、日期选择器、提示气泡、弹窗都走 portal，不受影响；新写的浮层也要走 portal。
 *
 * sticky 的页签栏、操作栏、表头加 `data-scroll-fade-pin="top" | "bottom"`，渐隐从它的边缘开始。
 *
 * 用法：`const fade = useScrollFade();` → `<div ref={fade.ref} className="overflow-y-auto">`。
 * 滚动条、浮层不该被淡掉时，传 `host` 把遮罩挂到只包内容的那一层（见 DataTable 的 TableFadeFrame）。
 */
export function useScrollFade<T extends HTMLElement = HTMLDivElement>({
  size = 28,
  enabled = true,
  axis = "y",
  scroller,
  host,
}: {
  /** 渐隐长度上限（px）。实际长度等于这一侧还能滚的距离，最多到这个值。 */
  size?: number;
  enabled?: boolean;
  /** `x`：横向滚动（胶囊条、横向页签），左右两端渐隐。 */
  axis?: ScrollFadeAxis;
  /** 已有的滚动容器 ref；不传时用返回的 `ref`。 */
  scroller?: RefObject<T | null>;
  /** 挂遮罩的元素，默认是滚动容器本身。 */
  host?: RefObject<HTMLElement | null>;
} = {}) {
  const ownRef = useRef<T | null>(null);
  const ref = scroller ?? ownRef;

  const measure = useCallback(() => {
    const node = ref.current;
    if (!enabled || !node) return;
    syncScrollFade(node, host?.current ?? node, axis, size);
  }, [axis, enabled, host, ref, size]);

  useEffect(() => {
    const node = ref.current;
    const target = host?.current ?? node;
    if (!enabled || !node || !target) return;
    target.setAttribute(SCROLL_FADE_HOST_ATTR, "");
    measure();
    const frame = window.requestAnimationFrame(measure);
    node.addEventListener("scroll", measure, { passive: true });
    node.addEventListener(SCROLL_FADE_MEASURE_EVENT, measure);
    // 容器自身尺寸变化、子元素增删或长高（展开一段内容、异步数据到达）都要重新量一次。
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    resize?.observe(node);
    if (target !== node) resize?.observe(target);
    const observeChildren = () => {
      for (const child of Array.from(node.children)) resize?.observe(child);
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
      node.removeEventListener("scroll", measure);
      node.removeEventListener(SCROLL_FADE_MEASURE_EVENT, measure);
      resize?.disconnect();
      mutation?.disconnect();
      clearScrollFade(target);
      target.removeAttribute(SCROLL_FADE_HOST_ATTR);
    };
  }, [enabled, host, measure, ref]);

  return {
    ref,
    /** 内容整体替换后手动重新测量（例如切换分组）。 */
    measure,
  };
}
