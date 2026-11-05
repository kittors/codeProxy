import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { calculateScrollbarThumbs } from "./scrollMetrics";

type ThumbPointerHandler = (event: ReactPointerEvent<HTMLDivElement>) => void;
type ScrollbarThumbs = ReturnType<typeof calculateScrollbarThumbs>;

/**
 * DataTable 自己画的两条滚动条（原生滚动条在 table-scrollbar 里隐藏了）。平时透明，
 * 鼠标进表格或焦点在表格里才显出来。
 *
 * 横向那条贴着表格框的底边：整页列表（fill）的框占满剩余高度，底边就在分页条上方，
 * 不随行数移动；按行收高的表，底边就在最后一行下面。滚动内容为它留了一条 pb-3.5 的通道，
 * 所以它不会压在最后一行上。
 */
export function TableScrollbars({
  vThumb,
  hThumb,
  headerHeight,
  verticalThumbRef,
  horizontalThumbRef,
  onThumbPointerDown,
  onThumbPointerMove,
  onThumbPointerUp,
}: ScrollbarThumbs & {
  headerHeight: number;
  verticalThumbRef: RefObject<HTMLDivElement | null>;
  horizontalThumbRef: RefObject<HTMLDivElement | null>;
  onThumbPointerDown: (axis: "x" | "y", event: ReactPointerEvent<HTMLDivElement>) => void;
  onThumbPointerMove: ThumbPointerHandler;
  onThumbPointerUp: ThumbPointerHandler;
}) {
  return (
    <>
      {vThumb ? (
        <div
          data-vt-scrollbar-gutter
          className="relative z-30 col-start-2 row-start-1 h-full w-3 justify-self-end"
        >
          <div
            data-vt-header-gutter
            className="absolute inset-x-0 top-0 rounded-r-xl bg-slate-100 dark:bg-neutral-800"
            style={{ height: headerHeight }}
          />
          <div
            data-vt-scrollbar="y"
            className="group/scrollbar pointer-events-auto absolute right-0 z-30 w-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
            style={{ top: headerHeight + 8, bottom: 8 }}
          >
            <div
              ref={verticalThumbRef}
              role="presentation"
              className="pointer-events-auto absolute right-0 w-1.5 cursor-pointer rounded-full bg-[#C7C7C7] transition-[width] duration-150 ease-out hover:w-2 active:w-2 group-hover/scrollbar:w-2 dark:bg-white/25"
              style={{ top: vThumb.top, height: vThumb.height }}
              onPointerDown={(e) => onThumbPointerDown("y", e)}
              onPointerMove={onThumbPointerMove}
              onPointerUp={onThumbPointerUp}
              onPointerCancel={onThumbPointerUp}
            />
          </div>
        </div>
      ) : null}

      {hThumb ? (
        <div
          data-vt-scrollbar="x"
          className={`group/scrollbar pointer-events-auto absolute bottom-1 left-2 ${vThumb ? "right-5" : "right-2"} z-30 h-2 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100`}
        >
          <div
            ref={horizontalThumbRef}
            role="presentation"
            className="pointer-events-auto absolute bottom-0 h-1.5 cursor-pointer rounded-full bg-[#C7C7C7] transition-[height] duration-150 ease-out hover:h-2 active:h-2 group-hover/scrollbar:h-2 dark:bg-white/25"
            style={{ left: hThumb.left, width: hThumb.width }}
            onPointerDown={(e) => onThumbPointerDown("x", e)}
            onPointerMove={onThumbPointerMove}
            onPointerUp={onThumbPointerUp}
            onPointerCancel={onThumbPointerUp}
          />
        </div>
      ) : null}
    </>
  );
}
