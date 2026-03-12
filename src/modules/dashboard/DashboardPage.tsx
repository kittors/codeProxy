import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, RefreshCw, Sigma, TriangleAlert } from "lucide-react";
import { usageApi, type DashboardSummary } from "@/lib/http/apis/usage";
import { KpiCard } from "@/modules/monitor/MonitorPagePieces";
import { SystemMonitorSection } from "@/modules/dashboard/SystemMonitorSection";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";

type DashboardRange = 1 | 7 | 30;

const RANGE_KEYS: Record<DashboardRange, string> = {
  1: "dashboard.today",
  7: "dashboard.last_7_days",
  30: "dashboard.last_30_days",
};

const formatNumber = (n: number) =>
  n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();

const formatRate = (rate: number) => `${rate.toFixed(2)}%`;

export function DashboardPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [range, setRange] = useState<DashboardRange>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (days: DashboardRange) => {
      setLoading(true);
      setError(null);
      try {
        const data = await usageApi.getDashboardSummary(days);
        setSummary(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("dashboard.load_failed");
        setError(message);
        notify({ type: "error", message });
      } finally {
        setLoading(false);
      }
    },
    [notify, t],
  );

  useEffect(() => {
    void refresh(range);
  }, [refresh, range]);

  const kpi = summary?.kpi;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          {t("dashboard.heading")}
        </h2>
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

      {/* ── Error State ── */}
      {error ? (
        <EmptyState
          title={t("dashboard.load_failed")}
          description={error}
          icon={<TriangleAlert size={18} />}
          action={
            <Button variant="secondary" onClick={() => void refresh(range)}>
              <RefreshCw size={14} />
              {t("dashboard.retry")}
            </Button>
          }
        />
      ) : null}

      {/* ── KPI Row ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title={t("dashboard.total_requests")}
          value={<span className="tabular-nums">{formatNumber(kpi?.total_requests ?? 0)}</span>}
          hint={
            range === 1
              ? t("dashboard.total_hint_today")
              : t("dashboard.total_hint_days", { count: range })
          }
          icon={Activity}
        />
        <KpiCard
          title={t("dashboard.success_rate")}
          value={<span className="tabular-nums">{formatRate(kpi?.success_rate ?? 0)}</span>}
          hint={t("dashboard.success_hint", {
            success: formatNumber(kpi?.success_requests ?? 0),
            failed: formatNumber(kpi?.failed_requests ?? 0),
          })}
          icon={Sigma}
        />
        <KpiCard
          title={t("dashboard.total_tokens")}
          value={<span className="tabular-nums">{formatNumber(kpi?.total_tokens ?? 0)}</span>}
          hint={t("dashboard.token_hint", {
            input: formatNumber(kpi?.input_tokens ?? 0),
            output: formatNumber(kpi?.output_tokens ?? 0),
          })}
          icon={Sigma}
        />
        <KpiCard
          title={t("dashboard.failed_requests")}
          value={<span className="tabular-nums">{formatNumber(kpi?.failed_requests ?? 0)}</span>}
          hint={t("dashboard.failed_hint")}
          icon={TriangleAlert}
        />
      </div>

      {/* ── System Monitor (real-time) ── */}
      <SystemMonitorSection />
    </div>
  );
}
