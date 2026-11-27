import { useMemo, type ReactNode } from "react";
import { Activity, CalendarClock, Coins, MessagesSquare, ShieldCheck, Sigma } from "@code-proxy/ui/icons";
import { AnimatedNumber, Button, ScrollFade, cn } from "@code-proxy/ui";
import { Reveal } from "@code-proxy/ui";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { EChart } from "@code-proxy/ui";
import { ChartLegend } from "@code-proxy/ui";
import { HoverTooltip } from "@code-proxy/ui";
import { useTheme } from "@code-proxy/ui";
import { MonitorCard as Card } from "@features/monitor-widgets";
import { dailyTrendColors } from "@features/monitor-widgets/chart-options/daily-trend";
import type {
  ModelDistributionDatum,
  DailySeriesPoint,
} from "@features/monitor-widgets/chart-options/types";
import type { PublicQuotaScope, PublicUsageLimits } from "../types";
import { QuotaLimitKpiCards } from "./QuotaLimitsBanner";
import { formatQuotaUsd } from "./kpiValueSize";

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

// 热力图按请求数着色，用请求身份色（蓝）的单色深浅阶：越忙越浓，与监控中心的「活跃时段」热力格
// 同一套。没有请求的格子保持中性的槽色（bg-sn-sunken）——它表示「没有数据」，不是「量很少」。
// 格子不再各描一圈细边：三百多个小方块每个都带轮廓，整块读起来是一张网格纸。
const HEATMAP_LEVEL_CLASSES = [
  "bg-sn-sunken",
  "bg-blue-500/20 dark:bg-blue-400/20",
  "bg-blue-500/40 dark:bg-blue-400/40",
  "bg-blue-500/65 dark:bg-blue-400/65",
  "bg-blue-500 dark:bg-blue-400",
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
  for (let current = new Date(start); current <= end; current.setDate(current.getDate() + 1)) {
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
          <span className="text-right">{(point?.sessions ?? 0).toLocaleString()}</span>
          <span>{t("apikey_lookup.token")}</span>
          <span className="text-right">{(point?.tokens ?? 0).toLocaleString()}</span>
          <span>{t("apikey_lookup.total_cost")}</span>
          <span className="text-right">${(point?.cost ?? 0).toFixed(4)}</span>
        </span>
      ) : (
        <span className="block opacity-70">
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
    () => heatmapSeries.reduce((max, point) => Math.max(max, point.requests), 0),
    [heatmapSeries],
  );
  const emptyCells: ReactNode[] = Array.from({ length: leadingEmptyCells }, (_, index) => (
    <span key={`empty-${index}`} className="h-3 w-3" aria-hidden="true" />
  ));

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
                  className={`block h-3 w-3 cursor-pointer rounded-sm transition-transform duration-150 hover:scale-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-sn-accent/60 ${HEATMAP_LEVEL_CLASSES[level]}`}
                  aria-label={`${date}: ${point?.requests ?? 0} ${t("apikey_lookup.requests")}`}
                />
              </HoverTooltip>
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-center gap-1 text-xs text-sn-label3 sm:justify-end">
        <span>{t("apikey_lookup.heatmap_less")}</span>
        {HEATMAP_LEVEL_CLASSES.map((className) => (
          <span
            key={className}
            className={`h-3 w-3 rounded-sm ${className}`}
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
              className="h-3 w-3 rounded-sm bg-sn-sunken motion-safe:animate-pulse"
            />
          ))}
        </div>
      </div>
      <div className="ml-auto h-3 w-28 rounded bg-sn-sunken motion-safe:animate-pulse" />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      className="h-72 rounded-inner bg-sn-sunken motion-safe:animate-pulse"
      aria-hidden="true"
    />
  );
}

