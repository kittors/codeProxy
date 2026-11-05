import { useRef, type PropsWithChildren, type RefObject } from "react";
import { useScrollFade } from "../hooks/useScrollFade";

/**
 * 表格的内容层：表头背衬、固定列背衬、滚动区和边缘阴影都在这一层里，自绘的横竖滚动条在外面。
 *
 * 它是表格上下渐隐的遮罩宿主（useScrollFade 的 host）。遮罩不能直接挂在滚动区上：mask 会让
 * 滚动区自成层叠上下文，滚动区里的 sticky 表头文字（z-50）就被关进去，压到滚动区外面的表头背衬
 * （z-40）下面。挂在这一层上，里面原有的层叠关系不变；滚动条在这一层外面，不会被淡掉。
 * 始终 isolate：有没有遮罩，这一层和滚动条的上下关系都一样，不会随行数变化而翻转。
 *
 * 表头背衬是渐隐的钉住区（data-scroll-fade-pin）：行从表头下沿开始淡出，表头本身不淡。
 * 自然流（naturalFlow）的表格不在内部滚动，这一层用 contents，不产生盒子。
 */
export function TableContentFrame({
  scrollerRef,
  naturalFlow,
  headerPlate,
  children,
}: PropsWithChildren<{
  scrollerRef: RefObject<HTMLDivElement | null>;
  naturalFlow: boolean;
  /** 表头背衬的尺寸；空表、自然流不画。 */
  headerPlate: { width: number; height: number; squareRight: boolean } | null;
}>) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  useScrollFade({ scroller: scrollerRef, host: frameRef, enabled: !naturalFlow });
  return (
    <div
      ref={frameRef}
      data-vt-content-frame
      className={
        naturalFlow ? "contents" : "relative isolate col-start-1 row-start-1 min-h-0 min-w-0"
      }
    >
      {/* Viewport-fixed header plate: only as wide as the table viewport, not content.
          Column labels still live in thead and scroll horizontally with body cells. */}
      {headerPlate ? (
        <div
          data-vt-header-chrome
          data-scroll-fade-pin="top"
          aria-hidden="true"
          className={`pointer-events-none absolute left-0 top-0 z-40 ${
            headerPlate.squareRight ? "rounded-l-xl" : "rounded-xl"
          } bg-slate-100 dark:bg-neutral-800`}
          style={{
            width: headerPlate.width || "100%",
            height: headerPlate.height > 0 ? headerPlate.height : "2.75rem",
          }}
        />
      ) : null}
      {children}
    </div>
  );
}
