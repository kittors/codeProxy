import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * 页内分区的「当前位置」：滚动容器里，顶部往下 96px 这条线落在哪个分区，哪个就是当前分区；
 * 滚到底时取最后一个（最后几个分区很矮，永远到不了那条线）。
 *
 * 点目录跳转时先锁住：平滑滚动途中会经过中间的分区，不锁的话目录高亮会一路闪过去。
 */
export function useSectionScrollSpy<T extends string>(
  containerRef: RefObject<HTMLElement | null>,
  sectionIds: readonly T[],
  attribute = "data-config-section",
) {
  const [active, setActive] = useState<T | null>(sectionIds[0] ?? null);
  const lockUntilRef = useRef(0);
  const idsKey = sectionIds.join("|");

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container || Date.now() < lockUntilRef.current) return;
    const sections = Array.from(container.querySelectorAll<HTMLElement>(`[${attribute}]`));
    if (sections.length === 0) return;
    const containerTop = container.getBoundingClientRect().top;
    const atBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 2;
    let current = sections[0]!;
    if (atBottom) {
      current = sections[sections.length - 1]!;
    } else {
      for (const section of sections) {
        if (section.getBoundingClientRect().top - containerTop <= 96) current = section;
      }
    }
    const id = current.getAttribute(attribute) as T | null;
    if (id) setActive((previous) => (previous === id ? previous : id));
  }, [attribute, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    measure();
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
    // idsKey：搜索过滤后分区集合变了要重新测一次。
  }, [containerRef, measure, idsKey]);

  const scrollTo = useCallback(
    (id: T) => {
      const container = containerRef.current;
      const target = container?.querySelector<HTMLElement>(`[${attribute}="${id}"]`);
      setActive(id);
      if (!container || !target) return;
      lockUntilRef.current = Date.now() + 700;
      const top =
        target.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
      const reduceMotion =
        typeof window.matchMedia === "function" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const nextTop = Math.max(0, top - 4);
      if (typeof container.scrollTo === "function") {
        container.scrollTo({ top: nextTop, behavior: reduceMotion ? "auto" : "smooth" });
      } else {
        container.scrollTop = nextTop;
      }
    },
    [attribute, containerRef],
  );

  return { active, scrollTo };
}
