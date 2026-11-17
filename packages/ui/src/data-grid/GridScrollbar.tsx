import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";

/**
 * 表格自己画的滚动条（原生滚动条在 DataGrid.css 里藏掉了）。
 *
 * - 横向：放在表体下方自己的一条通道里，不压在最后一行上；轨道夹在左右冻结区之间，
 *   一眼就能看出「冻结列不动、中间这段在滚」。有横向溢出时常驻（淡），悬停变粗变深——
 *   旧表格的横向滚动条平时透明，很多人不知道表格能左右滚。
 * - 纵向：叠在表体右侧、从表头下沿开始；平时隐藏，悬停表格或正在滚动时出现。
 * - 拖动滑块按比例滚动；点轨道空白处翻一屏。滚动时直接改 transform，不经过 React 渲染。
 * 滑块对读屏隐藏：视口本身可以用滚轮、触控板和行的键盘焦点滚动，这两条只是视觉指示。
 */

const MIN_THUMB = 28;

interface GridScrollbarProps {
  axis: "x" | "y";
  viewportRef: RefObject<HTMLDivElement | null>;
  /** 冻结区在这个方向上占掉的长度（横向是左右冻结列之和），不计入可滚动比例。 */
  pinnedSize?: number;
  className?: string;
  style?: CSSProperties;
}

export function GridScrollbar({
  axis,
  viewportRef,
  pinnedSize = 0,
  className,
  style,
}: GridScrollbarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const [thumb, setThumb] = useState({ size: 0, track: 0, visible: false });
  const thumbStateRef = useRef(thumb);
  thumbStateRef.current = thumb;
  const draggingRef = useRef(false);
  const [dragging, setDragging] = useState(false);

  const read = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return null;
    return axis === "x"
      ? {
          position: viewport.scrollLeft,
          content: viewport.scrollWidth,
          visible: viewport.clientWidth,
        }
      : {
          position: viewport.scrollTop,
          content: viewport.scrollHeight,
          visible: viewport.clientHeight,
        };
  }, [axis, viewportRef]);

  const place = useCallback(() => {
    const metrics = read();
    const element = thumbRef.current;
    const { size, track } = thumbStateRef.current;
    if (!metrics || !element || size <= 0) return;
    const range = metrics.content - metrics.visible;
    const ratio = range > 0 ? Math.min(1, Math.max(0, metrics.position / range)) : 0;
    const offset = ratio * Math.max(0, track - size);
    element.style.transform = axis === "x" ? `translateX(${offset}px)` : `translateY(${offset}px)`;
  }, [axis, read]);

  const measure = useCallback(() => {
    const metrics = read();
    const track = trackRef.current;
    if (!metrics || !track) return;
    const trackLength = axis === "x" ? track.clientWidth : track.clientHeight;
    const content = Math.max(1, metrics.content - pinnedSize);
    const visibleLength = Math.max(0, metrics.visible - pinnedSize);
    const overflow = metrics.content - metrics.visible > 1;
    const size = overflow
      ? Math.min(trackLength, Math.max(MIN_THUMB, (visibleLength / content) * trackLength))
      : 0;
    setThumb((prev) =>
      prev.size === size && prev.track === trackLength && prev.visible === overflow
        ? prev
        : { size, track: trackLength, visible: overflow },
    );
  }, [axis, pinnedSize, read]);

  useLayoutEffect(() => {
    place();
  }, [place, thumb]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const track = trackRef.current;
    if (!viewport || !track) return undefined;
    measure();
    const onScroll = () => place();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(track);
    const content = viewport.firstElementChild;
    if (content) observer?.observe(content);
    return () => {
      viewport.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [measure, place, viewportRef]);

  const onThumbPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const metrics = read();
    if (!viewport || !metrics || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget;
    target.setPointerCapture?.(event.pointerId);
    const start = axis === "x" ? event.clientX : event.clientY;
    const startPosition = metrics.position;
    const { size, track } = thumbStateRef.current;
    const range = metrics.content - metrics.visible;
    const perPixel = range / Math.max(1, track - size);
    draggingRef.current = true;
    setDragging(true);
    const onMove = (moveEvent: PointerEvent) => {
      const delta = (axis === "x" ? moveEvent.clientX : moveEvent.clientY) - start;
      if (axis === "x") viewport.scrollLeft = startPosition + delta * perPixel;
      else viewport.scrollTop = startPosition + delta * perPixel;
    };
    const onUp = () => {
      draggingRef.current = false;
      setDragging(false);
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
    };
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  };

  const onTrackPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const viewport = viewportRef.current;
    const thumbElement = thumbRef.current;
    if (!viewport || !thumbElement || event.target !== event.currentTarget) return;
    const rect = thumbElement.getBoundingClientRect();
    const before = axis === "x" ? event.clientX < rect.left : event.clientY < rect.top;
    const page = (axis === "x" ? viewport.clientWidth - pinnedSize : viewport.clientHeight) * 0.85;
    viewport.scrollBy({
      [axis === "x" ? "left" : "top"]: before ? -page : page,
      behavior: "smooth",
    });
  };

  const horizontal = axis === "x";
  return (
    <div
      ref={trackRef}
      aria-hidden="true"
      data-grid-scrollbar={axis}
      data-visible={thumb.visible ? "true" : "false"}
      data-dragging={dragging ? "true" : undefined}
      onPointerDown={onTrackPointerDown}
      className={[
        "group/scrollbar absolute select-none",
        horizontal ? "h-3" : "w-3",
        thumb.visible ? "" : "pointer-events-none opacity-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      <div
        ref={thumbRef}
        onPointerDown={onThumbPointerDown}
        className={[
          "absolute rounded-full bg-ink/20 transition-[background-color,width,height] duration-150 ease-soft dark:bg-white/22",
          "hover:bg-ink/35 group-hover/scrollbar:bg-ink/30 dark:hover:bg-white/38 dark:group-hover/scrollbar:bg-white/32",
          "data-[dragging=true]:bg-ink/45 dark:data-[dragging=true]:bg-white/45",
          horizontal
            ? "bottom-[3px] left-0 h-1.5 group-hover/scrollbar:h-2 group-data-[dragging=true]/scrollbar:h-2"
            : "right-[3px] top-0 w-1.5 group-hover/scrollbar:w-2 group-data-[dragging=true]/scrollbar:w-2",
        ].join(" ")}
        data-dragging={dragging ? "true" : undefined}
        style={horizontal ? { width: thumb.size } : { height: thumb.size }}
      />
    </div>
  );
}
