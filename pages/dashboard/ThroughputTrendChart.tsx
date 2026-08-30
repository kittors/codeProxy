import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { CircleAlert } from "lucide-react";
import type { ECBasicOption } from "echarts/types/dist/shared";
import type {
  DashboardTenantThroughputItem,
  DashboardThroughputPoint,
} from "@code-proxy/api-client/endpoints/usage";
import { Card, EChart, ChartLegend, type ChartLegendItem, HoverTooltip, surface } from "@code-proxy/ui";
import { DashboardMetricValue, formatThroughputValue, formatThroughputTooltip } from "./DashboardMetrics";

const PANEL_SURFACE = surface({ tone: "panel", radius: "2xl" });

const TENANT_PALETTE = [
  "#2563eb", // blue
  "#7c3aed", // violet
  "#059669", // emerald
  "#d97706", // amber
  "#dc2626", // red
  "#0891b2", // cyan
  "#db2777", // pink
  "#4f46e5", // indigo
  "#ea580c", // orange
  "#16a34a", // green
  "#9333ea", // purple
  "#0284c7", // sky
];

export interface ThroughputSeriesConfig {
  id: string;
  name: string;
  points: DashboardThroughputPoint[];
  color: string;
  metric: "rpm" | "tpm";
  lineType?: "solid" | "dashed";
}

function createThroughputOption(
  configs: ThroughputSeriesConfig[],
  visibleIds: Set<string>,
): ECBasicOption {
  // Collect all unique labels in order
  const labels: string[] = [];
  const labelSet = new Set<string>();
  for (const cfg of configs) {
    for (const pt of cfg.points) {
      if (!labelSet.has(pt.label)) {
        labelSet.add(pt.label);
        labels.push(pt.label);
      }
    }
  }

  const series = configs.map((cfg) => {
    const isVisible = visibleIds.has(cfg.id);
    const pointMap = new Map(cfg.points.map((p) => [p.label, cfg.metric === "rpm" ? p.rpm : p.tpm]));
    const data = isVisible ? labels.map((l) => pointMap.get(l) ?? 0) : [];
    const isRpm = cfg.metric === "rpm";

    return {
      id: cfg.id,
      name: cfg.name,
      type: "line",
      yAxisIndex: isRpm ? 0 : 1,
      data,
      smooth: true,
      showSymbol: false,
      lineStyle: {
        width: 2.5,
        color: cfg.color,
        type: cfg.lineType ?? "solid",
      },
      itemStyle: { color: cfg.color },
      areaStyle: {
        color: {
          type: "linear",
          x: 0,
          y: 0,
          x2: 0,
          y2: 1,
          colorStops: [
            { offset: 0, color: `${cfg.color}25` },
            { offset: 1, color: `${cfg.color}00` },
          ],
        },
      },
    };
  });

  return {
    animationDuration: 360,
    animationDurationUpdate: 80,
    tooltip: {
      trigger: "axis",
      borderWidth: 0,
      backgroundColor: "rgba(15, 23, 42, 0.92)",
      textStyle: { color: "#fff" },
      formatter: formatThroughputTooltip,
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
        axisLabel: {
          color: "#64748b",
          fontSize: 10,
          formatter: (value: number) => formatThroughputValue(value),
        },
        splitLine: { lineStyle: { color: "rgba(148,163,184,0.16)" } },
      },
      {
        type: "value",
        splitNumber: 4,
        axisLabel: {
          color: "#64748b",
          fontSize: 10,
          formatter: (value: number) => formatThroughputValue(value),
        },
        splitLine: { show: false },
      },
    ],
    series,
  };
}

