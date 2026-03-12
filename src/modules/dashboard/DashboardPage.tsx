import { useCallback, useEffect, useState } from "react";
import { Activity, RefreshCw, Sigma, TriangleAlert } from "lucide-react";
import { usageApi, type DashboardSummary } from "@/lib/http/apis/usage";
import { KpiCard } from "@/modules/monitor/MonitorPagePieces";
import { SystemMonitorSection } from "@/modules/dashboard/SystemMonitorSection";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";

type DashboardRange = 1 | 7 | 30;

const RANGE_OPTIONS: ReadonlyArray<{ value: DashboardRange; label: string }> = [
  { value: 1, label: "Today" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
];

const formatNumber = (n: number) =>
  n >= 10_000 ? `${(n / 1000).toFixed(1)}k` : n.toLocaleString();

const formatRate = (rate: number) =>
  `${rate.toFixed(2)}%`;

export function DashboardPage() {
  const { notify } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [range, setRange] = useState<DashboardRange>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (days: DashboardRange) => {
    setLoading(true);
    setError(null);
    try {
      const data = await usageApi.getDashboardSummary(days);
      setSummary(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to fetch data";
      setError(message);
      notify({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void refresh(range);
  }, [refresh, range]);

  const kpi = summary?.kpi;

  return (
    <div className="space-y-5">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
          Dashboard
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={String(range)} onValueChange={(next) => setRange(Number(next) as DashboardRange)}>
            <TabsList>
              {RANGE_OPTIONS.map((opt) => (
                <TabsTrigger key={opt.value} value={String(opt.value)}>
                  {opt.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <Button variant="secondary" size="sm" onClick={() => void refresh(range)} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Error State ── */}
      {error ? (
        <EmptyState
          title="Load failed"
          description={error}
          icon={<TriangleAlert size={18} />}
          action={
            <Button variant="secondary" onClick={() => void refresh(range)}>
              <RefreshCw size={14} />
              Retry
            </Button>
          }
        />
      ) : null}

      {/* ── KPI Row ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="Total Requests"
          value={<span className="tabular-nums">{formatNumber(kpi?.total_requests ?? 0)}</span>}
          hint={`Total requests for ${range === 1 ? "today" : `last ${range} days`}`}
          icon={Activity}
        />
        <KpiCard
          title="Success Rate"
          value={<span className="tabular-nums">{formatRate(kpi?.success_rate ?? 0)}</span>}
          hint={`Success ${formatNumber(kpi?.success_requests ?? 0)} · Failed ${formatNumber(kpi?.failed_requests ?? 0)}`}
          icon={Sigma}
        />
        <KpiCard
          title="Total Tokens"
          value={<span className="tabular-nums">{formatNumber(kpi?.total_tokens ?? 0)}</span>}
          hint={`Input ${formatNumber(kpi?.input_tokens ?? 0)} · Output ${formatNumber(kpi?.output_tokens ?? 0)}`}
          icon={Sigma}
        />
        <KpiCard
          title="Failed Requests"
          value={<span className="tabular-nums">{formatNumber(kpi?.failed_requests ?? 0)}</span>}
          hint="Failed requests (for provider/key quality analysis)"
          icon={TriangleAlert}
        />
      </div>

      {/* ── System Monitor (real-time) ── */}
      <SystemMonitorSection />
    </div>
  );
}
