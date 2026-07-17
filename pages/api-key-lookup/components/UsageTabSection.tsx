import { useMemo, type ReactNode } from "react";
import {
  Activity,
  Coins,
  MessagesSquare,
  ShieldCheck,
  Sigma,
} from "lucide-react";
import { AnimatedNumber } from "@code-proxy/ui";
import { Reveal } from "@code-proxy/ui";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { EChart } from "@code-proxy/ui";
import { ChartLegend } from "@code-proxy/ui";
import { HoverTooltip } from "@code-proxy/ui";
import { KpiCard, MonitorCard as Card } from "@features/monitor-widgets";
import type {
  ModelDistributionDatum,
  DailySeriesPoint,
} from "@features/monitor-widgets/chart-options/types";
import type { PublicUsageLimits } from "../types";
import { QuotaLimitKpiCards } from "./QuotaLimitsBanner";

const DAILY_LEGEND_KEYS = {
  input: "daily_input",
  output: "daily_output",
  requests: "daily_requests",
} as const;

type HeatmapPoint = {
  date: string;
  requests: number;
  sessions: number;
  tokens: number;
  cost: number;
};

const HEATMAP_LEVEL_CLASSES = [
  "bg-slate-100 dark:bg-white/10",
  "bg-blue-100 dark:bg-blue-950",
  "bg-blue-300 dark:bg-blue-700",
  "bg-blue-500 dark:bg-blue-500",
  "bg-blue-700 dark:bg-blue-300",
] as const;

const formatInteger = (value: number) => Math.round(value).toLocaleString();

function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildHeatmapDays() {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end);
  start.setDate(end.getDate() - 364);

  const days: string[] = [];
  for (
    let current = new Date(start);
    current <= end;
    current.setDate(current.getDate() + 1)
  ) {
    days.push(localDateKey(current));
  }
  return { days, leadingEmptyCells: start.getDay() };
}

function heatmapLevel(requests: number, maxRequests: number) {
  if (requests <= 0 || maxRequests <= 0) return 0;
  return Math.min(4, Math.max(1, Math.ceil((requests / maxRequests) * 4)));
}

function HeatmapTooltip({
  t,
  date,
  point,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  date: string;
  point?: HeatmapPoint;
}) {
  const requests = point?.requests ?? 0;
  return (
    <span className="block space-y-1 text-left">
      <span className="block font-semibold">{date}</span>
      {requests > 0 ? (
        <span className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 tabular-nums">
          <span>{t("apikey_lookup.requests")}</span>
          <span className="text-right">{requests.toLocaleString()}</span>
          <span>{t("apikey_lookup.total_sessions")}</span>
          <span className="text-right">
            {(point?.sessions ?? 0).toLocaleString()}
          </span>
          <span>{t("apikey_lookup.token")}</span>
          <span className="text-right">
            {(point?.tokens ?? 0).toLocaleString()}
          </span>
          <span>{t("apikey_lookup.total_cost")}</span>
          <span className="text-right">${(point?.cost ?? 0).toFixed(4)}</span>
        </span>
      ) : (
        <span className="block text-slate-500 dark:text-white/60">
          {t("apikey_lookup.no_usage_on_day")}
        </span>
      )}
    </span>
  );
}

