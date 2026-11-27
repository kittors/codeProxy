import { useEffect, useState } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function readReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement?.classList.contains("sn-reduce-motion")) return true;
  if (typeof window.matchMedia !== "function") return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

/**
 * 监听系统 `prefers-reduced-motion: reduce` 与 Satin 显式 `.sn-reduce-motion` 开关。
 * 零外部依赖，完整替代 framer-motion 的 `useReducedMotion`。
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(readReducedMotion);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const sync = () => setReduced(readReducedMotion());
    sync();

    const mql = typeof window.matchMedia === "function" ? window.matchMedia(REDUCED_MOTION_QUERY) : null;
    mql?.addEventListener?.("change", sync);

    const observer =
      typeof MutationObserver === "undefined"
        ? null
        : new MutationObserver(sync);
    observer?.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      mql?.removeEventListener?.("change", sync);
      observer?.disconnect();
    };
  }, []);

  return reduced;
}
