import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react";
import { HoverTooltip } from "@code-proxy/ui";
import {
  LevelPill,
  MeterBar,
  meterTone,
  type MonitorHue,
  type UsageLevel,
} from "@features/monitor-widgets/monitorVisuals";
import type { HealthIssue } from "./clusterHealth";
import { issuesLevel } from "./clusterHealth";
import { formatFillTime, type DiskView } from "./clusterDiskView";
import { formatBytes } from "./systemFormat";
import { formatAge, formatCores, type NodeCpuView } from "./clusterNodeView";

/*
 * 节点卡片与数据库卡片共用的零件。结构规则照面板的约定：卡里不再套带底色的盒子，分格只靠间距；
 * 标签只用淡底；告警色（琥珀 / 红）覆盖分类色，出问题的那一格和那张卡一眼能看出来。
 */

export const EMPTY = "—";

/** 告警档对应的文字色；正常档不着色。 */
export function levelText(level: UsageLevel | undefined): string {
  if (!level || level === "normal") return "text-ink";
  return meterTone(level).text;
}

/**
 * 右上角的状态标签：最差的档位 + 最严重的一项（还有几项写 +N），悬停列出全部。
 */
export function HealthPill({ issues }: { issues: HealthIssue[] }) {
  const { t } = useTranslation();
  const level = issuesLevel(issues);
  const top = issues[0];
  const label = top ? t(top.key, top.params) : t("cluster_nodes.status_ok");
  const more = issues.length - 1;
  const pill = (
    <span data-testid="health-pill" data-level={level}>
      <LevelPill level={level}>
        <span className="inline-flex max-w-[14rem] items-center gap-1">
          <span className="truncate">{label}</span>
          {more > 0 ? <span className="shrink-0 opacity-80">+{more}</span> : null}
        </span>
      </LevelPill>
    </span>
  );
  if (issues.length <= 1) return pill;
  return (
    <HoverTooltip
      placement="bottom"
      content={
        <ul className="space-y-1 text-xs">
          {issues.map((issue, index) => (
            <li key={`${issue.key}-${index}`} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${issue.level === "critical" ? "bg-rose-500" : "bg-amber-500"}`}
              />
              {t(issue.key, issue.params)}
            </li>
          ))}
        </ul>
      }
    >
      {pill}
    </HoverTooltip>
  );
}

/**
 * 关键指标的一格：标签与右侧的百分比 / 档位，大号数值，一根条，一行脚注。2×2 排在卡片上半部分。
 */
export function MetricCell({
  label,
  aside,
  value,
  level = "normal",
  bar,
  foot,
  footLevel,
  footTitle,
  testId,
}: {
  label: ReactNode;
  aside?: ReactNode;
  value: ReactNode;
  level?: UsageLevel;
  bar?: ReactNode;
  foot?: ReactNode;
  footLevel?: UsageLevel;
  /** 脚注的悬停全文；默认就是脚注本身（窄卡片、俄语这类长文案会被省略号截断）。 */
  footTitle?: string;
  testId?: string;
}) {
  return (
    <div data-testid={testId} data-level={level} className="min-w-0 space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-ink-3">{label}</span>
        {aside !== undefined && aside !== null ? (
          <span className={`shrink-0 text-xs font-semibold tabular-nums ${level === "normal" ? "text-ink-2" : levelText(level)}`}>
            {aside}
          </span>
        ) : null}
      </div>
      <p
        title={typeof value === "string" ? value : undefined}
        className={`truncate text-base font-semibold leading-tight tabular-nums ${levelText(level)}`}
      >
        {value}
      </p>
      {bar ?? <div className="h-bar-sm" aria-hidden="true" />}
      <p
        title={footTitle ?? (typeof foot === "string" ? foot : undefined)}
        className={`truncate text-2xs ${footLevel && footLevel !== "normal" ? levelText(footLevel) : "text-ink-3"}`}
      >
        {foot ?? " "}
      </p>
    </div>
  );
}

/** 依赖与状态的小胶囊：圆点 + 文字；出问题时整块换成琥珀 / 红淡底。 */
export function Chip({
  level = "normal",
  children,
  title,
  testId,
}: {
  level?: UsageLevel;
  children: ReactNode;
  title?: string;
  testId?: string;
}) {
  const tone =
    level === "critical"
      ? "bg-rose-500/10 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300"
      : level === "warn"
        ? "bg-amber-500/10 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
        : "bg-ink/[0.04] text-ink-2 dark:bg-white/[0.06]";
  const dot = level === "critical" ? "bg-rose-500" : level === "warn" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <span
      data-testid={testId}
      data-level={level}
      title={title}
      className={`inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full px-2 py-0.5 text-2xs font-medium tabular-nums ${tone}`}
    >
      <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** 展开详情的按钮。 */
export function ExpandToggle({
  expanded,
  onToggle,
  controls,
}: {
  expanded: boolean;
  onToggle: () => void;
  controls: string;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      aria-expanded={expanded}
      aria-controls={controls}
      onClick={onToggle}
      className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-ink-2 transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:hover:bg-white/[0.07]"
    >
      {t(expanded ? "cluster_nodes.collapse" : "cluster_nodes.expand")}
      <ChevronDown
        size={14}
        aria-hidden="true"
        className={`transition-transform duration-200 motion-reduce:transition-none ${expanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}

/** 详情里的一节：小标题 + 内容。 */
export function DetailSection({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-1.5">
      {/* 不用 uppercase：「近 5m」会被转成「近 5M」，像五百万。 */}
      <h4 className="text-2xs font-semibold tracking-wide text-ink-3">{title}</h4>
      {children}
    </section>
  );
}

/** 详情里的「标签 … 数值」两列网格。 */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-2 gap-x-4 gap-y-1">{children}</dl>;
}

export function DetailItem({
  label,
  value,
  level,
  wide,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  level?: UsageLevel;
  wide?: boolean;
  title?: string;
}) {
  return (
    <div className={`flex min-w-0 items-baseline justify-between gap-2 ${wide ? "col-span-2" : ""}`}>
      <dt className="shrink-0 text-xs text-ink-3">{label}</dt>
      <dd title={title} className={`truncate text-right text-xs font-medium tabular-nums ${levelText(level)}`}>
        {value}
      </dd>
    </div>
  );
}

/** 详情顶部「需要注意」的完整列表，读屏也能读到（状态标签的悬停提示只给鼠标）。 */
export function IssueList({ issues }: { issues: HealthIssue[] }) {
  const { t } = useTranslation();
  if (issues.length === 0) return null;
  return (
    <DetailSection title={t("cluster_nodes.issues")}>
      <ul className="space-y-1">
        {issues.map((issue, index) => (
          <li key={`${issue.key}-${index}`} className={`flex items-center gap-2 text-xs ${levelText(issue.level)}`}>
            <span
              aria-hidden="true"
              className={`size-1.5 shrink-0 rounded-full ${issue.level === "critical" ? "bg-rose-500" : "bg-amber-500"}`}
            />
            {t(issue.key, issue.params)}
          </li>
        ))}
      </ul>
    </DetailSection>
  );
}

export function useDiskUseLabel() {
  const { t } = useTranslation();
  return (use: string) => t(`cluster_nodes.disk_use.${use}`, { defaultValue: use });
}

/** 一块盘的增长说明：近 N 分钟 +X，约 Y 写满；或用量在下降 / 稳定。 */
export function useDiskGrowthText() {
  const { t } = useTranslation();
  return (disk: DiskView): string | null => {
    if (disk.growthDeltaBytes === null || disk.growthWindowSeconds === null) return null;
    const window = formatAge(disk.growthWindowSeconds);
    const delta = disk.growthDeltaBytes;
    if (Math.abs(delta) < 1024 * 1024) return t("cluster_nodes.disk_growth_flat", { window });
    const amount = `${delta > 0 ? "+" : "−"}${formatBytes(Math.abs(delta))}`;
    const fill = disk.fillSeconds === null ? null : formatFillTime(disk.fillSeconds);
    return fill
      ? t("cluster_nodes.disk_growth_fill", { window, amount, time: fill })
      : t("cluster_nodes.disk_growth", { window, amount });
  };
}

/** 磁盘列表（详情里）：每块盘一组——挂载点与用途、条、用量、inode 与增长。 */
export function DiskRows({ disks, hue = "sky" }: { disks: DiskView[]; hue?: MonitorHue }) {
  const { t } = useTranslation();
  const useLabel = useDiskUseLabel();
  const growthText = useDiskGrowthText();
  if (disks.length === 0) {
    return <p className="text-xs text-ink-3">{t("cluster_nodes.disks_unavailable")}</p>;
  }
  return (
    <ul className="space-y-2.5">
      {disks.map((disk) => {
        const growth = growthText(disk);
        const paths = disk.paths.map((path) => `${useLabel(path.use)}: ${path.path}`).join("\n");
        return (
          <li key={disk.mount} data-testid="disk-row" data-level={disk.level} className="min-w-0 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5" title={paths}>
                <span className="truncate font-mono text-xs font-semibold text-ink">{disk.mount}</span>
                {disk.fsType ? <span className="shrink-0 text-2xs text-ink-3">{disk.fsType}</span> : null}
                {disk.readOnly ? (
                  <span className="shrink-0 rounded-full bg-rose-500/10 px-1.5 text-2xs font-semibold text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
                    {t("cluster_nodes.read_only")}
                  </span>
                ) : null}
                <span className="truncate text-2xs text-ink-3">{disk.uses.map(useLabel).join(" · ")}</span>
              </span>
              <span className={`shrink-0 text-xs font-semibold tabular-nums ${levelText(disk.level)}`}>
                {Math.round(disk.pct)}%
              </span>
            </div>
            <MeterBar pct={disk.pct} tone={meterTone(disk.level, hue)} className="h-bar-sm" />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-2xs text-ink-3">
              <span className="tabular-nums">
                {t("cluster_nodes.disk_usage", {
                  used: formatBytes(disk.usedBytes),
                  total: formatBytes(disk.totalBytes),
                  free: formatBytes(disk.availableBytes),
                })}
              </span>
              <span className="tabular-nums">
                {disk.inodePct === null
                  ? t("cluster_nodes.inodes_none")
                  : t("cluster_nodes.inodes", { pct: `${disk.inodePct.toFixed(disk.inodePct < 10 ? 1 : 0)}%` })}
              </span>
            </div>
            {growth ? (
              <p className={`text-2xs ${disk.concern === "fill" ? levelText(disk.level) : "text-ink-3"}`}>{growth}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * 整机 CPU 的堆叠条：左段执行，右段 steal，其余空闲。steal 段固定琥珀色：超卖的宿主机上进程看着忙，
 * 其实多半在等宿主机，两段要一眼分得开。
 */
export function CpuSplitBar({ cpu }: { cpu: NodeCpuView }) {
  const { t } = useTranslation();
  const busy = Math.min(Math.max(cpu.busyPct, 0), 100);
  const steal = Math.min(Math.max(cpu.stealPct, 0), 100 - busy);
  const tone = meterTone(cpu.usageLevel, "sky");
  return (
    <div
      role="img"
      aria-label={t("cluster_nodes.cpu_bar_label", {
        busy: formatCores(cpu.busyCores),
        steal: formatCores(cpu.stealCores),
        cpus: cpu.cpus,
      })}
      className={`relative h-bar-sm w-full overflow-hidden rounded-full ${tone.track}`}
    >
      {busy > 0 ? (
        <div
          data-testid="node-cpu-busy"
          className={`absolute inset-y-0 left-0 ${tone.bar} transition-[width] duration-700 ease-pop motion-reduce:transition-none`}
          style={{ width: `${busy}%` }}
        />
      ) : null}
      {steal > 0 ? (
        <div
          data-testid="node-cpu-steal"
          className="absolute inset-y-0 bg-amber-500 transition-[left,width] duration-700 ease-pop motion-reduce:transition-none dark:bg-amber-400 colorful:bg-gradient-to-r colorful:from-amber-300 colorful:to-orange-500"
          style={{ left: `${busy}%`, width: `${steal}%` }}
        />
      ) : null}
    </div>
  );
}

/** 节点卡片和数据库主机共用的小标签：主节点、当前节点、主机名。中性灰，不和状态抢颜色。 */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-ink/[0.05] px-1.5 py-px text-2xs font-semibold text-ink-2 dark:bg-white/[0.07]">
      {children}
    </span>
  );
}
