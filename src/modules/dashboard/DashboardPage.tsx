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
  { value: 1, label: "今天" },
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
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
      const message = err instanceof Error ? err.message : "数据获取失败";
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
            刷新
          </Button>
        </div>
      </div>

      {/* ── Error State ── */}
      {error ? (
        <EmptyState
          title="加载失败"
          description={error}
          icon={<TriangleAlert size={18} />}
          action={
            <Button variant="secondary" onClick={() => void refresh(range)}>
              <RefreshCw size={14} />
              重试
            </Button>
          }
        />
      ) : null}

      {/* ── KPI Row ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="请求数"
          value={<span className="tabular-nums">{formatNumber(kpi?.total_requests ?? 0)}</span>}
          hint={`${range === 1 ? "今天" : `最近 ${range} 天`}的总请求数`}
          icon={Activity}
        />
        <KpiCard
          title="成功率"
          value={<span className="tabular-nums">{formatRate(kpi?.success_rate ?? 0)}</span>}
          hint={`成功 ${formatNumber(kpi?.success_requests ?? 0)} · 失败 ${formatNumber(kpi?.failed_requests ?? 0)}`}
          icon={Sigma}
        />
        <KpiCard
          title="Token 总量"
          value={<span className="tabular-nums">{formatNumber(kpi?.total_tokens ?? 0)}</span>}
          hint={`输入 ${formatNumber(kpi?.input_tokens ?? 0)} · 输出 ${formatNumber(kpi?.output_tokens ?? 0)}`}
          icon={Sigma}
        />
        <KpiCard
          title="失败请求"
          value={<span className="tabular-nums">{formatNumber(kpi?.failed_requests ?? 0)}</span>}
          hint="失败请求数（用于定位 provider/key 质量问题）"
          icon={TriangleAlert}
        />
      </div>

      {/* ── System Monitor (real-time) ── */}
      <SystemMonitorSection />
    </div>
  );
}
