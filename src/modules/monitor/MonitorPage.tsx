import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  Activity,
  ChartSpline,
  Coins,
  Filter,
  RefreshCw,
  Search,
  ShieldCheck,
  Sigma,
} from "lucide-react";
import { usageApi } from "@/lib/http/apis";
import { formatNumber, formatRate } from "@/modules/monitor/monitor-utils";
import { AnimatedNumber } from "@/modules/ui/AnimatedNumber";
import { TextInput } from "@/modules/ui/Input";
import { Reveal } from "@/modules/ui/Reveal";
import { EChart } from "@/modules/ui/charts/EChart";
import { ChartLegend } from "@/modules/ui/charts/ChartLegend";
import { useTheme } from "@/modules/ui/ThemeProvider";
import type { HourWindow, TimeRange } from "@/modules/monitor/monitor-constants";
import { CHART_COLOR_CLASSES, HOURLY_MODEL_COLORS } from "@/modules/monitor/monitor-constants";
import {
  formatCompact,
  formatMonthDay,
} from "@/modules/monitor/monitor-format";
import {
  HourWindowSelector,
  KpiCard,
  MonitorCard as Card,
  TimeRangeSelector,
} from "@/modules/monitor/MonitorPagePieces";
import {
  createDailyTrendOption,
  createHourlyModelOption,
  createHourlyTokenOption,
  createModelDistributionOption,
} from "@/modules/monitor/monitor-chart-options";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useTranslation } from "react-i18next";

const DAILY_LEGEND_KEYS = {
  input: "daily_input",
  output: "daily_output",
  requests: "daily_requests",
} as const;
const HOURLY_MODEL_OTHER_KEY = "__other__";
const HOURLY_MODEL_TOTAL_KEY = "__total_requests__";
const HOURLY_TOKEN_KEYS = {
  input: "hourly_input",
  output: "hourly_output",
  reasoning: "hourly_reasoning",
  cached: "hourly_cached",
  total: "__total_token__",
} as const;

