import { forwardRef, useCallback, type HTMLAttributes, type UIEvent } from "react";
import { useScrollFade } from "../hooks/useScrollFade";

/**
 * 带上下（或左右）渐隐的滚动容器：`useScrollFade` 的组件形式，直接替换原来的
 * `<div className="overflow-y-auto">`。只在内容确实溢出时才渐隐，到顶 / 到底就收起。
 *
 * 不要用在：外面有边框 / 底色的「盒子」本身（渐隐会把盒子的边一起淡掉——把它放在盒子里面）；
 * 含 sticky 表头或贴底浮动条的整页滚动区（它们会被一起淡掉）。
 */
export const ScrollFade = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & {
    /** 渐隐长度（px）。 */
    fadeSize?: number;
    axis?: "x" | "y";
  }
>(function ScrollFade({ fadeSize = 28, axis = "y", className, style, onScroll, ...rest }, forwardedRef) {
  const fade = useScrollFade<HTMLDivElement>({ size: fadeSize, axis });
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      fade.ref.current = node;
      if (typeof forwardedRef === "function") forwardedRef(node);
      else if (forwardedRef) forwardedRef.current = node;
    },
    [fade.ref, forwardedRef],
  );
  return (
    <div
      {...rest}
      ref={setRef}
      onScroll={(event: UIEvent<HTMLDivElement>) => {
        fade.onScroll();
        onScroll?.(event);
      }}
      style={fade.style ? { ...style, ...fade.style } : style}
      className={[className, fade.className].filter(Boolean).join(" ")}
    />
  );
});