export function ThroughputTrendChart({
  title,
  points,
  rpm,
  tpm,
  connected,
  allTenantsScope = false,
  tenants = [],
}: {
  title: string;
  points: DashboardThroughputPoint[];
  rpm: number;
  tpm: number;
  connected: boolean;
  /** Platform super-admin: series aggregates every tenant. */
  allTenantsScope?: boolean;
  tenants?: DashboardTenantThroughputItem[];
}) {
  const { t } = useTranslation();
  const [metric, setMetric] = useState<"rpm" | "tpm">("rpm");
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set(["aggregated"]));

  const hasTenants = allTenantsScope && tenants && tenants.length > 1;

  // Build series configs
  const seriesConfigs = useMemo<ThroughputSeriesConfig[]>(() => {
    if (!hasTenants) {
      return [
        {
          id: "aggregated-rpm",
          name: "RPM",
          points,
          color: "#2563eb",
          metric: "rpm",
        },
        {
          id: "aggregated-tpm",
          name: "TPM",
          points,
          color: "#7c3aed",
          metric: "tpm",
        },
      ];
    }

    // In allTenantsScope with breakdown:
    const configs: ThroughputSeriesConfig[] = [
      {
        id: "aggregated",
        name: t("dashboard.throughput_tenant_all"),
        points,
        color: metric === "rpm" ? "#2563eb" : "#7c3aed",
        metric,
        lineType: "solid",
      },
    ];

    tenants.forEach((tenant, idx) => {
      const color = TENANT_PALETTE[(idx + 1) % TENANT_PALETTE.length] || "#059669";
      configs.push({
        id: `tenant-${tenant.tenant_id}`,
        name: tenant.tenant_name || tenant.tenant_id,
        points: tenant.throughput_series,
        color,
        metric,
      });
    });

    return configs;
  }, [hasTenants, points, tenants, t, metric]);

  // Keep visibleIds synchronized if configs change
  useEffect(() => {
    if (!hasTenants) {
      setVisibleIds(new Set(["aggregated-rpm", "aggregated-tpm"]));
    } else {
      setVisibleIds((prev) => {
        if (prev.size === 0 || (!prev.has("aggregated") && !Array.from(prev).some((id) => id.startsWith("tenant-")))) {
          return new Set(["aggregated", ...tenants.map((item) => `tenant-${item.tenant_id}`)]);
        }
        return prev;
      });
    }
  }, [hasTenants, tenants]);

  const handleToggle = useCallback((id: string) => {
    setVisibleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // If it's the last one, don't uncheck or allow empty
        if (next.size > 1) {
          next.delete(id);
        }
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const option = useMemo(
    () => createThroughputOption(seriesConfigs, visibleIds),
    [seriesConfigs, visibleIds],
  );

  const active = rpm > 0 || tpm > 0;
  const titleNode = allTenantsScope ? (
    <span className="inline-flex items-center gap-1.5">
      <span>{title}</span>
      <HoverTooltip content={t("dashboard.throughput_all_tenants_hint")} placement="top">
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-amber-500 transition-colors hover:bg-amber-50 hover:text-amber-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 dark:text-amber-400 dark:hover:bg-amber-500/10 dark:hover:text-amber-300"
          aria-label={t("dashboard.throughput_all_tenants_hint")}
        >
          <CircleAlert size={14} strokeWidth={2.25} />
        </button>
      </HoverTooltip>
    </span>
  ) : (
    title
  );

  const legendItems = useMemo<ChartLegendItem[]>(() => {
    return seriesConfigs.map((cfg) => ({
      key: cfg.id,
      label: cfg.name,
      colorHex: cfg.color,
      enabled: visibleIds.has(cfg.id),
      onToggle: handleToggle,
    }));
  }, [seriesConfigs, visibleIds, handleToggle]);

  return (
    <Card
      className={PANEL_SURFACE}
      title={titleNode}
      actions={
        <div className="flex items-center gap-2">
          {hasTenants ? (
            <div className="inline-flex rounded-lg bg-slate-100 p-0.5 text-xs font-semibold dark:bg-neutral-800">
              <button
                type="button"
                onClick={() => setMetric("rpm")}
                className={`rounded-md px-2.5 py-1 transition ${
                  metric === "rpm"
                    ? "bg-white text-blue-600 shadow-2xs dark:bg-neutral-900 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                RPM
              </button>
              <button
                type="button"
                onClick={() => setMetric("tpm")}
                className={`rounded-md px-2.5 py-1 transition ${
                  metric === "tpm"
                    ? "bg-white text-violet-600 shadow-2xs dark:bg-neutral-900 dark:text-violet-400"
                    : "text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                TPM
              </button>
            </div>
          ) : null}
          <div
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
              connected
                ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-white/45"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                active ? "animate-pulse bg-emerald-500" : "bg-slate-300 dark:bg-neutral-600"
              }`}
            />
            {connected ? t("system_monitor.live") : t("system_monitor.polling")}
          </div>
        </div>
      }
      padding="compact"
    >
      <div className="mb-3 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-neutral-900/70 dark:ring-1 dark:ring-white/8">
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            RPM
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
            <DashboardMetricValue value={rpm} />
          </div>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3 py-2 dark:bg-neutral-900/70 dark:ring-1 dark:ring-white/8">
          <div className="text-2xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            TPM
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-violet-600 dark:text-violet-400">
            <DashboardMetricValue value={tpm} />
          </div>
        </div>
      </div>
      <EChart option={option} className="h-56" />
      <ChartLegend className="justify-start pt-3" items={legendItems} />
    </Card>
  );
}
