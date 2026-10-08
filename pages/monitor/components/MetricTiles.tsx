import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  CircleDollarSign,
  Gauge,
  ShieldCheck,
  Sparkles,
  Timer,
  type LucideIcon,
} from "lucide-react";
import type { MonitorOverview } from "@code-proxy/api-client";
import { AnimatedNumber, chartPalette, chartUsesIdentityColors, surface } from "@code-proxy/ui";
import { MetricIcon, type MonitorHue } from "@features/monitor-widgets/monitorVisuals";
import { computePointDelta, computeRelativeDelta, type MonitorDelta } from "../model/monitorDelta";
import {
  formatMonitorCompact,
  formatMonitorCost,
  formatMonitorCount,
  formatMonitorDuration,
  formatMonitorPercent,
  formatMonitorRate,
  formatMonitorStamp,
} from "../model/monitorFormat";
import { carryForward, elapsedWindowMinutes, seriesValues } from "../model/monitorSeries";
import { DeltaBadge } from "./DeltaBadge";
import { MonitorSparkline } from "./MonitorSparkline";
import { METRIC_HUE, sparkColor, successHue, successLevel } from "./monitorTheme";

interface TileSpec {
  key: string;
  /** 比率与耗时从序列最小值起画（见 MonitorSparkline）。 */
  sparkBaseline?: "zero" | "auto";
  label: string;
  icon: LucideIcon;
  /** 图标块的分类色（图标着色为多彩时显示）。 */
  hue: MonitorHue;
  /**
   * 迷你趋势线的颜色：多彩图表用指标身份色，强调色图表用强调色；成功率出问题时换成对应的
   * 状态色。
   */
  color: string;
  value: number;
  format: (value: number) => string;
  valueClassName?: string;
  delta: MonitorDelta;
  hint: ReactNode;
  spark: number[];
  sparkFailed?: number[];
  sparkLabel: string;
  /** 旧后端给不出这个指标：显示「—」而不是一个看起来真实的 0。 */
  unavailable?: boolean;
}

/**
 * 六格黄金指标：请求、成功率、P95 耗时、首字时间、Token、费用。
 * 每格：图标 + 大数字 + 环比（按好坏方向着色）+ 一句补充 + 迷你趋势。多彩风格下每格有自己的
 * 身份色（图标块与趋势线同色）；简约风格下六格都是线性图标 + 强调色趋势，颜色只在成功率出问题
 * 时出现，一眼就能看到哪一格需要注意。
 */