function CalendarHeatmap({
  t,
  heatmapSeries,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  heatmapSeries: HeatmapPoint[];
}) {
  const { days, leadingEmptyCells } = useMemo(buildHeatmapDays, []);
  const pointsByDate = useMemo(() => {
    const byDate = new Map<string, HeatmapPoint>();
    for (const point of heatmapSeries) byDate.set(point.date, point);
    return byDate;
  }, [heatmapSeries]);
  const maxRequests = useMemo(
    () =>
      heatmapSeries.reduce((max, point) => Math.max(max, point.requests), 0),
    [heatmapSeries],
  );
  const emptyCells: ReactNode[] = Array.from(
    { length: leadingEmptyCells },
    (_, index) => (
      <span key={`empty-${index}`} className="h-3 w-3" aria-hidden="true" />
    ),
  );

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto pb-1">
        <div
          className="mx-auto grid w-max grid-flow-col grid-rows-7 gap-1 py-1"
          style={{ gridAutoColumns: "0.75rem" }}
          aria-label={t("apikey_lookup.calendar_heatmap")}
        >
          {emptyCells}
          {days.map((date) => {
            const point = pointsByDate.get(date);
            const level = heatmapLevel(point?.requests ?? 0, maxRequests);
            return (
              <HoverTooltip
                key={date}
                className="h-3 w-3"
                placement="bottom"
                content={<HeatmapTooltip t={t} date={date} point={point} />}
              >
                <span
                  tabIndex={0}
                  className={`block h-3 w-3 cursor-pointer rounded-sm ring-1 ring-black/[0.03] transition duration-150 hover:scale-110 hover:ring-blue-400/70 focus:outline-none focus:ring-2 focus:ring-blue-400/70 dark:ring-white/[0.04] ${HEATMAP_LEVEL_CLASSES[level]}`}
                  aria-label={`${date}: ${point?.requests ?? 0} ${t("apikey_lookup.requests")}`}
                />
              </HoverTooltip>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-center gap-1 text-xs text-slate-500 dark:text-white/55 sm:justify-end">
        <span>{t("apikey_lookup.heatmap_less")}</span>
        {HEATMAP_LEVEL_CLASSES.map((className) => (
          <span
            key={className}
            className={`h-3 w-3 rounded-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04] ${className}`}
            aria-hidden="true"
          />
        ))}
        <span>{t("apikey_lookup.heatmap_more")}</span>
      </div>
    </div>
  );
}

function HeatmapSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="overflow-hidden pb-1">
        <div
          className="mx-auto grid w-max grid-flow-col grid-rows-7 gap-1"
          style={{ gridAutoColumns: "0.75rem" }}
        >
          {Array.from({ length: 371 }, (_, index) => (
            <span
              key={index}
              className="h-3 w-3 rounded-sm bg-slate-100 motion-safe:animate-pulse dark:bg-white/10"
            />
          ))}
        </div>
      </div>
      <div className="ml-auto h-3 w-28 rounded bg-slate-100 motion-safe:animate-pulse dark:bg-white/10" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="h-72 rounded-xl bg-slate-100 motion-safe:animate-pulse dark:bg-white/10"
      aria-hidden="true"
    />
  );
}

function KpiValueSkeleton() {
  return (
    <span
      className="block h-8 w-24 rounded-md bg-slate-100 motion-safe:animate-pulse dark:bg-white/10"
      aria-hidden="true"
    />
  );
}

export function UsageTabSection({
  t,
  timeRange,
  chartStats,
  chartLoading,
  quotaLimits,
  modelMetric,
  setModelMetric,
  heatmapSeries,
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
        total_sessions?: number;
        total_cost: number;
      }
    | undefined;
  chartLoading: boolean;
  quotaLimits?: PublicUsageLimits | null;
  modelMetric: "requests" | "tokens";
  setModelMetric: (value: "requests" | "tokens") => void;
  heatmapSeries: HeatmapPoint[];
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
  dailyLegendAvailability: {
    hasInput: boolean;
    hasOutput: boolean;
    hasRequests: boolean;
  };
  dailyLegendSelected: Record<string, boolean>;
  toggleDailyLegend: (key: string) => void;
}) {
  const showInitialLoading = chartLoading && !chartStats;
  const renderKpiValue = (value: ReactNode) =>
    showInitialLoading ? <KpiValueSkeleton /> : value;

  return (
    <Reveal>
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <QuotaLimitKpiCards
            t={t}
            limits={quotaLimits}
            renderValue={renderKpiValue}
          />
          <KpiCard
            title={t("apikey_lookup.total_requests")}
            icon={Activity}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={renderKpiValue(
              <AnimatedNumber
                value={chartStats?.total ?? 0}
                format={formatInteger}
              />,
            )}
          />
          <KpiCard
            title={t("common.success_rate")}
            icon={ShieldCheck}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={renderKpiValue(
              <AnimatedNumber
                value={chartStats?.success_rate ?? 0}
                format={(value) => `${value.toFixed(1)}%`}
              />,
            )}
          />
          <KpiCard
            title={t("apikey_lookup.total_tokens")}
            icon={Sigma}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={renderKpiValue(
              <AnimatedNumber
                value={chartStats?.total_tokens ?? 0}
                format={formatInteger}
              />,
            )}
          />
          <KpiCard
            title={t("apikey_lookup.total_sessions")}
            icon={MessagesSquare}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={renderKpiValue(
              <AnimatedNumber
                value={chartStats?.total_sessions ?? 0}
                format={formatInteger}
              />,
            )}
          />
          <KpiCard
            title={t("apikey_lookup.total_cost")}
            icon={Coins}
            hint={t("apikey_lookup.last_n_days", { days: timeRange })}
            value={renderKpiValue(
              <AnimatedNumber
                value={chartStats?.total_cost ?? 0}
                format={(value) => `$${value.toFixed(4)}`}
              />,
            )}
          />
        </div>

        <Card
          title={t("apikey_lookup.calendar_heatmap")}
          description={t("apikey_lookup.calendar_heatmap_desc")}
          loading={false}
        >
          {showInitialLoading ? (
            <HeatmapSkeleton />
          ) : (
            <CalendarHeatmap t={t} heatmapSeries={heatmapSeries} />
          )}
        </Card>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <Card
            title={t("apikey_lookup.model_distribution")}
            description={t(
              modelMetric === "requests"
                ? "apikey_lookup.model_distribution_desc_requests"
                : "apikey_lookup.model_distribution_desc_tokens",
            )}
            actions={
              <Tabs
                value={modelMetric}
                onValueChange={(next) =>
                  setModelMetric(next as "requests" | "tokens")
                }
              >
                <TabsList>
                  <TabsTrigger value="requests">
                    {t("apikey_lookup.requests")}
                  </TabsTrigger>
                  <TabsTrigger value="tokens">
                    {t("apikey_lookup.token")}
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            }
            loading={false}
          >
            {showInitialLoading ? (
              <ChartSkeleton />
            ) : modelDistributionData.length > 0 ? (
              <div className="flex flex-col gap-4 sm:grid sm:h-72 sm:grid-cols-[minmax(0,1fr)_220px]">
                <EChart
                  option={modelDistributionOption}
                  className="h-52 min-w-0 sm:h-72"
                />
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
            description={t("apikey_lookup.daily_usage_desc", {
              days: timeRange,
            })}
            loading={false}
          >
            {showInitialLoading ? (
              <ChartSkeleton />
            ) : dailySeries.length > 0 ? (
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
                            label: t("apikey_lookup.input_token"),
                            colorClass: "bg-violet-400",
                            enabled:
                              dailyLegendSelected[DAILY_LEGEND_KEYS.input] ??
                              true,
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
                            enabled:
                              dailyLegendSelected[DAILY_LEGEND_KEYS.output] ??
                              true,
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
                            enabled:
                              dailyLegendSelected[DAILY_LEGEND_KEYS.requests] ??
                              true,
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
