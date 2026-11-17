import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";

/** 排序后最多等这么久新顺序到达（服务端排序要先发请求），过期的快照丢掉，不给无关的刷新做动画。 */
const CAPTURE_TTL_MS = 4000;
const DURATION_MS = 360;
const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * 排序时的「行滑到新位置」（FLIP）。
 *
 * 点表头那一刻先 capture() 记下每行的 offsetTop，新顺序渲染出来后在 layout effect 里
 * 算出每行的位移，用 Web Animations 从旧位置滑到新位置。只给顺序变了、行还在的那些行做；
 * 新出现的行交给「依次浮入」。位移太大（滑过大半屏）的不做，看着像整页乱飞。
 * offsetTop 相对表格本身，不受视口滚动影响。
 */
export function useRowReorderMotion(
  bodyRef: RefObject<HTMLTableSectionElement | null>,
  orderSignature: string,
): () => void {
  const pending = useRef<{ at: number; tops: Map<string, number> } | null>(null);

  const capture = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const tops = new Map<string, number>();
    for (const row of body.querySelectorAll<HTMLElement>("tr[data-row-key]")) {
      tops.set(row.dataset.rowKey ?? "", row.offsetTop);
    }
    pending.current = { at: Date.now(), tops };
  }, [bodyRef]);

  useLayoutEffect(() => {
    const snapshot = pending.current;
    if (!snapshot) return;
    pending.current = null;
    if (Date.now() - snapshot.at > CAPTURE_TTL_MS) return;
    if (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    for (const row of body.querySelectorAll<HTMLElement>("tr[data-row-key]")) {
      const before = snapshot.tops.get(row.dataset.rowKey ?? "");
      if (before === undefined || typeof row.animate !== "function") continue;
      const delta = before - row.offsetTop;
      if (delta === 0 || Math.abs(delta) > 1600) continue;
      row.animate([{ transform: `translateY(${delta}px)` }, { transform: "translateY(0)" }], {
        duration: DURATION_MS,
        easing: EASING,
      });
    }
  }, [bodyRef, orderSignature]);

  return capture;
}
