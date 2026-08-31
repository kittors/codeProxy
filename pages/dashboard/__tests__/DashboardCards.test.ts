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

    expect(source).toContain("HealthHeroCard");
    expect(source).toContain("DiskUsageRingCard");
    expect(source).toContain('bodyClassName="mt-0 flex h-full items-center justify-center"');
    expect(source).toContain("strokeDasharray={circumference}");
    expect(source).toContain("grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_280px]");
    expect(source).not.toContain('label={t("system_monitor.disk_free")}');
  });

  test("labels api key count explicitly instead of users in latency summary", () => {
    const source = readModule("pages/dashboard/SystemMonitorSection.tsx");

    expect(source).toContain('t("system_monitor.key_count")');
    expect(source).not.toContain('t("system_monitor.users")');
  });

  test("includes dark mode surfaces for throughput and system monitor summary cards", () => {
    const chartSource = readModule("pages/dashboard/ThroughputTrendChart.tsx");
    const systemMonitorSource = readModule("pages/dashboard/SystemMonitorSection.tsx");

    expect(chartSource).toContain("dark:bg-neutral-900/70");
    expect(chartSource).toContain("dark:text-slate-400");
    expect(systemMonitorSource).toContain("dark:bg-neutral-900/70");
    expect(systemMonitorSource).toContain("dark:text-white/80");
  });
});
