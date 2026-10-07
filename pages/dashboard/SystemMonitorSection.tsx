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
import { AnimatedNumber, Card, surface } from "@code-proxy/ui";
import type { SystemStats } from "./useSystemStats";
import {
  GradientRing,
  IconChip,
  LevelDot,
  LevelPill,
  MeterBar,
  MONITOR_HUES,
  USAGE_LEVEL_LABEL_KEY,
  usageHue,
  usageLevel,
  type MonitorHue,
  type UsageLevel,
} from "@features/monitor-widgets/monitorVisuals";

const PANEL_SURFACE = surface({ tone: "panel", radius: "2xl" });

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

/** 健康评分分档：健康、良好用绿，告警琥珀，风险红；环、标签、数字同色。 */
function healthTone(score: number): { key: string; level: UsageLevel; hue: MonitorHue } {
  if (score >= 90) return { key: "system_monitor.health_healthy", level: "normal", hue: "emerald" };
  if (score >= 70) return { key: "system_monitor.health_good", level: "normal", hue: "emerald" };
  if (score >= 50) return { key: "system_monitor.health_warning", level: "warn", hue: "amber" };
  return { key: "system_monitor.health_risk", level: "critical", hue: "rose" };
}

/* ═══════════════════════════════════════════════════════════
   Health hero (left panel focal point)
   ═══════════════════════════════════════════════════════════ */

function HealthHeroCard({ score }: { score: number }) {
  const { t } = useTranslation();
  const tone = healthTone(score);
  const hue = MONITOR_HUES[tone.hue];

  return (
    <Card
      padding="compact"
      className={`${PANEL_SURFACE} relative h-full min-h-[246px] overflow-hidden`}
      bodyClassName="mt-0 flex h-full flex-col"
    >
      {/* 顶部一层同色系的柔光，让主角卡和旁边的指标卡拉开层次。 */}
      <div
        aria-hidden="true"
        className={[
          "pointer-events-none absolute inset-x-0 top-0 h-40 opacity-70",
          tone.level === "normal"
            ? "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(16_185_129/0.14),transparent)]"
            : tone.level === "warn"
              ? "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(245_158_11/0.16),transparent)]"
              : "bg-[radial-gradient(70%_100%_at_50%_0%,rgb(244_63_94/0.16),transparent)]",
        ].join(" ")}
      />
      <div className="relative flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold text-ink-2 dark:text-white/80">
          <IconChip icon={Activity} hue={hue} />
          {t("system_monitor.health_score")}
        </span>
        <LevelPill level={tone.level}>{t(tone.key)}</LevelPill>
      </div>
      <div className="relative flex flex-1 items-center justify-center pt-2">
        <GradientRing value={score} hue={hue} className="h-36 w-36" strokeWidth={11}>
          <AnimatedNumber
            value={score}
            format={(value) => String(Math.round(value))}
            className="text-4xl font-semibold tracking-tight tabular-nums text-ink"
          />
          <span className="mt-0.5 text-2xs font-medium text-ink-3">/ 100</span>
        </GradientRing>
      </div>
    </Card>
  );
}

