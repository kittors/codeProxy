import { useEffect, useMemo, useRef, useState } from "react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import ReactECharts from "echarts-for-react";
import { useTheme } from "../theme/ThemeProvider";

/**
 * 图表是 canvas 画出来的，读不到 CSS 的字体栈，echarts 默认退回系统 sans-serif——
 * 于是同一屏里图表文字和界面文字是两套字形。这里把 `--font-sans` 取出来喂给顶层
 * textStyle，凡是没单独指定 fontFamily 的图表组件都会继承它。
 */
const readSansFontFamily = (): string | undefined => {
  if (typeof document === "undefined") return undefined;
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-sans").trim();
  return value || undefined;
};

export type EChartEvents = Record<string, (params: unknown, chart: unknown) => void>;

export type EChartProps = {
  option: ECBasicOption;
  className?: string;
  onEvents?: EChartEvents;
  notMerge?: boolean;
  replaceMerge?: string | string[];
  overflowVisible?: boolean;
  loading?: boolean;
  loadingText?: string;
  initialAnimationGuardMs?: number;
};

export function EChartRenderer({
  option,
  className,
  onEvents,
  notMerge = false,
  replaceMerge,
  overflowVisible = false,
  loading = false,
  loadingText = "",
  initialAnimationGuardMs = 0,
}: EChartProps) {
  const {
    state: { mode },
  } = useTheme();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const instanceRef = useRef<any>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const pendingGuardedResizeRef = useRef<{ width: number; height: number } | null>(null);
  const guardedResizeTimerRef = useRef<number | null>(null);
  const initialAnimationGuardUntilRef = useRef(0);
  const didResizeOnceRef = useRef(false);
  const [hasMeasuredSize, setHasMeasuredSize] = useState(false);
  const [fontRevision, setFontRevision] = useState(0);

  /*
   * webfont 到位之前 canvas 已经用回退字体把文字画完了，而且 echarts 不会自己重画。
   * 等 document.fonts.ready 之后把版本号 +1，下面的 useMemo 会产出一个新的 option 引用，
   * 逼 echarts 重新排一次文字——否则首次访问会一直停在系统字体上，直到下次交互重绘。
   */
  useEffect(() => {
    const fonts = document.fonts;
    if (!fonts || fonts.status === "loaded") return;
    let cancelled = false;
    fonts.ready.then(() => {
      if (!cancelled) setFontRevision((current) => current + 1);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const styledOption = useMemo(() => {
    const fontFamily = readSansFontFamily();
    if (!fontFamily) return option;
    // 调用方自己写的 textStyle 优先，这里只补默认字体。
    const ownTextStyle = (option as { textStyle?: Record<string, unknown> }).textStyle;
    return { ...option, textStyle: { fontFamily, ...ownTextStyle } } as ECBasicOption;
    // fontRevision 只用来在字体就绪后触发重算，不参与 option 内容。
  }, [option, fontRevision]);

  const now = () => Date.now();

  const requestResize = (width: number, height: number) => {
    const container = containerRef.current;
    if (!container) return;

    lastSizeRef.current = { width, height };
    if (width > 0 && height > 0) {
      setHasMeasuredSize(true);
    }

    const guardUntil = initialAnimationGuardUntilRef.current;
    if (guardUntil > 0) {
      const remainingMs = guardUntil - now();
      if (remainingMs > 0) {
        pendingGuardedResizeRef.current = { width, height };
        if (guardedResizeTimerRef.current === null) {
          guardedResizeTimerRef.current = window.setTimeout(() => {
            guardedResizeTimerRef.current = null;
            const size = pendingGuardedResizeRef.current ?? lastSizeRef.current;
            pendingGuardedResizeRef.current = null;
            if (size) requestResize(size.width, size.height);
          }, remainingMs);
        }
        return;
      }
      initialAnimationGuardUntilRef.current = 0;
    }

    if (rafIdRef.current !== null) return;

    rafIdRef.current = window.requestAnimationFrame(() => {
      rafIdRef.current = null;

      const instance = instanceRef.current ?? chartRef.current?.getEchartsInstance?.();
      if (!instance) return;

      try {
        const containerWidth = container.clientWidth;
        const containerHeight = container.clientHeight;
        const chartWidth = instance.getWidth?.();
        const chartHeight = instance.getHeight?.();

        if (
          didResizeOnceRef.current &&
          typeof chartWidth === "number" &&
          typeof chartHeight === "number" &&
          Math.abs(chartWidth - containerWidth) < 1 &&
          Math.abs(chartHeight - containerHeight) < 1
        ) {
          return;
        }

        instance.resize?.({
          width: containerWidth,
          height: containerHeight,
          animation: { duration: 0 },
        });
        didResizeOnceRef.current = true;
      } catch {
        // 忽略 resize 异常（例如实例尚未就绪）
      }
    });
  };

  useEffect(() => {
    const guardMs = Math.max(0, initialAnimationGuardMs);
    if (guardMs > 0) {
      initialAnimationGuardUntilRef.current = now() + guardMs;
      pendingGuardedResizeRef.current = null;
      if (guardedResizeTimerRef.current !== null) {
        window.clearTimeout(guardedResizeTimerRef.current);
        guardedResizeTimerRef.current = null;
      }
      return;
    }

    initialAnimationGuardUntilRef.current = 0;
    if (guardedResizeTimerRef.current === null) return;

    window.clearTimeout(guardedResizeTimerRef.current);
    guardedResizeTimerRef.current = null;
    const size = pendingGuardedResizeRef.current ?? lastSizeRef.current;
    pendingGuardedResizeRef.current = null;
    if (size) requestResize(size.width, size.height);
  }, [initialAnimationGuardMs]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      requestResize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(element);
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (width > 0 && height > 0) {
      requestResize(width, height);
    }
    return () => {
      observer.disconnect();
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      if (guardedResizeTimerRef.current !== null) {
        window.clearTimeout(guardedResizeTimerRef.current);
        guardedResizeTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const handler = () => {
      const container = containerRef.current;
      if (!container) return;
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) requestResize(width, height);
    };

    window.addEventListener("resize", handler, { passive: true });
    window.addEventListener("orientationchange", handler, { passive: true });

    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", handler, { passive: true });
    viewport?.addEventListener("scroll", handler, { passive: true });

    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
      viewport?.removeEventListener("resize", handler);
      viewport?.removeEventListener("scroll", handler);
    };
  }, []);

  useEffect(() => {
    instanceRef.current = null;
    didResizeOnceRef.current = false;
    lastSizeRef.current = null;
  }, [mode]);

  useEffect(() => {
    const instance = instanceRef.current ?? chartRef.current?.getEchartsInstance?.();
    if (!instance) return;
    try {
      if (loading) {
        instance.showLoading?.({
          text: loadingText,
          color: "#2563eb",
          textColor: mode === "dark" ? "#e2e8f0" : "#475569",
          maskColor: mode === "dark" ? "rgba(15, 23, 42, 0.48)" : "rgba(248, 250, 252, 0.64)",
          zlevel: 1,
        });
      } else {
        instance.hideLoading?.();
      }
    } catch {
      // ignore
    }
  }, [loading, loadingText, mode]);

  return (
    <div
      ref={containerRef}
      className={[
        "relative w-full min-w-0",
        overflowVisible ? "overflow-visible" : "overflow-hidden",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {hasMeasuredSize ? (
        <ReactECharts
          ref={chartRef}
          option={styledOption}
          theme={mode === "dark" ? "dark" : undefined}
          style={{ height: "100%", width: "100%" }}
          showLoading={loading}
          loadingOption={{
            text: loadingText,
            color: "#2563eb",
            textColor: mode === "dark" ? "#e2e8f0" : "#475569",
            maskColor: mode === "dark" ? "rgba(15, 23, 42, 0.48)" : "rgba(248, 250, 252, 0.64)",
            zlevel: 1,
          }}
          notMerge={notMerge}
          replaceMerge={replaceMerge}
          autoResize={false}
          className="h-full w-full"
          onEvents={onEvents}
          onChartReady={(instance: any) => {
            instanceRef.current = instance;

            try {
              if (!loading) {
                instance?.hideLoading?.();
              }
            } catch {
              // ignore
            }

            const container = containerRef.current;
            if (!container) return;
            const width = container.clientWidth;
            const height = container.clientHeight;
            if (width > 0 && height > 0) {
              window.setTimeout(() => {
                requestResize(container.clientWidth, container.clientHeight);
              }, 60);
              window.setTimeout(() => {
                requestResize(container.clientWidth, container.clientHeight);
              }, 240);
              window.setTimeout(() => {
                requestResize(container.clientWidth, container.clientHeight);
              }, 500);
            } else {
              const size = lastSizeRef.current;
              if (!size) return;
              requestResize(size.width, size.height);
            }
          }}
        />
      ) : null}
    </div>
  );
}
