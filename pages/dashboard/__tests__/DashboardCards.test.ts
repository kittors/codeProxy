import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "../../..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("dashboard card composition", () => {
  test("uses the shared Card component for dashboard KPI cards", () => {
    const source = readModule("pages/dashboard/DashboardPage.tsx");
    const chartSource = readModule("pages/dashboard/ThroughputTrendChart.tsx");

    expect(source).toContain('from "@code-proxy/ui"');
    expect(source).toContain('from "./useSystemStats"');
    expect(source).toContain("createSparklineOption");
    expect(source).toContain("ThroughputTrendChart");
    expect(chartSource).toContain("ChartLegend");
    expect(source).toContain("useInterval");
    expect(source).toContain("summary?.trends");
    expect(source).toContain('can("system.status.read")');
    expect(source).toContain("useSystemStats(15, canViewSystemMonitor && pageVisible)");
    expect(source).toContain("rpm={tenantRpm}");
    expect(source).toContain("tpm={tenantTpm}");
    expect(source).toContain("tenants={tenantBreakdown}");
    expect(source).toContain("canViewSystemMonitor");
    expect(source).toContain("allTenantsScope");
    expect(chartSource).toContain("throughput_all_tenants_hint");
    expect(source).toContain("meta.generated_at");
    expect(source).toContain("pageVisible ? 20_000 : null");
    expect(source).not.toContain('replaceMerge="series"');
    expect(source).not.toContain('from "@features/monitor-widgets"');
    expect(source).not.toContain("<KpiCard");
  });

  test("formats throughput chart values with at most two decimal places", () => {
    const source = readModule("pages/dashboard/ThroughputTrendChart.tsx");
    const metricSource = readModule("pages/dashboard/DashboardMetrics.tsx");

    expect(metricSource).toContain("formatThroughputValue");
    expect(metricSource).toContain("maximumFractionDigits: 2");
    expect(metricSource).toContain("formatThroughputTooltip");
    expect(source).toContain("formatter: formatThroughputTooltip");
  });

  test("uses the shared Card component for system monitor panels", () => {
    const source = readModule("pages/dashboard/SystemMonitorSection.tsx");

    expect(source).toContain('from "@code-proxy/ui"');
    expect(source).toContain("AverageLatencyCard");
    expect(source).toContain("apiKeyCount");
    expect(source).toContain("stats?: SystemStats | null");
    expect(source).toContain("connected?: boolean");
    expect(source).not.toContain("useSystemStats(3)");
    expect(source).not.toContain("ConcurrencyCard");
    expect(source).not.toContain('className="rounded-2xl border border-slate-900/8 bg-white/50');
    expect(source).not.toContain('className="rounded-xl border border-slate-900/8 bg-white');
    expect(source).not.toContain(
      'className="min-w-0 overflow-hidden rounded-xl border border-slate-900/8 bg-white',
    );
  });

  test("uses a centered health hero and circular disk usage card in system monitor", () => {
    const source = readModule("pages/dashboard/SystemMonitorSection.tsx");
    const visuals = readModule("features/monitor-widgets/monitorVisuals.tsx");

    expect(source).toContain("HealthHeroCard");
    expect(source).toContain("DiskUsageRingCard");
    // 两个环都走同一个环形组件：描边从 0 转到当前值，告警时换色。
    expect(source.match(/<MeterRing/g)?.length).toBe(2);
    expect(visuals).toContain("strokeDasharray={circumference}");
    expect(visuals).toContain("transition-[stroke-dashoffset]");
    expect(source).toContain("grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_280px]");
    // 只有一层卡片：卡片里不再套淡底小块和彩色图标块，「系统监控」本身是扁平分区。
    expect(source).not.toContain("bg-subtle");
    expect(source).not.toContain("IconChip");
    expect(source).toMatch(/<Card\s+flat/);
  });

  test("labels api key count explicitly instead of users in latency summary", () => {
    const source = readModule("pages/dashboard/SystemMonitorSection.tsx");

    expect(source).toContain('t("system_monitor.key_count")');
    expect(source).not.toContain('t("system_monitor.users")');
  });

  test("includes dark mode surfaces for throughput and system monitor summary cards", () => {
    const chartSource = readModule("pages/dashboard/ThroughputTrendChart.tsx");
    const systemMonitorSource = readModule("pages/dashboard/SystemMonitorSection.tsx");

    // RPM / TPM 读数直接写在卡片上（标签前一颗与曲线同色的圆点），不再套白底小卡和
    // 彩色图标块；文字用 text-ink-* 令牌，深浅色都跟着切换，没有只顾浅色的填充色。
    expect(chartSource).not.toContain("surface(");
    expect(chartSource).not.toContain("DialogIcon");
    expect(chartSource).not.toContain("bg-subtle");
    expect(chartSource).toContain("text-ink-3");
    expect(chartSource).not.toMatch(/bg-slate-50(?![\w/-])/);
    expect(systemMonitorSource).not.toContain("dark:text-white/80");
    expect(systemMonitorSource).toContain("text-ink-2");
  });
});
