import { Fragment, useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert, Info, RefreshCw } from "lucide-react";
import { Button, Skeleton, surface, useChartAppearanceKey, useTheme } from "@code-proxy/ui";
import { useAuth } from "@app/providers/AuthProvider";
import { ActivityHeatmapCard, FlowSankeyCard } from "./components/FlowHeatmapCards";
import { FailureCard } from "./components/FailureCard";
import { HealthCard } from "./components/HealthCard";
import { LatencyCard } from "./components/LatencyCard";
import { LivePulseCard } from "./components/LivePulseCard";
import { MetricTiles } from "./components/MetricTiles";
import { MonitorToolbar } from "./components/MonitorToolbar";
import {
  ChannelHealthCard,
  ConsumerLeaderboardCard,
  ModelLeaderboardCard,
} from "./components/RankingCards";
import { TrafficTrendCard } from "./components/TrafficTrendCard";
import { useMonitorOverview } from "./hooks/useMonitorOverview";
import { useMonitorQueryState } from "./hooks/useMonitorQueryState";
import { useMonitorRealtime } from "./hooks/useMonitorRealtime";
import { isLegacyRangeSupported } from "./model/legacyOverview";
import { computeMonitorHealth } from "./model/monitorHealth";

/**
 * 监控中心：自上而下回答三个问题——现在正常吗（健康评分、实时流量、黄金指标），
 * 哪里出了问题（趋势、耗时分布、失败分析、渠道健康），量和钱花在哪（模型、门户用户、
 * 流向、活跃时段）。排行里点任意一行即按它筛选整页，地址栏同步，链接可直接分享。
 */
