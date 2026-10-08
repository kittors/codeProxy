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
  Card,
  ChartLegend,
  type ChartLegendItem,
  EChart,
  HoverTooltip,
  type Hue,
  Tabs,
  TabsList,
  TabsTrigger,
  chartAxisStyle,
  chartGradient,
  chartPalette,
  chartTooltipStyle,
  hueHex,
  useTheme,
} from "@code-proxy/ui";
import { DashboardMetricValue, formatThroughputValue, formatThroughputTooltip } from "./DashboardMetrics";


/**
 * 按租户拆开时每个租户一条线的颜色：CHART_CATEGORICAL 去掉靛蓝、紫与红——汇总线用的是当前指标的
 * 身份色（RPM 蓝 / TPM 紫），靛蓝、紫会和它混在一起；红只给失败。按序号取、不随数值排名变化，
 * 深色模式取同一色相亮一档（hueHex）。相邻两色在红绿色弱模拟下都分得开。
 */
const TENANT_HUES: readonly Hue[] = ["emerald", "amber", "pink", "cyan", "orange", "teal", "lime"];

export const throughputTenantColor = (index: number, isDark: boolean): string =>
  hueHex(TENANT_HUES[index % TENANT_HUES.length] ?? "emerald", isDark);


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
    // 租户线只画线：四五片面积叠在一起会糊成一团；汇总线（以及不分租户时的 RPM / TPM）才带面积。
    // RPM、TPM 两片面积常常重叠，深色底上叠出来发灰，所以深色模式再淡一档。
    const isTenant = cfg.id.startsWith("tenant-");

    return {
      id: cfg.id,
      name: cfg.name,
      type: "line",
      yAxisIndex: isRpm ? 0 : 1,
      data,
      smooth: true,
      showSymbol: false,
      lineStyle: {
        width: isTenant ? 1.75 : 2.2,
        color: cfg.color,
        type: cfg.lineType ?? "solid",
      },
      itemStyle: { color: cfg.color },
      emphasis: { lineStyle: { width: isTenant ? 2.4 : 2.8 } },
      areaStyle: isTenant ? undefined : { color: chartGradient(cfg.color, isDark ? 0.14 : 0.2, 0) },
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
        // RPM、TPM 用指标身份色（蓝 / 紫），与上方指标卡和下面的读数格一致。
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

    // 按租户拆开时：汇总线沿用当前指标的身份色，租户线从 TENANT_HUES 依次取。
    const configs: ThroughputSeriesConfig[] = [
      {
        id: "aggregated",
        name: t("dashboard.throughput_tenant_all"),
        points,
        color: metric === "rpm" ? palette.metric.rpm : palette.metric.tpm,
        metric,
        lineType: "solid",
      },
    ];

    tenants.forEach((tenant, idx) => {
      const color = throughputTenantColor(idx, isDark);
      configs.push({
        id: `tenant-${tenant.tenant_id}`,
        name: tenant.tenant_name || tenant.tenant_id,
        points: tenant.throughput_series,
        color,
        metric,
      });
    });

    return configs;
  }, [hasTenants, points, tenants, t, metric, isDark, palette.metric.rpm, palette.metric.tpm]);

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
          {/* 简约风格是中性胶囊、颜色只在那颗点上；多彩风格整块绿色淡底（与系统监控的数据通道状态一致）。 */}
          <div
            className={`inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-medium dark:bg-white/[0.07] ${
              connected
                ? "text-ink-2 colorful:bg-emerald-50 colorful:text-emerald-600 colorful:dark:bg-emerald-500/10 colorful:dark:text-emerald-300"
                : "text-ink-3"
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${active ? "animate-pulse bg-emerald-500" : "bg-ink-4"}`}
            />
            {connected ? t("system_monitor.live") : t("system_monitor.polling")}
          </div>
        </div>
      }
    >
      {/*
        当前读数：直接写在卡片上，标签前一颗与曲线同色的小圆点把数字和线对上。以前是卡片里
        再套两张白底小卡 + 彩色图标块，圆角一层套一层。
      */}
      <div className="mb-3 grid grid-cols-2 gap-3">
        {(
          [
            { key: "rpm", label: "RPM", value: rpm, color: palette.metric.rpm },
            { key: "tpm", label: "TPM", value: tpm, color: palette.metric.tpm },
          ] as const
        ).map((reading) => (
          <div key={reading.key} className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs font-medium text-ink-3">
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: reading.color }}
              />
              {reading.label}
            </div>
            <div className="mt-0.5 text-xl font-semibold tabular-nums text-ink">
              <DashboardMetricValue value={reading.value} />
            </div>
          </div>
        ))}
      </div>
      <EChart option={option} className="h-56" />
      <ChartLegend className="justify-start pt-3" items={legendItems} />
    </Card>
  );
}
