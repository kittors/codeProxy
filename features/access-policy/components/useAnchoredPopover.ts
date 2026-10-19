import { useCallback, useEffect, useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

const MAX_HEIGHT = 300;
const GAP = 4;

/**
 * 把建议列表固定定位在输入框下方（空间不够时翻到上方）。列表渲染在 body 上：编辑器常在
 * 弹窗的滚动区里，绝对定位的浮层会被滚动容器裁掉。滚动监听用捕获阶段，弹窗内部滚动也能跟上。
 */
export function useAnchoredPopover(anchorRef: RefObject<HTMLElement | null>, open: boolean) {
  const [style, setStyle] = useState<CSSProperties>({});

  const update = useCallback(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom - GAP;
    const above = rect.top - GAP;
    const flip = below < Math.min(MAX_HEIGHT, 200) && above > below;
    setStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      zIndex: 99999,
      ...(flip
        ? { bottom: window.innerHeight - rect.top + GAP, maxHeight: Math.min(MAX_HEIGHT, above) }
        : { top: rect.bottom + GAP, maxHeight: Math.min(MAX_HEIGHT, below) }),
    });
  }, [anchorRef]);

  useLayoutEffect(() => {
    if (open) update();
  }, [open, update]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, update]);

  return { style, update };
}
