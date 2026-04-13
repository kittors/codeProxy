import { Activity, Coins, ShieldCheck, Sigma } from "lucide-react";
import { AnimatedNumber } from "@/modules/ui/AnimatedNumber";
import { Reveal } from "@/modules/ui/Reveal";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { EChart } from "@/modules/ui/charts/EChart";
import { ChartLegend } from "@/modules/ui/charts/ChartLegend";
import { KpiCard, MonitorCard as Card } from "@/modules/monitor/MonitorPagePieces";
import type { ModelDistributionDatum, DailySeriesPoint } from "@/modules/monitor/chart-options/types";

const DAILY_LEGEND_KEYS = {
  input: "daily_input",
  output: "daily_output",
  requests: "daily_requests",
} as const;

export function UsageTabSection({
  t,
  timeRange,
  chartStats,
  chartLoading,
  modelMetric,
  setModelMetric,
  modelDistributionData,
  modelDistributionOption,
  modelDistributionLegend,
  dailySeries,
  dailyTrendOption,
  dailyLegendAvailability,
  dailyLegendSelected,
  toggleDailyLegend,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  timeRange: number;
  chartStats:
    | {
        total: number;
        success_rate: number;
        total_tokens: number;
        total_cost: number;
      }
    | undefined;
  chartLoading: boolean;
  modelMetric: "requests" | "tokens";
  setModelMetric: (value: "requests" | "tokens") => void;
  modelDistributionData: ModelDistributionDatum[];
  modelDistributionOption: Record<string, unknown>;
  modelDistributionLegend: Array<{
    name: string;
    valueLabel: string;
    percentLabel: string;
    colorClass: string;
  }>;
  dailySeries: DailySeriesPoint[];
  dailyTrendOption: Record<string, unknown>;
  dailyLegendAvailability: { hasInput: boolean; hasOutput: boolean; hasRequests: boolean };
  dailyLegendSelected: Record<string, boolean>;
  toggleDailyLegend: (key: string) => void;
}) {
  return (
    <Reveal>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title={t("apikey_lookup.total_requests")}
            icon={Activity}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={<AnimatedNumber value={chartStats?.total ?? 0} format={(value) => value.toLocaleString()} />}
          />
          <KpiCard
            title={t("common.success_rate")}
            icon={ShieldCheck}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={<AnimatedNumber value={chartStats?.success_rate ?? 0} format={(value) => `${value.toFixed(1)}%`} />}
          />
          <KpiCard
            title={t("apikey_lookup.total_tokens")}
            icon={Sigma}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={<AnimatedNumber value={chartStats?.total_tokens ?? 0} format={(value) => value.toLocaleString()} />}
          />
          <KpiCard
            title={t("apikey_lookup.total_cost")}
            icon={Coins}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={<AnimatedNumber value={chartStats?.total_cost ?? 0} format={(value) => `$${value.toFixed(4)}`} />}
          />
        </div>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <Card
            title={t("apikey_lookup.model_distribution")}
            description={t(
              modelMetric === "requests"
                ? "apikey_lookup.model_distribution_desc_requests"
                : "apikey_lookup.model_distribution_desc_tokens",
            )}
            actions={
              <Tabs value={modelMetric} onValueChange={(next) => setModelMetric(next as "requests" | "tokens")}>
                <TabsList>
                  <TabsTrigger value="requests">{t("apikey_lookup.requests")}</TabsTrigger>
                  <TabsTrigger value="tokens">{t("apikey_lookup.token")}</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            loading={chartLoading}
          >
            {modelDistributionData.length > 0 ? (
              <div className="flex flex-col gap-4 sm:grid sm:h-72 sm:grid-cols-[minmax(0,1fr)_220px]">
                <EChart option={modelDistributionOption} className="h-52 min-w-0 sm:h-72" />
                <div className="flex flex-row flex-wrap justify-center gap-2 overflow-y-auto pr-1 sm:h-72 sm:flex-col">
                  {modelDistributionLegend.map((item) => (
                    <div
                      key={item.name}
                      className="inline-flex items-center gap-x-1 text-xs sm:grid sm:grid-cols-[minmax(0,120px)_40px_52px] sm:text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                        <span
                          className={`h-3 w-3 shrink-0 rounded-full opacity-80 ring-1 ring-black/5 dark:ring-white/10 sm:h-3.5 sm:w-3.5 ${item.colorClass}`}
                        />
                        <span className="min-w-0 truncate text-slate-700 dark:text-white/80">
                          {item.name}
                        </span>
                      </div>
                      <span className="text-right font-semibold tabular-nums text-slate-900 dark:text-white">
                        {item.valueLabel}
                      </span>
                      <span className="hidden text-right tabular-nums text-slate-500 dark:text-white/55 sm:inline">
                        {item.percentLabel}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
                {t("apikey_lookup.no_data")}
              </p>
            )}
          </Card>

          <Card
            title={t("apikey_lookup.daily_usage")}
            description={t("apikey_lookup.daily_usage_desc", { days: timeRange })}
            loading={chartLoading}
          >
            {dailySeries.length > 0 ? (
              <div className="flex h-72 min-w-0 flex-col overflow-hidden">
                <EChart option={dailyTrendOption} className="min-h-0 flex-1 min-w-0" replaceMerge="series" />
                <ChartLegend
                  className="shrink-0 pt-4"
                  items={[
                    ...(dailyLegendAvailability.hasInput
                      ? [
                          {
                            key: DAILY_LEGEND_KEYS.input,
                            label: t("apikey_lookup.input_token"),
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
                            label: t("apikey_lookup.output_token"),
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
                            label: t("apikey_lookup.requests"),
                            colorClass: "bg-blue-500",
                            enabled: dailyLegendSelected[DAILY_LEGEND_KEYS.requests] ?? true,
                            onToggle: toggleDailyLegend,
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-400 dark:text-white/30">
                {t("apikey_lookup.no_data")}
              </p>
            )}
          </Card>
        </section>
      </div>
    </Reveal>
  );
}
