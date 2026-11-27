import { useTranslation } from "react-i18next";
import { Server } from "@code-proxy/ui/icons";
import type { ClusterNode } from "@code-proxy/api-client";
import { MeterBar, meterTone, type UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import { formatBytes, formatRate } from "./systemFormat";
import { sortDisks, formatFillTime } from "./clusterDiskView";
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
  nodeUptimeSeconds,
  roundTripLevel,
  secondsSince,
  worstLevel,
} from "./clusterNodeView";
import {
  CardFooter,
  CardHeader,
  CardShell,
  Chip,
  ChipRow,
  CpuSplitBar,
  EMPTY,
  MetricCell,
  MetricGrid,
  Stat,
  StatStrip,
  Tag,
} from "./ClusterCardParts";
import { useDiskUseLabel } from "./ClusterDetailParts";
import { formatRateShort, roundTripValue } from "./clusterFormat";

/*
 * 一台应用节点的卡片，五行骨架见 ClusterCardParts：标题、2×2 指标（CPU、内存、最满的磁盘、slot
 * 配额）、四格数字条（负载、在途、每分钟请求、出入流量）、依赖胶囊、页脚。完整的数（每块盘、cgroup、
 * 出口计数、进程信息）在详情抽屉里。离线的节点保留最后一次的数并整体变淡，状态标签写「离线」。
 */

