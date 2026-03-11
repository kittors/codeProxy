import {
    Cpu, Database, FileText, Clock, MemoryStick, HardDrive,
    Network, ArrowUpRight, ArrowDownRight, Wifi,
    Activity, AlertTriangle, Zap, RefreshCw, Layers,
} from "lucide-react";
import { useSystemStats, type SystemStats, type ChannelLatency } from "./useSystemStats";

/* ═══════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════ */

function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

function formatRate(bps: number): string {
    if (bps < 1024) return `${bps.toFixed(0)} B/s`;
    if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(1)} KB/s`;
    return `${(bps / 1024 / 1024).toFixed(2)} MB/s`;
}

function formatUptime(s: number): string {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}天 ${h}时 ${m}分`;
    if (h > 0) return `${h}时 ${m}分`;
    return `${m}分`;
}

function formatMs(ms: number): string {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
}

function statusColor(pct: number) {
    if (pct >= 95) return { text: "text-red-500", bg: "bg-red-500", ring: "stroke-red-500", bar: "bg-red-500", label: "严重", labelBg: "bg-red-500/10 text-red-500" };
    if (pct >= 80) return { text: "text-amber-500", bg: "bg-amber-500", ring: "stroke-amber-500", bar: "bg-amber-500", label: "警告", labelBg: "bg-amber-500/10 text-amber-500" };
    return { text: "text-emerald-500", bg: "bg-emerald-500", ring: "stroke-emerald-500", bar: "bg-emerald-500", label: "正常", labelBg: "bg-emerald-500/10 text-emerald-500" };
}

/** Compute an overall health score (0-100) from system stats */
function computeHealthScore(s: SystemStats): number {
    // Weighted: sys CPU 30%, sys Mem 30%, proc CPU 20%, proc Mem 20%
    const cpuScore = Math.max(0, 100 - s.system_cpu_pct);
    const memScore = Math.max(0, 100 - s.system_mem_pct);
    const procCpu = Math.max(0, 100 - Math.min(s.process_cpu_pct, 100));
    const procMem = Math.max(0, 100 - s.process_mem_pct);
    return cpuScore * 0.3 + memScore * 0.3 + procCpu * 0.2 + procMem * 0.2;
}

function healthLabel(score: number) {
    if (score >= 90) return { text: "健康", color: "text-emerald-500" };
    if (score >= 70) return { text: "良好", color: "text-blue-500" };
    if (score >= 50) return { text: "警告", color: "text-amber-500" };
    return { text: "风险", color: "text-red-500" };
}

function healthRingColor(score: number) {
    if (score >= 90) return "stroke-emerald-500";
    if (score >= 70) return "stroke-blue-500";
    if (score >= 50) return "stroke-amber-500";
    return "stroke-red-500";
}

/* ═══════════════════════════════════════════════════════════
   Big Health Gauge (left panel focal point)
   ═══════════════════════════════════════════════════════════ */