function DiskUsageRingCard({ stats }: { stats: SystemStats }) {
  const { t } = useTranslation();
  const pct = Math.min(Math.max(stats.disk_pct, 0), 100);
  const level = usageLevel(pct);
  const hue = usageHue("sky", pct);

  return (
    <Card
      padding="compact"
      className={`${PANEL_SURFACE} h-full min-h-[246px] overflow-hidden`}
      bodyClassName="mt-0 flex h-full flex-col justify-between gap-3"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-2 dark:text-white/80">
          <IconChip icon={HardDrive} hue={hue} />
          {t("system_monitor.disk")}
        </div>
        <LevelPill level={level}>{t(USAGE_LEVEL_LABEL_KEY[level])}</LevelPill>
      </div>

      <div className="flex flex-1 items-center justify-center">
        <GradientRing value={pct} hue={hue} className="h-32 w-32" strokeWidth={12}>
          <span className="text-2xl font-semibold tracking-tight tabular-nums text-ink">
            {stats.disk_pct.toFixed(1)}%
          </span>
          <span className="mt-0.5 text-2xs font-medium text-ink-3">{t("system_monitor.disk_used")}</span>
        </GradientRing>
      </div>

      {/* 图例：已用的格子铺环的颜色（随告警变琥珀 / 红），可用是中性的底槽色。 */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`rounded-2xl px-3 py-2 ${hue.track}`}>
          <p className="flex items-center gap-1.5 text-2xs text-ink-3">
            <span className={`size-1.5 rounded-full ${hue.bar}`} aria-hidden="true" />
            {t("system_monitor.disk_used")}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{formatBytes(stats.disk_used)}</p>
        </div>
        <div className="rounded-2xl bg-subtle px-3 py-2">
          <p className="flex items-center gap-1.5 text-2xs text-ink-3">
            <span className="size-1.5 rounded-full bg-track ring-1 ring-line-strong" aria-hidden="true" />
            {t("system_monitor.disk_free")}
          </p>
          <p className="mt-1 text-sm font-semibold tabular-nums text-ink">{formatBytes(stats.disk_free)}</p>
        </div>
      </div>
      <p className="-mt-1 text-center text-2xs text-ink-3">
        {t("system_monitor.total_size", { size: formatBytes(stats.disk_total) })}
      </p>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════
   Resource bar (CPU / memory)
   ═══════════════════════════════════════════════════════════ */

function ResourceBar({
  icon,
  hue: baseHue,
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
  const hue = usageHue(baseHue, pct);
  return (
    <Card padding="compact" bodyClassName="mt-0" className={`${PANEL_SURFACE} h-full`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconChip icon={icon} hue={MONITOR_HUES[baseHue]} />
          <span className="truncate text-xs font-medium text-ink-2 dark:text-white/80">{label}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <span className="text-base font-semibold tabular-nums text-ink">{value}</span>
          <LevelDot level={level} label={t(USAGE_LEVEL_LABEL_KEY[level])} />
        </div>
      </div>
      <MeterBar pct={pct} hue={hue} className="mt-3 h-2" />
      {detail ? <p className="mt-1.5 text-2xs text-ink-3">{detail}</p> : null}
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
    <Card
      padding="compact"
      bodyClassName="mt-0 flex h-full flex-col justify-between gap-3"
      className={`${PANEL_SURFACE} h-full`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-ink-2 dark:text-white/80">
        <IconChip icon={icon} hue={MONITOR_HUES[hue]} />
        {label}
      </div>
      <div className="min-w-0">
        <p className="truncate text-xl font-semibold tracking-tight tabular-nums text-ink">{value}</p>
        {sublabel ? <p className="mt-0.5 truncate text-2xs text-ink-3">{sublabel}</p> : null}
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
      hue: MONITOR_HUES.emerald,
      rate: formatRate(stats.net_send_rate),
      total: t("system_monitor.up_total", { size: formatBytes(stats.net_bytes_sent) }),
    },
    {
      icon: ArrowDownRight,
      hue: MONITOR_HUES.sky,
      rate: formatRate(stats.net_recv_rate),
      total: t("system_monitor.down_total", { size: formatBytes(stats.net_bytes_recv) }),
    },
  ];
  return (
    <Card
      padding="compact"
      bodyClassName="mt-0 flex h-full flex-col gap-3"
      className={`${PANEL_SURFACE} h-full`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-ink-2 dark:text-white/80">
        <IconChip icon={Wifi} hue={MONITOR_HUES.emerald} />
        {t("system_monitor.network_traffic")}
      </div>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
        {rows.map((row) => (
          <div key={row.total} className="flex items-center gap-2.5">
            <span className={`grid size-7 shrink-0 place-items-center rounded-full ${row.hue.chip}`}>
              <row.icon size={14} className={row.hue.icon} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tabular-nums text-ink">{row.rate}</p>
              <p className="truncate text-2xs text-ink-3">{row.total}</p>
            </div>
          </div>
        ))}
      </div>
      <div
        className={`mt-auto flex items-center justify-between rounded-xl px-3 py-2 ${MONITOR_HUES.emerald.track}`}
      >
        <span className="text-2xs text-ink-3">{t("system_monitor.total_traffic")}</span>
        <span className="text-xs font-semibold tabular-nums text-ink">
          {formatBytes(stats.net_bytes_sent + stats.net_bytes_recv)}
        </span>
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
    { label: t("system_monitor.latency"), value: formatMs(avgLatency), hue: MONITOR_HUES.indigo },
    { label: t("system_monitor.key_count"), value: String(apiKeyCount), hue: MONITOR_HUES.violet },
  ];

  return (
    <Card
      padding="compact"
      bodyClassName="mt-0 flex h-full flex-col gap-3"
      className={`${PANEL_SURFACE} h-full overflow-hidden`}
    >
      <div className="flex items-center gap-2 text-xs font-medium text-ink-2 dark:text-white/80">
        <IconChip icon={Network} hue={MONITOR_HUES.indigo} />
        {t("system_monitor.channel_avg_latency")}
      </div>
      <div className="grid flex-1 grid-cols-2 gap-3">
        {tiles.map((tile) => (
          // 左侧一道同色短竖条 + 同色淡底，把两个数字块和各自的含义对上（不再是灰底块）。
          <div key={tile.label} className={`relative overflow-hidden rounded-xl px-3 py-2.5 ${tile.hue.track}`}>
            <span aria-hidden="true" className={`absolute inset-y-2.5 left-0 w-1 rounded-r-full ${tile.hue.bar}`} />
            <div className="text-2xs font-medium text-ink-3">{tile.label}</div>
            <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums text-ink">{tile.value}</div>
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
        <Card
          padding="compact"
          bodyClassName="mt-0 flex h-full items-center justify-center p-2.5"
          className={`${PANEL_SURFACE} min-h-[246px]`}
        >
          <Skeleton className="h-32 w-32 rounded-full" />
        </Card>
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} padding="compact" bodyClassName="mt-0">
              <Skeleton className="h-3 w-16 mb-3" />
              <Skeleton className="h-5 w-20" />
            </Card>
          ))}
        </div>
        <Card
          padding="compact"
          bodyClassName="mt-0 flex h-full items-center justify-center"
          className={`${PANEL_SURFACE} min-h-[246px]`}
        >
          <Skeleton className="h-36 w-36 rounded-full" />
        </Card>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
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

/** 右上角的数据通道状态：实时推送是绿色呼吸点，退回轮询时是安静的灰色。 */
function LiveIndicator({ connected }: { connected: boolean }) {
  const { t } = useTranslation();
  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
        connected
          ? "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300"
          : "bg-hover text-ink-3",
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
        title={t("system_monitor.title")}
        className={PANEL_SURFACE}
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
      title={t("system_monitor.title")}
      description={t("system_monitor.updated_at", { time: new Date().toLocaleTimeString() })}
      className={PANEL_SURFACE}
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
