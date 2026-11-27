import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MeterBar, meterTone, type MonitorHue, type UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import type { HealthIssue } from "./clusterHealth";
import { formatFillTime, type DiskView } from "./clusterDiskView";
import { formatBytes } from "./systemFormat";
import { formatAge } from "./clusterNodeView";
import { levelText } from "./ClusterCardParts";

/*
 * 详情抽屉里的零件：分节标题、「标签 … 数值」两列网格、需要注意的完整列表、磁盘列表。抽屉本身是
 * 一层浮起的面板，里面不再套卡片，分节只靠标题和间距。
 */

/** 详情里的一节：小标题 + 内容。 */
export function DetailSection({
  title,
  aside,
  children,
}: {
  title: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        {/* 不用 uppercase：「近 5m」会被转成「近 5M」，像五百万。 */}
        <h3 className="text-xs font-semibold tracking-wide text-sn-label2">{title}</h3>
        {aside ? <span className="text-2xs text-sn-label3">{aside}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** 「标签 … 数值」两列网格；抽屉够宽，一行放两对。 */
export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">{children}</dl>;
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
    <div className={`flex min-w-0 items-baseline justify-between gap-3 ${wide ? "sm:col-span-2" : ""}`}>
      <dt className="shrink-0 text-xs text-sn-label3">{label}</dt>
      <dd title={title} className={`truncate text-right text-xs font-medium tabular-nums ${levelText(level)}`}>
        {value}
      </dd>
    </div>
  );
}

/** 需要注意的完整列表（卡片上的状态标签只写最严重的一项）。没有问题时写一句「一切正常」。 */
export function IssueList({ issues }: { issues: HealthIssue[] }) {
  const { t } = useTranslation();
  return (
    <DetailSection title={t("cluster_nodes.issues")}>
      {issues.length === 0 ? (
        <p className="text-xs text-sn-label3">{t("cluster_nodes.no_issues")}</p>
      ) : (
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
      )}
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

/** 磁盘列表：每块盘一组——挂载点与用途、条、用量、inode 与增长，各盘的路径悬停可见。 */
export function DiskRows({ disks, hue = "sky" }: { disks: DiskView[]; hue?: MonitorHue }) {
  const { t } = useTranslation();
  const useLabel = useDiskUseLabel();
  const growthText = useDiskGrowthText();
  if (disks.length === 0) {
    return <p className="text-xs text-sn-label3">{t("cluster_nodes.disks_unavailable")}</p>;
  }
  return (
    <ul className="space-y-3">
      {disks.map((disk) => {
        const growth = growthText(disk);
        const paths = disk.paths.map((path) => `${useLabel(path.use)}: ${path.path}`).join("\n");
        return (
          <li key={disk.mount} data-testid="disk-row" data-level={disk.level} className="min-w-0 space-y-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-baseline gap-1.5" title={paths}>
                <span className="truncate font-mono text-xs font-semibold text-sn-label">{disk.mount}</span>
                {disk.fsType ? <span className="shrink-0 text-2xs text-sn-label3">{disk.fsType}</span> : null}
                {disk.readOnly ? (
                  <span className="shrink-0 rounded-full bg-rose-500/10 px-1.5 text-2xs font-semibold text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
                    {t("cluster_nodes.read_only")}
                  </span>
                ) : null}
                <span className="truncate text-2xs text-sn-label3">{disk.uses.map(useLabel).join(" · ")}</span>
              </span>
              <span className={`shrink-0 text-xs font-semibold tabular-nums ${levelText(disk.level)}`}>
                {Math.round(disk.pct)}%
              </span>
            </div>
            <MeterBar pct={disk.pct} tone={meterTone(disk.level, hue)} className="h-bar-sm" />
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-2xs text-sn-label3">
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
              <p className={`text-2xs ${disk.concern === "fill" ? levelText(disk.level) : "text-sn-label3"}`}>{growth}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