export function MonitorPage() {
  const { t } = useTranslation();
  const {
    state: { mode },
  } = useTheme();
  const isDark = mode === "dark";

  const [compact, setCompact] = useState(() => window.innerWidth < 700);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 699px)");
    const handler = (e: MediaQueryListEvent) => setCompact(e.matches);
    setCompact(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [dailyLegendSelected, setDailyLegendSelected] = useState<Record<string, boolean>>({
    [DAILY_LEGEND_KEYS.input]: true,
    [DAILY_LEGEND_KEYS.output]: true,
    [DAILY_LEGEND_KEYS.requests]: true,
  });

  const [hourlyModelSelected, setHourlyModelSelected] = useState<Record<string, boolean>>({
    [HOURLY_MODEL_TOTAL_KEY]: true,
  });

  const [hourlyTokenSelected, setHourlyTokenSelected] = useState<Record<string, boolean>>({
    [HOURLY_TOKEN_KEYS.input]: true,
    [HOURLY_TOKEN_KEYS.output]: true,
    [HOURLY_TOKEN_KEYS.reasoning]: true,
    [HOURLY_TOKEN_KEYS.cached]: true,
    [HOURLY_TOKEN_KEYS.total]: true,
  });

  const [chartData, setChartData] = useState<import("@/lib/http/types").ChartDataResponse | null>(
    null,
  );
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiFilterInput, setApiFilterInput] = useState("");
  const [apiFilter, setApiFilter] = useState("");
  const [modelHourWindow, setModelHourWindow] = useState<HourWindow>(24);
  const [tokenHourWindow, setTokenHourWindow] = useState<HourWindow>(24);
  const [modelMetric, setModelMetric] = useState<"requests" | "tokens">("requests");
  const [apikeyMetric, setApikeyMetric] = useState<"requests" | "tokens">("requests");
  const [modelDistributionSelected, setModelDistributionSelected] = useState<
    Record<string, boolean>
  >({});
  const [apikeyDistributionSelected, setApikeyDistributionSelected] = useState<
    Record<string, boolean>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [isPending, startTransition] = useTransition();

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const chartResp = await usageApi.getChartData(timeRange, apiFilter);
      startTransition(() => {
        setChartData(chartResp);
      });
    } catch (requestError) {
      const message =
        requestError instanceof Error ? requestError.message : t("monitor.failed_fetch");
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, [t, timeRange, apiFilter]);

  const metrics = useMemo(() => {
    let requests = 0;
    let failed = 0;
    let inputTokens = 0;
    let outputTokens = 0;

    if (chartData?.daily_series) {
      for (const pt of chartData.daily_series) {
        requests += pt.requests || 0;
        failed += pt.failed_requests || 0;
        inputTokens += pt.input_tokens || 0;
        outputTokens += pt.output_tokens || 0;
      }
    }

    const success = requests - failed;
    const rate = requests > 0 ? (success / requests) * 100 : 0;

    return {
      totalRequests: requests,
      successCount: success,
      failureCount: failed,
      successRate: rate,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    };
  }, [chartData]);

  const applyFilter = useCallback(() => {
    setApiFilter(apiFilterInput);
  }, [apiFilterInput]);

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

  const toggleHourlyModelLegend = useCallback((key: string) => {
    setHourlyModelSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const toggleHourlyTokenLegend = useCallback((key: string) => {
    setHourlyTokenSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const hasData = metrics.totalRequests > 0;
  const isLoading = isRefreshing || isPending;

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const modelTotals = useMemo(() => {
    if (!chartData?.model_distribution) return [];
    return chartData.model_distribution.sort(
      (left, right) => right.requests - left.requests || left.model.localeCompare(right.model),
    );
  }, [chartData]);

  const sortedModelsByMetric = useMemo(() => {
    const list = [...modelTotals];
    list.sort((left, right) => {
      const leftValue = modelMetric === "requests" ? left.requests : left.tokens;
      const rightValue = modelMetric === "requests" ? right.requests : right.tokens;
      return rightValue - leftValue || left.model.localeCompare(right.model);
    });
    return list;
  }, [modelMetric, modelTotals]);

  const topModelKeys = useMemo(
    () => sortedModelsByMetric.slice(0, 5).map((item) => item.model),
    [sortedModelsByMetric],
  );

  const modelDistributionData = useMemo(() => {
    const top = sortedModelsByMetric.slice(0, 10);
    const otherValue = sortedModelsByMetric.slice(10).reduce((acc, item) => {
      return acc + (modelMetric === "requests" ? item.requests : item.tokens);
    }, 0);

    const data = top.map((item) => ({
      name: item.model,
      value: modelMetric === "requests" ? item.requests : item.tokens,
    }));

    if (otherValue > 0) {
      data.push({ name: t("common.other"), value: otherValue });
    }
    return data;
  }, [modelMetric, sortedModelsByMetric, t]);

  useEffect(() => {
    setModelDistributionSelected((prev) => {
      const next = { ...prev };
      for (const item of modelDistributionData) {
        if (!(item.name in next)) next[item.name] = true;
      }
      return next;
    });
  }, [modelDistributionData]);

  const visibleModelDistributionData = useMemo(
    () => modelDistributionData.filter((item) => modelDistributionSelected[item.name] ?? true),
    [modelDistributionData, modelDistributionSelected],
  );

  const dailySeries = useMemo(() => {
    if (!chartData?.daily_series) return [];

    // Parse backend date strings ("YYYY-MM-DD") to Date objects and format label
    // Using UTC parsing trick to match backend day strings consistently
    return chartData.daily_series.map((pt) => {
      // Create a date assuming noon UTC so boundary issues don't push it across
      // local day boundaries.
      const match = pt.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      let label = pt.date;
      if (match) {
        // Create local Date from the year, month, day
        const localD = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        label = formatMonthDay(localD);
      }
      return {
        label,
        requests: pt.requests,
        inputTokens: pt.input_tokens,
        outputTokens: pt.output_tokens,
        totalTokens: pt.input_tokens + pt.output_tokens,
      };
    });
  }, [chartData]);

  const hourlySeries = useMemo(() => {
    const modelKeys = [...topModelKeys, HOURLY_MODEL_OTHER_KEY];

    const modelPoints = (chartData?.hourly_models || [])
      .reduce(
        (acc, pt) => {
          const [, timePart] = pt.hour.split(" "); // "2023-10-10 15:00"
          const label = timePart || pt.hour;

          let bucket = acc.find((x) => x.label === label);
          if (!bucket) {
            bucket = { label, stacksMap: new Map<string, number>() };
            acc.push(bucket);
          }
          const current = bucket.stacksMap.get(pt.model) || 0;
          bucket.stacksMap.set(pt.model, current + pt.requests);
          return acc;
        },
        [] as { label: string; stacksMap: Map<string, number> }[],
      )
      .map((bucket) => {
        const stacks = modelKeys.map((key) => {
          if (key === HOURLY_MODEL_OTHER_KEY) {
            let sum = 0;
            for (const [m, v] of bucket.stacksMap.entries()) {
              if (!topModelKeys.includes(m)) sum += v;
            }
            return { key, value: sum };
          }
          return { key, value: bucket.stacksMap.get(key) || 0 };
        });
        return { label: bucket.label, stacks };
      });

    const tokenPoints = (chartData?.hourly_tokens || []).map((pt) => {
      const [, timePart] = pt.hour.split(" ");
      const label = timePart || pt.hour;
      return {
        label,
        stacks: [
          { key: HOURLY_TOKEN_KEYS.input, value: pt.input_tokens },
          { key: HOURLY_TOKEN_KEYS.output, value: pt.output_tokens },
          { key: HOURLY_TOKEN_KEYS.reasoning, value: pt.reasoning_tokens },
          { key: HOURLY_TOKEN_KEYS.cached, value: pt.cached_tokens },
          { key: HOURLY_TOKEN_KEYS.total, value: pt.total_tokens },
        ],
      };
    });

    return {
      modelKeys,
      modelPoints,
      tokenKeys: [
        HOURLY_TOKEN_KEYS.input,
        HOURLY_TOKEN_KEYS.output,
        HOURLY_TOKEN_KEYS.reasoning,
        HOURLY_TOKEN_KEYS.cached,
        HOURLY_TOKEN_KEYS.total,
      ],
      tokenPoints,
    };
  }, [chartData, topModelKeys]);

  const hourlyModelPalette = useMemo(() => {
    const palette = [
      "bg-emerald-400",
      "bg-violet-400",
      "bg-amber-400",
      "bg-pink-300",
      "bg-teal-400",
    ];
    const colorByKey: Record<string, string> = {};
    const classByKey: Record<string, string> = {};

    hourlySeries.modelKeys.forEach((key, index) => {
      if (key === HOURLY_MODEL_OTHER_KEY) {
        colorByKey[key] = "rgba(148,163,184,0.58)";
        classByKey[key] = "bg-slate-400";
        return;
      }
      colorByKey[key] = HOURLY_MODEL_COLORS[index % HOURLY_MODEL_COLORS.length];
      classByKey[key] = palette[index % palette.length] ?? "bg-slate-400";
    });

    colorByKey[HOURLY_MODEL_TOTAL_KEY] = "#3b82f6";
    classByKey[HOURLY_MODEL_TOTAL_KEY] = "bg-blue-500";

    return { colorByKey, classByKey };
  }, [hourlySeries.modelKeys]);

  const hourlyTokenPalette = useMemo(() => {
    return {
      colorByKey: {
        [HOURLY_TOKEN_KEYS.input]: "rgba(110,231,183,0.88)",
        [HOURLY_TOKEN_KEYS.output]: "rgba(196,181,253,0.88)",
        [HOURLY_TOKEN_KEYS.reasoning]: "rgba(252,211,77,0.88)",
        [HOURLY_TOKEN_KEYS.cached]: "rgba(94,234,212,0.88)",
        [HOURLY_TOKEN_KEYS.total]: "#3b82f6",
      } as Record<string, string>,
      classByKey: {
        [HOURLY_TOKEN_KEYS.input]: "bg-emerald-400",
        [HOURLY_TOKEN_KEYS.output]: "bg-violet-400",
        [HOURLY_TOKEN_KEYS.reasoning]: "bg-amber-400",
        [HOURLY_TOKEN_KEYS.cached]: "bg-teal-400",
        [HOURLY_TOKEN_KEYS.total]: "bg-blue-500",
      } as Record<string, string>,
    };
  }, []);

  useEffect(() => {
    setHourlyModelSelected((prev) => {
      const next = { ...prev };
      for (const key of hourlySeries.modelKeys) {
        if (!(key in next)) next[key] = true;
      }
      if (!(HOURLY_MODEL_TOTAL_KEY in next)) next[HOURLY_MODEL_TOTAL_KEY] = true;
      return next;
    });
  }, [hourlySeries.modelKeys]);

  useEffect(() => {
    setHourlyTokenSelected((prev) => {
      const next = { ...prev };
      for (const key of hourlySeries.tokenKeys) {
        if (!(key in next)) next[key] = true;
      }
      if (!(HOURLY_TOKEN_KEYS.total in next)) next[HOURLY_TOKEN_KEYS.total] = true;
      return next;
    });
  }, [hourlySeries.tokenKeys]);

  const modelDistributionOption = useMemo(
    () => createModelDistributionOption({ isDark, data: visibleModelDistributionData }),
    [isDark, visibleModelDistributionData],
  );

  // --- API Key Distribution ---
  const apikeyDistributionData = useMemo(() => {
    if (!chartData?.apikey_distribution) return [];
    const sorted = [...chartData.apikey_distribution].sort((a, b) => {
      const av = apikeyMetric === "requests" ? a.requests : a.tokens;
      const bv = apikeyMetric === "requests" ? b.requests : b.tokens;
      return bv - av;
    });
    const top = sorted.slice(0, 10);
    const otherValue = sorted.slice(10).reduce((acc, item) => {
      return acc + (apikeyMetric === "requests" ? item.requests : item.tokens);
    }, 0);
    const data = top.map((item) => ({
      name: item.name || item.api_key.slice(0, 8) + "…",
      value: apikeyMetric === "requests" ? item.requests : item.tokens,
    }));
    if (otherValue > 0) {
      data.push({ name: t("common.other"), value: otherValue });
    }
    return data;
  }, [apikeyMetric, chartData, t]);

  useEffect(() => {
    setApikeyDistributionSelected((prev) => {
      const next = { ...prev };
      for (const item of apikeyDistributionData) {
        if (!(item.name in next)) next[item.name] = true;
      }
      return next;
    });
  }, [apikeyDistributionData]);

  const visibleApikeyDistributionData = useMemo(
    () => apikeyDistributionData.filter((item) => apikeyDistributionSelected[item.name] ?? true),
    [apikeyDistributionData, apikeyDistributionSelected],
  );

  const apikeyDistributionOption = useMemo(
    () => createModelDistributionOption({ isDark, data: visibleApikeyDistributionData }),
    [isDark, visibleApikeyDistributionData],
  );

  const apikeyDistributionLegend = useMemo(() => {
    const total = apikeyDistributionData.reduce(
      (acc, item) => acc + (Number.isFinite(item.value) ? item.value : 0),
      0,
    );
    return apikeyDistributionData.map((item, index) => {
      const colorClass =
        index < CHART_COLOR_CLASSES.length ? CHART_COLOR_CLASSES[index] : "bg-slate-400";
      const value = Number(item.value ?? 0);
      const percent = total > 0 ? (value / total) * 100 : 0;
      return {
        name: item.name,
        valueLabel: formatCompact(value),
        percentLabel: `${percent.toFixed(1)}%`,
        colorClass,
        enabled: apikeyDistributionSelected[item.name] ?? true,
      };
    });
  }, [apikeyDistributionData, apikeyDistributionSelected]);

  const dailyLegendAvailability = useMemo(() => {
    const points = dailySeries.filter(
      (item) => item.requests > 0 || item.inputTokens > 0 || item.outputTokens > 0,
    );
    const visiblePoints = points.length > 0 ? points : dailySeries;
    const requestY = visiblePoints.map((item) => item.requests);
    const inputY = visiblePoints.map((item) => item.inputTokens);
    const outputY = visiblePoints.map((item) => item.outputTokens);

    return {
      hasInput: inputY.some((value) => value > 0),
      hasOutput: outputY.some((value) => value > 0),
      hasRequests: requestY.some((value) => value > 0),
    };
  }, [dailySeries]);

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
        valueLabel: formatCompact(value),
        percentLabel: `${percent.toFixed(1)}%`,
        colorClass,
        enabled: modelDistributionSelected[item.name] ?? true,
      };
    });
  }, [modelDistributionData, modelDistributionSelected]);

  const toggleModelDistributionLegend = useCallback((name: string) => {
    setModelDistributionSelected((prev) => ({ ...prev, [name]: !(prev[name] ?? true) }));
  }, []);

  const toggleApikeyDistributionLegend = useCallback((name: string) => {
    setApikeyDistributionSelected((prev) => ({ ...prev, [name]: !(prev[name] ?? true) }));
  }, []);

  const dailyTrendOption = useMemo(
    () =>
      createDailyTrendOption({
        dailySeries,
        dailyLegendSelected,
        legendKeys: DAILY_LEGEND_KEYS,
        labels: {
          input: t("monitor.input_token"),
          output: t("monitor.output_token_legend"),
          requests: t("monitor.requests"),
          tokenAxis: t("monitor.token"),
          requestAxis: t("monitor.requests"),
        },
        isDark,
        compact,
      }),
    [compact, dailyLegendSelected, dailySeries, isDark, t],
  );

  const getHourlyModelSeriesLabel = useCallback(
    (key: string) => {
      if (key === HOURLY_MODEL_OTHER_KEY) return t("common.other");
      if (key === HOURLY_MODEL_TOTAL_KEY) return t("monitor.total_requests");
      return key;
    },
    [t],
  );

  const hourlyTokenLabels = useMemo(
    () => ({
      [HOURLY_TOKEN_KEYS.input]: t("monitor.hourly_token.input"),
      [HOURLY_TOKEN_KEYS.output]: t("monitor.hourly_token.output"),
      [HOURLY_TOKEN_KEYS.reasoning]: t("monitor.hourly_token.reasoning"),
      [HOURLY_TOKEN_KEYS.cached]: t("monitor.hourly_token.cached"),
      [HOURLY_TOKEN_KEYS.total]: t("monitor.hourly_token.total"),
    }),
    [t],
  );

  const hourlyModelOption = useMemo(
    () =>
      createHourlyModelOption({
        hourlySeries,
        modelHourWindow,
        hourlyModelSelected,
        paletteColorByKey: hourlyModelPalette.colorByKey,
        totalLineKey: HOURLY_MODEL_TOTAL_KEY,
        getSeriesLabel: getHourlyModelSeriesLabel,
        isDark,
        compact,
      }),
    [
      compact,
      getHourlyModelSeriesLabel,
      hourlyModelPalette.colorByKey,
      hourlyModelSelected,
      hourlySeries.modelKeys,
      hourlySeries.modelPoints,
      isDark,
      modelHourWindow,
    ],
  );

  const hourlyTokenOption = useMemo(
    () =>
      createHourlyTokenOption({
        hourlySeries,
        tokenHourWindow,
        hourlyTokenSelected,
        paletteColorByKey: hourlyTokenPalette.colorByKey,
        labelsByKey: hourlyTokenLabels,
        totalLineKey: HOURLY_TOKEN_KEYS.total,
        isDark,
        compact,
      }),
    [
      compact,
      hourlySeries.tokenKeys,
      hourlySeries.tokenPoints,
      hourlyTokenLabels,
      hourlyTokenPalette.colorByKey,
      hourlyTokenSelected,
      isDark,
      tokenHourWindow,
    ],
  );

  const modelActions = (
    <Tabs
      value={modelMetric}
      onValueChange={(next) => setModelMetric(next as "requests" | "tokens")}
    >
      <TabsList>
        <TabsTrigger value="requests">{t("monitor.requests")}</TabsTrigger>
        <TabsTrigger value="tokens">{t("monitor.token")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const apikeyActions = (
    <Tabs
      value={apikeyMetric}
      onValueChange={(next) => setApikeyMetric(next as "requests" | "tokens")}
    >
      <TabsList>
        <TabsTrigger value="requests">{t("monitor.requests")}</TabsTrigger>
        <TabsTrigger value="tokens">{t("monitor.token")}</TabsTrigger>
      </TabsList>
    </Tabs>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <ChartSpline size={18} className="text-slate-900 dark:text-white" />
              <span>{t("monitor.title")}</span>
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TimeRangeSelector value={timeRange} onChange={setTimeRange} />
            <div className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <Search size={14} className="text-slate-500 dark:text-white/55" />
              <TextInput
                value={apiFilterInput}
                onChange={(event) => setApiFilterInput(event.target.value)}
                variant="ghost"
                className="w-36"
                placeholder={t("monitor.filter_placeholder")}
              />
            </div>
            <button
              type="button"
              onClick={applyFilter}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
            >
              <Filter size={14} />
              {t("monitor.apply")}
            </button>
            <button
              type="button"
              onClick={() => void refreshData()}
              disabled={isLoading}
              aria-busy={isLoading}
              className="inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-2xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
            >
              <RefreshCw size={14} className={isLoading ? "animate-spin" : ""} />
              <span className="grid">
                <span
                  className={
                    isLoading
                      ? "col-start-1 row-start-1 opacity-0"
                      : "col-start-1 row-start-1 opacity-100"
                  }
                >
                  {t("monitor.refresh")}
                </span>
                <span
                  className={
                    isLoading
                      ? "col-start-1 row-start-1 opacity-100"
                      : "col-start-1 row-start-1 opacity-0"
                  }
                >
                  {t("monitor.refreshing")}
                </span>
              </span>
            </button>
          </div>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}
      </section>

      <Reveal>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            title={t("monitor.total_requests")}
            value={<AnimatedNumber value={metrics.totalRequests} format={formatNumber} />}
            hint={t("monitor.filtered_by_time")}
            icon={Activity}
          />
          <KpiCard
            title={t("monitor.success_rate")}
            value={<AnimatedNumber value={metrics.successRate} format={formatRate} />}
            hint={t("monitor.success_count", {
              success: formatNumber(metrics.successCount),
              failed: formatNumber(metrics.failureCount),
            })}
            icon={ShieldCheck}
          />
          <KpiCard
            title={t("monitor.total_token")}
            value={<AnimatedNumber value={metrics.totalTokens} format={formatNumber} />}
            hint={t("monitor.input_output_hint")}
            icon={Sigma}
          />
          <KpiCard
            title={t("monitor.output_token")}
            value={<AnimatedNumber value={metrics.outputTokens} format={formatNumber} />}
            hint={t("monitor.input_tokens_hint", {
              count: formatNumber(metrics.inputTokens),
            } as Record<string, unknown>)}
            icon={Coins}
          />
        </section>
      </Reveal>

      {!hasData && !isLoading ? (
        <Reveal>
          <section className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="mx-auto flex max-w-md flex-col items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900/5 text-slate-700 dark:bg-white/10 dark:text-white/70">
                <ChartSpline size={20} />
              </div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("monitor.no_data")}
              </p>
              <p className="text-sm text-slate-600 dark:text-white/65">
                {t("monitor.no_data_hint")}
              </p>
              <button
                type="button"
                onClick={() => void refreshData()}
                className="inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-2xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
              >
                <RefreshCw size={14} />
                {t("monitor.refresh")}
              </button>
            </div>
          </section>
        </Reveal>
      ) : (
        <>
          <Reveal>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
              <Card
                title={t("monitor.model_distribution")}
                description={t("monitor.last_days_desc", {
                  days: timeRange,
                  metric: modelMetric === "requests" ? t("monitor.requests") : t("monitor.token"),
                })}
                actions={modelActions}
                loading={isRefreshing}
              >
                <div className="flex h-auto flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] md:items-center">
                  <EChart option={modelDistributionOption} className="h-56 min-w-0 md:h-[22rem]" />
                  <div className="flex h-auto flex-col justify-start gap-2 overflow-y-auto pr-2 md:max-h-[22rem]">
                    {modelDistributionLegend.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        aria-pressed={item.enabled}
                        onClick={() => toggleModelDistributionLegend(item.name)}
                        className={[
                          "grid w-full grid-cols-[minmax(0,1fr)_max-content_max-content] items-center gap-x-3 rounded-xl px-2 py-1.5 text-left text-sm transition",
                          item.enabled
                            ? "text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                            : "text-slate-400 opacity-60 hover:bg-slate-50 dark:text-white/35 dark:hover:bg-white/5",
                        ].join(" ")}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-3.5 w-3.5 shrink-0 rounded-full ${item.colorClass} opacity-80 ring-1 ring-black/5 dark:ring-white/10`}
                          />
                          <span className="min-w-0 truncate text-slate-700 dark:text-white/80">
                            {item.name}
                          </span>
                        </div>
                        <span className="min-w-[3.5rem] whitespace-nowrap text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                          {item.valueLabel}
                        </span>
                        <span className="min-w-[4.25rem] whitespace-nowrap text-right tabular-nums text-slate-500 dark:text-white/55">
                          {item.percentLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </Card>

              <Card
                title={t("monitor.daily_usage_trend")}
                description={t("monitor.daily_desc", { days: timeRange })}
                loading={isRefreshing}
              >
                <div className="flex h-72 min-w-0 flex-col overflow-hidden">
                  <EChart
                    option={dailyTrendOption}
                    className="min-h-0 flex-1 min-w-0"
                    replaceMerge="series"
                  />
                  <ChartLegend
                    className="shrink-0 pt-4"
                    items={[
                      ...(dailyLegendAvailability.hasInput
                        ? [
                            {
                              key: DAILY_LEGEND_KEYS.input,
                              label: t("monitor.input_token"),
                              colorClass: "bg-violet-400",
                              enabled: dailyLegendSelected[DAILY_LEGEND_KEYS.input] ?? true,
                              onToggle: toggleDailyLegend,
                            },
                          ]
                        : []),
                      ...(dailyLegendAvailability.hasOutput
                        ? [
                            {
                              key: DAILY_LEGEND_KEYS.output,
                              label: t("monitor.output_token_legend"),
                              colorClass: "bg-emerald-400",
                              enabled: dailyLegendSelected[DAILY_LEGEND_KEYS.output] ?? true,
                              onToggle: toggleDailyLegend,
                            },
                          ]
                        : []),
                      ...(dailyLegendAvailability.hasRequests
                        ? [
                            {
                              key: DAILY_LEGEND_KEYS.requests,
                              label: t("monitor.requests"),
                              colorClass: "bg-blue-500",
                              enabled: dailyLegendSelected[DAILY_LEGEND_KEYS.requests] ?? true,
                              onToggle: toggleDailyLegend,
                            },
                          ]
                        : []),
                    ]}
                  />
                </div>
              </Card>
            </section>
          </Reveal>

          {apikeyDistributionData.length > 0 && (
            <Reveal>
              <Card
                title={t("monitor.apikey_distribution")}
                description={t("monitor.apikey_distribution_desc", {
                  days: timeRange,
                  metric: apikeyMetric === "requests" ? t("monitor.requests") : t("monitor.token"),
                })}
                actions={apikeyActions}
                loading={isRefreshing}
              >
                <div className="flex h-auto flex-col gap-4 md:grid md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)] md:items-center">
                  <EChart option={apikeyDistributionOption} className="h-56 min-w-0 md:h-[22rem]" />
                  <div className="flex h-auto flex-col justify-start gap-2 overflow-y-auto pr-2 md:max-h-[22rem]">
                    {apikeyDistributionLegend.map((item) => (
                      <button
                        key={item.name}
                        type="button"
                        aria-pressed={item.enabled}
                        onClick={() => toggleApikeyDistributionLegend(item.name)}
                        className={[
                          "grid w-full grid-cols-[minmax(0,1fr)_max-content_max-content] items-center gap-x-3 rounded-xl px-2 py-1.5 text-left text-sm transition",
                          item.enabled
                            ? "text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10"
                            : "text-slate-400 opacity-60 hover:bg-slate-50 dark:text-white/35 dark:hover:bg-white/5",
                        ].join(" ")}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-3.5 w-3.5 shrink-0 rounded-full ${item.colorClass} opacity-80 ring-1 ring-black/5 dark:ring-white/10`}
                          />
                          <span className="min-w-0 truncate text-slate-700 dark:text-white/80">
                            {item.name}
                          </span>
                        </div>
                        <span className="min-w-[3.5rem] whitespace-nowrap text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                          {item.valueLabel}
                        </span>
                        <span className="min-w-[4.25rem] whitespace-nowrap text-right tabular-nums text-slate-500 dark:text-white/55">
                          {item.percentLabel}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </Card>
            </Reveal>
          )}

          <Reveal>
            <Card
              title={t("monitor.hourly_model.title")}
              description={t("monitor.hourly_model_desc")}
              actions={<HourWindowSelector value={modelHourWindow} onChange={setModelHourWindow} />}
              loading={isRefreshing}
            >
              <EChart option={hourlyModelOption} className="h-64 sm:h-72" replaceMerge="series" />
              <ChartLegend
                className="pt-4 max-h-32 overflow-y-auto justify-start sm:justify-center sm:max-h-none"
                items={[
                  ...hourlySeries.modelKeys.map((key) => ({
                    key,
                    label: getHourlyModelSeriesLabel(key),
                    colorClass: hourlyModelPalette.classByKey[key] ?? "bg-slate-400",
                    enabled: hourlyModelSelected[key] ?? true,
                    onToggle: toggleHourlyModelLegend,
                  })),
                  {
                    key: HOURLY_MODEL_TOTAL_KEY,
                    label: getHourlyModelSeriesLabel(HOURLY_MODEL_TOTAL_KEY),
                    colorClass:
                      hourlyModelPalette.classByKey[HOURLY_MODEL_TOTAL_KEY] ?? "bg-blue-500",
                    enabled: hourlyModelSelected[HOURLY_MODEL_TOTAL_KEY] ?? true,
                    onToggle: toggleHourlyModelLegend,
                  },
                ]}
              />
            </Card>
          </Reveal>

          <Reveal>
            <Card
              title={t("monitor.hourly_token.title")}
              description={t("monitor.hourly_token_desc")}
              actions={<HourWindowSelector value={tokenHourWindow} onChange={setTokenHourWindow} />}
              loading={isRefreshing}
            >
              <EChart option={hourlyTokenOption} className="h-64 sm:h-72" replaceMerge="series" />
              <ChartLegend
                className="pt-4 max-h-32 overflow-y-auto justify-start sm:justify-center sm:max-h-none"
                items={[
                  ...hourlySeries.tokenKeys
                    .filter((key) => key !== HOURLY_TOKEN_KEYS.total)
                    .map((key) => ({
                      key,
                      label: hourlyTokenLabels[key] ?? key,
                      colorClass: hourlyTokenPalette.classByKey[key] ?? "bg-slate-400",
                      enabled: hourlyTokenSelected[key] ?? true,
                      onToggle: toggleHourlyTokenLegend,
                    })),
                  {
                    key: HOURLY_TOKEN_KEYS.total,
                    label: hourlyTokenLabels[HOURLY_TOKEN_KEYS.total],
                    colorClass:
                      hourlyTokenPalette.classByKey[HOURLY_TOKEN_KEYS.total] ?? "bg-blue-500",
                    enabled: hourlyTokenSelected[HOURLY_TOKEN_KEYS.total] ?? true,
                    onToggle: toggleHourlyTokenLegend,
                  },
                ]}
              />
            </Card>
          </Reveal>
        </>
      )}
    </div>
  );
}
