import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "../../..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("dashboard card composition", () => {
  test("uses the shared Card component for dashboard KPI cards", () => {
    const source = readModule("modules/dashboard/DashboardPage.tsx");

    expect(source).toContain('from "@/modules/ui/Card"');
    expect(source).toContain('from "@/modules/ui/charts/EChart"');
    expect(source).toContain('from "@/modules/dashboard/useSystemStats"');
    expect(source).toContain("createSparklineOption");
    expect(source).toContain("ThroughputTrendChart");
    expect(source).toContain("ChartLegend");
    expect(source).toContain("useInterval");
    expect(source).toContain("summary?.trends");
    expect(source).toContain("const { stats, connected } = useSystemStats(3)");
    expect(source).toContain("rpm={stats?.total_rpm ?? 0}");
    expect(source).toContain("tpm={stats?.total_tpm ?? 0}");
    expect(source).toContain("meta.generated_at");
    expect(source).toContain('<EChart option={option} className="h-10" overflowVisible />');
    expect(source).not.toContain('replaceMerge="series"');
    expect(source).not.toContain('from "@/modules/monitor/MonitorPagePieces"');
    expect(source).not.toContain("<KpiCard");
  });

  test("formats throughput chart values with at most two decimal places", () => {
    const source = readModule("modules/dashboard/DashboardPage.tsx");

    expect(source).toContain("formatThroughputValue");
    expect(source).toContain("maximumFractionDigits: 2");
    expect(source).toContain("formatThroughputTooltip");
    expect(source).toContain("formatter: formatThroughputTooltip");
  });

  test("uses the shared Card component for system monitor panels", () => {
    const source = readModule("modules/dashboard/SystemMonitorSection.tsx");

    expect(source).toContain('from "@/modules/ui/Card"');
    expect(source).toContain("AverageLatencyCard");
    expect(source).toContain("apiKeyCount");
    expect(source).toContain("stats?: SystemStats | null");
    expect(source).toContain("connected?: boolean");
    expect(source).not.toContain("useSystemStats(3)");
    expect(source).not.toContain("ConcurrencyCard");
    expect(source).not.toContain('className="rounded-2xl border border-slate-200 bg-white/50');
    expect(source).not.toContain('className="rounded-xl border border-slate-200/80 bg-white');
    expect(source).not.toContain(
      'className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white',
    );
  });

  test("uses a centered health hero and circular disk usage card in system monitor", () => {
    const source = readModule("modules/dashboard/SystemMonitorSection.tsx");

    expect(source).toContain("HealthHeroCard");
    expect(source).toContain("DiskUsageRingCard");
    expect(source).toContain('bodyClassName="mt-0 flex h-full items-center justify-center"');
    expect(source).toContain("strokeDasharray={circumference}");
    expect(source).toContain("grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_280px]");
    expect(source).not.toContain('label={t("system_monitor.disk_free")}');
  });
});
