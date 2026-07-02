import { useLayoutEffect, useRef } from "react";

const layoutEasing = "cubic-bezier(0.16, 1, 0.3, 1)";

export function useResizeLayoutAnimation<T extends HTMLElement>(enabled: boolean) {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const element = ref.current;
    if (!enabled || !element || typeof window === "undefined") return;
    if (typeof element.animate !== "function") return;

    let previous = element.getBoundingClientRect();
    let frame = 0;
    let animation: Animation | null = null;

    const measure = () => {
      frame = 0;
      const next = element.getBoundingClientRect();
      const deltaX = previous.left - next.left;
      const deltaY = previous.top - next.top;
      previous = next;

      if (Math.abs(deltaX) < 0.5 && Math.abs(deltaY) < 0.5) return;

      animation?.cancel();
      animation = element.animate(
        [
          { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
          { transform: "translate3d(0, 0, 0)" },
        ],
        { duration: 260, easing: layoutEasing },
      );
    };

    const schedule = () => {
      if (frame) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(measure);
    };

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      animation?.cancel();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
    };
  }, [enabled]);

  return ref;
}
