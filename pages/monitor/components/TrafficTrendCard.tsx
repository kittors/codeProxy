import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChartNoAxesCombined, ChartSpline } from "lucide-react";
import type { MonitorOverview } from "@code-proxy/api-client";
import { Card, ChartLegend, EChart, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import {
  TREND_SERIES,
  createTrafficTrendOption,
  trendSeriesColor,
  type TrendLabels,
  type TrendSeriesKey,
  type TrendView,
} from "../charts/trafficTrendOption";
import { MonitorCardTitle, MonitorInlineNotice } from "./MonitorCardTitle";

const VIEWS: TrendView[] = ["requests", "tokens", "latency", "cost"];

/** 流量与可靠性：请求 / Token / 耗时 / 费用四个视图共用一条连续时间轴。 */
export function TrafficTrendCard({
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
  const [view, setView] = useState<TrendView>("requests");
  const [hidden, setHidden] = useState<Partial<Record<TrendSeriesKey, boolean>>>({});

  const labels = useMemo<TrendLabels>(
    () => ({
      success: t("monitor_center.series.success"),
      failed: t("monitor_center.series.failed"),
      success_rate: t("monitor_center.series.success_rate"),
      input: t("monitor_center.series.input"),
      output: t("monitor_center.series.output"),
      cache_rate: t("monitor_center.series.cache_rate"),
      latency_avg: t("monitor_center.series.latency_avg"),
      first_token_avg: t("monitor_center.series.first_token_avg"),
      cost: t("monitor_center.series.cost"),
      cumulative_cost: t("monitor_center.series.cumulative_cost"),
      requests: t("monitor_center.series.requests"),
      tokens: t("monitor_center.series.tokens"),
      reasoning: t("monitor_center.series.reasoning"),
      cached: t("monitor_center.series.cached"),
    }),
    [t],
  );

  // 旧后端只有按天的请求与 Token：耗时、费用视图没有数据，直接不给这两个选项。
  const views = legacy ? VIEWS.filter((item) => item === "requests" || item === "tokens") : VIEWS;
  const activeView = views.includes(view) ? view : "requests";
  const hasTraffic = overview.series.some((point) => point.requests > 0);
  const option = useMemo(
    () => createTrafficTrendOption(overview, activeView, isDark, labels, hidden),
    [activeView, hidden, isDark, labels, overview],
  );

  return (
    <Card
      title={
        <MonitorCardTitle
          icon={ChartNoAxesCombined}
          label={t("monitor_center.trend.title")}
          note={t(`monitor_center.trend.note_${activeView}`)}
        />
      }
      actions={
        <Tabs value={activeView} onValueChange={(next) => setView(next as TrendView)} size="sm">
          <TabsList aria-label={t("monitor_center.trend.view_label")}>
            {views.map((item) => (
              <TabsTrigger key={item} value={item}>
                {t(`monitor_center.trend.view_${item}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      }
      loading={loading}
    >
      {hasTraffic ? (
        <>
          <EChart option={option} className="h-72" notMerge />
          <ChartLegend
            className="pt-3"
            items={TREND_SERIES[activeView].map((key) => ({
              key,
              label: labels[key],
              colorHex: trendSeriesColor(key, isDark),
              enabled: !hidden[key],
              onToggle: (toggled) =>
                setHidden((prev) => ({
                  ...prev,
                  [toggled]: !prev[toggled as TrendSeriesKey],
                })),
            }))}
          />
        </>
      ) : (
        <MonitorInlineNotice
          icon={ChartSpline}
          title={t("monitor_center.empty.title")}
          description={t("monitor_center.empty.description")}
          className="h-72"
        />
      )}
    </Card>
  );
}
