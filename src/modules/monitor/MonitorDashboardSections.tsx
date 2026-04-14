import { Activity, ChartSpline, Coins, ShieldCheck, Sigma } from "lucide-react";
import type { HourWindow } from "@/modules/monitor/monitor-constants";
import { formatNumber, formatRate } from "@/modules/monitor/monitor-utils";
import { AnimatedNumber } from "@/modules/ui/AnimatedNumber";
import { Reveal } from "@/modules/ui/Reveal";
import { EChart } from "@/modules/ui/charts/EChart";
import { ChartLegend } from "@/modules/ui/charts/ChartLegend";
import {
  HourWindowSelector,
  KpiCard,
  MonitorCard as Card,
} from "@/modules/monitor/MonitorPagePieces";

export function MonitorKpiSection({
  t,
  metrics,
  hasData,
  isLoading,
  refreshData,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  metrics: {
    totalRequests: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    inputTokens: number;
      outputTokens: number;
      totalTokens: number;
  };
  hasData: boolean;
  isLoading: boolean;
  refreshData: () => Promise<void>;
}) {
  return (
    <>
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
                {t("monitor.refresh")}
              </button>
            </div>
          </section>
        </Reveal>
      ) : null}
    </>
  );
}

export function MonitorDistributionSections({
  t,
  timeRange,
  modelMetric,
  setModelMetric,
  modelDistributionOption,
  modelDistributionLegend,
  toggleModelDistributionLegend,
  dailyTrendOption,
  dailyLegendAvailability,
  dailyLegendSelected,
  toggleDailyLegend,
  apikeyDistributionData,
  apikeyMetric,
  setApikeyMetric,
  apikeyDistributionOption,
  apikeyDistributionLegend,
  toggleApikeyDistributionLegend,
  isRefreshing,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  timeRange: number;
  modelMetric: "requests" | "tokens";
  setModelMetric: (value: "requests" | "tokens") => void;
  modelDistributionOption: Record<string, unknown>;
  modelDistributionLegend: Array<{ name: string; valueLabel: string; percentLabel: string; colorClass: string; enabled: boolean }>;
  toggleModelDistributionLegend: (name: string) => void;
  dailyTrendOption: Record<string, unknown>;
  dailyLegendAvailability: { hasInput: boolean; hasOutput: boolean; hasRequests: boolean };
  dailyLegendSelected: Record<string, boolean>;
  toggleDailyLegend: (key: string) => void;
  apikeyDistributionData: Array<{ name: string; value: number }>;
  apikeyMetric: "requests" | "tokens";
  setApikeyMetric: (value: "requests" | "tokens") => void;
  apikeyDistributionOption: Record<string, unknown>;
  apikeyDistributionLegend: Array<{ name: string; valueLabel: string; percentLabel: string; colorClass: string; enabled: boolean }>;
  toggleApikeyDistributionLegend: (name: string) => void;
  isRefreshing: boolean;
}) {
  const modelActions = (
    <div className="flex">
      <div className="relative inline-flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
        <button
          type="button"
          onClick={() => setModelMetric("requests")}
          className={modelMetric === "requests" ? "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-semibold text-white bg-slate-900 dark:text-neutral-950 dark:bg-white" : "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs text-slate-700 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"}
        >
          {t("monitor.requests")}
        </button>
        <button
          type="button"
          onClick={() => setModelMetric("tokens")}
          className={modelMetric === "tokens" ? "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-semibold text-white bg-slate-900 dark:text-neutral-950 dark:bg-white" : "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs text-slate-700 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"}
        >
          {t("monitor.token")}
        </button>
      </div>
    </div>
  );

  const apikeyActions = (
    <div className="flex">
      <div className="relative inline-flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
        <button
          type="button"
          onClick={() => setApikeyMetric("requests")}
          className={apikeyMetric === "requests" ? "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-semibold text-white bg-slate-900 dark:text-neutral-950 dark:bg-white" : "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs text-slate-700 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"}
        >
          {t("monitor.requests")}
        </button>
        <button
          type="button"
          onClick={() => setApikeyMetric("tokens")}
          className={apikeyMetric === "tokens" ? "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs font-semibold text-white bg-slate-900 dark:text-neutral-950 dark:bg-white" : "relative z-10 inline-flex h-8 shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 text-xs text-slate-700 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"}
        >
          {t("monitor.token")}
        </button>
      </div>
    </div>
  );

  return (
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
              <EChart option={dailyTrendOption} className="min-h-0 flex-1 min-w-0" replaceMerge="series" />
              <ChartLegend
                className="shrink-0 pt-4"
                items={[
                  ...(dailyLegendAvailability.hasInput
                    ? [
                        {
                          key: "daily_input",
                          label: t("monitor.input_token"),
                          colorClass: "bg-violet-400",
                          enabled: dailyLegendSelected["daily_input"] ?? true,
                          onToggle: toggleDailyLegend,
                        },
                      ]
                    : []),
                  ...(dailyLegendAvailability.hasOutput
                    ? [
                        {
                          key: "daily_output",
                          label: t("monitor.output_token_legend"),
                          colorClass: "bg-emerald-400",
                          enabled: dailyLegendSelected["daily_output"] ?? true,
                          onToggle: toggleDailyLegend,
                        },
                      ]
                    : []),
                  ...(dailyLegendAvailability.hasRequests
                    ? [
                        {
                          key: "daily_requests",
                          label: t("monitor.requests"),
                          colorClass: "bg-blue-500",
                          enabled: dailyLegendSelected["daily_requests"] ?? true,
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

      {apikeyDistributionData.length > 0 ? (
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
      ) : null}
    </>
  );
}

export function MonitorHourlySections({
  t,
  isRefreshing,
  modelHourWindow,
  setModelHourWindow,
  hourlyModelLegendKeys,
  hourlyModelOption,
  hourlySeries,
  getHourlyModelSeriesLabel,
  hourlyModelPalette,
  hourlyModelSelected,
  toggleHourlyModelLegend,
  tokenHourWindow,
  setTokenHourWindow,
  hourlyTokenOption,
  hourlyTokenLabels,
  hourlyTokenPalette,
  hourlyTokenSelected,
  toggleHourlyTokenLegend,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  isRefreshing: boolean;
  modelHourWindow: HourWindow;
  setModelHourWindow: (value: HourWindow) => void;
  hourlyModelLegendKeys: string[];
  hourlyModelOption: Record<string, unknown>;
  hourlySeries: {
    modelKeys: string[];
    tokenKeys: string[];
  };
  getHourlyModelSeriesLabel: (key: string) => string;
  hourlyModelPalette: { classByKey: Record<string, string> };
  hourlyModelSelected: Record<string, boolean>;
  toggleHourlyModelLegend: (key: string) => void;
  tokenHourWindow: HourWindow;
  setTokenHourWindow: (value: HourWindow) => void;
  hourlyTokenOption: Record<string, unknown>;
  hourlyTokenLabels: Record<string, string>;
  hourlyTokenPalette: { classByKey: Record<string, string> };
  hourlyTokenSelected: Record<string, boolean>;
  toggleHourlyTokenLegend: (key: string) => void;
}) {
  return (
    <>
      <Reveal>
        <Card
          title={t("monitor.hourly_model.title")}
          description={t("monitor.hourly_model_desc")}
          actions={<HourWindowSelector value={modelHourWindow as any} onChange={setModelHourWindow} />}
          loading={isRefreshing}
        >
          <EChart option={hourlyModelOption} className="h-64 sm:h-72" replaceMerge="series" />
          <ChartLegend
            className="max-h-32 justify-start overflow-y-auto pt-4 sm:max-h-none sm:justify-center"
            items={hourlyModelLegendKeys.map((key) => ({
              key,
              label: getHourlyModelSeriesLabel(key),
              colorClass: hourlyModelPalette.classByKey[key] ?? "bg-slate-400",
              enabled: hourlyModelSelected[key] ?? true,
              onToggle: toggleHourlyModelLegend,
            }))}
          />
        </Card>
      </Reveal>

      <Reveal>
        <Card
          title={t("monitor.hourly_token.title")}
          description={t("monitor.hourly_token_desc")}
          actions={<HourWindowSelector value={tokenHourWindow as any} onChange={setTokenHourWindow} />}
          loading={isRefreshing}
        >
          <EChart option={hourlyTokenOption} className="h-64 sm:h-72" replaceMerge="series" />
          <ChartLegend
            className="max-h-32 justify-start overflow-y-auto pt-4 sm:max-h-none sm:justify-center"
            items={hourlySeries.tokenKeys.map((key) => ({
              key,
              label: hourlyTokenLabels[key] ?? key,
              colorClass: hourlyTokenPalette.classByKey[key] ?? "bg-slate-400",
              enabled: hourlyTokenSelected[key] ?? true,
              onToggle: toggleHourlyTokenLegend,
            }))}
          />
        </Card>
      </Reveal>
    </>
  );
}
