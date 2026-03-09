import { Cpu, HardDrive, MemoryStick, Network, Clock, Database, FileText, ArrowUp, ArrowDown, Wifi } from "lucide-react";
import { MonitorCard } from "@/modules/monitor/MonitorPagePieces";
import { useSystemStats, type SystemStats } from "./useSystemStats";

/* ─── Helpers ─── */

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatRate(bytesPerSec: number): string {
    if (bytesPerSec < 1024) return `${bytesPerSec.toFixed(0)} B/s`;
    if (bytesPerSec < 1024 * 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
    return `${(bytesPerSec / 1024 / 1024).toFixed(2)} MB/s`;
}

function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d} 天 ${h} 时 ${m} 分`;
    if (h > 0) return `${h} 时 ${m} 分`;
    return `${m} 分`;
}

function formatMs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)} ms`;
    return `${(ms / 1000).toFixed(2)} s`;
}

/** Returns tailwind color class based on threshold */
function statusColor(pct: number): string {
    if (pct >= 95) return "text-red-500";
    if (pct >= 80) return "text-amber-500";
    return "text-emerald-500";
}

function statusBg(pct: number): string {
    if (pct >= 95) return "bg-red-500";
    if (pct >= 80) return "bg-amber-500";
    return "bg-emerald-500";
}

function statusRing(pct: number): string {
    if (pct >= 95) return "stroke-red-500";
    if (pct >= 80) return "stroke-amber-500";
    return "stroke-emerald-500";
}

/* ─── Gauge Component ─── */

