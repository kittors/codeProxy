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
import type { UsageData } from "@/lib/http/types";
import {
  computeKpiMetrics,
  filterUsageByDays,
  formatNumber,
  formatRate,
  iterateUsageRecords,
} from "@/modules/monitor/monitor-utils";
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
  formatLocalDateKey,
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

const createEmptyUsage = (): UsageData => ({ apis: {} });

export function MonitorPage() {
  const {
    state: { mode },
  } = useTheme();
  const isDark = mode === "dark";

  const [dailyLegendSelected, setDailyLegendSelected] = useState<Record<string, boolean>>({
    "输入 Token": true,
    "输出 Token": true,
    请求数: true,
  });

  const [hourlyModelSelected, setHourlyModelSelected] = useState<Record<string, boolean>>({
    总请求: true,
  });

  const [hourlyTokenSelected, setHourlyTokenSelected] = useState<Record<string, boolean>>({
    输入: true,
    输出: true,
    推理: true,
    缓存: true,
    "总 Token": true,
  });

  const [rawUsage, setRawUsage] = useState<UsageData>(createEmptyUsage);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiFilterInput, setApiFilterInput] = useState("");
  const [apiFilter, setApiFilter] = useState("");
  const [modelHourWindow, setModelHourWindow] = useState<HourWindow>(24);
  const [tokenHourWindow, setTokenHourWindow] = useState<HourWindow>(24);
  const [modelMetric, setModelMetric] = useState<"requests" | "tokens">("requests");
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [isPending, startTransition] = useTransition();

  const refreshData = useCallback(async () => {
    setIsRefreshing(true);
    setError(null);
    try {
      const usageData = await usageApi.getUsage();
      startTransition(() => {
        setRawUsage(usageData);
      });
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : "数据获取失败";
      setError(message);
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  const filteredUsage = useMemo(() => {
    return filterUsageByDays(rawUsage, timeRange, apiFilter);
  }, [rawUsage, timeRange, apiFilter]);

  const metrics = useMemo(() => computeKpiMetrics(filteredUsage), [filteredUsage]);

  const records = useMemo(() => iterateUsageRecords(filteredUsage), [filteredUsage]);

  const applyFilter = useCallback(() => {
    setApiFilter(apiFilterInput);
  }, [apiFilterInput]);

  const toggleDailyLegend = useCallback((key: string) => {
    if (key !== "输入 Token" && key !== "输出 Token" && key !== "请求数") return;
    setDailyLegendSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const toggleHourlyModelLegend = useCallback((key: string) => {
    setHourlyModelSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const toggleHourlyTokenLegend = useCallback((key: string) => {
    setHourlyTokenSelected((prev) => ({ ...prev, [key]: !(prev[key] ?? true) }));
  }, []);

  const hasData = metrics.requestCount > 0;
  const isLoading = isRefreshing || isPending;

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const modelTotals = useMemo(() => {
    const byModel = new Map<string, { requests: number; tokens: number }>();
    records.forEach((record) => {
      const current = byModel.get(record.model) ?? { requests: 0, tokens: 0 };
      byModel.set(record.model, {
        requests: current.requests + 1,
        tokens: current.tokens + (record.tokens?.total_tokens ?? 0),
      });
    });

    return [...byModel.entries()]
      .map(([model, value]) => ({ model, ...value }))
      .sort(
        (left, right) => right.requests - left.requests || left.model.localeCompare(right.model),
      );
  }, [records]);

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
      data.push({ name: "其他", value: otherValue });
    }
    return data;
  }, [modelMetric, sortedModelsByMetric]);

  const dailySeries = useMemo(() => {
    const byDay = new Map<
      string,
      { requests: number; inputTokens: number; outputTokens: number }
    >();

    records.forEach((record) => {
      const date = new Date(record.timestamp);
      if (!Number.isFinite(date.getTime())) return;
      const key = formatLocalDateKey(date);
      const current = byDay.get(key) ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
      byDay.set(key, {
        requests: current.requests + 1,
        inputTokens: current.inputTokens + (record.tokens?.input_tokens ?? 0),
        outputTokens: current.outputTokens + (record.tokens?.output_tokens ?? 0),
      });
    });

    const today = new Date();
    const points = Array.from({ length: timeRange }).map((_, index) => {
      const date = new Date(today);
      date.setDate(today.getDate() - (timeRange - 1 - index));
      const key = formatLocalDateKey(date);
      const label = formatMonthDay(date);
      const value = byDay.get(key) ?? { requests: 0, inputTokens: 0, outputTokens: 0 };
      return { label, ...value, totalTokens: value.inputTokens + value.outputTokens };
    });

    return points;
  }, [records, timeRange]);

  const hourlySeries = useMemo(() => {
    const hourWindow = 24;
    const now = Date.now();
    const endHour = Math.floor(now / 3_600_000);
    const startHour = endHour - hourWindow + 1;

    const hourLabels = Array.from({ length: hourWindow }).map((_, index) => {
      const hour = startHour + index;
      const date = new Date(hour * 3_600_000);
      const label = `${String(date.getHours()).padStart(2, "0")}:00`;
      return { hour, label };
    });

    const modelBuckets = new Map<number, Map<string, number>>();
    const tokenBuckets = new Map<
      number,
      { input: number; output: number; reasoning: number; cached: number }
    >();

    records.forEach((record) => {
      const ts = new Date(record.timestamp).getTime();
      if (!Number.isFinite(ts)) return;
      const hour = Math.floor(ts / 3_600_000);
      if (hour < startHour || hour > endHour) return;

      const modelMap = modelBuckets.get(hour) ?? new Map<string, number>();
      modelMap.set(record.model, (modelMap.get(record.model) ?? 0) + 1);
      modelBuckets.set(hour, modelMap);

      const tokens = tokenBuckets.get(hour) ?? { input: 0, output: 0, reasoning: 0, cached: 0 };
      tokenBuckets.set(hour, {
        input: tokens.input + (record.tokens?.input_tokens ?? 0),
        output: tokens.output + (record.tokens?.output_tokens ?? 0),
        reasoning: tokens.reasoning + (record.tokens?.reasoning_tokens ?? 0),
        cached: tokens.cached + (record.tokens?.cached_tokens ?? 0),
      });
    });

    const modelKeys = [...topModelKeys, "其他"];

    const modelPoints = hourLabels.map(({ hour, label }) => {
      const map = modelBuckets.get(hour) ?? new Map<string, number>();
      const stacks = modelKeys.map((key) => {
        if (key === "其他") {
          const sum = [...map.entries()].reduce((acc, [model, value]) => {
            return topModelKeys.includes(model) ? acc : acc + value;
          }, 0);
          return { key, value: sum };
        }
        return { key, value: map.get(key) ?? 0 };
      });
      return { label, stacks };
    });

    const tokenKeys = ["输入", "输出", "推理", "缓存"] as const;

    const tokenPoints = hourLabels.map(({ hour, label }) => {
      const totals = tokenBuckets.get(hour) ?? { input: 0, output: 0, reasoning: 0, cached: 0 };
      const stacks = [
        { key: "输入", value: totals.input },
        { key: "输出", value: totals.output },
        { key: "推理", value: totals.reasoning },
        { key: "缓存", value: totals.cached },
      ];
      return { label, stacks };
    });

    return { modelKeys, modelPoints, tokenKeys: [...tokenKeys], tokenPoints };
  }, [records, topModelKeys]);

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
      if (key === "其他") {
        colorByKey[key] = "rgba(148,163,184,0.58)";
        classByKey[key] = "bg-slate-400";
        return;
      }
      colorByKey[key] = HOURLY_MODEL_COLORS[index % HOURLY_MODEL_COLORS.length];
      classByKey[key] = palette[index % palette.length] ?? "bg-slate-400";
    });

    colorByKey["总请求"] = "#3b82f6";
    classByKey["总请求"] = "bg-blue-500";

    return { colorByKey, classByKey };
  }, [hourlySeries.modelKeys]);

  const hourlyTokenPalette = useMemo(() => {
    return {
      colorByKey: {
        输入: "rgba(110,231,183,0.88)",
        输出: "rgba(196,181,253,0.88)",
        推理: "rgba(252,211,77,0.88)",
        缓存: "rgba(94,234,212,0.88)",
        "总 Token": "#3b82f6",
      } as Record<string, string>,
      classByKey: {
        输入: "bg-emerald-400",
        输出: "bg-violet-400",
        推理: "bg-amber-400",
        缓存: "bg-teal-400",
        "总 Token": "bg-blue-500",
      } as Record<string, string>,
    };
  }, []);

  useEffect(() => {
    setHourlyModelSelected((prev) => {
      const next = { ...prev };
      for (const key of hourlySeries.modelKeys) {
        if (!(key in next)) next[key] = true;
      }
      if (!("总请求" in next)) next["总请求"] = true;
      return next;
    });
  }, [hourlySeries.modelKeys]);

  useEffect(() => {
    setHourlyTokenSelected((prev) => {
      const next = { ...prev };
      for (const key of hourlySeries.tokenKeys) {
        if (!(key in next)) next[key] = true;
      }
      if (!("总 Token" in next)) next["总 Token"] = true;
      return next;
    });
  }, [hourlySeries.tokenKeys]);

  const modelDistributionOption = useMemo(
    () => createModelDistributionOption({ isDark, data: modelDistributionData }),
    [isDark, modelDistributionData],
  );

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
      };
    });
  }, [modelDistributionData]);

  const dailyTrendOption = useMemo(
    () => createDailyTrendOption({ dailySeries, dailyLegendSelected, isDark }),
    [dailyLegendSelected, dailySeries, isDark, timeRange],
  );

  const hourlyModelOption = useMemo(
    () =>
      createHourlyModelOption({
        hourlySeries,
        modelHourWindow,
        hourlyModelSelected,
        paletteColorByKey: hourlyModelPalette.colorByKey,
        isDark,
      }),
    [
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
        isDark,
      }),
    [
      hourlySeries.tokenKeys,
      hourlySeries.tokenPoints,
      hourlyTokenPalette.colorByKey,
      hourlyTokenSelected,
      isDark,
      tokenHourWindow,
    ],
  );

  const modelActions = (
    <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
      {[
        { key: "requests", label: "请求" },
        { key: "tokens", label: "Token" },
      ].map((item) => {
        const active = modelMetric === item.key;
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => setModelMetric(item.key as "requests" | "tokens")}
            className={
              active
                ? "rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
                : "rounded-xl px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
            }
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
              <ChartSpline size={18} className="text-slate-900 dark:text-white" />
              <span>监控中心</span>
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
                placeholder="按 API key 过滤"
              />
            </div>
            <button
              type="button"
              onClick={applyFilter}
              className="inline-flex items-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/80 dark:hover:bg-white/10"
            >
              <Filter size={14} />
              应用过滤
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
                  刷新
                </span>
                <span
                  className={
                    isLoading
                      ? "col-start-1 row-start-1 opacity-100"
                      : "col-start-1 row-start-1 opacity-0"
                  }
                >
                  刷新中
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
            title="总请求"
            value={<AnimatedNumber value={metrics.requestCount} format={formatNumber} />}
            hint="已按时间范围过滤"
            icon={Activity}
          />
          <KpiCard
            title="成功率"
            value={<AnimatedNumber value={metrics.successRate} format={formatRate} />}
            hint={`成功 ${formatNumber(metrics.successCount)} / 失败 ${formatNumber(metrics.failedCount)}`}
            icon={ShieldCheck}
          />
          <KpiCard
            title="总 Token"
            value={<AnimatedNumber value={metrics.totalTokens} format={formatNumber} />}
            hint="输入 + 输出 + 推理 + 缓存"
            icon={Sigma}
          />
          <KpiCard
            title="输出 Token"
            value={<AnimatedNumber value={metrics.outputTokens} format={formatNumber} />}
            hint={`输入 Token：${formatNumber(metrics.inputTokens)}`}
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
              <p className="text-sm font-semibold text-slate-900 dark:text-white">暂无监控数据</p>
              <p className="text-sm text-slate-600 dark:text-white/65">
                可以点击上方“刷新”重新拉取数据。
              </p>
              <button
                type="button"
                onClick={() => void refreshData()}
                className="inline-flex min-w-[96px] items-center justify-center gap-1.5 rounded-2xl bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-800 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200"
              >
                <RefreshCw size={14} />
                刷新
              </button>
            </div>
          </section>
        </Reveal>
      ) : (
        <>
          <Reveal>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
              <Card
                title="模型用量分布"
                description={`最近 ${timeRange} 天 · 按${modelMetric === "requests" ? "请求数" : "Token"} · Top10`}
                actions={modelActions}
                loading={isRefreshing}
              >
                <div className="grid h-72 grid-cols-[minmax(0,1fr)_220px] gap-4">
                  <EChart option={modelDistributionOption} className="h-72 min-w-0" />
                  <div className="flex h-72 flex-col justify-center gap-2 overflow-y-auto pr-1">
                    {modelDistributionLegend.map((item) => (
                      <div
                        key={item.name}
                        className="grid grid-cols-[minmax(0,120px)_40px_52px] items-center gap-x-1 text-sm"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className={`h-3.5 w-3.5 shrink-0 rounded-full ${item.colorClass} opacity-80 ring-1 ring-black/5 dark:ring-white/10`}
                          />
                          <span className="min-w-0 truncate text-slate-700 dark:text-white/80">
                            {item.name}
                          </span>
                        </div>
                        <span className="text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                          {item.valueLabel}
                        </span>
                        <span className="text-right tabular-nums text-slate-500 dark:text-white/55">
                          {item.percentLabel}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>

              <Card
                title="每日用量趋势"
                description={`最近 ${timeRange} 天 · 请求数与 Token 用量趋势`}
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
                              key: "输入 Token",
                              label: "输入 Token",
                              colorClass: "bg-violet-400",
                              enabled: dailyLegendSelected["输入 Token"] ?? true,
                              onToggle: toggleDailyLegend,
                            },
                          ]
                        : []),
                      ...(dailyLegendAvailability.hasOutput
                        ? [
                            {
                              key: "输出 Token",
                              label: "输出 Token",
                              colorClass: "bg-emerald-400",
                              enabled: dailyLegendSelected["输出 Token"] ?? true,
                              onToggle: toggleDailyLegend,
                            },
                          ]
                        : []),
                      ...(dailyLegendAvailability.hasRequests
                        ? [
                            {
                              key: "请求数",
                              label: "请求数",
                              colorClass: "bg-blue-500",
                              enabled: dailyLegendSelected["请求数"] ?? true,
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

          <Reveal>
            <Card
              title="每小时模型请求分布"
              description="按小时聚合（Top5 模型 + 其他）"
              actions={<HourWindowSelector value={modelHourWindow} onChange={setModelHourWindow} />}
              loading={isRefreshing}
            >
              <div className="flex h-72 flex-col overflow-hidden">
                <EChart
                  option={hourlyModelOption}
                  className="min-h-0 flex-1"
                  replaceMerge="series"
                />
                <ChartLegend
                  className="shrink-0 pt-4"
                  items={[
                    ...hourlySeries.modelKeys.map((key) => ({
                      key,
                      label: key,
                      colorClass: hourlyModelPalette.classByKey[key] ?? "bg-slate-400",
                      enabled: hourlyModelSelected[key] ?? true,
                      onToggle: toggleHourlyModelLegend,
                    })),
                    {
                      key: "总请求",
                      label: "总请求",
                      colorClass: hourlyModelPalette.classByKey["总请求"] ?? "bg-blue-500",
                      enabled: hourlyModelSelected["总请求"] ?? true,
                      onToggle: toggleHourlyModelLegend,
                    },
                  ]}
                />
              </div>
            </Card>
          </Reveal>

          <Reveal>
            <Card
              title="每小时 Token 用量"
              description="按小时聚合（输入 / 输出 / 推理 / 缓存）"
              actions={<HourWindowSelector value={tokenHourWindow} onChange={setTokenHourWindow} />}
              loading={isRefreshing}
            >
              <div className="flex h-72 flex-col overflow-hidden">
                <EChart
                  option={hourlyTokenOption}
                  className="min-h-0 flex-1"
                  replaceMerge="series"
                />
                <ChartLegend
                  className="shrink-0 pt-4"
                  items={[
                    ...hourlySeries.tokenKeys.map((key) => ({
                      key,
                      label: key,
                      colorClass: hourlyTokenPalette.classByKey[key] ?? "bg-slate-400",
                      enabled: hourlyTokenSelected[key] ?? true,
                      onToggle: toggleHourlyTokenLegend,
                    })),
                    {
                      key: "总 Token",
                      label: "总 Token",
                      colorClass: hourlyTokenPalette.classByKey["总 Token"] ?? "bg-blue-500",
                      enabled: hourlyTokenSelected["总 Token"] ?? true,
                      onToggle: toggleHourlyTokenLegend,
                    },
                  ]}
                />
              </div>
            </Card>
          </Reveal>
        </>
      )}
    </div>
  );
}