export function ClusterNodeCard({
  node,
  now,
  onOpenDetails,
}: {
  node: ClusterNode;
  now: number;
  onOpenDetails: () => void;
}) {
  const { t } = useTranslation();
  const useLabel = useDiskUseLabel();

  const snapshot = node.snapshot;
  const issues = nodeIssues(node, now);
  const cpu = nodeCpuView(snapshot);
  const memory = nodeMemoryView(snapshot);
  const slot = nodeSlotView(snapshot);
  const traffic = nodeTrafficView(snapshot);
  const egress = nodeEgressView(snapshot);
  const disks = sortDisks(snapshot?.disks);
  const topDisk = disks[0] ?? null;
  const uptime = nodeUptimeSeconds(node, now);
  const lastSeen = secondsSince(node.last_seen, now);
  const snapshotAge = secondsSince(node.snapshot_at, now);
  const stale = isSnapshotStale(node, now);
  const version = snapshot?.version || node.version;
  const load = snapshot?.host?.load;
  const dimmed = !node.active;

  const shared = snapshot?.shared_redis;
  const redis = snapshot?.redis;
  const redisLabelKey =
    redis?.role === "cluster"
      ? "cluster_nodes.chip_redis_cluster"
      : redis?.role === "usage"
        ? "cluster_nodes.chip_redis_usage"
        : "cluster_nodes.chip_redis";
  const sharedLevel: UsageLevel = !shared ? "normal" : !shared.configured ? "warn" : shared.available ? "normal" : "critical";

  const egressText = !egress
    ? EMPTY
    : egress.state === "open"
      ? t("cluster_nodes.egress_open", { count: egress.open })
      : egress.state === "degraded"
        ? t("cluster_nodes.egress_degraded", { count: egress.unreachable, total: egress.total })
        : egress.state === "off"
          ? t("cluster_nodes.egress_off")
          : t("cluster_nodes.egress_ok");

  const slotUsagePct =
    slot && slot.usageCores !== null && slot.quotaCores ? (slot.usageCores / slot.quotaCores) * 100 : null;

  const diskFoot = !topDisk
    ? t("cluster_nodes.disks_unavailable")
    : topDisk.concern === "fill" && topDisk.fillSeconds !== null
      ? t("cluster_nodes.disk_fill", { time: formatFillTime(topDisk.fillSeconds) ?? EMPTY })
      : topDisk.concern === "inodes"
        ? t("cluster_nodes.inodes", { pct: `${Math.round(topDisk.inodePct ?? 0)}%` })
        : topDisk.concern === "read_only"
          ? t("cluster_nodes.read_only")
          : disks.length > 1
            ? t("cluster_nodes.disk_more", {
                used: formatBytes(topDisk.usedBytes),
                total: formatBytes(topDisk.totalBytes),
                count: disks.length - 1,
              })
            : `${formatBytes(topDisk.usedBytes)} / ${formatBytes(topDisk.totalBytes)}`;

  const meta = [
    uptime === null ? null : t("cluster_nodes.footer_uptime", { uptime: formatAge(uptime) }),
    lastSeen === null ? null : (
      <span key="seen" className={node.active ? undefined : "font-semibold text-rose-600 dark:text-rose-300"}>
        {t("cluster_nodes.footer_heartbeat", { age: formatAge(lastSeen) })}
      </span>
    ),
    // 离线时心跳已经说明了数据有多旧，不再重复「数据过时」。
    stale && node.active && snapshotAge !== null ? (
      <span key="stale" className="text-amber-700 dark:text-amber-300">
        {t("cluster_nodes.snapshot_stale", { age: formatAge(snapshotAge) })}
      </span>
    ) : null,
  ]
    .filter(Boolean)
    .flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));

  return (
    <CardShell label={node.node_id} testId="cluster-node-card">
      <CardHeader
        icon={Server}
        hue={node.active ? "emerald" : "rose"}
        title={node.node_id}
        tags={
          <>
            {node.leader ? <Tag>{t("cluster_nodes.leader")}</Tag> : null}
            {node.self ? <Tag>{t("cluster_nodes.self")}</Tag> : null}
          </>
        }
        subtitle={[version, node.advertise].filter(Boolean).join(" · ")}
        issues={issues}
      />

      {snapshot ? (
        <MetricGrid dimmed={dimmed}>
          <MetricCell
            testId="node-cpu"
            label={
              <span title={t("cluster_nodes.cpu_hint")}>
                {cpu ? t("cluster_nodes.cpu_with_cores", { count: cpu.cpus }) : t("cluster_nodes.cpu")}
              </span>
            }
            aside={cpu ? `${Math.round(cpu.busyPct + cpu.stealPct)}%` : undefined}
            level={cpu?.usageLevel}
            value={cpu ? t("cluster_nodes.cores", { value: formatCores(cpu.busyCores) }) : EMPTY}
            bar={cpu ? <CpuSplitBar cpu={cpu} /> : undefined}
            foot={
              !cpu
                ? t("cluster_nodes.cpu_pending")
                : cpu.stealShare === null
                  ? t("cluster_nodes.steal_foot_idle", { cores: formatCores(cpu.stealCores) })
                  : t("cluster_nodes.steal_foot", {
                      cores: formatCores(cpu.stealCores),
                      pct: formatPercent(cpu.stealShare),
                    })
            }
            footLevel={cpu?.stealLevel}
          />
          <MetricCell
            testId="node-memory"
            label={t("cluster_nodes.memory")}
            aside={memory ? `${Math.round(memory.pct)}%` : undefined}
            level={memory?.level}
            value={memory ? `${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}` : EMPTY}
            bar={memory ? <MeterBar pct={memory.pct} tone={meterTone(memory.level, "violet")} className="h-bar-sm" /> : undefined}
            foot={
              memory
                ? t("cluster_nodes.memory_available", { size: formatBytes(memory.totalBytes - memory.usedBytes) })
                : undefined
            }
          />
          <MetricCell
            testId="node-disk"
            label={
              topDisk ? (
                <span title={topDisk.uses.map(useLabel).join(" · ")}>
                  {t("cluster_nodes.disk_cell", { mount: topDisk.mount })}
                </span>
              ) : (
                t("cluster_nodes.disk")
              )
            }
            aside={topDisk ? `${Math.round(topDisk.pct)}%` : undefined}
            level={topDisk?.level}
            value={topDisk ? t("cluster_nodes.disk_available", { size: formatBytes(topDisk.availableBytes) }) : EMPTY}
            bar={
              topDisk ? <MeterBar pct={topDisk.pct} tone={meterTone(topDisk.level, "sky")} className="h-bar-sm" /> : undefined
            }
            foot={diskFoot}
            footLevel={topDisk && topDisk.concern && topDisk.concern !== "space" ? topDisk.level : undefined}
          />
          <MetricCell
            testId="node-slot"
            label={
              <span title={t("cluster_nodes.slot_hint")}>
                {slot
                  ? t("cluster_nodes.slot_cell", {
                      quota:
                        slot.quotaCores === null
                          ? t("cluster_nodes.unlimited")
                          : t("cluster_nodes.cores", { value: formatCores(slot.quotaCores) }),
                    })
                  : t("cluster_nodes.slot")}
              </span>
            }
            aside={slotUsagePct === null ? undefined : `${Math.round(slotUsagePct)}%`}
            level={slot?.cpuLevel}
            value={slot?.usageCores == null ? EMPTY : t("cluster_nodes.cores", { value: formatCores(slot.usageCores) })}
            bar={
              slotUsagePct === null ? undefined : (
                <MeterBar pct={slotUsagePct} tone={meterTone(slot?.cpuLevel ?? "normal", "sky")} className="h-bar-sm" />
              )
            }
            foot={
              !slot
                ? t("cluster_nodes.slot_unavailable")
                : t("cluster_nodes.slot_foot", {
                    throttled: slot.throttledRatio === null ? EMPTY : formatPercent(slot.throttledRatio),
                    memory:
                      slot.memoryCurrent === null
                        ? EMPTY
                        : slot.memoryLimit === null
                          ? formatBytes(slot.memoryCurrent)
                          : `${formatBytes(slot.memoryCurrent)} / ${formatBytes(slot.memoryLimit)}`,
                  })
            }
            footLevel={slot ? worstLevel(slot.cpuLevel, slot.memoryLevel) : undefined}
          />
        </MetricGrid>
      ) : (
        // 没有快照（旧版本或刚启动）：这一行写原因，后面两行留空，页脚照样对齐。
        <p className="self-center text-xs text-sn-label3">{t("cluster_nodes.no_snapshot")}</p>
      )}

      {snapshot ? (
        <StatStrip dimmed={dimmed}>
          <Stat
            label={t("cluster_nodes.stat_load")}
            value={load ? load.load1.toFixed(2) : EMPTY}
            title={
              load
                ? t("cluster_nodes.load_title", {
                    load: `${load.load1.toFixed(2)} / ${load.load5.toFixed(2)} / ${load.load15.toFixed(2)}`,
                  })
                : undefined
            }
          />
          <Stat label={t("cluster_nodes.stat_in_flight")} value={traffic ? traffic.inFlight.toLocaleString() : EMPTY} />
          <Stat
            label={t("cluster_nodes.stat_rpm")}
            value={traffic?.requestsPerMinute == null ? EMPTY : Math.round(traffic.requestsPerMinute).toLocaleString()}
          />
          <Stat
            label={t("cluster_nodes.stat_traffic")}
            value={
              traffic?.bytesInPerSecond == null || traffic.bytesOutPerSecond == null
                ? EMPTY
                : `${formatRateShort(traffic.bytesInPerSecond)} / ${formatRateShort(traffic.bytesOutPerSecond)}`
            }
            title={
              traffic?.bytesInPerSecond == null || traffic.bytesOutPerSecond == null
                ? undefined
                : t("cluster_nodes.traffic_title", {
                    in: formatRate(traffic.bytesInPerSecond),
                    out: formatRate(traffic.bytesOutPerSecond),
                  })
            }
          />
        </StatStrip>
      ) : (
        <div aria-hidden="true" />
      )}

      {snapshot ? (
        <ChipRow dimmed={dimmed}>
          <Chip testId="chip-egress" level={egress?.level}>
            {t("cluster_nodes.chip_egress", { value: egressText })}
          </Chip>
          {snapshot.db ? (
            <Chip testId="chip-db" level={roundTripLevel(snapshot.db)}>
              {t("cluster_nodes.chip_db", { value: roundTripValue(snapshot.db, t) })}
            </Chip>
          ) : null}
          {redis ? (
            <Chip testId="chip-redis" level={worstLevel(roundTripLevel(redis), sharedLevel)}>
              {shared && sharedLevel !== "normal"
                ? t(shared.configured ? "cluster_nodes.chip_shared_redis_down" : "cluster_nodes.chip_shared_redis_none")
                : t(redisLabelKey, { value: roundTripValue(redis, t) })}
            </Chip>
          ) : null}
        </ChipRow>
      ) : (
        <div aria-hidden="true" />
      )}

      <CardFooter
        meta={meta}
        onOpenDetails={snapshot ? onOpenDetails : undefined}
        detailsLabel={t("cluster_nodes.open_details", { name: node.node_id })}
      />
    </CardShell>
  );
}
