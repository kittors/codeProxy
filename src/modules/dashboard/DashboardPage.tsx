import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Activity, RefreshCw, Sigma, Sparkles, TriangleAlert } from "lucide-react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import {
  usageApi,
  type DashboardSummary,
  type DashboardThroughputPoint,
  type DashboardTrendPoint,
} from "@/lib/http/apis/usage";
import { SystemMonitorSection } from "@/modules/dashboard/SystemMonitorSection";
import { AnimatedNumber } from "@/modules/ui/AnimatedNumber";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { EChart } from "@/modules/ui/charts/EChart";
import { ChartLegend } from "@/modules/ui/charts/ChartLegend";
import { useInterval } from "@/hooks/useInterval";

type DashboardRange = 1 | 7 | 30;

const RANGE_KEYS: Record<DashboardRange, string> = {
  1: "dashboard.today",
  7: "dashboard.last_7_days",
  30: "dashboard.last_30_days",
};

const formatNumber = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}m`
    : n >= 10_000
      ? `${(n / 1000).toFixed(1)}k`
      : n.toLocaleString();

const formatRate = (rate: number) => `${rate.toFixed(2)}%`;
const PANEL_SURFACE =
  "rounded-[18px] border border-slate-200/85 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]";

function createSparklineOption(points: DashboardTrendPoint[], color: string): ECBasicOption {
  const labels = points.map((point) => point.label);
  const values = points.map((point) => point.value);

  return {
    animationDuration: 320,
    animationDurationUpdate: 240,
    grid: { left: 0, right: 0, top: 6, bottom: 0 },
    tooltip: {
      trigger: "axis",
      borderWidth: 0,
      backgroundColor: "rgba(15, 23, 42, 0.9)",
      textStyle: { color: "#fff", fontSize: 11 },
      formatter: (params: any) => {
        const first = Array.isArray(params) ? params[0] : params;
        return `${first?.axisValueLabel ?? ""}<br/>${formatNumber(Number(first?.data ?? 0))}`;
      },
    },
    xAxis: {
      type: "category",
      data: labels,
      show: false,
      boundaryGap: false,
    },
    yAxis: {
      type: "value",
      show: false,
      min: (value: { min: number }) => Math.min(0, value.min),
    },
    series: [
      {
        type: "line",
        data: values,
        smooth: true,
        symbol: "none",
        lineStyle: { color, width: 2.5 },
        areaStyle: {
          color: {
            type: "linear",
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: `${color}33` },
              { offset: 1, color: `${color}00` },
            ],
          },
        },
      },
    ],
  };
}

function createThroughputOption(
  points: DashboardThroughputPoint[],
  showRPM: boolean,
  showTPM: boolean,
): ECBasicOption {
  const labels = points.map((point) => point.label);
  const rpmValues = points.map((point) => point.rpm);
  const tpmValues = points.map((point) => point.tpm);

  return {
    animationDuration: 360,
    animationDurationUpdate: 240,
    tooltip: {
      trigger: "axis",
      borderWidth: 0,
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      textStyle: { color: "#fff" },
    },
    grid: { left: 12, right: 12, top: 12, bottom: 22, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisTick: { show: false },
      axisLine: { lineStyle: { color: "rgba(148,163,184,0.45)" } },
      axisLabel: { color: "#64748b", fontSize: 10, hideOverlap: true },
    },
    yAxis: [
      {
        type: "value",
        splitNumber: 4,
        axisLabel: { color: "#64748b", fontSize: 10 },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.16)" } },
      },
      {
        type: "value",
        splitNumber: 4,
        axisLabel: { color: "#64748b", fontSize: 10 },
        splitLine: { show: false },
      },
    ],
    series: [
      ...(showRPM
        ? [
            {
              name: "RPM",
              type: "line",
              yAxisIndex: 0,
              data: rpmValues,
              smooth: true,
              symbol: "circle",
              symbolSize: 6,
              lineStyle: { width: 3, color: "#2563eb" },
              itemStyle: { color: "#2563eb" },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: "rgba(37,99,235,0.18)" },
                    { offset: 1, color: "rgba(37,99,235,0.02)" },
                  ],
                },
              },
            },
          ]
        : []),
      ...(showTPM
        ? [
            {
              name: "TPM",
              type: "line",
              yAxisIndex: 1,
              data: tpmValues,
              smooth: true,
              symbol: "circle",
              symbolSize: 6,
              lineStyle: { width: 3, color: "#7c3aed" },
              itemStyle: { color: "#7c3aed" },
              areaStyle: {
                color: {
                  type: "linear",
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: "rgba(124,58,237,0.14)" },
                    { offset: 1, color: "rgba(124,58,237,0.02)" },
                  ],
                },
              },
            },
          ]
        : []),
    ],
  };
}

function DashboardKpiCard({
  title,
  value,
  hint,
  icon: Icon,
  option,
  accent,
}: {
  title: string;
  value: ReactNode;
  hint: string;
  icon: typeof Activity;
  option: ECBasicOption;
  accent: {
    iconWrap: string;
    iconColor: string;
  };
}) {
  return (
    <Card
      className={`${PANEL_SURFACE} h-full`}
      bodyClassName="mt-0 flex h-full flex-col"
      padding="compact"
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`inline-flex h-9 w-9 items-center justify-center rounded-[14px] ${accent.iconWrap}`}
        >
          <Icon size={16} className={accent.iconColor} />
        </div>
      </div>
      <div className="mt-3">
        <p className="text-sm font-semibold text-slate-700">{title}</p>
        <div className="mt-2 text-[2rem] font-semibold leading-none tracking-tight text-slate-950">
          {value}
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{hint}</p>
      </div>
      <div className="mt-auto pt-3">
        <EChart option={option} className="h-10" replaceMerge="series" />
      </div>
    </Card>
  );
}

function ThroughputTrendChart({
  title,
  points,
  showRPM,
  showTPM,
  onToggle,
}: {
  title: string;
  points: DashboardThroughputPoint[];
  showRPM: boolean;
  showTPM: boolean;
  onToggle: (key: string) => void;
}) {
  const current = points.at(-1) ?? { rpm: 0, tpm: 0 };

  return (
    <Card
      className={PANEL_SURFACE}
      title={title}
      actions={
        <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Realtime
        </div>
      }
      padding="compact"
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[14px] bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            RPM
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-blue-600">
            {current.rpm.toFixed(2)}
          </div>
        </div>
        <div className="rounded-[14px] bg-slate-50 px-3 py-2">
          <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            TPM
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-violet-600">
            {current.tpm.toFixed(2)}
          </div>
        </div>
      </div>
      <EChart
        option={createThroughputOption(points, showRPM, showTPM)}
        className="h-56"
        replaceMerge="series"
      />
      <ChartLegend
        className="justify-start pt-3"
        items={[
          {
            key: "rpm",
            label: "RPM",
            colorClass: "bg-blue-500",
            enabled: showRPM,
            onToggle,
          },
          {
            key: "tpm",
            label: "TPM",
            colorClass: "bg-violet-500",
            enabled: showTPM,
            onToggle,
          },
        ]}
      />
    </Card>
  );
}

export function DashboardPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [range, setRange] = useState<DashboardRange>(7);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [throughputLegend, setThroughputLegend] = useState({ rpm: true, tpm: true });

  const refresh = useCallback(
    async (days: DashboardRange, silent = false) => {
      if (!silent) {
        setLoading(true);
      }
      setError(null);
      try {
        const data = await usageApi.getDashboardSummary(days);
        setSummary(data);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("dashboard.load_failed");
        setError(message);
        notify({ type: "error", message });
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [notify, t],
  );

  useEffect(() => {
    void refresh(range);
  }, [refresh, range]);

  useInterval(() => {
    void refresh(range, true);
  }, 15000);

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
  const failedRequestOption = useMemo(
    () => createSparklineOption(trends?.failed_requests ?? [], "#ef4444"),
    [trends?.failed_requests],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-[2rem] font-semibold tracking-tight text-slate-950 text-balance">
            {t("dashboard.heading")}
          </h2>
          <p className="mt-1 text-sm text-slate-500">{t("dashboard.hero_subtitle")}</p>
          <p className="mt-2 text-[11px] text-slate-400">
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
            <Button variant="secondary" onClick={() => void refresh(range)}>
              <RefreshCw size={14} />
              {t("dashboard.retry")}
            </Button>
          }
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <DashboardKpiCard
          title={t("dashboard.total_requests")}
          value={<AnimatedNumber value={kpi?.total_requests ?? 0} format={formatNumber} />}
          hint={
            range === 1
              ? t("dashboard.total_hint_today")
              : t("dashboard.total_hint_days", { count: range })
          }
          icon={Activity}
          option={totalRequestOption}
          accent={{ iconWrap: "bg-blue-50", iconColor: "text-blue-600" }}
        />
        <DashboardKpiCard
          title={t("dashboard.success_rate")}
          value={<AnimatedNumber value={kpi?.success_rate ?? 0} format={formatRate} />}
          hint={t("dashboard.success_hint", {
            success: formatNumber(kpi?.success_requests ?? 0),
            failed: formatNumber(kpi?.failed_requests ?? 0),
          })}
          icon={Sigma}
          option={successRateOption}
          accent={{ iconWrap: "bg-emerald-50", iconColor: "text-emerald-600" }}
        />
        <DashboardKpiCard
          title={t("dashboard.total_tokens")}
          value={<AnimatedNumber value={kpi?.total_tokens ?? 0} format={formatNumber} />}
          hint={t("dashboard.token_hint", {
            input: formatNumber(kpi?.input_tokens ?? 0),
            output: formatNumber(kpi?.output_tokens ?? 0),
          })}
          icon={Sparkles}
          option={totalTokenOption}
          accent={{ iconWrap: "bg-violet-50", iconColor: "text-violet-600" }}
        />
        <DashboardKpiCard
          title={t("dashboard.failed_requests")}
          value={<AnimatedNumber value={kpi?.failed_requests ?? 0} format={formatNumber} />}
          hint={t("dashboard.failed_hint")}
          icon={TriangleAlert}
          option={failedRequestOption}
          accent={{ iconWrap: "bg-rose-50", iconColor: "text-rose-600" }}
        />
      </div>

      <SystemMonitorSection apiKeyCount={summary?.counts.api_keys ?? 0} />

      <ThroughputTrendChart
        title={t("dashboard.throughput_title")}
        points={throughputSeries}
        showRPM={throughputLegend.rpm}
        showTPM={throughputLegend.tpm}
        onToggle={(key) =>
          setThroughputLegend((prev) => ({ ...prev, [key]: !prev[key as "rpm" | "tpm"] }))
        }
      />
    </div>
  );
}
