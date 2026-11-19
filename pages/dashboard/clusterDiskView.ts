import type { NodeDisk } from "@code-proxy/api-client";
import type { UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import { worstLevel } from "./clusterNodeView";

/*
 * 磁盘的显示口径（CliRelay internal/nodemetrics 的 disks）：
 * - 已用比例与 df 的 Use% 一致：used / (used + available)。available 不含给 root 预留的块，所以普通进程
 *   写满时 df 已经是 100%，root 还能写一点；节点进程不是 root，按这个口径算才对。
 * - 磁盘满了是硬故障（库写不进、日志写不进、请求体落不了盘），所以告警比内存早：80% 留意、90% 告急；
 *   inode 同样。
 * - 后端给最近约 1 小时的用量变化，面板据此线性外推多久写满：3 天内留意、1 天内告急。只在增长时外推，
 *   日志轮转、缓存清理带来的下降不算。
 * - 写满预测只在盘已经用掉不少时才告警：留意要已用 60% 以上，告急要 80% 以上（和 node-exporter 的
 *   NodeFilesystemSpaceFillingUp 一样，要可用空间不多「且」预测会写满）。把一小时的变化外推到几天后，
 *   在几乎空的盘上噪声远大于信号：2026-11-17 n143 的 /tmp（1.9 GB tmpfs，只放处理中的请求体）只用了
 *   0.5%，一个 10 MB 的请求体就被算成「约 30 小时写满」，反复出现。
 */

export const DISK_WARN_PCT = 80;
export const DISK_CRITICAL_PCT = 90;
const DAY_SECONDS = 86_400;
export const DISK_FILL_WARN_SECONDS = 3 * DAY_SECONDS;
export const DISK_FILL_CRITICAL_SECONDS = DAY_SECONDS;
export const DISK_FILL_WARN_MIN_PCT = 60;
export const DISK_FILL_CRITICAL_MIN_PCT = 80;

export function diskPctLevel(pct: number | null): UsageLevel {
  if (pct === null) return "normal";
  return pct >= DISK_CRITICAL_PCT ? "critical" : pct >= DISK_WARN_PCT ? "warn" : "normal";
}

/** 写满预测的档位：时间够近，且盘已经用到相应的程度。 */
export function fillLevel(seconds: number | null, pct: number): UsageLevel {
  if (seconds === null) return "normal";
  if (seconds <= DISK_FILL_CRITICAL_SECONDS && pct >= DISK_FILL_CRITICAL_MIN_PCT) return "critical";
  if (seconds <= DISK_FILL_WARN_SECONDS && pct >= DISK_FILL_WARN_MIN_PCT) return "warn";
  return "normal";
}

/** 这块盘最该注意的是哪一项，卡片和状态标签据此写原因。 */
export type DiskConcern = "read_only" | "space" | "inodes" | "fill" | null;

export interface DiskView {
  mount: string;
  fsType: string | null;
  readOnly: boolean;
  /** 用途去重后的列表（同一用途可能有多个目录）。 */
  uses: string[];
  paths: { use: string; path: string }[];
  totalBytes: number;
  usedBytes: number;
  availableBytes: number;
  /** df 口径的已用比例，0–100。 */
  pct: number;
  inodePct: number | null;
  /** 最近窗口里每秒的净增长（字节，可为负）。 */
  growthPerSecond: number | null;
  growthWindowSeconds: number | null;
  growthDeltaBytes: number | null;
  /** 按当前增长速度多少秒后写满；没有增长时为 null。 */
  fillSeconds: number | null;
  level: UsageLevel;
  concern: DiskConcern;
}

export function diskView(disk: NodeDisk): DiskView {
  const denominator = disk.used_bytes + disk.available_bytes;
  const pct = denominator > 0 ? (disk.used_bytes / denominator) * 100 : 0;
  const inodePct =
    disk.inodes_total && disk.inodes_total > 0 && disk.inodes_free !== undefined
      ? ((disk.inodes_total - disk.inodes_free) / disk.inodes_total) * 100
      : null;
  const growth = disk.growth;
  const growthPerSecond =
    growth && growth.window_seconds > 0 ? growth.used_delta_bytes / growth.window_seconds : null;
  const fillSeconds =
    growthPerSecond !== null && growthPerSecond > 0 && disk.available_bytes >= 0
      ? disk.available_bytes / growthPerSecond
      : null;
  const readOnly = Boolean(disk.read_only);

  const spaceLevel = diskPctLevel(pct);
  const inodeLevel = diskPctLevel(inodePct);
  const growthLevel = fillLevel(fillSeconds, pct);
  const level: UsageLevel = readOnly ? "critical" : worstLevel(spaceLevel, inodeLevel, growthLevel);
  let concern: DiskConcern = null;
  if (readOnly) concern = "read_only";
  else if (level !== "normal") {
    // 同档时先说空间：它最直观，也最常是原因。
    concern =
      spaceLevel === level ? "space" : inodeLevel === level ? "inodes" : "fill";
  }

  const uses: string[] = [];
  for (const path of disk.paths ?? []) {
    if (!uses.includes(path.use)) uses.push(path.use);
  }
  return {
    mount: disk.mount,
    fsType: disk.fs_type || null,
    readOnly,
    uses,
    paths: disk.paths ?? [],
    totalBytes: disk.total_bytes,
    usedBytes: disk.used_bytes,
    availableBytes: disk.available_bytes,
    pct,
    inodePct,
    growthPerSecond,
    growthWindowSeconds: growth?.window_seconds ?? null,
    growthDeltaBytes: growth?.used_delta_bytes ?? null,
    fillSeconds,
    level,
    concern,
  };
}

const LEVEL_ORDER: Record<UsageLevel, number> = { normal: 0, warn: 1, critical: 2 };

/**
 * 每台节点的磁盘按「最该看」排序：告警档高的在前，同档按已用比例，再按写满时间。卡片的磁盘格只显示第一块。
 */
export function sortDisks(disks: NodeDisk[] | undefined): DiskView[] {
  return (disks ?? [])
    .map(diskView)
    .sort(
      (a, b) =>
        LEVEL_ORDER[b.level] - LEVEL_ORDER[a.level] ||
        b.pct - a.pct ||
        (a.fillSeconds ?? Infinity) - (b.fillSeconds ?? Infinity),
    );
}

/** 写满时间的简短说法：45 分钟、18 小时、3 天；超过 90 天不再说。 */
export function formatFillTime(seconds: number): string | null {
  if (!Number.isFinite(seconds) || seconds > 90 * DAY_SECONDS) return null;
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 2 * DAY_SECONDS) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / DAY_SECONDS)}d`;
}
