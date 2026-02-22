import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Link } from "react-router-dom";
import { Activity, Bot, FileKey, RefreshCw, Settings, Sigma, TriangleAlert } from "lucide-react";
import { usageApi } from "@/lib/http/apis";
import type { UsageData } from "@/lib/http/types";
import {
  filterUsageByDays,
  computeKpiMetrics,
  formatNumber,
  formatRate,
} from "@/modules/monitor/monitor-utils";
import { KpiCard, MonitorCard } from "@/modules/monitor/MonitorPagePieces";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";

const createEmptyUsage = (): UsageData => ({ apis: {} });

type DashboardRange = 1 | 7 | 30;

const RANGE_OPTIONS: ReadonlyArray<{ value: DashboardRange; label: string }> = [
  { value: 1, label: "今天" },
  { value: 7, label: "近 7 天" },
  { value: 30, label: "近 30 天" },
];

export function DashboardPage() {
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();
  const [rawUsage, setRawUsage] = useState<UsageData>(createEmptyUsage);
  const [range, setRange] = useState<DashboardRange>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const usage = await usageApi.getUsage();
      startTransition(() => {
        setRawUsage(usage);
        setLastUpdatedAt(Date.now());
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "数据获取失败";
      setError(message);
      notify({ type: "error", message });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredUsage = useMemo(() => filterUsageByDays(rawUsage, range, ""), [rawUsage, range]);
  const kpis = useMemo(() => computeKpiMetrics(filteredUsage), [filteredUsage]);
  const isEmpty = kpis.requestCount === 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
            仪表盘
          </h2>
          <p className="text-sm text-slate-600 dark:text-white/65">
            业务状态概览（不改变你的 UI 结构，仅补齐业务能力）
            {lastUpdatedAt ? ` · 更新于 ${new Date(lastUpdatedAt).toLocaleString()}` : ""}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            {RANGE_OPTIONS.map((opt) => {
              const active = opt.value === range;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRange(opt.value)}
                  className={
                    active
                      ? "rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
                      : "rounded-xl px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                  }
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading || isPending}
          >
            <RefreshCw size={14} />
            刷新
          </Button>
        </div>
      </div>

      {error ? (
        <EmptyState
          title="加载失败"
          description={error}
          icon={<TriangleAlert size={18} />}
          action={
            <Button variant="secondary" onClick={() => void refresh()}>
              <RefreshCw size={14} />
              重试
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          title="请求数"
          value={<span className="tabular-nums">{formatNumber(kpis.requestCount)}</span>}
          hint={`${range === 1 ? "今天" : `最近 ${range} 天`}的总请求数`}
          icon={Activity}
        />
        <KpiCard
          title="成功率"
          value={<span className="tabular-nums">{formatRate(kpis.successRate)}</span>}
          hint={`成功 ${formatNumber(kpis.successCount)} · 失败 ${formatNumber(kpis.failedCount)}`}
          icon={Sigma}
        />
        <KpiCard
          title="Token 总量"
          value={<span className="tabular-nums">{formatNumber(kpis.totalTokens)}</span>}
          hint={`输入 ${formatNumber(kpis.inputTokens)} · 输出 ${formatNumber(kpis.outputTokens)}`}
          icon={Sigma}
        />
        <KpiCard
          title="失败请求"
          value={<span className="tabular-nums">{formatNumber(kpis.failedCount)}</span>}
          hint="失败请求数（用于定位 provider/key 质量问题）"
          icon={TriangleAlert}
        />
      </div>

      <MonitorCard
        title="快捷入口"
        description={isEmpty ? "当前时间范围内暂无 usage 数据。" : "进入对应页面继续操作。"}
        loading={loading || isPending}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Link
            to="/monitor"
            viewTransition
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white dark:hover:bg-neutral-900"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Activity size={16} />
              监控中心
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-white/65">
              KPI、图表、请求趋势与模型分布
            </div>
          </Link>
          <Link
            to="/ai-providers"
            viewTransition
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white dark:hover:bg-neutral-900"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Bot size={16} />
              AI 供应商
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-white/65">
              配置/测试/禁用模型、查看 key 状态
            </div>
          </Link>
          <Link
            to="/auth-files"
            viewTransition
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white dark:hover:bg-neutral-900"
          >
            <div className="flex items-center gap-2 font-semibold">
              <FileKey size={16} />
              认证文件
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-white/65">
              管理 auth file、排除模型与别名
            </div>
          </Link>
          <Link
            to="/config"
            viewTransition
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm transition hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white dark:hover:bg-neutral-900"
          >
            <div className="flex items-center gap-2 font-semibold">
              <Settings size={16} />
              配置面板
            </div>
            <div className="mt-1 text-xs text-slate-600 dark:text-white/65">
              可视化/源码/运行时配置
            </div>
          </Link>
        </div>
      </MonitorCard>
    </div>
  );
}
