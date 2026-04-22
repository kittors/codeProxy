import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const root = resolve(__dirname, "../../..");

const readModule = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("dashboard card composition", () => {
  test("uses the shared Card component for dashboard KPI cards", () => {
    const source = readModule("modules/dashboard/DashboardPage.tsx");

    expect(source).toContain('from "@/modules/ui/Card"');
    expect(source).toContain("Sparkline");
    expect(source).toContain("ThroughputTrendChart");
    expect(source).toContain("summary?.trends");
    expect(source).toContain("meta.generated_at");
    expect(source).not.toContain('from "@/modules/monitor/MonitorPagePieces"');
    expect(source).not.toContain("<KpiCard");
  });

  test("uses the shared Card component for system monitor panels", () => {
    const source = readModule("modules/dashboard/SystemMonitorSection.tsx");

    expect(source).toContain('from "@/modules/ui/Card"');
    expect(source).not.toContain('className="rounded-2xl border border-slate-200 bg-white/50');
    expect(source).not.toContain('className="rounded-xl border border-slate-200/80 bg-white');
    expect(source).not.toContain(
      'className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white',
    );
  });
});
