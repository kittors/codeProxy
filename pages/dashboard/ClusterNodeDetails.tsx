import { useTranslation } from "react-i18next";
import type { ClusterNode } from "@code-proxy/api-client";
import type { UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import { formatBytes, formatRate } from "./systemFormat";
import { sortDisks } from "./clusterDiskView";
import { nodeIssues } from "./clusterHealth";
import {
  formatAge,
  formatCores,
  formatPercent,
  isSnapshotStale,
  nodeCpuView,
  nodeEgressView,
  nodeMemoryView,
  nodeSlotView,
  nodeTrafficView,
  roundTripLevel,
  secondsSince,
} from "./clusterNodeView";
import { CpuSplitBar, EMPTY } from "./ClusterCardParts";
import { DetailGrid, DetailItem, DetailSection, DiskRows, IssueList } from "./ClusterDetailParts";
import { formatTime, roundTripValue } from "./clusterFormat";

/*
 * 详情抽屉里一台节点的全部数：需要注意的完整列表、每块磁盘、CPU 与负载、slot 的 cgroup、流量、出口、
 * 依赖、进程。卡片上放不下的都在这里，跟着每 10 秒的刷新一起更新。
 */

export function ClusterNodeDetails({ node, now }: { node: ClusterNode; now: number }) {
  const { t } = useTranslation();
  const snapshot = node.snapshot;
  const issues = nodeIssues(node, now);
  const lastSeen = secondsSince(node.last_seen, now);
  const snapshotAge = secondsSince(node.snapshot_at, now);
  const stale = isSnapshotStale(node, now);
  const version = snapshot?.version || node.version;

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <IssueList issues={issues} />
        <p className="text-sm text-ink-2">{t("cluster_nodes.no_snapshot")}</p>
        <DetailSection title={t("cluster_nodes.section_process")}>
          <DetailGrid>
            <DetailItem wide label={t("cluster_nodes.version")} value={version || EMPTY} />
            <DetailItem
              wide
              label={t("cluster_nodes.last_heartbeat")}
              value={lastSeen === null ? EMPTY : t("cluster_nodes.ago", { age: formatAge(lastSeen) })}
              level={node.active ? undefined : "critical"}
            />
          </DetailGrid>
        </DetailSection>
      </div>
    );
  }

  const cpu = nodeCpuView(snapshot);
  const memory = nodeMemoryView(snapshot);
  const slot = nodeSlotView(snapshot);
  const traffic = nodeTrafficView(snapshot);
  const egress = nodeEgressView(snapshot);
  const disks = sortDisks(snapshot.disks);
  const load = snapshot.host?.load;
  const shared = snapshot.shared_redis;
  const redis = snapshot.redis;
  const sharedLevel: UsageLevel = !shared ? "normal" : !shared.configured ? "warn" : shared.available ? "normal" : "critical";
  const cores = (value: number) => t("cluster_nodes.cores", { value: formatCores(value) });

  return (
    <div className="space-y-6">
      <IssueList issues={issues} />

      <DetailSection title={t("cluster_nodes.section_disks")} aside={t("cluster_nodes.disks_aside")}>
        <DiskRows disks={disks} />
      </DetailSection>

      <DetailSection
        title={t("cluster_nodes.section_cpu")}
        aside={cpu ? t("cluster_nodes.window_aside", { seconds: Math.round(cpu.windowSeconds) }) : undefined}
      >
        {cpu ? <CpuSplitBar cpu={cpu} /> : <p className="text-xs text-ink-3">{t("cluster_nodes.cpu_pending")}</p>}
        <DetailGrid>
          <DetailItem label={t("cluster_nodes.cpu_busy")} value={cpu ? cores(cpu.busyCores) : EMPTY} level={cpu?.usageLevel} />
          <DetailItem label={t("cluster_nodes.cpu_steal")} value={cpu ? cores(cpu.stealCores) : EMPTY} level={cpu?.stealLevel} />
          <DetailItem label={t("cluster_nodes.cpu_iowait")} value={cpu ? cores(cpu.iowaitCores) : EMPTY} />
          <DetailItem label={t("cluster_nodes.cpu_idle")} value={cpu ? cores(cpu.idleCores) : EMPTY} />
          <DetailItem
            label={t("cluster_nodes.steal_share_label")}
            value={cpu?.stealShare == null ? EMPTY : formatPercent(cpu.stealShare)}
            level={cpu?.stealLevel}
          />
          <DetailItem label={t("cluster_nodes.cpus")} value={cpu ? String(cpu.cpus) : EMPTY} />
          <DetailItem
            wide
            label={t("cluster_nodes.load")}
            value={load ? `${load.load1.toFixed(2)} / ${load.load5.toFixed(2)} / ${load.load15.toFixed(2)}` : EMPTY}
          />
          <DetailItem
            wide
            label={t("cluster_nodes.memory")}
            value={memory ? `${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}` : EMPTY}
            level={memory?.level}
          />
        </DetailGrid>
      </DetailSection>

      <DetailSection title={t("cluster_nodes.section_slot")}>
        {slot ? (
          <DetailGrid>
            <DetailItem wide label={t("cluster_nodes.slot_unit")} value={slot.path.split("/").pop() || slot.path} title={slot.path} />
            <DetailItem
              label={t("cluster_nodes.slot_quota")}
              value={slot.quotaCores === null ? t("cluster_nodes.unlimited") : cores(slot.quotaCores)}
            />
            <DetailItem label={t("cluster_nodes.slot_usage")} value={slot.usageCores === null ? EMPTY : cores(slot.usageCores)} />
            <DetailItem
              label={t("cluster_nodes.slot_throttled")}
              value={slot.throttledRatio === null ? EMPTY : formatPercent(slot.throttledRatio)}
              level={slot.cpuLevel}
            />
            <DetailItem
              label={t("cluster_nodes.slot_throttled_time")}
              value={
                snapshot.cgroup?.cpu?.window
                  ? t("cluster_nodes.seconds", { value: snapshot.cgroup.cpu.window.throttled_seconds.toFixed(1) })
                  : EMPTY
              }
            />
            <DetailItem
              label={t("cluster_nodes.slot_memory_current")}
              value={slot.memoryCurrent === null ? EMPTY : formatBytes(slot.memoryCurrent)}
              level={slot.memoryLevel}
            />
            <DetailItem
              label={t("cluster_nodes.slot_memory_high")}
              value={snapshot.cgroup?.memory?.high_bytes ? formatBytes(snapshot.cgroup.memory.high_bytes) : t("cluster_nodes.unlimited")}
            />
            <DetailItem
              label={t("cluster_nodes.slot_memory_max")}
              value={slot.memoryMax === null ? t("cluster_nodes.unlimited") : formatBytes(slot.memoryMax)}
            />
            <DetailItem
              label="GOMEMLIMIT"
              value={snapshot.memory_limit_bytes ? formatBytes(snapshot.memory_limit_bytes) : t("cluster_nodes.unlimited")}
            />
            <DetailItem label="GOMAXPROCS" value={String(snapshot.gomaxprocs)} />
            <DetailItem label={t("cluster_nodes.goroutines")} value={snapshot.goroutines.toLocaleString()} />
          </DetailGrid>
        ) : (
          <p className="text-xs text-ink-3">{t("cluster_nodes.slot_unavailable")}</p>
        )}
      </DetailSection>

      <DetailSection
        title={t("cluster_nodes.section_traffic")}
        aside={t("cluster_nodes.window_aside", { seconds: Math.round(snapshot.traffic.window_seconds) })}
      >
        <DetailGrid>
          <DetailItem label={t("cluster_nodes.in_flight")} value={traffic ? traffic.inFlight.toLocaleString() : EMPTY} />
          <DetailItem
            label={t("cluster_nodes.requests_per_minute")}
            value={traffic?.requestsPerMinute == null ? EMPTY : Math.round(traffic.requestsPerMinute).toLocaleString()}
          />
          <DetailItem wide label={t("cluster_nodes.requests")} value={snapshot.traffic.requests.toLocaleString()} />
          <DetailItem
            label={t("cluster_nodes.bytes_in_rate")}
            value={traffic?.bytesInPerSecond == null ? EMPTY : formatRate(traffic.bytesInPerSecond)}
          />
          <DetailItem
            label={t("cluster_nodes.bytes_out_rate")}
            value={traffic?.bytesOutPerSecond == null ? EMPTY : formatRate(traffic.bytesOutPerSecond)}
          />
          <DetailItem label={t("cluster_nodes.bytes_in_total")} value={formatBytes(snapshot.traffic.bytes_in)} />
          <DetailItem label={t("cluster_nodes.bytes_out_total")} value={formatBytes(snapshot.traffic.bytes_out)} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title={t("cluster_nodes.section_egress")}>
        {snapshot.egress ? (
          <DetailGrid>
            <DetailItem
              label={t("cluster_nodes.egress_breaker")}
              value={t(snapshot.egress.breaker_enabled ? "cluster_nodes.on" : "cluster_nodes.off")}
            />
            <DetailItem
              label={t("cluster_nodes.egress_open_count")}
              value={String(snapshot.egress.breaker_open)}
              level={egress?.state === "open" ? "critical" : undefined}
            />
            <DetailItem label={t("cluster_nodes.egress_auth_rejected")} value={String(snapshot.egress.auth_rejected)} />
            <DetailItem label={t("cluster_nodes.egress_unreachable")} value={String(snapshot.egress.unreachable)} />
            <DetailItem
              label={t("cluster_nodes.egress_check")}
              value={
                snapshot.egress.check
                  ? t("cluster_nodes.egress_check_value", {
                      ok: snapshot.egress.check.total - snapshot.egress.check.unreachable,
                      total: snapshot.egress.check.total,
                    })
                  : EMPTY
              }
              level={egress?.state === "degraded" ? "warn" : undefined}
            />
            <DetailItem label={t("cluster_nodes.since")} value={formatTime(snapshot.egress.open_since)} />
          </DetailGrid>
        ) : (
          <p className="text-xs text-ink-3">{EMPTY}</p>
        )}
      </DetailSection>

      <DetailSection title={t("cluster_nodes.section_deps")}>
        <DetailGrid>
          <DetailItem label={t("cluster_nodes.db_rtt")} value={roundTripValue(snapshot.db, t)} level={roundTripLevel(snapshot.db)} />
          <DetailItem
            label={t(
              redis?.role === "cluster"
                ? "cluster_nodes.redis_cluster"
                : redis?.role === "usage"
                  ? "cluster_nodes.redis_usage"
                  : "cluster_nodes.redis",
            )}
            value={roundTripValue(redis, t)}
            level={roundTripLevel(redis)}
          />
          {shared ? (
            <DetailItem
              wide
              label={t("cluster_nodes.shared_redis")}
              value={t(
                !shared.configured
                  ? "cluster_nodes.shared_redis_none"
                  : shared.available
                    ? "cluster_nodes.shared_redis_ok"
                    : "cluster_nodes.shared_redis_down",
              )}
              level={sharedLevel}
              title={shared.since ? formatTime(shared.since) : undefined}
            />
          ) : null}
        </DetailGrid>
      </DetailSection>

      <DetailSection title={t("cluster_nodes.section_process")}>
        <DetailGrid>
          <DetailItem wide label={t("cluster_nodes.version")} value={version || EMPTY} />
          <DetailItem wide label={t("cluster_nodes.started_at")} value={formatTime(snapshot.started_at)} />
          <DetailItem
            wide
            label={t("cluster_nodes.last_heartbeat")}
            value={lastSeen === null ? EMPTY : t("cluster_nodes.ago", { age: formatAge(lastSeen) })}
            level={node.active ? undefined : "critical"}
          />
          <DetailItem
            wide
            label={t("cluster_nodes.snapshot_at")}
            value={snapshotAge === null ? EMPTY : t("cluster_nodes.ago", { age: formatAge(snapshotAge) })}
            level={stale ? "warn" : undefined}
          />
        </DetailGrid>
      </DetailSection>
    </div>
  );
}
