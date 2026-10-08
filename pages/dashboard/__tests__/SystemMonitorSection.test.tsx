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

  test("draws each resource in both styles and switches to amber / red only as it climbs", () => {
    render(
      <SystemMonitorSection
        stats={{ ...stats, system_cpu_pct: 23, system_mem_pct: 85, process_cpu_pct: 97, process_mem_pct: 7 }}
        connected
        apiKeyCount={1}
      />,
    );

    const [sysCpu, sysMem, svcCpu, svcMem] = screen.getAllByTestId("monitor-meter-fill");
    expect(sysCpu).toHaveStyle({ width: "23%" });
    // 简约风格（基础类）：正常档一律强调色，颜色只在出问题的那一张卡上出现。
    expect(sysCpu).toHaveClass("bg-accent");
    expect(sysMem).toHaveClass("bg-amber-500");
    expect(svcCpu).toHaveClass("bg-rose-500");
    expect(svcMem).toHaveClass("bg-accent");
    // 多彩风格（colorful: 变体）：正常档用指标的分类色——CPU 天蓝、内存紫——告警档覆盖成琥珀 / 红。
    expect(sysCpu).toHaveClass("colorful:from-sky-400", "colorful:to-blue-500");
    expect(svcMem).toHaveClass("colorful:from-violet-400");
    expect(sysMem).toHaveClass("colorful:from-amber-300");
    expect(svcCpu).toHaveClass("colorful:from-rose-400");
    expect(sysCpu.parentElement).toHaveClass("bg-track", "colorful:bg-sky-500/10");
    // 进度条首次出现从 0 长到实际值，减少动态效果时关掉。
    expect(sysCpu.className).toContain("motion-safe:animate-[quota-bar-grow");
    expect(screen.getByRole("img", { name: "Critical" })).toBeInTheDocument();
  });

  test("labels the health score and disk state in both styles and shows the live channel", () => {
    render(<SystemMonitorSection stats={stats} connected apiKeyCount={1} />);

    // 夹具的加权健康分是 88.5，落在「良好」档；磁盘 40% 是「正常」。简约风格下一切正常不是
    // 需要注意的消息，标签是中性的灰；多彩风格下是绿色标签。
    expect(screen.getByText("Good")).toHaveClass("text-ink-2", "colorful:text-emerald-700");
    expect(screen.getByText("Normal")).toHaveClass("text-ink-2", "colorful:text-emerald-700");
    expect(screen.getByText("Live")).toBeInTheDocument();
    // 「已用」出现两次：环中央的说明，和环下方图例行（图例改成纯文字行，不再是淡底小块）。
    expect(screen.getAllByText("Used", { selector: "span" })).toHaveLength(2);
  });
});
