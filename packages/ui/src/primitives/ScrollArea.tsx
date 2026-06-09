import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type PointerEvent as ReactPointerEvent,
  type PropsWithChildren,
} from "react";

type ScrollbarVisibility = "hover" | "always";

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
  contentClassName,
  scrollbarVisibility = "hover",
  scrollbarTrackInset = 8,
  ...divProps
}: PropsWithChildren<
  {
    viewportClassName?: string;
    contentClassName?: string;
    scrollbarVisibility?: ScrollbarVisibility;
    scrollbarTrackInset?: number;
  } & HTMLAttributes<HTMLDivElement>
>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<DragState | null>(null);
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
  }, [measure]);

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
            "pointer-events-auto absolute bottom-0 right-0 top-0 z-30 w-2",
            visibilityClasses,
          )}
        >
          <div
            className="absolute left-0 right-0 rounded-full bg-slate-200/40 dark:bg-white/10"
            style={{ top: Math.max(0, scrollbarTrackInset), bottom: Math.max(0, scrollbarTrackInset) }}
          />
          <div
            role="presentation"
            className="pointer-events-auto absolute left-0 right-0 cursor-pointer rounded-full bg-slate-500/40 transition-colors hover:bg-slate-500/70 dark:bg-white/25 dark:hover:bg-white/50"
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
