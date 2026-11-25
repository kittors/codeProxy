import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { edgeFrames, reduced } from "satin-ui";

/**
 * Satin 流体滑块 Hook：直接调用 satin-ui 的 `edgeFrames` 物理曲线引擎，
 * 前缘先走（leadEase）、后缘延迟 45ms 跟上（trailEase）、落定时纵向轻压回弹，
 * 在浏览器合成线程上以 60fps 播放 Web Animations，不依赖 framer-motion。
 *
 * 坐标原点始终以 `thumb.offsetLeft` 为准（而非写死 paddingLeft || 2），
 * 因此无论容器有无内边距（.sn-seg 的 2px、分页器的 0px）都严格 0px 误差贴合激活项。
 */
export function useSatinFluidThumb(
  containerRef: RefObject<HTMLElement | null>,
  thumbRef: RefObject<HTMLElement | null>,
  activeSelector: string,
  activeKey: string,
) {
  const prevEdgesRef = useRef<[number, number] | null>(null);
  const animRef = useRef<Animation | null>(null);

  const measureActive = useCallback((): [number, number] | null => {
    const container = containerRef.current;
    const thumb = thumbRef.current;
    if (!container || !thumb) return null;
    const activeEl = container.querySelector<HTMLElement>(activeSelector);
    if (!activeEl) return null;
    const width = activeEl.offsetWidth;
    if (width <= 0) return null;
    const originLeft = thumb.offsetLeft;
    const left = activeEl.offsetLeft - originLeft;
    return [left, left + width];
  }, [activeSelector, containerRef, thumbRef]);

  const applyStatic = useCallback(
    (edges: [number, number]) => {
      const container = containerRef.current;
      const thumb = thumbRef.current;
      if (!thumb) return;
      const width = Math.max(1, edges[1] - edges[0]);
      thumb.style.opacity = "1";
      thumb.style.width = `${width}px`;
      thumb.style.transform = `translateX(${edges[0].toFixed(2)}px) scaleX(1) scaleY(1)`;
      container?.setAttribute("data-thumb-ready", "true");
    },
    [containerRef, thumbRef],
  );

  useLayoutEffect(() => {
    const container = containerRef.current;
    const thumb = thumbRef.current;
    if (!thumb) return;
    const target = measureActive();
    if (!target) {
      thumb.style.opacity = "0";
      container?.removeAttribute("data-thumb-ready");
      prevEdgesRef.current = null;
      return;
    }

    const from = prevEdgesRef.current;
    prevEdgesRef.current = target;

    if (
      !from ||
      (Math.abs(from[0] - target[0]) < 0.5 && Math.abs(from[1] - target[1]) < 0.5) ||
      reduced() ||
      typeof thumb.animate !== "function"
    ) {
      animRef.current?.cancel();
      animRef.current = null;
      applyStatic(target);
      return;
    }

    const baseWidth = Math.max(1, target[1] - target[0]);
    thumb.style.opacity = "1";
    thumb.style.width = `${baseWidth}px`;
    container?.setAttribute("data-thumb-ready", "true");

    const toTransform = (edges: [number, number], sy: number) =>
      `translateX(${edges[0].toFixed(2)}px) scaleX(${(Math.max(1, edges[1] - edges[0]) / baseWidth).toFixed(4)}) scaleY(${sy.toFixed(4)})`;

    animRef.current?.cancel();
    const { frames, duration } = edgeFrames(from, target, toTransform, 0);
    const anim = thumb.animate(frames as Keyframe[], { duration, easing: "linear" });
    animRef.current = anim;
    applyStatic(target);
    anim.onfinish = () => {
      if (animRef.current === anim) {
        animRef.current = null;
        const settled = measureActive() ?? target;
        prevEdgesRef.current = settled;
        applyStatic(settled);
      }
    };
  }, [activeKey, applyStatic, containerRef, measureActive, thumbRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (animRef.current) return;
      const current = measureActive();
      if (current) {
        prevEdgesRef.current = current;
        applyStatic(current);
      }
    });
    observer.observe(container);
    return () => {
      observer.disconnect();
      animRef.current?.cancel();
    };
  }, [applyStatic, containerRef, measureActive]);
}
