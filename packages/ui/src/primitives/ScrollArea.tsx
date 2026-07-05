import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
} from "react";

type ScrollbarVisibility = "hover" | "track-hover" | "always";

type ScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

type DragState = {
  pointerId: number;
  startY: number;
  startScrollTop: number;
  trackLength: number;
  thumbHeight: number;
  scrollRange: number;
};

const cn = (...classes: Array<string | false | null | undefined>) =>
  classes.filter(Boolean).join(" ");

export function ScrollArea({
  children,
  className,
  viewportClassName,
  viewportStyle,
  contentClassName,
  scrollbarVisibility = "hover",
  scrollbarTrackInset = 8,
  ...divProps
}: PropsWithChildren<
  {
    viewportClassName?: string;
    viewportStyle?: CSSProperties;
    contentClassName?: string;
    scrollbarVisibility?: ScrollbarVisibility;
    scrollbarTrackInset?: number;
  } & HTMLAttributes<HTMLDivElement>
>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const scrollHideTimerRef = useRef<number | null>(null);
  const [scrollbarActive, setScrollbarActive] = useState(false);
  const [metrics, setMetrics] = useState<ScrollMetrics>({
    clientHeight: 0,
    scrollHeight: 0,
    scrollTop: 0,
  });

  const measure = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    setMetrics({
      clientHeight: viewport.clientHeight,
      scrollHeight: viewport.scrollHeight,
      scrollTop: viewport.scrollTop,
    });
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    if (contentRef.current) {
      observer.observe(contentRef.current);
    }

    const raf = window.requestAnimationFrame(measure);
    window.addEventListener("resize", measure);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, [measure]);

  useEffect(() => {
    measure();
  }, [children, measure]);

  useEffect(() => {
    return () => {
      if (scrollHideTimerRef.current !== null) {
        window.clearTimeout(scrollHideTimerRef.current);
      }
    };
  }, []);

  const thumb = useMemo(() => {
    const trackInset = Math.max(0, scrollbarTrackInset);
    const hasVerticalOverflow = metrics.scrollHeight > metrics.clientHeight + 1;
    if (!hasVerticalOverflow) return null;

    const trackLength = Math.max(0, metrics.clientHeight - trackInset * 2);
    const viewport = Math.max(1, metrics.clientHeight);
    const content = Math.max(viewport, metrics.scrollHeight);
    const height = Math.max(28, Math.round((viewport / content) * trackLength));
    const maxThumbOffset = Math.max(0, trackLength - height);
    const scrollRange = Math.max(1, metrics.scrollHeight - metrics.clientHeight);
    const top = Math.min(
      maxThumbOffset,
      Math.max(0, Math.round((metrics.scrollTop / scrollRange) * maxThumbOffset)),
    );

    return {
      top,
      height,
      trackLength,
      scrollRange,
    };
  }, [metrics, scrollbarTrackInset]);

  const handleScroll = useCallback(() => {
    measure();
    if (scrollbarVisibility !== "track-hover") return;
    setScrollbarActive(true);
    if (scrollHideTimerRef.current !== null) {
      window.clearTimeout(scrollHideTimerRef.current);
    }
    scrollHideTimerRef.current = window.setTimeout(() => {
      setScrollbarActive(false);
      scrollHideTimerRef.current = null;
    }, 900);
  }, [measure, scrollbarVisibility]);

  const handleThumbPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!thumb) return;
      const viewport = viewportRef.current;
      if (!viewport) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragStateRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY,
        startScrollTop: viewport.scrollTop,
        trackLength: thumb.trackLength,
        thumbHeight: thumb.height,
        scrollRange: thumb.scrollRange,
      };
    },
    [thumb],
  );

  const handleThumbPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const state = dragStateRef.current;
      const viewport = viewportRef.current;
      if (!state || !viewport || state.pointerId !== event.pointerId) return;

      const maxThumbOffset = Math.max(1, state.trackLength - state.thumbHeight);
      const delta = event.clientY - state.startY;
      viewport.scrollTop = state.startScrollTop + (delta / maxThumbOffset) * state.scrollRange;
      measure();
    },
    [measure],
  );

  const handleThumbPointerUp = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    dragStateRef.current = null;
  }, []);

  const visibilityClasses =
    scrollbarVisibility === "always"
      ? "opacity-100"
      : scrollbarVisibility === "track-hover"
        ? scrollbarActive
          ? "opacity-100 transition-opacity hover:opacity-100 group-focus-within:opacity-100"
          : "opacity-0 transition-opacity hover:opacity-100 group-focus-within:opacity-100"
      : "opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100";

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
        onScroll={handleScroll}
        style={viewportStyle}
        className={cn(
          "h-full min-h-0 table-scrollbar overflow-auto overscroll-contain",
          viewportClassName,
        )}
      >
        <div ref={contentRef} data-scroll-area-content className={contentClassName}>
          {children}
        </div>
      </div>

      {thumb ? (
        <div
          data-scroll-area-scrollbar="y"
          className={cn(
            "group/scrollbar pointer-events-auto absolute bottom-0 right-0 top-0 z-30 w-2",
            visibilityClasses,
          )}
        >
          <div
            role="presentation"
            className="pointer-events-auto absolute right-0 w-1.5 cursor-pointer rounded-full bg-[#C7C7C7] transition-[width] duration-150 ease-out hover:w-2 active:w-2 group-hover/scrollbar:w-2"
            style={{ top: thumb.top + Math.max(0, scrollbarTrackInset), height: thumb.height }}
            onPointerDown={handleThumbPointerDown}
            onPointerMove={handleThumbPointerMove}
            onPointerUp={handleThumbPointerUp}
            onPointerCancel={handleThumbPointerUp}
          />
        </div>
      ) : null}
    </div>
  );
}