function HealthGauge({ score }: { score: number }) {
    const radius = 60;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const hl = healthLabel(score);

    return (
        <div className="flex flex-col items-center justify-center">
            <div className="relative h-40 w-40">
                <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90">
                    <circle cx="75" cy="75" r={radius} fill="none" strokeWidth="10"
                        className="stroke-slate-200/60 dark:stroke-neutral-800" />
                    <circle cx="75" cy="75" r={radius} fill="none" strokeWidth="10"
                        strokeLinecap="round"
                        strokeDasharray={circumference} strokeDashoffset={offset}
                        className={`${healthRingColor(score)} transition-all duration-700 ease-out`} />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className={`text-4xl font-bold tabular-nums ${hl.color}`}>
                        {Math.round(score)}
                    </span>
                    <span className={`mt-0.5 text-xs font-semibold ${hl.color}`}>{hl.text}</span>
                </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">健康状况评分</p>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   Resource Bar (compact horizontal card with progress)
   ═══════════════════════════════════════════════════════════ */

function ResourceBar({ icon: Icon, label, value, pct, detail }: {
    icon: typeof Cpu;
    label: string;
    value: string;
    pct: number;
    detail?: string;
}) {
    const sc = statusColor(pct);
    return (
        <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Icon size={14} className="text-slate-400 dark:text-slate-500" />
                    <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold tabular-nums ${sc.text}`}>{value}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${sc.labelBg}`}>{sc.label}</span>
                </div>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-neutral-800">
                <div
                    className={`h-full rounded-full ${sc.bar} transition-all duration-500`}
                    style={{ width: `${Math.min(pct, 100)}%` }}
                />
            </div>
            {detail && <p className="mt-1 text-[10px] text-slate-400 dark:text-white/35">{detail}</p>}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   Mini KPI (for top-right grid)
   ═══════════════════════════════════════════════════════════ */

function MiniKpi({ label, value, icon: Icon, color = "text-slate-900 dark:text-white", sublabel }: {
    label: string;
    value: string;
    icon: typeof Activity;
    color?: string;
    sublabel?: string;
}) {
    return (
        <div className="rounded-xl border border-slate-200/80 bg-white px-3.5 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/40">
                <Icon size={12} />
                {label}
            </div>
            <p className={`mt-1.5 text-lg font-bold tabular-nums ${color}`}>{value}</p>
            {sublabel && <p className="mt-0.5 text-[10px] text-slate-400 dark:text-white/35">{sublabel}</p>}
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   Network Card (compact dual column)
   ═══════════════════════════════════════════════════════════ */

function NetworkCard({ stats }: { stats: SystemStats }) {
    return (
        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/40 mb-2.5">
                <Wifi size={12} />
                网络流量
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <div className="flex items-center gap-1 text-emerald-500">
                        <ArrowUpRight size={14} />
                        <span className="text-sm font-bold tabular-nums">{formatRate(stats.net_send_rate)}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">↑ 累计 {formatBytes(stats.net_bytes_sent)}</p>
                </div>
                <div>
                    <div className="flex items-center gap-1 text-blue-500">
                        <ArrowDownRight size={14} />
                        <span className="text-sm font-bold tabular-nums">{formatRate(stats.net_recv_rate)}</span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-slate-400">↓ 累计 {formatBytes(stats.net_bytes_recv)}</p>
                </div>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-neutral-800/50">
                <span className="text-[10px] text-slate-500 dark:text-white/45">总流量</span>
                <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-white">{formatBytes(stats.net_bytes_sent + stats.net_bytes_recv)}</span>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   Channel Latency (compact bar chart)
   ═══════════════════════════════════════════════════════════ */

function ChannelLatencyCard({ data }: { data: ChannelLatency[] }) {
    if (!data || data.length === 0) return null;
    const top5 = data.slice(0, 5);
    const maxMs = Math.max(...top5.map((d) => d.avg_ms));

    return (
        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/40 mb-2.5">
                <Network size={12} />
                渠道平均延迟
                <span className="ml-auto text-[9px] font-normal normal-case tracking-normal">Top 5 · 近 7 天</span>
            </div>
            <div className="space-y-1.5">
                {top5.map((ch) => {
                    const pct = maxMs > 0 ? (ch.avg_ms / maxMs) * 100 : 0;
                    return (
                        <div key={ch.source} className="flex items-center gap-2">
                            <span className="w-20 shrink-0 truncate text-[11px] font-medium text-slate-600 dark:text-slate-300">{ch.source}</span>
                            <div className="flex-1 h-4 overflow-hidden rounded bg-slate-100 dark:bg-neutral-800">
                                <div
                                    className="h-full rounded bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-500"
                                    style={{ width: `${Math.max(pct, 3)}%` }}
                                />
                            </div>
                            <span className="w-14 shrink-0 text-right text-[11px] font-bold tabular-nums text-slate-600 dark:text-slate-300">
                                {formatMs(ch.avg_ms)}
                            </span>
                            <span className="w-10 shrink-0 text-right text-[9px] text-slate-400 tabular-nums">
                                {ch.count}次
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   Concurrency Card (real-time in-flight requests)
   ═══════════════════════════════════════════════════════════ */

function ConcurrencyCard({ stats }: { stats: SystemStats }) {
    const rpm = stats.total_rpm ?? 0;
    const tpm = stats.total_tpm ?? 0;

    return (
        <div className="rounded-xl border border-slate-200/80 bg-white p-3.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/40 mb-3">
                <Layers size={12} />
                实时吞吐
                <span className={`ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums ${rpm > 0
                    ? "bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400"
                    : "bg-slate-100 text-slate-400 dark:bg-neutral-800 dark:text-white/35"
                    }`}>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${rpm > 0 ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-neutral-600"}`} />
                    {rpm > 0 ? "活跃" : "空闲"}
                </span>
            </div>
            <div className="grid grid-cols-2 gap-4">
                <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-neutral-800/50">
                    <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/35">
                        <Zap size={10} />
                        RPM
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {rpm.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400 dark:text-white/35">每分钟请求数</p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-neutral-800/50">
                    <div className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-slate-400 dark:text-white/35">
                        <Activity size={10} />
                        TPM
                    </div>
                    <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
                        {tpm.toLocaleString()}
                    </p>
                    <p className="mt-0.5 text-[10px] text-slate-400 dark:text-white/35">每分钟 Token 数</p>
                </div>
            </div>
        </div>
    );
}



/* ═══════════════════════════════════════════════════════════
   Skeleton
   ═══════════════════════════════════════════════════════════ */

function Skeleton({ className = "" }: { className?: string }) {
    return <div className={`animate-pulse rounded bg-slate-200 dark:bg-neutral-700 ${className}`} />;
}

function SkeletonLayout() {
    return (
        <div className="space-y-4">
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                <div className="flex items-center justify-center rounded-xl border border-slate-200/80 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-950/60">
                    <Skeleton className="h-40 w-40 rounded-full" />
                </div>
                <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} className="rounded-xl border border-slate-200/80 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-950/60">
                            <Skeleton className="h-3 w-16 mb-3" />
                            <Skeleton className="h-5 w-20" />
                        </div>
                    ))}
                </div>
            </div>
            <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-slate-200/80 bg-white p-3.5 dark:border-neutral-800 dark:bg-neutral-950/60">
                        <Skeleton className="h-3 w-12 mb-2" />
                        <Skeleton className="h-4 w-16 mb-2" />
                        <Skeleton className="h-1.5 w-full" />
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════
   Main Section — exported
   ═══════════════════════════════════════════════════════════ */

export function SystemMonitorSection() {
    const { stats, connected } = useSystemStats(3);

    if (!stats) {
        return (
            <section className="rounded-2xl border border-slate-200 bg-white/50 p-5 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/50">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <Activity size={16} className="text-slate-600 dark:text-white" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">运维监控</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-300 dark:bg-neutral-600" />
                        连接中…
                    </div>
                </div>
                <SkeletonLayout />
            </section>
        );
    }

    const health = computeHealthScore(stats);

    return (
        <section className="rounded-2xl border border-slate-200 bg-white/50 p-5 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/50">
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Activity size={16} className="text-slate-600 dark:text-white" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">运维监控</span>
                    <span className="text-[10px] text-slate-400 dark:text-white/35">
                        更新于 {new Date().toLocaleTimeString()}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400">
                    <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-neutral-600"}`} />
                    {connected ? "实时" : "轮询"}
                </div>
            </div>

            <div className="space-y-4">
                {/* ── Row 1: Health Gauge (left) + Core KPIs (right) ── */}
                <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
                    {/* Left: big gauge */}
                    <div className="flex items-center justify-center rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 dark:border-neutral-800 dark:from-neutral-900/50 dark:to-neutral-950/60">
                        <HealthGauge score={health} />
                    </div>

                    {/* Right: core KPIs in 2x3 grid */}
                    <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
                        <MiniKpi label="运行时长" value={formatUptime(stats.uptime_seconds)} icon={Clock}
                            sublabel={`启动于 ${new Date(stats.start_time).toLocaleString()}`} />
                        <MiniKpi label="Goroutines" value={String(stats.go_routines)} icon={Zap}
                            color="text-violet-500" sublabel={`堆 ${formatBytes(stats.go_heap_bytes)}`} />
                        <MiniKpi label="数据库" value={formatBytes(stats.db_size_bytes)} icon={Database}
                            sublabel="SQLite + WAL" />
                        <MiniKpi label="日志存储" value={formatBytes(stats.log_size_bytes)} icon={FileText}
                            sublabel="日志目录" />
                        <NetworkCard stats={stats} />
                        {stats.channel_latency?.length > 0 ? (
                            <ChannelLatencyCard data={stats.channel_latency} />
                        ) : (
                            <MiniKpi label="渠道延迟" value="--" icon={Network} sublabel="暂无数据" />
                        )}
                    </div>
                </div>

                {/* ── Row 2: System Resources — compact horizontal bars ── */}
                <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
                    <ResourceBar icon={Cpu} label="系统 CPU" value={`${stats.system_cpu_pct.toFixed(1)}%`} pct={stats.system_cpu_pct} />
                    <ResourceBar icon={MemoryStick} label="系统内存" value={`${stats.system_mem_pct.toFixed(1)}%`} pct={stats.system_mem_pct}
                        detail={`${formatBytes(stats.system_mem_used)} / ${formatBytes(stats.system_mem_total)}`} />
                    <ResourceBar icon={Cpu} label="服务 CPU" value={`${stats.process_cpu_pct.toFixed(1)}%`} pct={Math.min(stats.process_cpu_pct, 100)} />
                    <ResourceBar icon={MemoryStick} label="服务内存" value={`${stats.process_mem_pct.toFixed(1)}%`} pct={stats.process_mem_pct}
                        detail={formatBytes(stats.process_mem_bytes)} />
                    <ResourceBar icon={HardDrive} label="磁盘" value={`${stats.disk_pct.toFixed(1)}%`} pct={stats.disk_pct}
                        detail={`${formatBytes(stats.disk_used)} / ${formatBytes(stats.disk_total)}`} />
                </div>

                {/* ── Row 3: Concurrency ── */}
                <div className="grid gap-3 grid-cols-1 lg:grid-cols-2">
                    <ConcurrencyCard stats={stats} />
                    <div className="grid gap-3 grid-cols-2">
                        <MiniKpi label="数据库" value={formatBytes(stats.db_size_bytes)} icon={Database}
                            sublabel="SQLite + WAL + SHM" />
                        <MiniKpi label="磁盘可用" value={formatBytes(stats.disk_free)} icon={HardDrive}
                            color={stats.disk_pct >= 90 ? "text-red-500" : stats.disk_pct >= 75 ? "text-amber-500" : "text-emerald-500"}
                            sublabel={`共 ${formatBytes(stats.disk_total)}`} />
                    </div>
                </div>
            </div>
        </section>
    );
}