export function MetricTiles({
  overview,
  legacy,
  isDark,
}: {
  overview: MonitorOverview;
  legacy: boolean;
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const current = overview.summary.current;
  const previous = overview.summary.previous;
  const series = overview.series;
  const latency = overview.latency;
  const palette = chartPalette(isDark);
  const minutes = elapsedWindowMinutes(overview);
  const previousSpan =
    overview.range.previous_start && overview.range.previous_end
      ? `${formatMonitorStamp(overview.range.previous_start)} – ${formatMonitorStamp(overview.range.previous_end)}`
      : "";
  const deltaHint = (from: string, to: string) =>
    previousSpan
      ? t("monitor_center.tiles.delta_hint", { span: previousSpan, from, to })
      : t("monitor_center.tiles.delta_none");

  const rate = current.success_rate;
  const rateLevel = successLevel(rate);
  const hasLatencySamples = latency.total.samples > 0;
  const hasFirstTokenSamples = latency.first_token.samples > 0;
  const streamingShare = current.requests > 0 ? (current.streaming / current.requests) * 100 : 0;

  const tiles: TileSpec[] = [
    {
      key: "requests",
      label: t("monitor_center.tiles.requests"),
      icon: Activity,
      hue: METRIC_HUE.requests,
      color: sparkColor("requests", isDark),
      value: current.requests,
      format: formatMonitorCount,
      delta: computeRelativeDelta(current.requests, previous.requests, "neutral"),
      hint: legacy
        ? t("monitor_center.tiles.requests_hint_legacy", {
            rpm: formatMonitorRate(current.requests / minutes),
          })
        : t("monitor_center.tiles.requests_hint", {
            rpm: formatMonitorRate(current.requests / minutes),
            streaming: formatMonitorPercent(streamingShare, 0),
          }),
      spark: seriesValues(series, (point) => point.requests),
      sparkFailed: seriesValues(series, (point) => point.failed),
      sparkLabel: t("monitor_center.tiles.requests_spark"),
    },
    {
      key: "success",
      label: t("monitor_center.tiles.success_rate"),
      icon: ShieldCheck,
      hue: successHue(rate),
      color:
        rateLevel === "critical"
          ? palette.err
          : rateLevel === "warn"
            ? palette.warn
            : chartUsesIdentityColors()
              ? palette.ok
              : palette.primary,
      value: rate,
      format: (value) => formatMonitorPercent(value),
      valueClassName:
        rateLevel === "critical"
          ? "text-rose-600 dark:text-rose-300"
          : rateLevel === "warn"
            ? "text-amber-600 dark:text-amber-300"
            : undefined,
      delta: computePointDelta(
        rate,
        previous.success_rate,
        previous.requests > 0,
        "higher-is-better",
      ),
      hint: t("monitor_center.tiles.success_hint", {
        failed: formatMonitorCount(current.failed),
      }),
      spark: carryForward(
        series,
        (point) => point.success_rate,
        (point) => point.requests > 0,
        100,
      ),
      sparkBaseline: "auto",
      sparkLabel: t("monitor_center.tiles.success_spark"),
    },
    {
      key: "latency",
      label: hasLatencySamples
        ? t("monitor_center.tiles.latency_p95")
        : t("monitor_center.tiles.latency_avg"),
      icon: Timer,
      hue: METRIC_HUE.latency,
      color: sparkColor("latency", isDark),
      value: hasLatencySamples ? latency.total.p95_ms : current.latency_avg_ms,
      format: formatMonitorDuration,
      delta: computeRelativeDelta(
        current.latency_avg_ms,
        previous.latency_avg_ms,
        "lower-is-better",
      ),
      hint: hasLatencySamples
        ? t("monitor_center.tiles.latency_hint", {
            avg: formatMonitorDuration(current.latency_avg_ms),
            p50: formatMonitorDuration(latency.total.p50_ms),
          })
        : t("monitor_center.tiles.latency_hint_avg_only"),
      spark: carryForward(
        series,
        (point) => point.latency_avg_ms,
        (point) => point.latency_avg_ms > 0,
        0,
      ),
      sparkBaseline: "auto",
      sparkLabel: t("monitor_center.tiles.latency_spark"),
      unavailable: legacy || current.latency_avg_ms <= 0,
    },
    {
      key: "first_token",
      label: hasFirstTokenSamples
        ? t("monitor_center.tiles.first_token_p50")
        : t("monitor_center.tiles.first_token_avg"),
      icon: Gauge,
      hue: METRIC_HUE.latency,
      color: sparkColor("latency", isDark),
      value: hasFirstTokenSamples ? latency.first_token.p50_ms : current.first_token_avg_ms,
      format: formatMonitorDuration,
      delta: computeRelativeDelta(
        current.first_token_avg_ms,
        previous.first_token_avg_ms,
        "lower-is-better",
      ),
      hint: hasFirstTokenSamples
        ? t("monitor_center.tiles.first_token_hint", {
            p95: formatMonitorDuration(latency.first_token.p95_ms),
            streaming: formatMonitorPercent(streamingShare, 0),
          })
        : t("monitor_center.tiles.first_token_hint_none"),
      spark: carryForward(
        series,
        (point) => point.first_token_avg_ms,
        (point) => point.first_token_avg_ms > 0,
        0,
      ),
      sparkBaseline: "auto",
      sparkLabel: t("monitor_center.tiles.first_token_spark"),
      unavailable: legacy || current.first_token_avg_ms <= 0,
    },
    {
      key: "tokens",
      label: t("monitor_center.tiles.tokens"),
      icon: Sparkles,
      hue: METRIC_HUE.tokens,
      color: sparkColor("tokens", isDark),
      value: current.total_tokens,
      format: formatMonitorCount,
      delta: computeRelativeDelta(current.total_tokens, previous.total_tokens, "neutral"),
      hint: legacy
        ? t("monitor_center.tiles.tokens_hint_legacy", {
            output: formatMonitorCompact(current.output_tokens),
          })
        : t("monitor_center.tiles.tokens_hint", {
            cache: formatMonitorPercent(current.cache_rate, 1),
            output: formatMonitorCompact(current.output_tokens),
          }),
      spark: seriesValues(series, (point) => point.total_tokens),
      sparkLabel: t("monitor_center.tiles.tokens_spark"),
    },
    {
      key: "cost",
      label: t("monitor_center.tiles.cost"),
      icon: CircleDollarSign,
      hue: METRIC_HUE.cost,
      color: sparkColor("cost", isDark),
      value: current.cost,
      format: formatMonitorCost,
      delta: computeRelativeDelta(current.cost, previous.cost, "neutral"),
      hint:
        current.requests > 0
          ? t("monitor_center.tiles.cost_hint", {
              perThousand: formatMonitorCost((current.cost / current.requests) * 1_000),
            })
          : t("monitor_center.tiles.cost_hint_none"),
      spark: seriesValues(series, (point) => point.cost),
      sparkLabel: t("monitor_center.tiles.cost_spark"),
      unavailable: legacy,
    },
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      {tiles.map((tile) => (
        <MetricTile
          key={tile.key}
          tile={tile}
          deltaHint={deltaHint(
            tile.format(pickDeltaValue(tile.key, previous)),
            tile.format(pickDeltaValue(tile.key, current)),
          )}
          unavailableLabel={t("monitor_center.needs_upgrade")}
        />
      ))}
    </section>
  );
}

/** 环比用的两端数值：耗时类按平均值比（上一周期没有分位数），其余与大数字同口径。 */
function pickDeltaValue(key: string, totals: MonitorOverview["summary"]["current"]): number {
  switch (key) {
    case "requests":
      return totals.requests;
    case "success":
      return totals.success_rate;
    case "latency":
      return totals.latency_avg_ms;
    case "first_token":
      return totals.first_token_avg_ms;
    case "tokens":
      return totals.total_tokens;
    default:
      return totals.cost;
  }
}

function MetricTile({
  tile,
  deltaHint,
  unavailableLabel,
}: {
  tile: TileSpec;
  deltaHint: string;
  unavailableLabel: string;
}) {
  return (
    <article
      className={`${surface({ radius: "3xl" })} flex min-w-0 flex-col p-4`}
      aria-label={tile.label}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink-2">
          <MetricIcon icon={tile.icon} hue={tile.hue} />
          <span className="truncate">{tile.label}</span>
        </span>
        {tile.unavailable ? null : <DeltaBadge delta={tile.delta} hint={deltaHint} />}
      </div>
      <div
        className={`mt-3 truncate text-2xl leading-none font-semibold tracking-tight tabular-nums ${tile.valueClassName ?? "text-ink"}`}
      >
        {tile.unavailable ? (
          <span className="text-ink-4">—</span>
        ) : (
          <AnimatedNumber value={tile.value} format={tile.format} />
        )}
      </div>
      <p
        className="mt-1.5 truncate text-xs text-ink-3"
        title={typeof tile.hint === "string" ? tile.hint : undefined}
      >
        {tile.unavailable ? unavailableLabel : tile.hint}
      </p>
      <div className="mt-auto pt-3">
        {tile.unavailable ? (
          <div className="h-9" aria-hidden="true" />
        ) : (
          <MonitorSparkline
            values={tile.spark}
            failed={tile.sparkFailed}
            color={tile.color}
            label={tile.sparkLabel}
            baseline={tile.sparkBaseline}
          />
        )}
      </div>
    </article>
  );
}
