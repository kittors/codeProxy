import { useCallback, useMemo, useState } from "react";
import { createModelDistributionOption } from "@/modules/monitor/chart-options/model-distribution";
import { createDailyTrendOption } from "@/modules/monitor/chart-options/daily-trend";
import { CHART_COLOR_CLASSES } from "@/modules/monitor/monitor-constants";
import type { DailySeriesPoint, ModelDistributionDatum } from "@/modules/monitor/chart-options/types";
import type { ChartDataResponse } from "@/modules/apikey-lookup/types";

const DAILY_LEGEND_KEYS = {
  input: "daily_input",
  output: "daily_output",
  requests: "daily_requests",
} as const;

function formatLocalDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

export function useApiKeyLookupCharts({
  chartData,
  compact,
  isDark,
  t,
}: {
  chartData: ChartDataResponse | null;
  compact: boolean;
  isDark: boolean;
  t: (key: string, options?: Record<string, unknown>) => string;
}) {
  const [modelMetric, setModelMetric] = useState<"requests" | "tokens">("requests");
  const [dailyLegendSelected, setDailyLegendSelected] = useState<Record<string, boolean>>({
    [DAILY_LEGEND_KEYS.input]: true,
    [DAILY_LEGEND_KEYS.output]: true,
    [DAILY_LEGEND_KEYS.requests]: true,
  });

  const chartStats = chartData?.stats;

  const dailySeries: DailySeriesPoint[] = useMemo(() => {
    if (!chartData?.daily_series) return [];
    return chartData.daily_series.map((item) => ({
      label: formatLocalDateLabel(item.date),
      requests: item.requests,
      inputTokens: item.input_tokens,
      outputTokens: item.output_tokens,
    }));
  }, [chartData]);

  const dailyTrendOption = useMemo(
    () =>
      createDailyTrendOption({
        dailySeries,
        dailyLegendSelected,
        legendKeys: DAILY_LEGEND_KEYS,
        labels: {
          input: t("apikey_lookup.input_token"),
          output: t("apikey_lookup.output_token"),
          requests: t("apikey_lookup.requests"),
          tokenAxis: t("apikey_lookup.token"),
          requestAxis: t("apikey_lookup.requests"),
        },
        isDark,
        compact,
      }),
    [compact, dailyLegendSelected, dailySeries, isDark, t],
  );

  const toggleDailyLegend = useCallback((key: string) => {
    if (
      !Object.values(DAILY_LEGEND_KEYS).includes(
        key as (typeof DAILY_LEGEND_KEYS)[keyof typeof DAILY_LEGEND_KEYS],
      )
    ) {
      return;
    }
    setDailyLegendSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const dailyLegendAvailability = useMemo(() => {
    const points = dailySeries.filter(
      (item) => item.requests > 0 || item.inputTokens > 0 || item.outputTokens > 0,
    );
    const visible = points.length > 0 ? points : dailySeries;
    return {
      hasInput: visible.some((item) => item.inputTokens > 0),
      hasOutput: visible.some((item) => item.outputTokens > 0),
      hasRequests: visible.some((item) => item.requests > 0),
    };
  }, [dailySeries]);

  const modelDistributionData: ModelDistributionDatum[] = useMemo(() => {
    if (!chartData?.model_distribution) return [];
    const sorted = [...chartData.model_distribution].sort((a, b) => {
      const aValue = modelMetric === "requests" ? a.requests : a.tokens;
      const bValue = modelMetric === "requests" ? b.requests : b.tokens;
      return bValue - aValue || a.model.localeCompare(b.model);
    });
    const top = sorted.slice(0, 10);
    const otherValue = sorted
      .slice(10)
      .reduce((acc, item) => acc + (modelMetric === "requests" ? item.requests : item.tokens), 0);
    const data = top.map((item) => ({
      name: item.model,
      value: modelMetric === "requests" ? item.requests : item.tokens,
    }));
    if (otherValue > 0) data.push({ name: t("common.other"), value: otherValue });
    return data;
  }, [chartData, modelMetric, t]);

  const modelDistributionOption = useMemo(
    () => createModelDistributionOption({ isDark, data: modelDistributionData }),
    [isDark, modelDistributionData],
  );

  const modelDistributionLegend = useMemo(() => {
    const total = modelDistributionData.reduce(
      (acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0),
      0,
    );
    return modelDistributionData.map((item, index) => {
      const colorClass =
        index < CHART_COLOR_CLASSES.length ? CHART_COLOR_CLASSES[index] : "bg-slate-400";
      const value = Number(item.value ?? 0);
      const percent = total > 0 ? (value / total) * 100 : 0;
      return {
        name: item.name,
        valueLabel: Intl.NumberFormat("en-US", { notation: "compact" }).format(value),
        percentLabel: `${percent.toFixed(1)}%`,
        colorClass,
      };
    });
  }, [modelDistributionData]);

  return {
    chartStats,
    modelMetric,
    setModelMetric,
    dailyLegendSelected,
    dailySeries,
    dailyTrendOption,
    toggleDailyLegend,
    dailyLegendAvailability,
    modelDistributionData,
    modelDistributionOption,
    modelDistributionLegend,
  };
}
