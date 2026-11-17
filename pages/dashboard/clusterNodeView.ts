import type { ClusterNode, NodeSnapshot } from "@code-proxy/api-client";
import { usageLevel, type UsageLevel } from "@features/monitor-widgets/monitorVisuals";

/*
 * 节点卡片要显示的数，从后端的资源快照（CliRelay internal/nodemetrics）算出来。快照每一段都
 * 可能缺（非 Linux、cgroup v1、刚启动还没有两次采样），缺了就返回 null，卡片显示「—」。
 */

/** 快照比心跳旧这么多秒就标成「数据过时」：采样每 5 秒一次，心跳也是 5 秒。 */
export const SNAPSHOT_STALE_SECONDS = 30;

const ORDER: Record<UsageLevel, number> = { normal: 0, warn: 1, critical: 2 };

export function worstLevel(...levels: UsageLevel[]): UsageLevel {
  return levels.reduce<UsageLevel>(
    (worst, level) => (ORDER[level] > ORDER[worst] ? level : worst),
    "normal",
  );
}

/** iso 时刻距 now 的秒数；时钟偏差可能让它为负，按 0 算。 */
export function secondsSince(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  return Math.max(0, (now - at) / 1000);
}

export function nodeUptimeSeconds(node: ClusterNode, now: number): number | null {
  // 快照里是进程自己的启动时间；成员表里的是注册时刻（集群模式下按数据库时钟）。
  return secondsSince(node.snapshot?.started_at ?? node.started_at, now);
}

export function isSnapshotStale(node: ClusterNode, now: number): boolean {
  const age = secondsSince(node.snapshot_at, now);
  return age !== null && age > SNAPSHOT_STALE_SECONDS;
}

export interface NodeCpuView {
  cpus: number;
  busyCores: number;
  stealCores: number;
  iowaitCores: number;
  idleCores: number;
  windowSeconds: number;
  /** 占整机 CPU 的百分比，堆叠条两段的宽度。 */
  busyPct: number;
  stealPct: number;
  /** steal 占「想运行的时间」（执行 + steal）的比例，0–1；几乎空闲时没有意义，为 null。 */
  stealShare: number | null;
  /** 执行 + steal 占整机的档位，和 steal 占比的档位分开，状态标签要分别说原因。 */
  usageLevel: UsageLevel;
  stealLevel: UsageLevel;
  level: UsageLevel;
}

/**
 * 整机 CPU 的执行与 steal。hk-155 那种超卖的宿主机上，进程和 cgroup 看着很忙，其实大部分
 * 时间在等宿主机：两者分开显示，steal 占比高也算告警。
 */
export function nodeCpuView(snapshot: NodeSnapshot | undefined): NodeCpuView | null {
  const cpu = snapshot?.host?.cpu;
  const cpus = snapshot?.host?.cpus ?? 0;
  if (!cpu || cpus <= 0) return null;
  const busyPct = (cpu.busy_cores / cpus) * 100;
  const stealPct = (cpu.steal_cores / cpus) * 100;
  const runnable = cpu.busy_cores + cpu.steal_cores;
  // 不到 0.1 核时比例只是噪声。
  const stealShare = runnable >= 0.1 ? cpu.steal_cores / runnable : null;
  const stealLevel: UsageLevel =
    stealShare === null
      ? "normal"
      : stealShare >= 0.5
        ? "critical"
        : stealShare >= 0.2
          ? "warn"
          : "normal";
  const loadLevel = usageLevel(busyPct + stealPct);
  return {
    cpus,
    busyCores: cpu.busy_cores,
    stealCores: cpu.steal_cores,
    iowaitCores: cpu.iowait_cores,
    idleCores: cpu.idle_cores,
    windowSeconds: cpu.window_seconds,
    busyPct,
    stealPct,
    stealShare,
    usageLevel: loadLevel,
    stealLevel,
    level: worstLevel(loadLevel, stealLevel),
  };
}

export interface NodeMemoryView {
  usedBytes: number;
  totalBytes: number;
  pct: number;
  level: UsageLevel;
}

export function nodeMemoryView(snapshot: NodeSnapshot | undefined): NodeMemoryView | null {
  const memory = snapshot?.host?.memory;
  if (!memory || memory.total_bytes <= 0 || memory.available_bytes === undefined) return null;
  const usedBytes = Math.max(0, memory.total_bytes - memory.available_bytes);
  const pct = (usedBytes / memory.total_bytes) * 100;
  return { usedBytes, totalBytes: memory.total_bytes, pct, level: usageLevel(pct) };
}