export function MonitorPage() {
  const { t } = useTranslation();
  const {
    state: { mode: themeMode },
  } = useTheme();
  const isDark = themeMode === "dark";
  // 图表颜色写在 echarts option 里，外观的图表配色变了（另一个标签页里改的）要整组重建。
  const chartAppearanceKey = useChartAppearanceKey();
  const { can } = useAuth();
  const view = useMonitorQueryState();
  const { query } = view;
  const data = useMonitorOverview(query, view.refreshSeconds);
  const legacy = data.mode === "legacy";
  const realtime = useMonitorRealtime(
    { consumers: query.consumers, models: query.models, channels: query.channels },
    !legacy,
  );

  // 旧后端只能按天聚合：地址栏里若是分钟 / 小时级范围，切到「今天」。
  const { setRange } = view;
  useEffect(() => {
    if (legacy && !isLegacyRangeSupported(query.range)) setRange("today");
  }, [legacy, query.range, setRange]);

  const overview = data.overview;
  const health = useMemo(() => (overview ? computeMonitorHealth(overview) : null), [overview]);
  const switching = data.switching;
  const shared = { legacy, loading: switching, isDark };
  const activeFilters = {
    consumers: query.consumers,
    models: query.models,
    channels: query.channels,
  };

  return (
    <div className="space-y-4">
      <MonitorToolbar
        query={query}
        overview={overview}
        legacy={legacy}
        refreshing={data.refreshing}
        error={data.error}
        updatedAt={data.updatedAt}
        refreshSeconds={view.refreshSeconds}
        onRangeChange={view.setRange}
        onFilterChange={view.setFilter}
        onToggleFilter={view.toggleFilter}
        onClearFilters={view.clearFilters}
        onRefreshSecondsChange={view.setRefreshSeconds}
        onRefresh={data.refresh}
      />

      {legacy ? (
        <div
          className={`${surface({ tone: "inset", radius: "2xl" })} flex items-start gap-2.5 px-4 py-3 text-sm text-ink-2`}
        >
          <Info
            size={16}
            className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-300"
            aria-hidden="true"
          />
          <span>{t("monitor_center.legacy_notice")}</span>
        </div>
      ) : null}

      {overview && health ? (
        <Fragment key={chartAppearanceKey}>
          <Rise index={0}>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <HealthCard report={health} loading={switching} legacy={legacy} />
              <LivePulseCard
                realtime={realtime.realtime}
                unavailable={legacy || realtime.unavailable}
                isDark={isDark}
              />
            </section>
          </Rise>
          <Rise index={1}>
            <div className={`transition-opacity duration-200 ${switching ? "opacity-60" : ""}`}>
              <MetricTiles overview={overview} legacy={legacy} isDark={isDark} />
            </div>
          </Rise>
          <Rise index={2}>
            <TrafficTrendCard overview={overview} {...shared} />
          </Rise>
          <Rise index={3}>
            <section className="grid gap-4 xl:grid-cols-2">
              <LatencyCard overview={overview} {...shared} />
              <FailureCard
                overview={overview}
                legacy={legacy}
                loading={switching}
                canViewDetail={can("request_logs.content.read")}
                activeFilters={activeFilters}
                onSelect={view.toggleFilter}
              />
            </section>
          </Rise>
          <Rise index={4}>
            <ModelLeaderboardCard
              overview={overview}
              {...shared}
              selected={query.models}
              onSelect={view.toggleFilter}
            />
          </Rise>
          <Rise index={5}>
            <section className="grid gap-4 xl:grid-cols-2">
              <ChannelHealthCard
                overview={overview}
                {...shared}
                selected={query.channels}
                onSelect={view.toggleFilter}
              />
              <ConsumerLeaderboardCard
                overview={overview}
                {...shared}
                selected={query.consumers}
                onSelect={view.toggleFilter}
              />
            </section>
          </Rise>
          <Rise index={6}>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <FlowSankeyCard overview={overview} {...shared} />
              <ActivityHeatmapCard overview={overview} {...shared} />
            </section>
          </Rise>
        </Fragment>
      ) : data.error ? (
        <section
          className={`${surface({ radius: "3xl" })} flex flex-col items-center gap-3 px-6 py-14 text-center`}
          role="alert"
        >
          <span className="grid size-10 place-items-center rounded-full bg-rose-500/10 text-rose-600 dark:bg-rose-400/15 dark:text-rose-300">
            <CircleAlert size={20} aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-ink">{t("monitor_center.load_failed")}</p>
          <p className="max-w-md text-xs break-all text-ink-3">{data.error}</p>
          <Button size="sm" onClick={data.refresh}>
            <RefreshCw size={14} aria-hidden="true" />
            {t("monitor_center.retry")}
          </Button>
        </section>
      ) : (
        <MonitorSkeleton />
      )}
    </div>
  );
}

/** 首屏依次浮现：每段晚 50ms，减少动态效果时直接显示。 */
function Rise({ index, children }: { index: number; children: ReactNode }) {
  const style: CSSProperties = { animationDelay: `${index * 50}ms` };
  return (
    <div
      className="motion-safe:animate-[fadeInUp_420ms_cubic-bezier(0.2,0.8,0.2,1)_both]"
      style={style}
    >
      {children}
    </div>
  );
}

/** 首次加载的骨架：与真实版面同一套栅格和卡片内边距（Card 默认 p-4），数据到位时不跳动。 */
function MonitorSkeleton() {
  const block = `${surface({ radius: "3xl" })} p-4`;
  return (
    <div className="space-y-4" aria-hidden="true">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div className={`${block} flex flex-col items-center gap-4`}>
          <Skeleton className="h-4 w-24 self-start" />
          <Skeleton className="size-32" rounded="full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-4/5" />
        </div>
        <div className={`${block} space-y-4`}>
          <Skeleton className="h-4 w-32" />
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-11" rounded="lg" />
            ))}
          </div>
          <Skeleton className="h-36" rounded="lg" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className={`${surface({ radius: "3xl" })} space-y-3 p-4`}>
            <Skeleton className="h-8 w-28" rounded="lg" />
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-9" rounded="lg" />
          </div>
        ))}
      </div>
      <div className={`${block} space-y-4`}>
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-72" rounded="lg" />
      </div>
    </div>
  );
}
