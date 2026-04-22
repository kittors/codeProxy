import { useTranslation } from "react-i18next";
import {
  Cpu,
  Database,
  FileText,
  Clock,
  MemoryStick,
  HardDrive,
  Network,
  ArrowUpRight,
  ArrowDownRight,
  Wifi,
  Activity,
  Zap,
  Layers,
} from "lucide-react";
import { Card } from "@/modules/ui/Card";
import type { SystemStats } from "./useSystemStats";

const PANEL_SURFACE =
  "rounded-[18px] border border-slate-200/85 bg-white shadow-[0_10px_26px_rgba(15,23,42,0.05)]";

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
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function statusColor(pct: number) {
  if (pct >= 95)
    return {
      text: "text-red-500",
      bg: "bg-red-500",
      ring: "stroke-red-500",
      bar: "bg-red-500",
      labelKey: "system_monitor.status_critical",
      labelBg: "bg-red-500/10 text-red-500",
    };
  if (pct >= 80)
    return {
      text: "text-amber-500",
      bg: "bg-amber-500",
      ring: "stroke-amber-500",
      bar: "bg-amber-500",
      labelKey: "system_monitor.status_warn",
      labelBg: "bg-amber-500/10 text-amber-500",
    };
  return {
    text: "text-emerald-500",
    bg: "bg-emerald-500",
    ring: "stroke-emerald-500",
    bar: "bg-emerald-500",
    labelKey: "system_monitor.status_normal",
    labelBg: "bg-emerald-500/10 text-emerald-500",
  };
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
  if (score >= 90) return { key: "system_monitor.health_healthy", color: "text-emerald-500" };
  if (score >= 70) return { key: "system_monitor.health_good", color: "text-blue-500" };
  if (score >= 50) return { key: "system_monitor.health_warning", color: "text-amber-500" };
  return { key: "system_monitor.health_risk", color: "text-red-500" };
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
  const { t } = useTranslation();
  const radius = 60;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const hl = healthLabel(score);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative h-32 w-32">
        <svg viewBox="0 0 150 150" className="h-full w-full -rotate-90">
          <circle
            cx="75"
            cy="75"
            r={radius}
            fill="none"
            strokeWidth="10"
            className="stroke-slate-200/60 dark:stroke-neutral-800"
          />
          <circle
            cx="75"
            cy="75"
            r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className={`${healthRingColor(score)} transition-all duration-700 ease-out`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-3xl font-bold tabular-nums ${hl.color}`}>{Math.round(score)}</span>
          <span className={`mt-0.5 text-xs font-semibold ${hl.color}`}>{t(hl.key)}</span>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400 dark:text-white/40">
        {t("system_monitor.health_score")}
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Resource Bar (compact horizontal card with progress)
   ═══════════════════════════════════════════════════════════ */

function ResourceBar({
  icon: Icon,
  label,
  value,
  pct,
  detail,
}: {
  icon: typeof Cpu;
  label: string;
  value: string;
  pct: number;
  detail?: string;
}) {
  const { t } = useTranslation();
  const sc = statusColor(pct);
  return (
    <Card padding="compact" bodyClassName="mt-0" className={PANEL_SURFACE}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon size={14} className="text-slate-400 dark:text-slate-500" />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-sm font-bold tabular-nums ${sc.text}`}>{value}</span>
          <span
            className={`h-2.5 w-2.5 shrink-0 rounded-full ${sc.bg} ring-1 ring-black/5 dark:ring-white/10`}
            title={t(sc.labelKey)}
            role="img"
            aria-label={t(sc.labelKey)}
          />
        </div>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-neutral-800">
        <div
          className={`h-full rounded-full ${sc.bar} transition-all duration-500`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      {detail && <p className="mt-1 text-[10px] text-slate-400 dark:text-white/35">{detail}</p>}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Mini KPI (for top-right grid)
   ═══════════════════════════════════════════════════════════ */

function MiniKpi({
  label,
  value,
  icon: Icon,
  color = "text-slate-900 dark:text-white",
  sublabel,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
  color?: string;
  sublabel?: string;
}) {
  return (
    <Card padding="compact" bodyClassName="mt-0" className={PANEL_SURFACE}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/40">
        <Icon size={12} />
        {label}
      </div>
      <p className={`mt-1.5 text-lg font-bold tabular-nums ${color}`}>{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-white/35">{sublabel}</p>
      )}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Network Card (compact dual column)
   ═══════════════════════════════════════════════════════════ */

function NetworkCard({ stats }: { stats: SystemStats }) {
  const { t } = useTranslation();
  return (
    <Card padding="compact" bodyClassName="mt-0" className={PANEL_SURFACE}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/40 mb-2.5">
        <Wifi size={12} />
        {t("system_monitor.network_traffic")}
      </div>
      <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-3">
        <div>
          <div className="flex items-center gap-1 text-emerald-500">
            <ArrowUpRight size={14} />
            <span className="text-sm font-bold tabular-nums">
              {formatRate(stats.net_send_rate)}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">
            {t("system_monitor.up_total", { size: formatBytes(stats.net_bytes_sent) })}
          </p>
        </div>
        <div>
          <div className="flex items-center gap-1 text-blue-500">
            <ArrowDownRight size={14} />
            <span className="text-sm font-bold tabular-nums">
              {formatRate(stats.net_recv_rate)}
            </span>
          </div>
          <p className="mt-0.5 text-[10px] text-slate-400">
            {t("system_monitor.down_total", { size: formatBytes(stats.net_bytes_recv) })}
          </p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-[12px] bg-slate-50 px-2.5 py-1.5 dark:bg-neutral-800/50">
        <span className="text-[10px] text-slate-500 dark:text-white/45">
          {t("system_monitor.total_traffic")}
        </span>
        <span className="text-xs font-bold tabular-nums text-slate-700 dark:text-white">
          {formatBytes(stats.net_bytes_sent + stats.net_bytes_recv)}
        </span>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Channel Latency (compact bar chart)
   ═══════════════════════════════════════════════════════════ */

function AverageLatencyCard({
  avgLatency,
  apiKeyCount,
}: {
  avgLatency: number;
  apiKeyCount: number;
}) {
  const { t } = useTranslation();

  return (
    <Card padding="compact" bodyClassName="mt-0" className={`${PANEL_SURFACE} overflow-hidden`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-white/40 mb-2.5">
        <Network size={12} />
        {t("system_monitor.channel_avg_latency")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[12px] bg-slate-50 px-3 py-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {t("system_monitor.latency")}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
            {formatMs(avgLatency)}
          </div>
        </div>
        <div className="rounded-[12px] bg-slate-50 px-3 py-2.5">
          <div className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">
            {t("system_monitor.users")}
          </div>
          <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">{apiKeyCount}</div>
        </div>
      </div>
    </Card>
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
      <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
        <Card
          padding="compact"
          bodyClassName="mt-0 flex items-center justify-center p-2.5"
          className={PANEL_SURFACE}
        >
          <Skeleton className="h-32 w-32 rounded-full" />
        </Card>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} padding="compact" bodyClassName="mt-0">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-5 w-20" />
            </Card>
          ))}
        </div>
      </div>
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i} padding="compact" bodyClassName="mt-0">
            <Skeleton className="h-3 w-12 mb-2" />
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-1.5 w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Section — exported
   ═══════════════════════════════════════════════════════════ */

export function SystemMonitorSection({
  stats,
  connected = false,
  apiKeyCount = 0,
}: {
  stats?: SystemStats | null;
  connected?: boolean;
  apiKeyCount?: number;
}) {
  const { t } = useTranslation();

  if (!stats) {
    return (
      <Card
        title={t("system_monitor.title")}
        className={PANEL_SURFACE}
        actions={
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-slate-300 dark:bg-neutral-600" />
            {t("system_monitor.connecting")}
          </div>
        }
      >
        <SkeletonLayout />
      </Card>
    );
  }

  const health = computeHealthScore(stats);
  const logDirSizeBytes = stats.log_dir_size_bytes || stats.log_size_bytes;
  const channelLatency = stats.channel_latency ?? [];
  const latencyWeight = channelLatency.reduce((acc, item) => acc + item.count, 0);
  const averageLatency =
    latencyWeight > 0
      ? channelLatency.reduce((acc, item) => acc + item.avg_ms * item.count, 0) / latencyWeight
      : 0;

  return (
    <Card
      title={t("system_monitor.title")}
      description={t("system_monitor.updated_at", { time: new Date().toLocaleTimeString() })}
      className={PANEL_SURFACE}
      actions={
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <span
            className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500 animate-pulse" : "bg-slate-300 dark:bg-neutral-600"}`}
          />
          {connected ? t("system_monitor.live") : t("system_monitor.polling")}
        </div>
      }
    >
      <div className="space-y-3">
        {/* ── Row 1: Health Gauge (left) + Core KPIs (right) ── */}
        <div className="grid gap-3 lg:grid-cols-[220px_1fr]">
          {/* Left: big gauge */}
          <Card
            padding="compact"
            className={`${PANEL_SURFACE} bg-gradient-to-br from-slate-50 to-white dark:from-neutral-900/50 dark:to-neutral-950/60`}
            bodyClassName="mt-0 flex items-center justify-center"
          >
            <HealthGauge score={health} />
          </Card>

          {/* Right: core KPIs in 2x3 grid */}
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-3">
            <MiniKpi
              label={t("system_monitor.uptime")}
              value={formatUptime(stats.uptime_seconds)}
              icon={Clock}
              sublabel={t("system_monitor.started", {
                time: new Date(stats.start_time).toLocaleString(),
              })}
            />
            <MiniKpi
              label={t("system_monitor.goroutines")}
              value={String(stats.go_routines)}
              icon={Zap}
              color="text-violet-500"
              sublabel={t("system_monitor.heap", { size: formatBytes(stats.go_heap_bytes) })}
            />
            <MiniKpi
              label={t("system_monitor.database")}
              value={formatBytes(stats.db_size_bytes)}
              icon={Database}
              sublabel={t("system_monitor.sqlite_wal_shm")}
            />
            <MiniKpi
              label={t("system_monitor.log_storage")}
              value={formatBytes(stats.log_content_store_bytes)}
              icon={FileText}
              sublabel={t("system_monitor.request_log_content")}
            />
            <NetworkCard stats={stats} />
            <AverageLatencyCard avgLatency={averageLatency} apiKeyCount={apiKeyCount} />
          </div>
        </div>

        {/* ── Row 2: System Resources — compact horizontal bars ── */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
          <ResourceBar
            icon={Cpu}
            label={t("system_monitor.system_cpu")}
            value={`${stats.system_cpu_pct.toFixed(1)}%`}
            pct={stats.system_cpu_pct}
          />
          <ResourceBar
            icon={MemoryStick}
            label={t("system_monitor.system_memory")}
            value={`${stats.system_mem_pct.toFixed(1)}%`}
            pct={stats.system_mem_pct}
            detail={`${formatBytes(stats.system_mem_used)} / ${formatBytes(stats.system_mem_total)}`}
          />
          <ResourceBar
            icon={Cpu}
            label={t("system_monitor.service_cpu")}
            value={`${stats.process_cpu_pct.toFixed(1)}%`}
            pct={Math.min(stats.process_cpu_pct, 100)}
          />
          <ResourceBar
            icon={MemoryStick}
            label={t("system_monitor.service_memory")}
            value={`${stats.process_mem_pct.toFixed(1)}%`}
            pct={stats.process_mem_pct}
            detail={formatBytes(stats.process_mem_bytes)}
          />
          <ResourceBar
            icon={HardDrive}
            label={t("system_monitor.disk")}
            value={`${stats.disk_pct.toFixed(1)}%`}
            pct={stats.disk_pct}
            detail={`${formatBytes(stats.disk_used)} / ${formatBytes(stats.disk_total)}`}
          />
        </div>

        {/* ── Row 3: Storage tail KPIs ── */}
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          <MiniKpi
            label={t("system_monitor.log_dir")}
            value={formatBytes(logDirSizeBytes)}
            icon={Layers}
            sublabel={t("system_monitor.log_files")}
          />
          <MiniKpi
            label={t("system_monitor.disk_free")}
            value={formatBytes(stats.disk_free)}
            icon={HardDrive}
            color={
              stats.disk_pct >= 90
                ? "text-red-500"
                : stats.disk_pct >= 75
                  ? "text-amber-500"
                  : "text-emerald-500"
            }
            sublabel={t("system_monitor.total_size", { size: formatBytes(stats.disk_total) })}
          />
        </div>
      </div>
    </Card>
  );
}