export interface NodeSlotView {
  path: string;
  quotaCores: number | null;
  usageCores: number | null;
  /** 配额周期里用满配额的比例，0–1。 */
  throttledRatio: number | null;
  cpuLevel: UsageLevel;
  memoryCurrent: number | null;
  /** memory.high（软上限，超过就开始回收），没有就用 memory.max。 */
  memoryLimit: number | null;
  memoryMax: number | null;
  memoryPct: number | null;
  memoryLevel: UsageLevel;
}

/** 限流比例的告警档：5% 的周期用满配额说明配额偏紧，25% 就是在排队了。 */
export function throttleLevel(ratio: number | null): UsageLevel {
  if (ratio === null) return "normal";
  return ratio >= 0.25 ? "critical" : ratio >= 0.05 ? "warn" : "normal";
}

export function nodeSlotView(snapshot: NodeSnapshot | undefined): NodeSlotView | null {
  const group = snapshot?.cgroup;
  if (!group) return null;
  const window = group.cpu?.window;
  const throttledRatio = window ? window.throttled_ratio : null;
  const memoryCurrent = group.memory?.current_bytes ?? null;
  const memoryLimit = group.memory?.high_bytes ?? group.memory?.max_bytes ?? null;
  const memoryPct =
    memoryCurrent !== null && memoryLimit !== null && memoryLimit > 0
      ? (memoryCurrent / memoryLimit) * 100
      : null;
  return {
    path: group.path,
    quotaCores: group.cpu?.quota_cores ?? null,
    usageCores: window ? window.usage_cores : null,
    throttledRatio,
    cpuLevel: throttleLevel(throttledRatio),
    memoryCurrent,
    memoryLimit,
    memoryMax: group.memory?.max_bytes ?? null,
    memoryPct,
    memoryLevel: memoryPct === null ? "normal" : usageLevel(memoryPct),
  };
}

export interface NodeTrafficView {
  inFlight: number;
  requestsPerMinute: number | null;
  bytesInPerSecond: number | null;
  bytesOutPerSecond: number | null;
}

export function nodeTrafficView(snapshot: NodeSnapshot | undefined): NodeTrafficView | null {
  const traffic = snapshot?.traffic;
  if (!traffic) return null;
  const seconds = traffic.window_seconds;
  const perSecond = (value: number) => (seconds > 0 ? value / seconds : null);
  const requests = perSecond(traffic.requests);
  return {
    inFlight: traffic.in_flight,
    requestsPerMinute: requests === null ? null : requests * 60,
    bytesInPerSecond: perSecond(traffic.bytes_in),
    bytesOutPerSecond: perSecond(traffic.bytes_out),
  };
}

/** ok 正常；degraded 连接检查有端点连不上；open 有代理被熔断；off 熔断关着。 */
export type NodeEgressState = "ok" | "degraded" | "open" | "off";

export interface NodeEgressView {
  state: NodeEgressState;
  open: number;
  unreachable: number;
  total: number;
  level: UsageLevel;
}

export function nodeEgressView(snapshot: NodeSnapshot | undefined): NodeEgressView | null {
  const egress = snapshot?.egress;
  if (!egress) return null;
  const unreachable = egress.check?.unreachable ?? 0;
  const total = egress.check?.total ?? 0;
  if (egress.breaker_open > 0) {
    return { state: "open", open: egress.breaker_open, unreachable, total, level: "critical" };
  }
  if (unreachable > 0) {
    return { state: "degraded", open: 0, unreachable, total, level: "warn" };
  }
  return {
    state: egress.breaker_enabled ? "ok" : "off",
    open: 0,
    unreachable,
    total,
    level: "normal",
  };
}

/** 往返耗时的告警档：同机通常不到 1 ms，跨机约 8 ms；超时和失败直接告急。 */
export function roundTripLevel(rtt: { rtt_ms?: number; error?: string } | undefined): UsageLevel {
  if (!rtt) return "normal";
  if (rtt.error) return "critical";
  const ms = rtt.rtt_ms ?? 0;
  return ms >= 200 ? "critical" : ms >= 50 ? "warn" : "normal";
}

/** 核数显示两位小数：0.76、2.76 这类数要能和 top 对上。 */
export function formatCores(cores: number): string {
  return cores.toFixed(2);
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(ratio < 0.1 ? 1 : 0)}%`;
}

/** 简短的时长：45s、12m、3h 5m、2d 4h。 */
export function formatAge(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
