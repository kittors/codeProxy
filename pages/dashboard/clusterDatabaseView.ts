import type { ClusterHost, ClusterStatus, NodeDatabase } from "@code-proxy/api-client";
import { usageLevel, type UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import { sortDisks, type DiskView } from "./clusterDiskView";
import {
  issuesLevel,
  machineIssues,
  pushIssue,
  sortIssues,
  type HealthIssue,
} from "./clusterHealth";
import { nodeCpuView, nodeMemoryView, secondsSince, worstLevel } from "./clusterNodeView";

/*
 * 数据库卡片的显示口径。数据来自主节点快照里的 database 段（主节点每 30 秒查一次 PostgreSQL 的统计视图），
 * 数据库主机的 CPU、内存和磁盘来自 hosts 里 role = database 的那台（clirelay-hostagent 每 15 秒上报）。
 *
 * 告警档（在 PR 和文档里写明，改的话两边一起改）：
 * - 连接：客户端连接占「max_connections − 超级用户预留」80% 留意、95% 告急（普通角色到这个数就连不上）。
 * - 复制槽：未活跃或 wal_status = extended 留意，unreserved / lost 告急；保留的 WAL 占
 *   max_slot_wal_keep_size 50% 留意、80% 告急（到 100% 槽就失效，归档断档）；不限量时保留超过 1 GB 留意。
 * - 复制连接：不是 streaming、或 60 秒没回复，留意。
 * - 事务：最长事务 5 分钟留意、30 分钟告急；事务中空闲 1 分钟留意、10 分钟告急；等锁 10 秒留意、60 秒告急。
 * - 事务 ID 年龄 5 亿留意、10 亿告急（20 亿停写）。
 * - 近 5 分钟缓存命中率低于 90% 留意、80% 告急（读块太少时不算）；有死锁留意。
 * - 数据 2 分钟没更新（4 轮）留意；查询失败或库处于恢复模式告急。
 */

export const DATABASE_STALE_SECONDS = 120;
export const HOST_STALE_SECONDS = 120;
const GIB = 1024 ** 3;
/** 近 5 分钟读块少于这个数时，命中率只是噪声。 */
const CACHE_MIN_BLOCKS = 1000;

/** 缓存命中率保留一位小数：99.2% 和 99.8% 的差别正是要看的，通用的百分比格式会把两者都写成 100%。 */
export function formatHitRatio(ratio: number): string {
  return `${(Math.floor(ratio * 1000) / 10).toFixed(1)}%`;
}

export function thresholdLevel(value: number, warn: number, critical: number): UsageLevel {
  return value >= critical ? "critical" : value >= warn ? "warn" : "normal";
}

export interface DatabaseSlotView {
  name: string;
  type: string;
  active: boolean;
  walStatus: string | null;
  retainedBytes: number | null;
  safeBytes: number | null;
  /** 保留量占 max_slot_wal_keep_size 的比例，0–1；不限量时为 null。 */
  keepRatio: number | null;
  level: UsageLevel;
}

export interface DatabaseReplicaView {
  name: string;
  state: string;
  syncState: string | null;
  sentLagBytes: number | null;
  flushLagBytes: number | null;
  replyAgeSeconds: number | null;
  level: UsageLevel;
}

export interface DatabaseHostView {
  host: ClusterHost;
  disks: DiskView[];
  ageSeconds: number;
  stale: boolean;
}

export interface DatabaseView {
  db: NodeDatabase;
  /** 查库的主节点。 */
  leaderId: string;
  ageSeconds: number | null;
  stale: boolean;
  connections: {
    client: number;
    max: number;
    usable: number;
    pct: number;
    level: UsageLevel;
  } | null;
  walLevel: UsageLevel;
  slots: DatabaseSlotView[];
  replicas: DatabaseReplicaView[];
  transactionLevel: UsageLevel;
  idleTransactionLevel: UsageLevel;
  lockLevel: UsageLevel;
  xidLevel: UsageLevel;
  /** 近 5 分钟缓存命中率，0–1。 */
  cacheHitRatio: number | null;
  cacheLevel: UsageLevel;
  commitsPerSecond: number | null;
  rollbackRatio: number | null;
  host: DatabaseHostView | null;
  issues: HealthIssue[];
  level: UsageLevel;
}

function slotView(slot: NonNullable<NodeDatabase["slots"]>[number], maxKeep: number | null): DatabaseSlotView {
  const retained = slot.retained_bytes ?? null;
  const keepRatio = retained !== null && maxKeep !== null && maxKeep > 0 ? retained / maxKeep : null;
  const status = slot.wal_status || null;
  let level: UsageLevel = "normal";
  if (status === "lost" || status === "unreserved") level = "critical";
  else if (!slot.active || status === "extended") level = "warn";
  if (keepRatio !== null) level = worstLevel(level, thresholdLevel(keepRatio, 0.5, 0.8));
  else if (retained !== null && retained >= GIB) level = worstLevel(level, "warn");
  return {
    name: slot.name,
    type: slot.type,
    active: slot.active,
    walStatus: status,
    retainedBytes: retained,
    safeBytes: slot.safe_wal_size_bytes ?? null,
    keepRatio,
    level,
  };
}

function replicaView(replica: NonNullable<NodeDatabase["replication"]>[number]): DatabaseReplicaView {
  const reply = replica.reply_age_seconds ?? null;
  const level: UsageLevel =
    replica.state !== "streaming" || (reply !== null && reply >= 60) ? "warn" : "normal";
  return {
    name: replica.name || "—",
    state: replica.state,
    syncState: replica.sync_state || null,
    sentLagBytes: replica.sent_lag_bytes ?? null,
    flushLagBytes: replica.flush_lag_bytes ?? null,
    replyAgeSeconds: reply,
    level,
  };
}

/** 主节点快照里的数据库段；集群里只该有一个，万一有两个（交接瞬间）取更新的那份。 */
export function findDatabase(status: ClusterStatus): { db: NodeDatabase; leaderId: string } | null {
  let found: { db: NodeDatabase; leaderId: string } | null = null;
  for (const node of status.nodes ?? []) {
    const db = node.snapshot?.database;
    if (!db || !node.active) continue;
    if (!found || Date.parse(db.collected_at) > Date.parse(found.db.collected_at)) {
      found = { db, leaderId: node.node_id };
    }
  }
  return found;
}

export function databaseHost(status: ClusterStatus): ClusterHost | null {
  return (status.hosts ?? []).find((host) => host.role === "database") ?? null;
}

export function databaseView(
  status: ClusterStatus,
  now: number,
  receivedAt: number,
): DatabaseView | null {
  const found = findDatabase(status);
  if (!found) return null;
  const { db, leaderId } = found;
  const issues: HealthIssue[] = [];

  const ageSeconds = secondsSince(db.collected_at, now);
  const stale = ageSeconds !== null && ageSeconds > DATABASE_STALE_SECONDS;
  if (db.error) {
    pushIssue(issues, "critical", db.error === "timeout" ? "cluster_nodes.issue_query_timeout" : "cluster_nodes.issue_query_error");
  }
  if (stale) pushIssue(issues, "warn", "cluster_nodes.issue_database_stale");
  if (db.in_recovery) pushIssue(issues, "critical", "cluster_nodes.issue_in_recovery");

  let connections: DatabaseView["connections"] = null;
  if (db.connections && db.connections.max > 0) {
    const { client, max, reserved } = db.connections;
    const usable = max - reserved > 0 ? max - reserved : max;
    const pct = (client / usable) * 100;
    connections = { client, max, usable, pct, level: usageLevel(pct) };
    pushIssue(issues, connections.level, "cluster_nodes.issue_connections", { pct: `${Math.round(pct)}%` });
  }

  const maxKeep = db.wal?.max_slot_keep_bytes ?? null;
  const slots = (db.slots ?? []).map((slot) => slotView(slot, maxKeep));
  for (const slot of slots) {
    if (slot.level === "normal") continue;
    const key =
      slot.walStatus === "lost"
        ? "cluster_nodes.issue_slot_lost"
        : slot.walStatus === "unreserved"
          ? "cluster_nodes.issue_slot_unreserved"
          : !slot.active
            ? "cluster_nodes.issue_slot_inactive"
            : "cluster_nodes.issue_slot_retained";
    pushIssue(issues, slot.level, key, { name: slot.name });
  }
  const replicas = (db.replication ?? []).map(replicaView);
  for (const replica of replicas) {
    pushIssue(issues, replica.level, "cluster_nodes.issue_replica", { name: replica.name, state: replica.state });
  }

  // pg_wal 远超 max_wal_size：有槽或归档在拖着 WAL 不让回收。
  const walBytes = db.wal?.bytes;
  const maxWal = db.wal?.max_wal_size_bytes;
  const walLevel: UsageLevel = walBytes !== undefined && maxWal && walBytes > 2 * maxWal ? "warn" : "normal";
  pushIssue(issues, walLevel, "cluster_nodes.issue_wal");

  const activity = db.activity;
  const transactionLevel = activity ? thresholdLevel(activity.longest_transaction_seconds, 300, 1800) : "normal";
  const idleTransactionLevel = activity
    ? thresholdLevel(activity.longest_idle_in_transaction_seconds, 60, 600)
    : "normal";
  const lockLevel = activity && activity.lock_waits > 0 ? thresholdLevel(activity.longest_lock_wait_seconds, 10, 60) : "normal";
  if (activity) {
    pushIssue(issues, transactionLevel, "cluster_nodes.issue_long_transaction", {
      age: Math.round(activity.longest_transaction_seconds),
    });
    pushIssue(issues, idleTransactionLevel, "cluster_nodes.issue_idle_transaction", {
      age: Math.round(activity.longest_idle_in_transaction_seconds),
    });
    pushIssue(issues, lockLevel, "cluster_nodes.issue_lock_wait", { count: activity.lock_waits });
  }
  const xidLevel = thresholdLevel(db.xid_age, 500_000_000, 1_000_000_000);
  pushIssue(issues, xidLevel, "cluster_nodes.issue_xid", { age: `${Math.round(db.xid_age / 1_000_000)}M` });

  const window = db.window;
  const blocks = window ? window.blocks_hit + window.blocks_read : 0;
  const cacheHitRatio = window && blocks >= CACHE_MIN_BLOCKS ? window.blocks_hit / blocks : null;
  const cacheLevel: UsageLevel =
    cacheHitRatio === null ? "normal" : cacheHitRatio < 0.8 ? "critical" : cacheHitRatio < 0.9 ? "warn" : "normal";
  if (cacheHitRatio !== null) {
    pushIssue(issues, cacheLevel, "cluster_nodes.issue_cache", { pct: formatHitRatio(cacheHitRatio) });
  }
  if (window && window.deadlocks > 0) {
    pushIssue(issues, "warn", "cluster_nodes.issue_deadlocks", { count: window.deadlocks });
  }
  const transactions = window ? window.commits + window.rollbacks : 0;
  const commitsPerSecond = window && window.seconds > 0 ? window.commits / window.seconds : null;
  const rollbackRatio = window && transactions > 0 ? window.rollbacks / transactions : null;

  let host: DatabaseHostView | null = null;
  const hostRow = databaseHost(status);
  if (hostRow) {
    // age_seconds 是响应那一刻按数据库时钟算的；之后每过一秒再加上。
    const ageSeconds = hostRow.age_seconds + Math.max(0, (now - receivedAt) / 1000);
    host = {
      host: hostRow,
      disks: sortDisks(hostRow.snapshot?.disks),
      ageSeconds,
      stale: ageSeconds > HOST_STALE_SECONDS,
    };
    if (host.stale) pushIssue(issues, "warn", "cluster_nodes.issue_host_stale", { host: hostRow.host_id });
    machineIssues(issues, hostRow.snapshot);
  }

  const sorted = sortIssues(issues);
  return {
    db,
    leaderId,
    ageSeconds,
    stale,
    connections,
    walLevel,
    slots,
    replicas,
    transactionLevel,
    idleTransactionLevel,
    lockLevel,
    xidLevel,
    cacheHitRatio,
    cacheLevel,
    commitsPerSecond,
    rollbackRatio,
    host,
    issues: sorted,
    level: issuesLevel(sorted),
  };
}

/** 数据库主机的 CPU 与内存，给卡片和详情用。 */
export function databaseHostMachine(host: DatabaseHostView | null) {
  if (!host) return { cpu: null, memory: null };
  return { cpu: nodeCpuView(host.host.snapshot), memory: nodeMemoryView(host.host.snapshot) };
}
