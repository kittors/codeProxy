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
});
