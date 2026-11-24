import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { edgeFrames, reduced } from "satin-ui";

/**
 * Satin 流体滑块 Hook：直接调用 satin-ui 的 `edgeFrames` 物理曲线引擎，
 * 前缘先走（leadEase）、后缘延迟 45ms 跟上（trailEase）、落定时纵向轻压回弹，
 * 在浏览器合成线程上以 60fps 播放 Web Animations，不依赖 framer-motion。
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
    if (!container) return null;
    const activeEl = container.querySelector<HTMLElement>(activeSelector);
    if (!activeEl) return null;
    const paddingLeft = Number.parseFloat(getComputedStyle(container).paddingLeft) || 2;
    const left = activeEl.offsetLeft - paddingLeft;
    const width = activeEl.offsetWidth;
    if (width <= 0) return null;
    return [left, left + width];
  }, [activeSelector, containerRef]);

  const applyStatic = useCallback(
    (edges: [number, number]) => {
      const thumb = thumbRef.current;
      if (!thumb) return;
      const width = Math.max(1, edges[1] - edges[0]);
      thumb.style.opacity = "1";
      thumb.style.width = `${width}px`;
      thumb.style.transform = `translateX(${edges[0].toFixed(2)}px) scaleX(1) scaleY(1)`;
    },
    [thumbRef],
  );

  useLayoutEffect(() => {
    const thumb = thumbRef.current;
    if (!thumb) return;
    const target = measureActive();
    if (!target) {
      thumb.style.opacity = "0";
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
  }, [activeKey, applyStatic, measureActive, thumbRef]);

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
