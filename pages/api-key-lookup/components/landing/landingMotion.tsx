import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePrefersReducedMotion } from "@code-proxy/ui";

/** 落地页统一缓动：对齐 Satin `--sn-ease-out-strong` 与落地页滑入曲线。 */
export const LANDING_EASE_CSS = "cubic-bezier(0.16, 1, 0.3, 1)";

export interface FadeUpOptions {
  delay?: number;
  distance?: number;
  duration?: number;
  immediate?: boolean;
}

/**
 * 零 framer-motion 的视口渐入钩子：
 * 基于原生 IntersectionObserver + CSS opacity/transform 过渡；
 * 减少动态效果时直接渲染终态，不挂观察器。
 */
export function useLandingReveal<T extends HTMLElement = HTMLDivElement>(
  options: FadeUpOptions = {},
) {
  const { delay = 0, distance = 16, duration = 0.6, immediate = false } = options;
  const reduceMotion = usePrefersReducedMotion();
  const ref = useRef<T | null>(null);
  const [shown, setShown] = useState(() => reduceMotion || immediate);

  useEffect(() => {
    if (reduceMotion) {
      setShown(true);
      return undefined;
    }
    if (immediate) {
      const raf = window.requestAnimationFrame(() => setShown(true));
      return () => window.cancelAnimationFrame(raf);
    }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [immediate, reduceMotion]);

  const style: CSSProperties = reduceMotion
    ? {}
    : {
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : `translate3d(0, ${distance}px, 0)`,
        transition: `opacity ${duration}s ${LANDING_EASE_CSS} ${delay}s, transform ${duration}s ${LANDING_EASE_CSS} ${delay}s`,
      };

  return { ref, style, shown };
}

export function LandingFade({
  children,
  className,
  delay = 0,
  distance = 16,
  duration = 0.6,
  immediate = false,
}: FadeUpOptions & {
  children: ReactNode;
  className?: string;
}) {
  const { ref, style } = useLandingReveal<HTMLDivElement>({
    delay,
    distance,
    duration,
    immediate,
  });
  return (
    <div ref={ref} style={style} className={className}>
      {children}
    </div>
  );
}

export function LandingFadeItem({
  children,
  className,
  delay = 0,
  distance = 16,
  duration = 0.6,
}: FadeUpOptions & {
  children: ReactNode;
  className?: string;
}) {
  const { ref, style } = useLandingReveal<HTMLLIElement>({
    delay,
    distance,
    duration,
  });
  return (
    <li ref={ref} style={style} className={className}>
      {children}
    </li>
  );
}
