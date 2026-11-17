import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { PanelRightOpen, type LucideIcon } from "lucide-react";
import { HoverTooltip, surface } from "@code-proxy/ui";
import {
  LevelPill,
  MetricIcon,
  meterTone,
  type MonitorHue,
  type UsageLevel,
} from "@features/monitor-widgets/monitorVisuals";
import { issuesLevel, type HealthIssue } from "./clusterHealth";
import { formatCores, type NodeCpuView } from "./clusterNodeView";

/*
 * 节点卡片与数据库卡片共用的骨架和零件。
 *
 * 每张卡片都是同样的五行：标题、2×2 指标、四格数字条、状态胶囊、页脚。卡片在分区网格里占五行，
 * 自己的行用 subgrid 取父网格的行（grid-rows-subgrid）：同一行的几张卡片里，第 N 行的高度取它们中
 * 最高的那个，于是卡片等高、页脚贴底，标题、指标、数字条、胶囊、页脚都落在同一条水平线上。以前每张
 * 卡片自己从上往下排，数据库卡片少一行就矮一截，胶囊折行也会让后面整体错开。
 *
 * 结构规则照面板的约定：卡里不再套带底色的盒子，分格只靠间距；标签只用淡底；告警色（琥珀 / 红）
 * 覆盖分类色，出问题的那一格和那张卡一眼能看出来。
 */

export const EMPTY = "—";

/** 一张卡片占父网格的行数，和 CardShell 里的五个子块一一对应。 */
export const CARD_ROWS = 5;

/** 告警档对应的文字色；正常档不着色。 */
export function levelText(level: UsageLevel | undefined): string {
  if (!level || level === "normal") return "text-ink";
  return meterTone(level).text;
}

/**
 * 卡片外壳：占父网格五行，行取 subgrid。children 必须恰好是五个块（标题、指标、数字条、胶囊、页脚），
 * 缺的块传占位，否则后面的块会错到上一行去。
 */
export function CardShell({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: ReactNode;
}) {
  return (
    // 以名字命名的分组：读屏和测试都按名字找到这张卡。
    <article
      role="group"
      aria-label={label}
      data-testid={testId}
      className={[
        surface({ tone: "card", radius: "3xl" }),
        "row-span-5 grid min-w-0 grid-rows-subgrid gap-y-3 p-4 [--cp-inner-radius:var(--radius-lg)]",
      ].join(" ")}
    >
      {children}
    </article>
  );
}

/** 第一行：图标、名字、标签、副标题，右侧状态标签。 */
export function CardHeader({
  icon,
  hue,
  title,
  tags,
  subtitle,
  issues,
}: {
  icon: LucideIcon;
  hue: MonitorHue;
  title: string;
  tags?: ReactNode;
  subtitle?: string;
  issues: HealthIssue[];
}) {
  return (
    <div className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <MetricIcon icon={icon} hue={hue} />
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="truncate text-sm font-semibold text-ink">{title}</h3>
            {tags}
          </div>
          <p className="truncate text-2xs text-ink-3" title={subtitle}>
            {subtitle || " "}
          </p>
        </div>
      </div>
      <HealthPill issues={issues} />
    </div>
  );
}

/** 第二行：2×2 的关键指标。 */
export function MetricGrid({ children, dimmed }: { children: ReactNode; dimmed?: boolean }) {
  return (
    <div className={`grid min-w-0 grid-cols-2 gap-x-5 gap-y-4 ${dimmed ? "opacity-60" : ""}`}>{children}</div>
  );
}

/**
 * 右上角的状态标签：最差的档位 + 最严重的一项（还有几项写 +N），悬停列出全部；完整列表在详情抽屉里，
 * 读屏也能读到。
 */
export function HealthPill({ issues }: { issues: HealthIssue[] }) {
  const { t } = useTranslation();
  const level = issuesLevel(issues);
  const top = issues[0];
  const label = top ? t(top.key, top.params) : t("cluster_nodes.status_ok");
  const more = issues.length - 1;
  const pill = (
    <span data-testid="health-pill" data-level={level} className="shrink-0">
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
 * 关键指标的一格：标签与右侧的百分比，大号数值，一根条，一行脚注。四行的高度固定（没有条时占位、
 * 没有脚注时留空），同一行的格子之间、相邻卡片之间都对得齐。
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
    <div data-testid={testId} data-level={level} className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-xs font-medium text-ink-3">{label}</span>
        {aside !== undefined && aside !== null ? (
          <span
            className={`shrink-0 text-xs font-semibold tabular-nums ${level === "normal" ? "text-ink-2" : levelText(level)}`}
          >
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

/** 第三行：四格小数字（标签在上、数值在下），节点与数据库同一排法。 */
export function StatStrip({ children, dimmed }: { children: ReactNode; dimmed?: boolean }) {
  return (
    <dl className={`grid min-w-0 grid-cols-4 gap-x-3 ${dimmed ? "opacity-60" : ""}`} data-testid="stat-strip">
      {children}
    </dl>
  );
}

export function Stat({
  label,
  value,
  level,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  level?: UsageLevel;
  title?: string;
}) {
  return (
    <div className="min-w-0" title={title}>
      <dt className="truncate text-2xs text-ink-3">{label}</dt>
      <dd className={`truncate text-xs font-semibold tabular-nums ${levelText(level)}`}>{value}</dd>
    </div>
  );
}

/** 第四行：依赖与状态胶囊，从上往下排；折行时整行跟着同一行最高的卡片走。 */
export function ChipRow({ children, dimmed }: { children: ReactNode; dimmed?: boolean }) {
  return (
    <div
      className={`flex min-w-0 flex-wrap content-start items-start gap-1.5 ${dimmed ? "opacity-60" : ""}`}
      data-testid="chip-row"
    >
      {children}
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

/**
 * 第五行：左边是数据有多新（运行时长、心跳 / 查询时刻），右边是打开详情抽屉的按钮。行贴底，
 * 同一行卡片的页脚在同一条线上。
 */
export function CardFooter({
  meta,
  onOpenDetails,
  detailsLabel,
}: {
  meta: ReactNode;
  onOpenDetails?: () => void;
  detailsLabel: string;
}) {
  const { t } = useTranslation();
  return (
    // 固定高度：没有详情按钮的卡片（还没有快照的节点）页脚文字也和别的卡片落在同一条线上。
    <div className="flex h-7 min-w-0 items-center justify-between gap-2 self-end" data-testid="card-footer">
      <p className="min-w-0 truncate text-2xs text-ink-3">{meta}</p>
      {onOpenDetails ? (
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={detailsLabel}
          onClick={onOpenDetails}
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium text-ink-2 transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 dark:hover:bg-white/[0.07]"
        >
          {t("cluster_nodes.details")}
          <PanelRightOpen size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
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

/** 小标签：主节点、当前节点、主机名。中性灰，不和状态抢颜色。 */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 rounded-full bg-ink/[0.05] px-1.5 py-px text-2xs font-semibold text-ink-2 dark:bg-white/[0.07]">
      {children}
    </span>
  );
}
