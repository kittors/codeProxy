import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Hourglass, Timer } from "lucide-react";
import type { MonitorOverview } from "@code-proxy/api-client";
import { Card, EChart, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { createLatencyOption } from "../charts/latencyOption";
import {
  formatMonitorCompact,
  formatMonitorDuration,
  formatMonitorStamp,
} from "../model/monitorFormat";
import { MonitorCardTitle, MonitorInlineNotice } from "./MonitorCardTitle";

type LatencyMetric = "total" | "first_token";

const PERCENTILES = [
  { key: "p50_ms", label: "P50" },
  { key: "p90_ms", label: "P90" },
  { key: "p95_ms", label: "P95" },
  { key: "p99_ms", label: "P99" },
] as const;

/**
 * 耗时分布：分位数 + 直方图。平均值会被少数长请求拉偏，P95 / P99 才是用户感受到的「慢」。
 * 分位数来自请求明细，明细比汇总保留得短；时间窗超出明细保留期时在卡片底部写明覆盖范围。
 */
export function LatencyCard({
  overview,
  legacy,
  loading,
  isDark,
}: {
  overview: MonitorOverview;
  legacy: boolean;
  loading: boolean;
  isDark: boolean;
}) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<LatencyMetric>("total");
  const stats = overview.latency[metric];
  const option = useMemo(
    () =>
      createLatencyOption(stats, overview.latency.bounds_ms, isDark, {
        requests: t("monitor_center.series.requests"),
        share: t("monitor_center.latency.share"),
      }),
    [isDark, overview.latency.bounds_ms, stats, t],
  );

  const coverage = overview.latency.coverage_start;
  const rangeStart = Date.parse(overview.range.start);
  // 明细最早一条比时间窗起点晚一小时以上，说明更早的明细已过保留期。
  const truncated =
    Boolean(coverage) &&
    Number.isFinite(rangeStart) &&
    Date.parse(coverage) - rangeStart > 3_600_000;

  return (
    <Card
      title={<MonitorCardTitle icon={Timer} hue="indigo" label={t("monitor_center.latency.title")} />}
      actions={
        legacy ? null : (
          <Tabs value={metric} onValueChange={(next) => setMetric(next as LatencyMetric)} size="sm">
            <TabsList aria-label={t("monitor_center.latency.metric_label")}>
              <TabsTrigger value="total">{t("monitor_center.latency.total")}</TabsTrigger>
              <TabsTrigger value="first_token">
                {t("monitor_center.latency.first_token")}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        )
      }
      loading={loading}
      className="flex h-full flex-col"
      bodyClassName="flex min-h-0 flex-1 flex-col gap-4"
    >
      {legacy ? (
        <MonitorInlineNotice
          icon={Hourglass}
          title={t("monitor_center.needs_upgrade")}
          description={t("monitor_center.latency.upgrade_hint")}
        />
      ) : stats.samples === 0 ? (
        <MonitorInlineNotice
          icon={Hourglass}
          title={t(`monitor_center.latency.empty_${metric}`)}
          description={t("monitor_center.latency.empty_hint")}
        />
      ) : (
        <>
          {/*
            四个分位数是一行「标签 + 数值」，不再各垫一块彩色底、P95 再描一圈：卡片里又是四个小框，
            层级就多了一层。P95 仍是重点，标签用强调色，与下面直方图里标着 P95 的那根实色柱子呼应。
          */}
          <dl className="grid grid-cols-4 gap-3">
            {PERCENTILES.map((item) => (
              <div key={item.key} className="min-w-0">
                <dt
                  className={`text-2xs font-semibold tracking-wide ${item.key === "p95_ms" ? "text-accent-ink colorful:text-indigo-600 colorful:dark:text-indigo-300" : "text-ink-3"}`}
                >
                  {item.label}
                </dt>
                <dd className="mt-1 truncate text-lg leading-none font-semibold tabular-nums text-ink">
                  {formatMonitorDuration(stats[item.key])}
                </dd>
              </div>
            ))}
          </dl>
          <EChart option={option} className="min-h-44 flex-1" notMerge />
          <p className="text-xs text-ink-3">
            {t("monitor_center.latency.summary", {
              avg: formatMonitorDuration(stats.avg_ms),
              max: formatMonitorDuration(stats.max_ms),
              samples: formatMonitorCompact(stats.samples),
            })}
            {truncated
              ? ` · ${t("monitor_center.latency.coverage", { since: formatMonitorStamp(coverage) })}`
              : null}
          </p>
        </>
      )}
    </Card>
  );
}
