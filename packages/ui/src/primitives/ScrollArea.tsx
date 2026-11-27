import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type HTMLAttributes,
  type PropsWithChildren,
} from "react";
import { createScrollArea } from "satin-ui";
import { useScrollFade } from "../hooks/useScrollFade";
import { cn } from "../utils/selectStyles";

type ScrollbarVisibility = "hover" | "track-hover" | "always";

const BAR_MODE_MAP: Record<ScrollbarVisibility, "hover" | "auto" | "always"> = {
  hover: "hover",
  "track-hover": "auto",
  always: "always",
};

/**
 * 滚动区域：底层委托 Satin 原生 `scrollArea` 引擎（合成线程滚动时间线 + 悬浮细滚动条 + 边缘渐隐），
 * 同时透传 `data-scroll-area-*` 与 `useScrollFade` 兼容业务测试与钉住表头渐隐契约。
 */
export function ScrollArea({
  children,
  className,
  viewportClassName,
  viewportStyle,
  contentClassName,
  scrollbarVisibility = "hover",
  scrollbarTrackInset = 8,
  edgeFade = true,
  ...divProps
}: PropsWithChildren<
  {
    viewportClassName?: string;
    viewportStyle?: CSSProperties;
    contentClassName?: string;
    scrollbarVisibility?: ScrollbarVisibility;
    scrollbarTrackInset?: number;
    edgeFade?: boolean | number;
  } & HTMLAttributes<HTMLDivElement>
>) {
  const fadeSize = edgeFade === true ? 24 : typeof edgeFade === "number" ? edgeFade : 0;
  const fade = useScrollFade<HTMLDivElement>({ enabled: fadeSize > 0, size: fadeSize });
  const viewportRef = fade.ref;
  const contentRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !viewport.parentElement) return undefined;
    const api = createScrollArea(viewport, {
      // 渐隐仍交由 useScrollFade 处理以完整支持 data-scroll-fade-pin 钉住表头与 data-scroll-more-* 属性
      fade: "none",
      bar: BAR_MODE_MAP[scrollbarVisibility],
      barInset: Math.max(1, Math.min(4, Math.round(scrollbarTrackInset / 2))),
      overscroll: "contain",
    });
    api.box.classList.add("h-full", "min-h-0", "min-w-0");
    return () => {
      api.destroy();
    };
  }, [scrollbarTrackInset, scrollbarVisibility, viewportRef]);

  return (
    <div
      {...divProps}
      data-scroll-area-root
      className={cn("group relative isolate min-h-0 min-w-0", className)}
    >
      <div
        ref={viewportRef}
        tabIndex={0}
        data-scroll-area-viewport
        data-scrollbar-visibility={scrollbarVisibility}
        style={viewportStyle}
        className={cn("h-full min-h-0 table-scrollbar overflow-auto overscroll-contain", viewportClassName)}
      >
        <div ref={contentRef} data-scroll-area-content className={contentClassName}>
          {children}
        </div>
      </div>
    </div>
  );
}
