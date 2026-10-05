import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";
import i18n from "@code-proxy/i18n";
import { SystemMonitorSection } from "../SystemMonitorSection";
import type { SystemStats } from "../useSystemStats";

const stats = {
  db_size_bytes: 8192,
  db_engine: "postgres",
  log_content_store_bytes: 1024,
  log_dir_size_bytes: 2048,
  log_size_bytes: 2048,
  process_mem_bytes: 64 * 1024 * 1024,
  process_mem_pct: 3,
  process_cpu_pct: 2,
  go_routines: 12,
  go_heap_bytes: 16 * 1024 * 1024,
  system_cpu_pct: 10,
  system_mem_total: 2 * 1024 * 1024 * 1024,
  system_mem_used: 512 * 1024 * 1024,
  system_mem_pct: 25,
  net_bytes_sent: 1000,
  net_bytes_recv: 2000,
  net_send_rate: 10,
  net_recv_rate: 20,
  disk_total: 100 * 1024 * 1024 * 1024,
  disk_used: 40 * 1024 * 1024 * 1024,
  disk_free: 60 * 1024 * 1024 * 1024,
  disk_pct: 40,
  uptime_seconds: 3600,
  start_time: "2026-07-09T12:00:00Z",
  channel_latency: [],
  active_concurrency: null,
  total_in_flight: 0,
  total_rpm: 0,
  total_tpm: 0,
} satisfies SystemStats;

describe("SystemMonitorSection", () => {
  beforeEach(async () => {
    await i18n.changeLanguage("en");
  });

  test("shows PostgreSQL for postgres runtime database stats", () => {
    render(<SystemMonitorSection stats={stats} connected apiKeyCount={1} />);

    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.queryByText("SQLite + WAL + SHM")).toBeNull();
  });

  test("defaults missing db engine to PostgreSQL", () => {
    render(
      <SystemMonitorSection stats={{ ...stats, db_engine: undefined }} connected apiKeyCount={1} />,
    );

    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(screen.queryByText(/sqlite/i)).toBeNull();
  });

  test("colours each resource by category and switches to amber / red as it climbs", () => {
    render(
      <SystemMonitorSection
        stats={{ ...stats, system_cpu_pct: 23, system_mem_pct: 85, process_cpu_pct: 97, process_mem_pct: 7 }}
        connected
        apiKeyCount={1}
      />,
    );

    const [sysCpu, sysMem, svcCpu, svcMem] = screen.getAllByTestId("monitor-meter-fill");
    expect(sysCpu).toHaveStyle({ width: "23%" });
    expect(sysCpu.className).toContain("from-sky-400");
    expect(sysMem.className).toContain("from-amber-300");
    expect(svcCpu.className).toContain("from-rose-400");
    expect(svcMem.className).toContain("from-violet-400");
    // 进度条首次出现从 0 长到实际值，减少动态效果时关掉。
    expect(sysCpu.className).toContain("motion-safe:animate-[quota-bar-grow");
    expect(screen.getByRole("img", { name: "Critical" })).toBeInTheDocument();
  });

  test("labels the health score and disk state with tinted pills and shows the live channel", () => {
    render(<SystemMonitorSection stats={stats} connected apiKeyCount={1} />);

    // 夹具的加权健康分是 88.5，落在「良好」档（同为绿色）；磁盘 40% 是「正常」。
    expect(screen.getByText("Good")).toHaveClass("text-emerald-700");
    expect(screen.getByText("Normal")).toHaveClass("text-emerald-700");
    expect(screen.getByText("Live")).toBeInTheDocument();
    expect(screen.getByText("Used", { selector: "span" })).toBeInTheDocument();
  });
});