function CircularGauge({ value, label, sublabel }: { value: number; label: string; sublabel?: string }) {
    const clampedValue = Math.min(100, Math.max(0, value));
    const radius = 38;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (clampedValue / 100) * circumference;

    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative h-24 w-24">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                    <circle
                        cx="50" cy="50" r={radius}
                        fill="none"
                        strokeWidth="7"
                        className="stroke-slate-200 dark:stroke-neutral-800"
                    />
                    <circle
                        cx="50" cy="50" r={radius}
                        fill="none"
                        strokeWidth="7"
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        className={`${statusRing(clampedValue)} transition-all duration-500`}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-lg font-bold tabular-nums ${statusColor(clampedValue)}`}>
                        {clampedValue.toFixed(1)}%
                    </span>
                </div>
            </div>
            <div className="text-center">
                <p className="text-xs font-semibold text-slate-900 dark:text-white">{label}</p>
                {sublabel && <p className="text-[10px] text-slate-500 dark:text-white/55">{sublabel}</p>}
            </div>
        </div>
    );
}

/* ─── Stat Card ─── */

function StatCard({ icon: Icon, title, value, sublabel, statusPct }: {
    icon: typeof Cpu;
    title: string;
    value: string;
    sublabel?: string;
    statusPct?: number;
}) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
            <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-neutral-800">
                    <Icon size={16} className="text-slate-600 dark:text-slate-300" />
                </div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/55">{title}</span>
                {statusPct !== undefined && (
                    <span className={`ml-auto inline-block h-2 w-2 rounded-full ${statusBg(statusPct)}`} />
                )}
            </div>
            <p className="mt-3 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">{value}</p>
            {sublabel && <p className="mt-1 text-xs text-slate-500 dark:text-white/55">{sublabel}</p>}
        </div>
    );
}

/* ─── Channel Latency Table ─── */

function ChannelLatencyTable({ data }: { data: SystemStats["channel_latency"] }) {
    if (!data || data.length === 0) {
        return <p className="text-xs text-slate-400 dark:text-white/40">暂无渠道数据</p>;
    }
    const maxMs = Math.max(...data.map((d) => d.avg_ms));

    return (
        <div className="space-y-2">
            {data.map((ch) => {
                const pct = maxMs > 0 ? (ch.avg_ms / maxMs) * 100 : 0;
                return (
                    <div key={ch.source} className="flex items-center gap-3">
                        <span className="w-24 shrink-0 truncate text-xs font-medium text-slate-700 dark:text-slate-300">{ch.source}</span>
                        <div className="relative flex-1 h-5 overflow-hidden rounded-full bg-slate-100 dark:bg-neutral-800">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                                style={{ width: `${Math.max(pct, 4)}%` }}
                            />
                        </div>
                        <span className="w-16 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                            {formatMs(ch.avg_ms)}
                        </span>
                        <span className="w-12 shrink-0 text-right text-[10px] text-slate-400 tabular-nums">
                            {ch.count} 次
                        </span>
                    </div>
                );
            })}
        </div>
    );
}

/* ─── Skeleton placeholder ─── */

function SkeletonGauge() {
    return (
        <div className="flex flex-col items-center gap-2">
            <div className="relative h-24 w-24">
                <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                    <circle cx="50" cy="50" r={38} fill="none" strokeWidth="7" className="stroke-slate-200 dark:stroke-neutral-800" />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="h-5 w-10 animate-pulse rounded bg-slate-200 dark:bg-neutral-700" />
                </div>
            </div>
            <div className="h-3 w-12 animate-pulse rounded bg-slate-200 dark:bg-neutral-700" />
        </div>
    );
}

function SkeletonCard() {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
            <div className="flex items-center gap-2">
                <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-200 dark:bg-neutral-700" />
                <div className="h-3 w-16 animate-pulse rounded bg-slate-200 dark:bg-neutral-700" />
            </div>
            <div className="mt-3 h-6 w-24 animate-pulse rounded bg-slate-200 dark:bg-neutral-700" />
            <div className="mt-2 h-3 w-20 animate-pulse rounded bg-slate-200 dark:bg-neutral-700" />
        </div>
    );
}

/* ─── Main Section ─── */

export function SystemMonitorSection() {
    const { stats, connected } = useSystemStats(3);

    return (
        <MonitorCard
            title="系统监控"
            description="服务资源使用状态（实时推送）"
            actions={
                <div className="flex items-center gap-2 text-xs">
                    <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-neutral-600"}`} />
                    <span className="text-slate-500 dark:text-white/55">{connected ? "实时" : "轮询"}</span>
                </div>
            }
            loading={false}
        >
            {!stats ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <SkeletonGauge /><SkeletonGauge /><SkeletonGauge /><SkeletonGauge />
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <SkeletonCard /><SkeletonCard /><SkeletonCard /><SkeletonCard />
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                    {/* ── Row 1: Gauges ── */}
                    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                        <CircularGauge value={stats.system_cpu_pct} label="系统 CPU" />
                        <CircularGauge value={stats.system_mem_pct} label="系统内存" sublabel={`${formatBytes(stats.system_mem_used)} / ${formatBytes(stats.system_mem_total)}`} />
                        <CircularGauge value={stats.process_cpu_pct} label="服务 CPU" />
                        <CircularGauge value={stats.process_mem_pct} label="服务内存" sublabel={formatBytes(stats.process_mem_bytes)} />
                    </div>

                    {/* ── Row 2: Storage & Info ── */}
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <StatCard icon={Database} title="数据库" value={formatBytes(stats.db_size_bytes)} sublabel="SQLite + WAL" />
                        <StatCard icon={FileText} title="日志" value={formatBytes(stats.log_size_bytes)} sublabel="日志目录大小" />
                        <StatCard icon={Clock} title="运行时长" value={formatUptime(stats.uptime_seconds)} sublabel={`启动于 ${new Date(stats.start_time).toLocaleString()}`} />
                        <StatCard icon={MemoryStick} title="Go 堆内存" value={formatBytes(stats.go_heap_bytes)} sublabel={`${stats.go_routines} goroutines`} />
                    </div>

                    {/* ── Row 3: Network ── */}
                    <div className="grid gap-3 md:grid-cols-3">
                        <StatCard icon={ArrowUp} title="上行速率" value={formatRate(stats.net_send_rate)} sublabel={`累计 ${formatBytes(stats.net_bytes_sent)}`} />
                        <StatCard icon={ArrowDown} title="下行速率" value={formatRate(stats.net_recv_rate)} sublabel={`累计 ${formatBytes(stats.net_bytes_recv)}`} />
                        <StatCard
                            icon={Wifi}
                            title="总流量"
                            value={formatBytes(stats.net_bytes_sent + stats.net_bytes_recv)}
                            sublabel={`↑ ${formatBytes(stats.net_bytes_sent)} · ↓ ${formatBytes(stats.net_bytes_recv)}`}
                        />
                    </div>

                    {/* ── Row 4: Channel latency ── */}
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70">
                        <div className="flex items-center gap-2 mb-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-neutral-800">
                                <Network size={16} className="text-slate-600 dark:text-slate-300" />
                            </div>
                            <div>
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-white/55">渠道平均延迟</span>
                                <p className="text-[10px] text-slate-400 dark:text-white/40">近 7 天各渠道请求平均耗时</p>
                            </div>
                        </div>
                        <ChannelLatencyTable data={stats.channel_latency} />
                    </div>
                </div>
            )}
        </MonitorCard>
    );
}
