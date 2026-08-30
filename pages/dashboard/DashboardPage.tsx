import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Database,
  DollarSign,
  RefreshCw,
  Sigma,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import {
  usageApi,
  type DashboardSummary,
} from "@code-proxy/api-client/endpoints/usage";
import { useAuth } from "@app/providers/AuthProvider";
import { SystemMonitorSection } from "./SystemMonitorSection";
import { useSystemStats } from "./useSystemStats";
import { AnimatedNumber } from "@code-proxy/ui";
import { Button } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { useInterval } from "@code-proxy/ui";
import { DashboardKpiCard } from "./DashboardKpiCard";
import {
  DashboardMetricValue,
  renderDashboardHint,
  formatRate,
  createSparklineOption,
} from "./DashboardMetrics";
import { ThroughputTrendChart } from "./ThroughputTrendChart";

type DashboardRange = 1 | 7 | 30;

const RANGE_KEYS: Record<DashboardRange, string> = {
  1: "dashboard.today",
  7: "dashboard.last_7_days",
  30: "dashboard.last_30_days",
};

export function DashboardPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const {
    can,
    state: { principal },
  } = useAuth();
  // Host-level system monitor is gated by platform permission (and thus menus/roles).
  // Throughput: platform super-admins see all tenants; others stay tenant-scoped.
  const canViewSystemMonitor = can("system.status.read");
  const [pageVisible, setPageVisible] = useState(() =>
    typeof document === "undefined" ? true : !document.hidden,
  );
  const { stats, connected } = useSystemStats(15, canViewSystemMonitor && pageVisible);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const summaryRef = useRef<DashboardSummary | null>(null);
  const [range, setRange] = useState<DashboardRange>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (days: DashboardRange, silent = false) => {
      if (!silent) {
        setLoading(true);
        setError(null);
      }
      try {
        const data = await usageApi.getDashboardSummary(days);
        summaryRef.current = data;
        setSummary(data);
        setError(null);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("dashboard.load_failed");
        const hasSummary = summaryRef.current !== null;
        if (!silent || !hasSummary) {
          setError(message);
        }
        if (!silent) {
          notify({ type: "error", message });
        }
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [notify, t],
  );

  useEffect(() => {
    const handleVisibilityChange = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (pageVisible) void refresh(range);
  }, [pageVisible, refresh, range]);

  // Backend caches dashboard-summary for ~15s; poll slightly above that so
  // multi-tab remounts do not re-stampede request_logs aggregation.
  useInterval(
    () => {
      void refresh(range, true);
    },
    pageVisible ? 20_000 : null,
  );

  const kpi = summary?.kpi;
  const trends = summary?.trends;
  const meta = summary?.meta ?? {};
  const generatedAt = meta.generated_at
    ? new Date(meta.generated_at).toLocaleString()
    : t("dashboard.updated_fallback");
  const throughputSeries = useMemo(
    () => trends?.throughput_series ?? [],
    [trends?.throughput_series],
  );
  // Latest point is a rolling last-60s window from the API (not an empty new calendar minute).
  const latestThroughput = throughputSeries[throughputSeries.length - 1];
  const tenantRpm = latestThroughput?.rpm ?? 0;
  const tenantTpm = latestThroughput?.tpm ?? 0;
  const throughputAllTenants =
    meta.throughput_scope === "all_tenants" || Boolean(principal?.platform_admin);
  const tenantBreakdown = trends?.tenants ?? [];

  const totalRequestOption = useMemo(
    () => createSparklineOption(trends?.request_volume ?? [], "#2563eb"),
    [trends?.request_volume],
  );
  const successRateOption = useMemo(
    () => createSparklineOption(trends?.success_rate ?? [], "#10b981"),
    [trends?.success_rate],
  );
  const totalTokenOption = useMemo(
    () => createSparklineOption(trends?.total_tokens ?? [], "#7c3aed"),
    [trends?.total_tokens],
  );
  const totalCostOption = useMemo(
    () => createSparklineOption(trends?.total_cost ?? [], "#0891b2"),
    [trends?.total_cost],
  );
  const failedRequestOption = useMemo(
    () => createSparklineOption(trends?.failed_requests ?? [], "#ef4444"),
    [trends?.failed_requests],
  );
  const cacheRateOption = useMemo(() => createSparklineOption([], "#f59e0b"), []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-950 text-balance dark:text-white">
            {t("dashboard.heading")}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-white/55">
            {t("dashboard.hero_subtitle")}
          </p>
          <p className="mt-2 text-xs text-slate-400 dark:text-white/40">
            {t("dashboard.overview_hint", { time: generatedAt })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            value={String(range)}
            onValueChange={(next) => setRange(Number(next) as DashboardRange)}
          >
            <TabsList>
              {([1, 7, 30] as DashboardRange[]).map((val) => (
                <TabsTrigger key={val} value={String(val)}>
                  {t(RANGE_KEYS[val])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refresh(range)}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("dashboard.refresh")}
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState
          title={t("dashboard.load_failed")}
          description={error}
          icon={<TriangleAlert size={18} />}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void refresh(range)}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("dashboard.retry")}
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DashboardKpiCard
          title={t("dashboard.total_requests")}
          value={<DashboardMetricValue value={kpi?.total_requests ?? 0} animated />}
          hint={
            range === 1
              ? t("dashboard.total_hint_today")
              : t("dashboard.total_hint_days", { count: range })
          }
          icon={Activity}
          option={totalRequestOption}
          accent={{
            iconWrap: "bg-blue-50 dark:bg-blue-500/12",
            iconColor: "text-blue-600 dark:text-blue-400",
          }}
        />
        <DashboardKpiCard
          title={t("dashboard.success_rate")}
          value={<AnimatedNumber value={kpi?.success_rate ?? 0} format={formatRate} />}
          hint={renderDashboardHint(
            "dashboard.success_hint",
            <DashboardMetricValue key="success" value={kpi?.success_requests ?? 0} />,
            <DashboardMetricValue key="failed" value={kpi?.failed_requests ?? 0} />,
          )}
          icon={Sigma}
          option={successRateOption}
          accent={{
            iconWrap: "bg-emerald-50 dark:bg-emerald-500/12",
            iconColor: "text-emerald-600 dark:text-emerald-400",
          }}
        />
        <DashboardKpiCard
          title={t("dashboard.total_tokens")}
          value={<DashboardMetricValue value={kpi?.total_tokens ?? 0} animated />}
          hint={renderDashboardHint(
            "dashboard.token_hint",
            <DashboardMetricValue key="input" value={kpi?.input_tokens ?? 0} />,
            <DashboardMetricValue key="output" value={kpi?.output_tokens ?? 0} />,
          )}
          icon={Sparkles}
          option={totalTokenOption}
          accent={{
            iconWrap: "bg-violet-50 dark:bg-violet-500/12",
            iconColor: "text-violet-600 dark:text-violet-400",
          }}
        />
        <DashboardKpiCard
          title={t("dashboard.total_cost")}
          value={<DashboardMetricValue value={kpi?.total_cost ?? 0} variant="currency" animated />}
          hint={t("dashboard.total_cost_hint")}
          icon={DollarSign}
          option={totalCostOption}
          accent={{
            iconWrap: "bg-cyan-50 dark:bg-cyan-500/12",
            iconColor: "text-cyan-600 dark:text-cyan-400",
          }}
        />
        <DashboardKpiCard
          title={t("dashboard.failed_requests")}
          value={<DashboardMetricValue value={kpi?.failed_requests ?? 0} animated />}
          hint={t("dashboard.failed_hint")}
          icon={TriangleAlert}
          option={failedRequestOption}
          accent={{
            iconWrap: "bg-rose-50 dark:bg-rose-500/12",
            iconColor: "text-rose-600 dark:text-rose-400",
          }}
        />
        <DashboardKpiCard
          title={t("dashboard.cache_rate")}
          value={<AnimatedNumber value={kpi?.cache_rate ?? 0} format={formatRate} />}
          hint={renderDashboardHint(
            "dashboard.cache_hint",
            <DashboardMetricValue key="cached" value={kpi?.cached_tokens ?? 0} />,
            <DashboardMetricValue key="input" value={kpi?.input_tokens ?? 0} />,
          )}
          icon={Database}
          option={cacheRateOption}
          accent={{
            iconWrap: "bg-amber-50 dark:bg-amber-500/12",
            iconColor: "text-amber-600 dark:text-amber-400",
          }}
        />
      </div>

      {canViewSystemMonitor ? (
        <SystemMonitorSection
          stats={stats}
          connected={connected}
          apiKeyCount={summary?.counts?.api_keys ?? 0}
        />
      ) : null}

      <ThroughputTrendChart
        title={t("dashboard.throughput_title")}
        points={throughputSeries}
        rpm={tenantRpm}
        tpm={tenantTpm}
        // Series from dashboard-summary polling; latest point is rolling 60s RPM/TPM.
        connected={false}
        allTenantsScope={throughputAllTenants}
        tenants={tenantBreakdown}
      />
    </div>
  );
}
