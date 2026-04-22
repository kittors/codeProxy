import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Activity, FileKey, Layers, RefreshCw, Sigma, Sparkles, TriangleAlert } from "lucide-react";
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

function buildSparklinePath(points: DashboardTrendPoint[]) {
  if (points.length === 0) {
    return "";
  }
  const values = points.map((point) => point.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const span = Math.max(max - min, 1);

  return points
    .map((point, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 100 - ((point.value - min) / span) * 84 - 8;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function Sparkline({
  points,
  strokeClassName,
  fillClassName,
}: {
  points: DashboardTrendPoint[];
  strokeClassName: string;
  fillClassName: string;
}) {
  const path = buildSparklinePath(points);
  const area = path ? `${path} L 100 100 L 0 100 Z` : "";

  return (
    <svg
      viewBox="0 0 100 100"
      className="h-14 w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {area ? <path d={area} className={fillClassName} /> : null}
      {path ? (
        <path
          d={path}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={strokeClassName}
        />
      ) : null}
    </svg>
  );
}

function DashboardKpiCard({
  title,
  value,
  hint,
  icon: Icon,
  points,
  accent,
}: {
  title: string;
  value: ReactNode;
  hint: string;
  icon: typeof Activity;
  points: DashboardTrendPoint[];
  accent: {
    iconWrap: string;
    iconColor: string;
    line: string;
    fill: string;
  };
}) {
  return (
    <Card
      className="overflow-hidden border-white/60 bg-white/90 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-xl"
      bodyClassName="mt-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div
          className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${accent.iconWrap}`}
        >
          <Icon size={18} className={accent.iconColor} />
        </div>
        <div className="text-right text-[11px] font-medium text-slate-400">
          {points.at(-1)?.label}
        </div>
      </div>
      <div className="mt-4">
        <p className="text-sm font-semibold text-slate-600">{title}</p>
        <div className="mt-2 text-4xl font-semibold tracking-tight text-slate-950">{value}</div>
        <p className="mt-2 text-xs text-slate-500">{hint}</p>
      </div>
      <div className="-mx-2 mt-4">
        <Sparkline points={points} strokeClassName={accent.line} fillClassName={accent.fill} />
      </div>
    </Card>
  );
}

function ThroughputTrendChart({
  points,
  subtitle,
}: {
  points: DashboardThroughputPoint[];
  subtitle: string;
}) {
  const width = 720;
  const height = 220;
  const padding = 20;
  const chartHeight = height - padding * 2;
  const chartWidth = width - padding * 2;
  const rpmMax = Math.max(...points.map((point) => point.rpm), 1);
  const tpmMax = Math.max(...points.map((point) => point.tpm), 1);

  const buildLine = (values: number[], max: number) =>
    values
      .map((value, index) => {
        const x =
          points.length === 1 ? padding : padding + (index / (points.length - 1)) * chartWidth;
        const y = padding + chartHeight - (value / max) * chartHeight;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

  const rpmPath = buildLine(
    points.map((point) => point.rpm),
    rpmMax,
  );
  const tpmPath = buildLine(
    points.map((point) => point.tpm),
    tpmMax,
  );

  return (
    <Card
      className="overflow-hidden border-white/60 bg-white/92 shadow-[0_22px_55px_rgba(15,23,42,0.07)]"
      title={subtitle}
      actions={
        <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-600">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Live
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-4 text-xs font-semibold">
        <span className="inline-flex items-center gap-2 text-blue-600">
          <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
          RPM
        </span>
        <span className="inline-flex items-center gap-2 text-violet-600">
          <span className="h-2.5 w-2.5 rounded-full bg-violet-500" />
          TPM
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-64 w-full" preserveAspectRatio="none">
        {Array.from({ length: 4 }).map((_, index) => {
          const y = padding + (chartHeight / 3) * index;
          return (
            <line
              key={index}
              x1={padding}
              x2={width - padding}
              y1={y}
              y2={y}
              className="stroke-slate-200"
              strokeDasharray="4 6"
            />
          );
        })}
        <path d={rpmPath} fill="none" stroke="#2563eb" strokeWidth="4" strokeLinecap="round" />
        <path d={tpmPath} fill="none" stroke="#7c3aed" strokeWidth="4" strokeLinecap="round" />
      </svg>
      <div className="mt-3 grid grid-cols-4 gap-2 text-[11px] text-slate-500 md:grid-cols-7">
        {points.slice(Math.max(points.length - 7, 0)).map((point) => (
          <div
            key={point.label}
            className="truncate rounded-xl bg-slate-50 px-2 py-1.5 text-center"
          >
            {point.label}
          </div>
        ))}
      </div>
    </Card>
  );
}

function SummaryStat({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: ReactNode;
  icon: typeof Layers;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-[0_12px_32px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        <Icon size={14} />
        {title}
      </div>
      <div className="mt-3 text-2xl font-semibold text-slate-950">{value}</div>
    </div>
  );
}

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
  const trends = summary?.trends;
  const meta = summary?.meta ?? {};
  const generatedAt = meta.generated_at
    ? new Date(meta.generated_at).toLocaleString()
    : t("dashboard.updated_fallback");
  const throughputSeries = useMemo(
    () => trends?.throughput_series ?? [],
    [trends?.throughput_series],
  );

  return (
    <div className="space-y-6">
      <section className="rounded-[2rem] border border-white/70 bg-white/72 px-6 py-6 shadow-[0_24px_70px_rgba(15,23,42,0.08)] backdrop-blur-2xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-600">
              <span className="h-2 w-2 rounded-full bg-blue-500" />
              {t("dashboard.hero_badge")}
            </div>
            <div>
              <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
                {t("dashboard.heading")}
              </h2>
              <p className="mt-2 text-sm text-slate-500">{t("dashboard.hero_subtitle")}</p>
            </div>
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
          <div className="mt-6">
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
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 xl:grid-cols-4">
          <DashboardKpiCard
            title={t("dashboard.total_requests")}
            value={<AnimatedNumber value={kpi?.total_requests ?? 0} format={formatNumber} />}
            hint={
              range === 1
                ? t("dashboard.total_hint_today")
                : t("dashboard.total_hint_days", { count: range })
            }
            icon={Activity}
            points={trends?.request_volume ?? []}
            accent={{
              iconWrap: "bg-blue-50",
              iconColor: "text-blue-600",
              line: "stroke-blue-500",
              fill: "fill-blue-100/70",
            }}
          />
          <DashboardKpiCard
            title={t("dashboard.success_rate")}
            value={<AnimatedNumber value={kpi?.success_rate ?? 0} format={formatRate} />}
            hint={t("dashboard.success_hint", {
              success: formatNumber(kpi?.success_requests ?? 0),
              failed: formatNumber(kpi?.failed_requests ?? 0),
            })}
            icon={Sigma}
            points={trends?.success_rate ?? []}
            accent={{
              iconWrap: "bg-emerald-50",
              iconColor: "text-emerald-600",
              line: "stroke-emerald-500",
              fill: "fill-emerald-100/70",
            }}
          />
          <DashboardKpiCard
            title={t("dashboard.total_tokens")}
            value={<AnimatedNumber value={kpi?.total_tokens ?? 0} format={formatNumber} />}
            hint={t("dashboard.token_hint", {
              input: formatNumber(kpi?.input_tokens ?? 0),
              output: formatNumber(kpi?.output_tokens ?? 0),
            })}
            icon={Sparkles}
            points={trends?.total_tokens ?? []}
            accent={{
              iconWrap: "bg-violet-50",
              iconColor: "text-violet-600",
              line: "stroke-violet-500",
              fill: "fill-violet-100/75",
            }}
          />
          <DashboardKpiCard
            title={t("dashboard.failed_requests")}
            value={<AnimatedNumber value={kpi?.failed_requests ?? 0} format={formatNumber} />}
            hint={t("dashboard.failed_hint")}
            icon={TriangleAlert}
            points={trends?.failed_requests ?? []}
            accent={{
              iconWrap: "bg-rose-50",
              iconColor: "text-rose-600",
              line: "stroke-rose-500",
              fill: "fill-rose-100/75",
            }}
          />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.9fr)]">
        <ThroughputTrendChart
          points={throughputSeries}
          subtitle={t("dashboard.throughput_title")}
        />
        <Card
          className="border-white/70 bg-white/88 shadow-[0_18px_48px_rgba(15,23,42,0.07)]"
          title={t("dashboard.overview_title")}
          description={t("dashboard.overview_hint", { time: generatedAt })}
        >
          <div className="grid gap-3">
            <SummaryStat
              title={t("dashboard.summary_api_keys")}
              value={<AnimatedNumber value={summary?.counts.api_keys ?? 0} format={formatNumber} />}
              icon={FileKey}
            />
            <SummaryStat
              title={t("dashboard.summary_providers")}
              value={
                <AnimatedNumber
                  value={summary?.counts.providers_total ?? 0}
                  format={formatNumber}
                />
              }
              icon={Layers}
            />
            <SummaryStat
              title={t("dashboard.summary_auth_files")}
              value={
                <AnimatedNumber value={summary?.counts.auth_files ?? 0} format={formatNumber} />
              }
              icon={Sparkles}
            />
          </div>
        </Card>
      </div>

      <SystemMonitorSection />
    </div>
  );
}
