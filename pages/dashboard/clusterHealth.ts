import type { ClusterNode } from "@code-proxy/api-client";
import type { UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import { sortDisks, formatFillTime, type DiskView } from "./clusterDiskView";
import {
  formatPercent,
  isSnapshotStale,
  nodeCpuView,
  nodeEgressView,
  nodeMemoryView,
  nodeSlotView,
  roundTripLevel,
  worstLevel,
} from "./clusterNodeView";

/*
 * 卡片右上角的状态标签：汇总这台节点（或数据库）所有指标的最差档，文字写最严重的那一项，悬停列出全部。
 * 目的是三台节点并排时，不用逐行读数就能看出哪台、哪里出了问题。
 */

/** 一项需要注意的情况。key 是 cluster_nodes.issue_* 文案，params 填进去。 */
export interface HealthIssue {
  level: Exclude<UsageLevel, "normal">;
  key: string;
  params?: Record<string, string | number>;
}

const ORDER: Record<UsageLevel, number> = { normal: 0, warn: 1, critical: 2 };

export function pushIssue(
  issues: HealthIssue[],
  level: UsageLevel,
  key: string,
  params?: Record<string, string | number>,
) {
  if (level === "normal") return;
  issues.push({ level, key, params });
}

/** 告急在前，同档保持加入的顺序（越靠前越是根因：离线、CPU、磁盘……）。 */
export function sortIssues(issues: HealthIssue[]): HealthIssue[] {
  return issues
    .map((issue, index) => ({ issue, index }))
    .sort((a, b) => ORDER[b.issue.level] - ORDER[a.issue.level] || a.index - b.index)
    .map(({ issue }) => issue);
}

export function issuesLevel(issues: HealthIssue[]): UsageLevel {
  return worstLevel(...issues.map((issue) => issue.level));
}

/** 一块盘的问题，节点和数据库主机共用。 */
export function diskIssue(issues: HealthIssue[], disk: DiskView) {
  switch (disk.concern) {
    case "read_only":
      pushIssue(issues, "critical", "cluster_nodes.issue_disk_read_only", { mount: disk.mount });
      return;
    case "space":
      pushIssue(issues, disk.level, "cluster_nodes.issue_disk_space", {
        mount: disk.mount,
        pct: `${Math.round(disk.pct)}%`,
      });
      return;
    case "inodes":
      pushIssue(issues, disk.level, "cluster_nodes.issue_disk_inodes", {
        mount: disk.mount,
        pct: `${Math.round(disk.inodePct ?? 0)}%`,
      });
      return;
    case "fill": {
      const time = disk.fillSeconds === null ? null : formatFillTime(disk.fillSeconds);
      if (time) pushIssue(issues, disk.level, "cluster_nodes.issue_disk_fill", { mount: disk.mount, time });
      return;
    }
    default:
  }
}

/** 一台机器（节点或数据库主机）共有的部分：CPU、内存、磁盘。 */
export function machineIssues(
  issues: HealthIssue[],
  snapshot: ClusterNode["snapshot"],
): void {
  const cpu = nodeCpuView(snapshot);
  if (cpu && cpu.stealShare !== null) {
    pushIssue(issues, cpu.stealLevel, "cluster_nodes.issue_steal", {
      pct: formatPercent(cpu.stealShare),
    });
  }
  if (cpu) {
    pushIssue(issues, cpu.usageLevel, "cluster_nodes.issue_cpu", {
      pct: `${Math.round(cpu.busyPct + cpu.stealPct)}%`,
    });
  }
  const memory = nodeMemoryView(snapshot);
  if (memory) {
    pushIssue(issues, memory.level, "cluster_nodes.issue_memory", { pct: `${Math.round(memory.pct)}%` });
  }
  for (const disk of sortDisks(snapshot?.disks)) diskIssue(issues, disk);
}

/** 一台应用节点要注意的情况，最严重的在前。 */
export function nodeIssues(node: ClusterNode, now: number): HealthIssue[] {
  const issues: HealthIssue[] = [];
  if (!node.active) {
    pushIssue(issues, "critical", "cluster_nodes.issue_offline");
    return issues;
  }
  const snapshot = node.snapshot;
  if (!snapshot) return issues;
  if (isSnapshotStale(node, now)) pushIssue(issues, "warn", "cluster_nodes.issue_stale");

  machineIssues(issues, snapshot);

  const slot = nodeSlotView(snapshot);
  if (slot && slot.throttledRatio !== null) {
    pushIssue(issues, slot.cpuLevel, "cluster_nodes.issue_throttled", {
      pct: formatPercent(slot.throttledRatio),
    });
  }
  if (slot && slot.memoryPct !== null) {
    pushIssue(issues, slot.memoryLevel, "cluster_nodes.issue_slot_memory", {
      pct: `${Math.round(slot.memoryPct)}%`,
    });
  }

  const egress = nodeEgressView(snapshot);
  if (egress?.state === "open") {
    pushIssue(issues, "critical", "cluster_nodes.issue_egress_open", { count: egress.open });
  } else if (egress?.state === "degraded") {
    pushIssue(issues, "warn", "cluster_nodes.issue_egress_degraded", {
      count: egress.unreachable,
      total: egress.total,
    });
  }

  for (const [rtt, name] of [
    [snapshot.db, "db"],
    [snapshot.redis, "redis"],
  ] as const) {
    if (!rtt) continue;
    if (rtt.error) {
      pushIssue(issues, "critical", `cluster_nodes.issue_${name}_${rtt.error === "timeout" ? "timeout" : "error"}`);
    } else if (rtt.rtt_ms !== undefined) {
      pushIssue(issues, roundTripLevel(rtt), `cluster_nodes.issue_${name}_slow`, {
        ms: rtt.rtt_ms.toFixed(0),
      });
    }
  }

  const shared = snapshot.shared_redis;
  if (shared && !shared.configured) {
    pushIssue(issues, "warn", "cluster_nodes.issue_shared_redis_none");
  } else if (shared && !shared.available) {
    pushIssue(issues, "critical", "cluster_nodes.issue_shared_redis_down");
  }
  return sortIssues(issues);
}
