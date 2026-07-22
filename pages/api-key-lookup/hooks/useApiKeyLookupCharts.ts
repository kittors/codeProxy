import { useCallback, useMemo, useState } from "react";
import {
  buildModelDistributionData,
  createModelDistributionOption,
} from "@features/monitor-widgets/chart-options/model-distribution";
import { createDailyTrendOption } from "@features/monitor-widgets/chart-options/daily-trend";
import { CHART_COLOR_CLASSES } from "@features/monitor-widgets/monitor-constants";
import type {
  DailySeriesPoint,
  ModelDistributionDatum,
} from "@features/monitor-widgets/chart-options/types";
import type { ChartDataResponse } from "../types";

const DAILY_LEGEND_KEYS = {
  input: "daily_input",
  output: "daily_output",
  requests: "daily_requests",
} as const;

function formatLocalDateLabel(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function buildDistributionLegend(data: ModelDistributionDatum[]) {
  const total = data.reduce((acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0), 0);
  return data.map((item, index) => {
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
  const [apiKeyMetric, setApiKeyMetric] = useState<"requests" | "tokens">("requests");
  const [dailyLegendSelected, setDailyLegendSelected] = useState<Record<string, boolean>>({
    [DAILY_LEGEND_KEYS.input]: true,
    [DAILY_LEGEND_KEYS.output]: true,
    [DAILY_LEGEND_KEYS.requests]: true,
  });

  const chartStats = chartData?.stats;
  const heatmapSeries = chartData?.heatmap_series ?? [];

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

  const apiKeyDistributionData: ModelDistributionDatum[] = useMemo(() => {
    const points = Array.isArray(chartData?.api_key_distribution)
      ? chartData.api_key_distribution
      : [];
    const items = points
      .filter((point) => {
        const value = apiKeyMetric === "requests" ? point.requests : point.tokens;
        return point.api_key_id.trim() !== "" && Number.isFinite(value) && value > 0;
      })
      .map((point) => {
        const apiKeyID = point.api_key_id.trim();
        return {
          model: point.name.trim() || `API Key ${apiKeyID.slice(0, 8)}`,
          requests: point.requests,
          tokens: point.tokens,
        };
      });
    return buildModelDistributionData({
      items,
      metric: apiKeyMetric,
      otherLabel: t("common.other"),
      limit: 10,
    });
  }, [apiKeyMetric, chartData, t]);

  const apiKeyDistributionOption = useMemo(
    () => createModelDistributionOption({ isDark, data: apiKeyDistributionData }),
    [apiKeyDistributionData, isDark],
  );

  const apiKeyDistributionLegend = useMemo(
    () => buildDistributionLegend(apiKeyDistributionData),
    [apiKeyDistributionData],
  );

  const modelDistributionData: ModelDistributionDatum[] = useMemo(() => {
    return buildModelDistributionData({
      items: chartData?.model_distribution ?? [],
      metric: modelMetric,
      otherLabel: t("common.other"),
    });
  }, [chartData, modelMetric, t]);

  const modelDistributionOption = useMemo(
    () => createModelDistributionOption({ isDark, data: modelDistributionData }),
    [isDark, modelDistributionData],
  );

  const modelDistributionLegend = useMemo(
    () => buildDistributionLegend(modelDistributionData),
    [modelDistributionData],
  );

  return {
    chartStats,
    apiKeyMetric,
    setApiKeyMetric,
    apiKeyDistributionData,
    apiKeyDistributionOption,
    apiKeyDistributionLegend,
    modelMetric,
    setModelMetric,
    dailyLegendSelected,
    heatmapSeries,
    dailySeries,
    dailyTrendOption,
    toggleDailyLegend,
    dailyLegendAvailability,
    modelDistributionData,
    modelDistributionOption,
    modelDistributionLegend,
  };
}
