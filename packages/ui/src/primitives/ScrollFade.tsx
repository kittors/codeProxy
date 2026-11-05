import { forwardRef, useCallback, type HTMLAttributes } from "react";
import { useScrollFade } from "../hooks/useScrollFade";

/**
 * 带上下（或左右）渐隐的滚动容器：`useScrollFade` 的组件形式，直接替换原来的
 * `<div className="overflow-y-auto">`。只在内容确实溢出时才渐隐，到顶 / 到底那一侧不淡。
 *
 * 不要用在：外面有底色 / 圆角的「盒子」本身（渐隐会把盒子的底色和边一起淡掉——把它放在盒子里面）。
 * 里面的 sticky 页签栏、表头、贴底操作条加 `data-scroll-fade-pin="top" | "bottom"`，否则会被一起淡掉。
 */
export const ScrollFade = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    /** 渐隐长度上限（px）。 */
    fadeSize?: number;
    axis?: "x" | "y";
  }
>(function ScrollFade({ fadeSize = 28, axis = "y", ...rest }, forwardedRef) {
  const fade = useScrollFade<HTMLDivElement>({ size: fadeSize, axis });
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      fade.ref.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [fade.ref, forwardedRef],
  );
  return <div {...rest} ref={setRef} />;
});
