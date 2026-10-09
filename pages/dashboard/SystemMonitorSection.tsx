import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  Clock,
  Cpu,
  Database,
  FileText,
  HardDrive,
  Layers,
  MemoryStick,
  Network,
  Wifi,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { AnimatedNumber, Card } from "@code-proxy/ui";
import type { SystemStats } from "./useSystemStats";
import {
  LevelDot,
  LevelPill,
  MeterBar,
  MeterRing,
  MetricIcon,
  USAGE_LEVEL_LABEL_KEY,
  meterTone,
  usageLevel,
  usageTone,
  type MonitorHue,
  type UsageLevel,
} from "@features/monitor-widgets/monitorVisuals";

/*
 * 层级：「系统监控」是页面上的一个分区（标题 + 网格），不是一张大卡片；网格里的每个指标才是
 * 卡片，而且只有这一层——卡片里不再套淡底小块。以前这里是「大卡 → 小卡 → 淡底块 / 图标块」
 * 四层圆角叠在一起，圆角各有各的圆心，看着别扭。
 *
 * 颜色跟随「外观」（见 monitorVisuals）：多彩风格下每类指标有分类色——图标块、渐变环、渐变条，
 * 健康卡顶上一层同色柔光；简约风格只有告警档变色。图标块的圆角与卡片同心（rounded-inner）。
 */

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

/** Compute an overall health score (0-100) from system stats */
function computeHealthScore(s: SystemStats): number {
  // Weighted: sys CPU 30%, sys Mem 30%, proc CPU 20%, proc Mem 20%
  const cpuScore = Math.max(0, 100 - s.system_cpu_pct);
  const memScore = Math.max(0, 100 - s.system_mem_pct);
  const procCpu = Math.max(0, 100 - Math.min(s.process_cpu_pct, 100));
  const procMem = Math.max(0, 100 - s.process_mem_pct);
  return cpuScore * 0.3 + memScore * 0.3 + procCpu * 0.2 + procMem * 0.2;
}

/**
 * 健康评分分档：健康、良好是正常档（简约风格强调色、多彩风格绿），告警琥珀，风险红；
 * 环与标签同档。
 */
function healthTone(score: number): { key: string; level: UsageLevel; hue: MonitorHue } {
  if (score >= 90) return { key: "system_monitor.health_healthy", level: "normal", hue: "emerald" };
  if (score >= 70) return { key: "system_monitor.health_good", level: "normal", hue: "emerald" };
  if (score >= 50) return { key: "system_monitor.health_warning", level: "warn", hue: "amber" };
  return { key: "system_monitor.health_risk", level: "critical", hue: "rose" };
}

/** 多彩风格下健康卡顶上的同色柔光：让主角卡和旁边的指标卡拉开层次。 */
const HEALTH_GLOW: Record<UsageLevel, string> = {
  normal: "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(16_185_129/0.14),transparent)]",
  warn: "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(245_158_11/0.16),transparent)]",
  critical: "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(244_63_94/0.16),transparent)]",
};

