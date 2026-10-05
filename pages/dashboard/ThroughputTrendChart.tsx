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
import {
  CHART_CATEGORICAL,
  Card,
  ChartLegend,
  type ChartLegendItem,
  EChart,
  HoverTooltip,
  Tabs,
  TabsList,
  TabsTrigger,
  chartAxisStyle,
  chartPalette,
  chartTooltipStyle,
  surface,
  useTheme,
} from "@code-proxy/ui";
import { DashboardMetricValue, formatThroughputValue, formatThroughputTooltip } from "./DashboardMetrics";

const PANEL_SURFACE = surface({ tone: "panel", radius: "2xl" });


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
  isDark: boolean,
): ECBasicOption {
  const axis = chartAxisStyle(isDark);
  const tooltipStyle = chartTooltipStyle(isDark);
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
        width: 2,
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
            { offset: 0, color: `${cfg.color}1a` },
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
      ...tooltipStyle,
      trigger: "axis",
      renderMode: "html",
      appendToBody: true,
      confine: true,
      extraCssText: `${tooltipStyle.extraCssText} z-index: 10000;`,
      formatter: formatThroughputTooltip,
    },
    grid: { left: 12, right: 12, top: 12, bottom: 22, containLabel: true },
    xAxis: {
      type: "category",
      data: labels,
      boundaryGap: false,
      axisTick: axis.axisTick,
      axisLine: axis.axisLine,
      axisLabel: { ...axis.axisLabel, hideOverlap: true },
    },
    yAxis: [
      {
        type: "value",
        splitNumber: 4,
        axisLabel: {
          ...axis.axisLabel,
          formatter: (value: number) => formatThroughputValue(value),
        },
        splitLine: axis.splitLine,
      },
      {
        type: "value",
        splitNumber: 4,
        axisLabel: {
          ...axis.axisLabel,
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
  const {
    state: { mode },
  } = useTheme();
  const isDark = mode === "dark";
  const palette = chartPalette(isDark);
  const [metric, setMetric] = useState<"rpm" | "tpm">("rpm");
  const [visibleIds, setVisibleIds] = useState<Set<string>>(() => new Set(["aggregated"]));

  const hasTenants = allTenantsScope && tenants && tenants.length > 1;

  // Build series configs
  const seriesConfigs = useMemo<ThroughputSeriesConfig[]>(() => {
    if (!hasTenants) {
      return [
        // 不分租户时 RPM、TPM 用指标身份色（蓝 / 紫），与上方指标卡一致；按租户拆开时汇总线
        // 仍用墨色，免得和分类色板里的蓝色租户线撞色。
        {
          id: "aggregated-rpm",
          name: "RPM",
          points,
          color: palette.metric.rpm,
          metric: "rpm",
        },
        {
          id: "aggregated-tpm",
          name: "TPM",
          points,
          color: palette.metric.tpm,
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
        color: palette.primary,
        metric,
        lineType: "solid",
      },
    ];

    tenants.forEach((tenant, idx) => {
      const color = CHART_CATEGORICAL[idx % CHART_CATEGORICAL.length];
      configs.push({
        id: `tenant-${tenant.tenant_id}`,
        name: tenant.tenant_name || tenant.tenant_id,
        points: tenant.throughput_series,
        color,
        metric,
      });
    });

    return configs;
  }, [hasTenants, points, tenants, t, metric, palette.primary, palette.metric.rpm, palette.metric.tpm]);

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
    () => createThroughputOption(seriesConfigs, visibleIds, isDark),
    [isDark, seriesConfigs, visibleIds],
  );

  const active = rpm > 0 || tpm > 0;
  const titleNode = allTenantsScope ? (
    <span className="inline-flex items-center gap-1.5">
      <span>{title}</span>
      <HoverTooltip content={t("dashboard.throughput_all_tenants_hint")} placement="top">
        <button
          type="button"
          className="inline-flex h-5 w-5 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
          aria-label={t("dashboard.throughput_all_tenants_hint")}
        >
          <CircleAlert size={14} />
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
            <Tabs
              value={metric}
              onValueChange={(next) => setMetric(next === "tpm" ? "tpm" : "rpm")}
              size="sm"
            >
              <TabsList aria-label={title}>
                <TabsTrigger value="rpm">RPM</TabsTrigger>
                <TabsTrigger value="tpm">TPM</TabsTrigger>
              </TabsList>
            </Tabs>
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
        <div className="rounded-2xl bg-subtle px-3 py-2">
          <div className="text-2xs font-medium text-ink-3">
            RPM
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">
            <DashboardMetricValue value={rpm} />
          </div>
        </div>
        <div className="rounded-2xl bg-subtle px-3 py-2">
          <div className="text-2xs font-medium text-ink-3">
            TPM
          </div>
          <div className="mt-1 text-xl font-semibold tabular-nums text-ink">
            <DashboardMetricValue value={tpm} />
          </div>
        </div>
      </div>
      <EChart option={option} className="h-56" />
      <ChartLegend className="justify-start pt-3" items={legendItems} />
    </Card>
  );
}
