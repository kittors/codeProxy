import { useEffect, useRef } from "react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import ReactECharts from "echarts-for-react";
import { useTheme } from "../theme/ThemeProvider";

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
}: EChartProps) {
  const {
    state: { mode },
  } = useTheme();

  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<any>(null);
  const instanceRef = useRef<any>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastSizeRef = useRef<{ width: number; height: number } | null>(null);
  const didResizeOnceRef = useRef(false);

  const requestResize = (width: number, height: number) => {
    const container = containerRef.current;
    if (!container) return;

    lastSizeRef.current = { width, height };
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
    const element = containerRef.current;
    if (!element) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      requestResize(entry.contentRect.width, entry.contentRect.height);
    });

    observer.observe(element);
    return () => {
      observer.disconnect();
      if (rafIdRef.current !== null) {
        window.cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
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
      <ReactECharts
        ref={chartRef}
        option={option}
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
    </div>
  );
}