/** 卡片标题行：图标（多彩时是分类色图标块）+ 标签，右侧可放状态。 */
function MetricHeader({
  icon,
  hue,
  label,
  children,
}: {
  icon: LucideIcon;
  hue: MonitorHue;
  label: string;
  children?: ReactNode;
}) {
  return (
    <div className="relative flex items-center justify-between gap-3">
      <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink-2">
        <MetricIcon icon={icon} hue={hue} />
        <span className="truncate">{label}</span>
      </span>
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Health hero (left panel focal point)
   ═══════════════════════════════════════════════════════════ */

function HealthHeroCard({ score }: { score: number }) {
  const { t } = useTranslation();
  const tone = healthTone(score);

  return (
    <Card className="h-full min-h-[246px] overflow-hidden" bodyClassName="mt-0 flex h-full flex-col">
      <div
        aria-hidden="true"
        className={`pointer-events-none absolute inset-x-0 top-0 hidden h-40 opacity-70 colorful:block ${HEALTH_GLOW[tone.level]}`}
      />
      <MetricHeader icon={Activity} hue={tone.hue} label={t("system_monitor.health_score")}>
        <LevelPill level={tone.level}>{t(tone.key)}</LevelPill>
      </MetricHeader>
      <div className="relative flex flex-1 items-center justify-center pt-2">
        <MeterRing value={score} tone={meterTone(tone.level, tone.hue)} className="h-36 w-36" strokeWidth={11}>
          <AnimatedNumber
            value={score}
            format={(value) => String(Math.round(value))}
            className="text-4xl font-semibold tracking-tight tabular-nums text-ink"
          />
          <span className="mt-0.5 text-xs font-medium text-ink-3">/ 100</span>
        </MeterRing>
      </div>
    </Card>
  );
}

/** 一行「标签 … 数值」，代替以前卡片里的淡底小块。 */
function StatLine({ label, value, marker }: { label: string; value: string; marker?: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-3">
        {marker}
        <span className="truncate">{label}</span>
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}

function DiskUsageRingCard({ stats }: { stats: SystemStats }) {
  const { t } = useTranslation();
  const pct = Math.min(Math.max(stats.disk_pct, 0), 100);
  const level = usageLevel(pct);
  const tone = usageTone(pct, "sky");

  return (
    <Card className="h-full min-h-[246px]" bodyClassName="mt-0 flex h-full flex-col justify-between gap-3">
      <MetricHeader icon={HardDrive} hue="sky" label={t("system_monitor.disk")}>
        <LevelPill level={level}>{t(USAGE_LEVEL_LABEL_KEY[level])}</LevelPill>
      </MetricHeader>

      <div className="flex flex-1 items-center justify-center">
        <MeterRing value={pct} tone={tone} className="h-32 w-32" strokeWidth={12}>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-ink">
            {stats.disk_pct.toFixed(1)}%
          </span>
          <span className="mt-0.5 text-xs font-medium text-ink-3">{t("system_monitor.disk_used")}</span>
        </MeterRing>
      </div>

      {/* 图例：已用的圆点是环的颜色（随告警变琥珀 / 红），可用是中性的底槽色。 */}
      <div className="space-y-1.5">
        <StatLine
          label={t("system_monitor.disk_used")}
          value={formatBytes(stats.disk_used)}
          marker={<span className={`size-1.5 rounded-full ${tone.bar}`} aria-hidden="true" />}
        />
        <StatLine
          label={t("system_monitor.disk_free")}
          value={formatBytes(stats.disk_free)}
          marker={<span className="size-1.5 rounded-full bg-ink-4" aria-hidden="true" />}
        />
        <p className="pt-0.5 text-center text-xs text-ink-3">
          {t("system_monitor.total_size", { size: formatBytes(stats.disk_total) })}
        </p>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Resource bar (CPU / memory)
   ═══════════════════════════════════════════════════════════ */

function ResourceBar({
  icon,
  hue,
  label,
  value,
  pct,
  detail,
}: {
  icon: LucideIcon;
  hue: MonitorHue;
  label: string;
  value: string;
  pct: number;
  detail?: string;
}) {
  const { t } = useTranslation();
  const level = usageLevel(pct);
  return (
    <Card bodyClassName="mt-0" className="h-full">
      <MetricHeader icon={icon} hue={hue} label={label}>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-base font-semibold tabular-nums text-ink">{value}</span>
          <LevelDot level={level} label={t(USAGE_LEVEL_LABEL_KEY[level])} />
        </span>
      </MetricHeader>
      <MeterBar pct={pct} tone={meterTone(level, hue)} className="mt-3 h-bar" />
      {detail ? <p className="mt-1.5 text-xs text-ink-3">{detail}</p> : null}
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Mini KPI
   ═══════════════════════════════════════════════════════════ */

function MiniKpi({
  label,
  value,
  icon,
  hue,
  sublabel,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hue: MonitorHue;
  sublabel?: string;
}) {
  return (
    <Card bodyClassName="mt-0 flex h-full flex-col justify-between gap-3" className="h-full">
      <MetricHeader icon={icon} hue={hue} label={label} />
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
        {sublabel ? <p className="mt-0.5 truncate text-xs text-ink-3">{sublabel}</p> : null}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Network
   ═══════════════════════════════════════════════════════════ */

function NetworkCard({ stats }: { stats: SystemStats }) {
  const { t } = useTranslation();
  const rows = [
    {
      icon: ArrowUpRight,
      rate: formatRate(stats.net_send_rate),
      total: t("system_monitor.up_total", { size: formatBytes(stats.net_bytes_sent) }),
    },
    {
      icon: ArrowDownRight,
      rate: formatRate(stats.net_recv_rate),
      total: t("system_monitor.down_total", { size: formatBytes(stats.net_bytes_recv) }),
    },
  ];
  return (
    <Card bodyClassName="mt-0 flex h-full flex-col gap-3" className="h-full">
      <MetricHeader icon={Wifi} hue="emerald" label={t("system_monitor.network_traffic")} />
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {rows.map((row) => (
          <div key={row.total} className="flex min-w-0 items-start gap-2">
            <row.icon
              size={14}
              className="mt-1 shrink-0 text-ink-3 icon-hue:text-emerald-600 icon-hue:dark:text-emerald-300"
              aria-hidden="true"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tabular-nums text-ink">{row.rate}</p>
              <p className="truncate text-xs text-ink-3">{row.total}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-auto">
        <StatLine
          label={t("system_monitor.total_traffic")}
          value={formatBytes(stats.net_bytes_sent + stats.net_bytes_recv)}
        />
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Channel latency
   ═══════════════════════════════════════════════════════════ */

function AverageLatencyCard({
  avgLatency,
  apiKeyCount,
}: {
  avgLatency: number;
  apiKeyCount: number;
}) {
  const { t } = useTranslation();
  const tiles = [
    { label: t("system_monitor.latency"), value: formatMs(avgLatency) },
    { label: t("system_monitor.key_count"), value: String(apiKeyCount) },
  ];

  return (
    <Card bodyClassName="mt-0 flex h-full flex-col gap-3" className="h-full">
      <MetricHeader icon={Network} hue="indigo" label={t("system_monitor.channel_avg_latency")} />
      <div className="grid flex-1 grid-cols-2 items-end gap-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="min-w-0">
            <div className="truncate text-xs text-ink-3">{tile.label}</div>
            <div className="mt-1 truncate text-xl font-semibold tracking-tight tabular-nums text-ink">
              {tile.value}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Skeleton
   ═══════════════════════════════════════════════════════════ */

function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`rounded bg-track motion-safe:animate-pulse ${className}`} />;
}

function SkeletonLayout() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <Card bodyClassName="mt-0 flex h-full items-center justify-center p-2.5" className="min-h-[246px]">
          <Skeleton className="h-32 w-32 rounded-full" />
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} bodyClassName="mt-0">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-5 w-20" />
            </Card>
          ))}
        </div>
        <Card bodyClassName="mt-0 flex h-full items-center justify-center" className="min-h-[246px]">
          <Skeleton className="h-36 w-36 rounded-full" />
        </Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} bodyClassName="mt-0">
            <Skeleton className="h-3 w-12 mb-2" />
            <Skeleton className="h-4 w-16 mb-2" />
            <Skeleton className="h-bar-sm w-full" />
          </Card>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Main Section — exported
   ═══════════════════════════════════════════════════════════ */

/**
 * 右上角的数据通道状态：实时推送是一颗绿色呼吸点，退回轮询时点是灰色。简约风格下胶囊保持
 * 中性、颜色只在那颗点上；多彩风格下实时推送时整块是绿色淡底。
 */
function LiveIndicator({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-1 text-xs font-medium dark:bg-white/[0.07]",
        connected
          ? "text-ink-2 colorful:bg-emerald-500/10 colorful:text-emerald-700 colorful:dark:bg-emerald-400/15 colorful:dark:text-emerald-300"
          : "text-ink-3",
      ].join(" ")}
    >
      <span className="relative flex size-2">
        {connected ? (
          <span className="absolute inset-0 rounded-full bg-emerald-500 opacity-60 motion-safe:animate-ping" />
        ) : null}
        <span className={`relative size-2 rounded-full ${connected ? "bg-emerald-500" : "bg-ink-4"}`} />
      </span>
      {connected ? t("system_monitor.live") : t("system_monitor.polling")}
    </span>
  );
}

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
        flat
        title={t("system_monitor.title")}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-hover px-2.5 py-1 text-xs font-medium text-ink-3">
            <span className="size-2 rounded-full bg-ink-4 motion-safe:animate-pulse" />
            {t("system_monitor.connecting")}
          </span>
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
  const rawDBEngine = stats.db_engine?.trim();
  const dbEngine = (rawDBEngine || "postgres").toLowerCase();
  const dbSublabel =
    dbEngine === "postgres" || dbEngine === "postgresql"
      ? t("system_monitor.postgresql")
      : rawDBEngine;

  return (
    <Card
      flat
      title={t("system_monitor.title")}
      description={t("system_monitor.updated_at", { time: new Date().toLocaleTimeString() })}
      actions={<LiveIndicator connected={connected} />}
    >
      <div className="space-y-3">
        <div className="grid gap-3 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
          <HealthHeroCard score={health} />

          <div className="grid gap-3 sm:grid-cols-2">
            <MiniKpi
              label={t("system_monitor.uptime")}
              value={formatUptime(stats.uptime_seconds)}
              icon={Clock}
              hue="emerald"
              sublabel={t("system_monitor.started", {
                time: new Date(stats.start_time).toLocaleString(),
              })}
            />
            <MiniKpi
              label={t("system_monitor.goroutines")}
              value={String(stats.go_routines)}
              icon={Zap}
              hue="violet"
              sublabel={t("system_monitor.heap", { size: formatBytes(stats.go_heap_bytes) })}
            />
            <MiniKpi
              label={t("system_monitor.database")}
              value={formatBytes(stats.db_size_bytes)}
              icon={Database}
              hue="sky"
              sublabel={dbSublabel}
            />
            <MiniKpi
              label={t("system_monitor.log_storage")}
              value={formatBytes(stats.log_content_store_bytes)}
              icon={FileText}
              hue="amber"
              sublabel={t("system_monitor.request_log_content")}
            />
          </div>

          <DiskUsageRingCard stats={stats} />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <ResourceBar
            icon={Cpu}
            hue="sky"
            label={t("system_monitor.system_cpu")}
            value={`${stats.system_cpu_pct.toFixed(1)}%`}
            pct={stats.system_cpu_pct}
          />
          <ResourceBar
            icon={MemoryStick}
            hue="violet"
            label={t("system_monitor.system_memory")}
            value={`${stats.system_mem_pct.toFixed(1)}%`}
            pct={stats.system_mem_pct}
            detail={`${formatBytes(stats.system_mem_used)} / ${formatBytes(stats.system_mem_total)}`}
          />
          <ResourceBar
            icon={Cpu}
            hue="sky"
            label={t("system_monitor.service_cpu")}
            value={`${stats.process_cpu_pct.toFixed(1)}%`}
            pct={Math.min(stats.process_cpu_pct, 100)}
          />
          <ResourceBar
            icon={MemoryStick}
            hue="violet"
            label={t("system_monitor.service_memory")}
            value={`${stats.process_mem_pct.toFixed(1)}%`}
            pct={stats.process_mem_pct}
            detail={formatBytes(stats.process_mem_bytes)}
          />
        </div>

        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_220px]">
          <NetworkCard stats={stats} />
          <AverageLatencyCard avgLatency={averageLatency} apiKeyCount={apiKeyCount} />
          <MiniKpi
            label={t("system_monitor.log_dir")}
            value={formatBytes(logDirSizeBytes)}
            icon={Layers}
            hue="amber"
            sublabel={t("system_monitor.log_files")}
          />
        </div>
      </div>
    </Card>
  );
}