function KpiValueSkeleton() {
  return (
    <span
      className="block h-8 w-24 rounded-md bg-sn-sunken motion-safe:animate-pulse"
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
  quotaScopes,
  expiresAt,
  showBillingShortcut,
  onOpenBilling,
  showApiKeyDistribution,
  apiKeyMetric,
  setApiKeyMetric,
  apiKeyDistributionData,
  apiKeyDistributionOption,
  apiKeyDistributionLegend,
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
  quotaScopes?: PublicQuotaScope[] | null;
  expiresAt?: string | null;
  showBillingShortcut?: boolean;
  onOpenBilling?: () => void;
  showApiKeyDistribution: boolean;
  apiKeyMetric: "requests" | "tokens";
  setApiKeyMetric: (value: "requests" | "tokens") => void;
  apiKeyDistributionData: ModelDistributionDatum[];
  apiKeyDistributionOption: Record<string, unknown>;
  apiKeyDistributionLegend: Array<{
    name: string;
    valueLabel: string;
    percentLabel: string;
    color: string;
  }>;
  modelMetric: "requests" | "tokens";
  setModelMetric: (value: "requests" | "tokens") => void;
  heatmapSeries: HeatmapPoint[];
  modelDistributionData: ModelDistributionDatum[];
  modelDistributionOption: Record<string, unknown>;
  modelDistributionLegend: Array<{
    name: string;
    valueLabel: string;
    percentLabel: string;
    color: string;
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
  const {
    state: { mode },
  } = useTheme();
  // 每日用量图例的色点与图表同一份颜色（输入 / 输出 Token 紫的浅、深两档，请求数蓝）。
  const dailyColors = dailyTrendColors(mode === "dark");
  const showInitialLoading = chartLoading && !chartStats;
  const renderKpiValue = (value: ReactNode) => (showInitialLoading ? <KpiValueSkeleton /> : value);

  const expiryMeta = useMemo(() => {
    if (!expiresAt) return null;
    const ms = new Date(expiresAt).getTime();
    if (Number.isNaN(ms)) return null;
    const diff = ms - Date.now();
    const expired = diff <= 0;
    const days = Math.max(1, Math.ceil(diff / (24 * 3600 * 1000)));
    return {
      expired,
      soon: !expired && diff <= 3 * 24 * 3600 * 1000,
      days,
      formatted: new Date(ms).toLocaleString(),
    };
  }, [expiresAt]);

  const rangeHint = t("apikey_lookup.last_n_days", { days: timeRange });
  const metricItems = [
    {
      key: "cost",
      title: t("apikey_lookup.total_cost"),
      icon: Coins,
      hint: rangeHint,
      accent: true,
      value: (
        <AnimatedNumber value={chartStats?.total_cost ?? 0} format={formatQuotaUsd} />
      ),
    },
    {
      key: "requests",
      title: t("apikey_lookup.total_requests"),
      icon: Activity,
      hint: rangeHint,
      value: (
        <AnimatedNumber value={chartStats?.total ?? 0} format={formatInteger} />
      ),
    },
    {
      key: "success-rate",
      title: t("common.success_rate"),
      icon: ShieldCheck,
      hint: rangeHint,
      value: (
        <AnimatedNumber
          value={chartStats?.success_rate ?? 0}
          format={(value) => `${value.toFixed(1)}%`}
        />
      ),
    },
    {
      key: "tokens",
      title: t("apikey_lookup.total_tokens"),
      icon: Sigma,
      hint: rangeHint,
      value: (
        <AnimatedNumber value={chartStats?.total_tokens ?? 0} format={formatInteger} />
      ),
    },
    {
      key: "sessions",
      title: t("apikey_lookup.total_sessions"),
      icon: MessagesSquare,
      hint: rangeHint,
      value: (
        <AnimatedNumber value={chartStats?.total_sessions ?? 0} format={formatInteger} />
      ),
    },
  ];

  return (
    <Reveal>
      <div className="flex flex-col gap-4">
        {expiryMeta ? (
          <div
            className={cn(
              "flex flex-wrap items-center justify-between gap-3 rounded-2xl border px-4 py-2.5 text-xs",
              expiryMeta.expired
                ? "border-rose-500/20 bg-rose-500/8 text-rose-700 dark:text-rose-300"
                : expiryMeta.soon
                  ? "border-amber-500/20 bg-amber-500/8 text-amber-800 dark:text-amber-300"
                  : "border-sn-line bg-sn-raised text-sn-label2",
            )}
          >
            <div className="flex items-center gap-2">
              <CalendarClock size={14} className="shrink-0" />
              <span>
                {expiryMeta.expired
                  ? t("billing.expiry_banner_expired", { date: expiryMeta.formatted })
                  : t("billing.expiry_banner_active", {
                      date: expiryMeta.formatted,
                      days: expiryMeta.days,
                    })}
              </span>
            </div>
            {showBillingShortcut && onOpenBilling ? (
              <Button size="sm" variant={expiryMeta.expired ? "primary" : "secondary"} onClick={onOpenBilling}>
                {t("billing.go_recharge")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {/* 独立横向配额条带：按配额数量自适应铺满整行，彻底消除 6+1 孤儿卡与宽金额截断 */}
        <QuotaLimitKpiCards
          t={t}
          limits={quotaLimits}
          quotaScopes={quotaScopes}
          renderValue={renderKpiValue}
        />

        {/* 核心 5 项用量：统一扁平发丝分隔指标带（gap-px 无双边线），与下方卡片保持统一 rounded-2xl */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-sn-line bg-sn-line sm:grid-cols-3 lg:grid-cols-5">
          {metricItems.map((metric, index) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.key}
                className={cn(
                  "min-w-0 bg-sn-raised px-5 py-4 transition-colors duration-150 hover:bg-sn-hover/60",
                  index === 0 && "col-span-2 sm:col-span-1",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-xs font-medium text-sn-label3">
                  <span className="truncate">{metric.title}</span>
                  <Icon size={14} className="shrink-0 opacity-75" />
                </div>
                <div className="mt-2.5 text-2xl font-semibold tracking-tight text-sn-label">
                  {renderKpiValue(
                    <span className="block whitespace-nowrap tabular-nums leading-tight">
                      {metric.value}
                    </span>,
                  )}
                </div>
                <p className="mt-1.5 text-xs text-sn-label3">{metric.hint}</p>
              </div>
            );
          })}
        </div>

        <Card tone="portal"
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

        {showApiKeyDistribution ? (
          <Card tone="portal"
            title={t("apikey_lookup.api_key_distribution")}
            description={t("apikey_lookup.api_key_distribution_desc", {
              days: timeRange,
              metric:
                apiKeyMetric === "requests"
                  ? t("apikey_lookup.requests")
                  : t("apikey_lookup.token"),
            })}
            actions={
              <Tabs
                value={apiKeyMetric}
                onValueChange={(next) => setApiKeyMetric(next === "tokens" ? "tokens" : "requests")}
              >
                <TabsList>
                  <TabsTrigger value="requests">{t("apikey_lookup.requests")}</TabsTrigger>
                  <TabsTrigger value="tokens">{t("apikey_lookup.token")}</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            loading={false}
          >
            {showInitialLoading ? (
              <ChartSkeleton />
            ) : apiKeyDistributionData.length > 0 ? (
              <div className="grid gap-4 md:h-72 md:grid-cols-[minmax(0,1fr)_minmax(16rem,20rem)]">
                <EChart option={apiKeyDistributionOption} className="h-52 min-w-0 md:h-72" />
                <ScrollFade className="flex max-h-72 min-w-0 flex-col gap-2 overflow-y-auto pr-1">
                  {apiKeyDistributionLegend.map((item) => (
                    <div
                      key={item.name}
                      className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-2 text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-3.5 w-3.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="min-w-0 truncate text-sn-label2">{item.name}</span>
                      </div>
                      <span className="text-right font-semibold tabular-nums text-sn-label">
                        {item.valueLabel}
                      </span>
                      <span className="text-right tabular-nums text-sn-label3">{item.percentLabel}</span>
                    </div>
                  ))}
                </ScrollFade>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-sn-label3">
                {t("apikey_lookup.no_data")}
              </p>
            )}
          </Card>
        ) : null}

        <section className="grid gap-4 lg:grid-cols-[minmax(0,560px)_minmax(0,1fr)]">
          <Card tone="portal"
            title={t("apikey_lookup.model_distribution")}
            description={t(
              modelMetric === "requests"
                ? "apikey_lookup.model_distribution_desc_requests"
                : "apikey_lookup.model_distribution_desc_tokens",
            )}
            actions={
              <Tabs
                value={modelMetric}
                onValueChange={(next) => setModelMetric(next as "requests" | "tokens")}
              >
                <TabsList>
                  <TabsTrigger value="requests">{t("apikey_lookup.requests")}</TabsTrigger>
                  <TabsTrigger value="tokens">{t("apikey_lookup.token")}</TabsTrigger>
                </TabsList>
              </Tabs>
            }
            loading={false}
          >
            {showInitialLoading ? (
              <ChartSkeleton />
            ) : modelDistributionData.length > 0 ? (
              <div className="flex flex-col gap-4 sm:grid sm:h-72 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,16rem)]">
                <EChart option={modelDistributionOption} className="h-52 min-w-0 sm:h-72" />
                <ScrollFade className="flex flex-row flex-wrap justify-center gap-2 overflow-y-auto pr-1 sm:h-72 sm:flex-col sm:justify-start">
                  {modelDistributionLegend.map((item) => (
                    <div
                      key={item.name}
                      className="inline-flex items-center gap-x-1.5 text-xs sm:grid sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:gap-x-2 sm:text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full sm:h-3 sm:w-3"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="min-w-0 truncate text-sn-label2" title={item.name}>
                          {item.name}
                        </span>
                      </div>
                      <span className="text-right font-semibold tabular-nums text-sn-label">
                        {item.valueLabel}
                      </span>
                      <span className="hidden text-right tabular-nums text-sn-label3 sm:inline">
                        {item.percentLabel}
                      </span>
                    </div>
                  ))}
                </ScrollFade>
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-sn-label3">
                {t("apikey_lookup.no_data")}
              </p>
            )}
          </Card>

          <Card tone="portal"
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
                            colorHex: dailyColors.input,
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
                            colorHex: dailyColors.output,
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
                            colorHex: dailyColors.requests,
                            enabled: dailyLegendSelected[DAILY_LEGEND_KEYS.requests] ?? true,
                            onToggle: toggleDailyLegend,
                          },
                        ]
                      : []),
                  ]}
                />
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-sn-label3">
                {t("apikey_lookup.no_data")}
              </p>
            )}
          </Card>
        </section>
      </div>
    </Reveal>
  );
}
