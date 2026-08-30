import type { ReactElement, ReactNode } from "react";
import { Trans } from "react-i18next";
import type { ECBasicOption } from "echarts/types/dist/shared";
import type { DashboardTrendPoint } from "@code-proxy/api-client/endpoints/usage";
import {
  formatCompactNumber,
  formatCompactUsd,
  formatFixedNumber,
  formatUsd,
  getCompactNumberParts,
  type CompactNumberOptions,
} from "@code-proxy/domain";
import { HoverTooltip } from "@code-proxy/ui";
import { AnimatedNumber } from "@code-proxy/ui";

export const DASHBOARD_COMPACT_OPTIONS = {
  threshold: 10_000,
  maximumFractionDigits: 1,
  standardMaximumFractionDigits: 0,
} satisfies CompactNumberOptions;

export const DASHBOARD_COST_COMPACT_OPTIONS = {
  threshold: 10_000,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  standardMinimumFractionDigits: 4,
  standardMaximumFractionDigits: 4,
} satisfies CompactNumberOptions;

export const formatDashboardNumber = (value: number) =>
  formatCompactNumber(value, DASHBOARD_COMPACT_OPTIONS);
export const formatDashboardTooltipNumber = (value: number) =>
  formatFixedNumber(value, { fractionDigits: 2 });
export const formatDashboardCost = (value: number) =>
  formatCompactUsd(value, DASHBOARD_COST_COMPACT_OPTIONS);
export const formatDashboardTooltipCost = (value: number) =>
  formatUsd(value, { fractionDigits: 4 });

export function DashboardMetricValue({
  value,
  variant = "number",
  animated = false,
  className,
}: {
  value: number;
  variant?: "number" | "currency";
  animated?: boolean;
  className?: string;
}) {
  const compactOptions =
    variant === "currency" ? DASHBOARD_COST_COMPACT_OPTIONS : DASHBOARD_COMPACT_OPTIONS;
  const format = variant === "currency" ? formatDashboardCost : formatDashboardNumber;
  const tooltip =
    variant === "currency"
      ? formatDashboardTooltipCost(value)
      : formatDashboardTooltipNumber(value);
  const compact = getCompactNumberParts(value, compactOptions).compact;
  const content = animated ? (
    <AnimatedNumber value={value} format={format} className={className} />
  ) : (
    <span className={["inline-block tabular-nums", className].filter(Boolean).join(" ")}>
      {format(value)}
    </span>
  );

  return (
    <HoverTooltip
      content={tooltip}
      disabled={!compact}
      placement="top"
      className={compact ? "cursor-help" : undefined}
    >
      {content}
    </HoverTooltip>
  );
}

export const renderDashboardHint = (
  i18nKey: string,
  first: ReactElement,
  second: ReactElement,
): ReactNode => {
  return <Trans i18nKey={i18nKey} components={[first, second]} />;
};

export const throughputNumberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});
export const formatThroughputValue = (value: number) =>
  throughputNumberFormatter.format(Number.isFinite(value) ? value : 0);
export const formatRate = (rate: number) => `${rate.toFixed(2)}%`;

export const formatThroughputTooltip = (params: any) => {
  const items = Array.isArray(params) ? params : [params];
  const title = items[0]?.axisValueLabel ?? "";
  const lines = items.map(
    (item) =>
      `${item?.marker ?? ""}${item?.seriesName ?? ""} ${formatThroughputValue(Number(item?.data ?? 0))}`,
  );
  return [title, ...lines].join("<br/>");
};

export function createSparklineOption(points: DashboardTrendPoint[], color: string): ECBasicOption {
  const labels = points.map((point) => point.label);
  const values = points.map((point) => point.value);

  return {
    animationDuration: 320,
    animationDurationUpdate: 240,
    grid: { left: 0, right: 0, top: 6, bottom: 0 },
    tooltip: {
      trigger: "axis",
      renderMode: "html",
      appendToBody: true,
      confine: true,
      borderWidth: 0,
      backgroundColor: "rgba(15, 23, 42, 0.9)",
      textStyle: { color: "#fff", fontSize: 12 },
      extraCssText: "z-index: 10000;",
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params;
        return `${first?.axisValueLabel ?? ""}<br/>${formatDashboardTooltipNumber(Number(first?.data ?? 0))}`;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      show: false,
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      show: false,
      min: (value: { min: number }) => Math.min(0, value.min),
    },
    series: [
      {
        id: "sparkline",
        name: "trend",
        type: "line",
        data: values,
        smooth: true,
        symbol: "none",
        lineStyle: { color, width: 2.5 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}33` },
              { offset: 1, color: `${color}00` },
            ],
          },
        },
      },
    ],
  };
}
