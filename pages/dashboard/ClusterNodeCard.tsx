import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowDownRight, ArrowUpRight, Server } from "lucide-react";
import { Card } from "@code-proxy/ui";
import type { ClusterNode, NodeRoundTrip } from "@code-proxy/api-client";
import { MeterBar, MetricIcon, meterTone, type UsageLevel } from "@features/monitor-widgets/monitorVisuals";
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
  Chip,
  CpuSplitBar,
  DetailGrid,
  DetailItem,
  DetailSection,
  DiskRows,
  EMPTY,
  ExpandToggle,
  HealthPill,
  IssueList,
  MetricCell,
  Tag,
  useDiskUseLabel,
} from "./ClusterCardParts";

/*
 * 一台应用节点的卡片。上半部分是 2×2 的关键指标（CPU、内存、最满的磁盘、slot 配额），下面一行负载与
 * 流量、一行依赖胶囊；其余的数（每块盘、cgroup 细节、出口计数、进程信息）点「详情」在卡片里展开。
 * 离线的节点保留最后一次的数，整体变淡，状态标签写「离线」。
 */

type T = (key: string, options?: Record<string, unknown>) => string;

function roundTripValue(rtt: NodeRoundTrip | undefined, t: T): string {
  if (!rtt) return EMPTY;
  if (rtt.error === "timeout") return t("cluster_nodes.rtt_timeout");
  if (rtt.error) return t("cluster_nodes.rtt_error");
  return rtt.rtt_ms === undefined ? EMPTY : `${rtt.rtt_ms.toFixed(1)} ms`;
}

function formatTime(iso: string | undefined): string {
  if (!iso) return EMPTY;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toLocaleString() : EMPTY;
}

export function ClusterNodeCard({ node, now }: { node: ClusterNode; now: number }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
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
  const subtitle = [version, node.advertise].filter(Boolean).join(" · ");

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

  return (
    // 每张节点卡是一个以节点 ID 命名的分组，读屏和测试都按名字找到它。
    <div role="group" aria-label={node.node_id} data-testid="cluster-node-card" className="min-w-0">
      <Card padding="compact" bodyClassName="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <MetricIcon icon={Server} hue={node.active ? "emerald" : "rose"} />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-ink">{node.node_id}</p>
                {node.leader ? <Tag>{t("cluster_nodes.leader")}</Tag> : null}
                {node.self ? <Tag>{t("cluster_nodes.self")}</Tag> : null}
              </div>
              {subtitle ? <p className="truncate text-2xs text-ink-3">{subtitle}</p> : null}
            </div>
          </div>
          <HealthPill issues={issues} />
        </div>

        {snapshot ? (
          <div className={`space-y-3 ${node.active ? "" : "opacity-60"}`}>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3">
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
                  topDisk ? (
                    <MeterBar pct={topDisk.pct} tone={meterTone(topDisk.level, "sky")} className="h-bar-sm" />
                  ) : undefined
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
                value={
                  slot?.usageCores == null ? EMPTY : t("cluster_nodes.cores", { value: formatCores(slot.usageCores) })
                }
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
            </div>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-2 tabular-nums">
              <span>
                {t("cluster_nodes.load_short", {
                  load: load ? `${load.load1.toFixed(2)} · ${load.load5.toFixed(2)} · ${load.load15.toFixed(2)}` : EMPTY,
                })}
              </span>
              <span>{t("cluster_nodes.in_flight_short", { count: traffic?.inFlight ?? 0 })}</span>
              <span>
                {t("cluster_nodes.rpm_short", {
                  value: traffic?.requestsPerMinute == null ? EMPTY : Math.round(traffic.requestsPerMinute).toLocaleString(),
                })}
              </span>
              {[
                { key: "in", icon: ArrowDownRight, rate: traffic?.bytesInPerSecond, label: "cluster_nodes.bytes_in" },
                { key: "out", icon: ArrowUpRight, rate: traffic?.bytesOutPerSecond, label: "cluster_nodes.bytes_out" },
              ].map(({ key, icon: Icon, rate, label }) => {
                const text = rate == null ? EMPTY : formatRate(rate);
                return (
                  // 箭头和数值只给眼睛看；读屏读完整的「入 / 出 …」。
                  <span key={key} className="inline-flex items-center gap-0.5">
                    <Icon size={12} aria-hidden="true" />
                    <span aria-hidden="true">{text}</span>
                    <span className="sr-only">{t(label, { rate: text })}</span>
                  </span>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-1.5">
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
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-3">{t("cluster_nodes.no_snapshot")}</p>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate text-2xs text-ink-3">
            {[
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
              .flatMap((part, index) => (index === 0 ? [part] : [" · ", part]))}
          </p>
          {snapshot ? (
            <ExpandToggle expanded={expanded} onToggle={() => setExpanded((open) => !open)} controls={detailsId} />
          ) : null}
        </div>

        {snapshot && expanded ? (
          <div id={detailsId} data-testid="node-details" className="space-y-3 pt-1">
            <IssueList issues={issues} />
            <DetailSection title={t("cluster_nodes.section_disks")}>
              <DiskRows disks={disks} />
            </DetailSection>
            <DetailSection title={t("cluster_nodes.section_cpu")}>
              <DetailGrid>
                <DetailItem label={t("cluster_nodes.cpu_busy")} value={cpu ? t("cluster_nodes.cores", { value: formatCores(cpu.busyCores) }) : EMPTY} />
                <DetailItem
                  label={t("cluster_nodes.cpu_steal")}
                  value={cpu ? t("cluster_nodes.cores", { value: formatCores(cpu.stealCores) }) : EMPTY}
                  level={cpu?.stealLevel}
                />
                <DetailItem label={t("cluster_nodes.cpu_iowait")} value={cpu ? t("cluster_nodes.cores", { value: formatCores(cpu.iowaitCores) }) : EMPTY} />
                <DetailItem label={t("cluster_nodes.cpu_idle")} value={cpu ? t("cluster_nodes.cores", { value: formatCores(cpu.idleCores) }) : EMPTY} />
                <DetailItem
                  label={t("cluster_nodes.steal_share_label")}
                  value={cpu?.stealShare == null ? EMPTY : formatPercent(cpu.stealShare)}
                  level={cpu?.stealLevel}
                />
                <DetailItem label={t("cluster_nodes.window")} value={cpu ? t("cluster_nodes.seconds", { value: Math.round(cpu.windowSeconds) }) : EMPTY} />
                <DetailItem
                  wide
                  label={t("cluster_nodes.load")}
                  value={load ? `${load.load1.toFixed(2)} / ${load.load5.toFixed(2)} / ${load.load15.toFixed(2)}` : EMPTY}
                />
              </DetailGrid>
            </DetailSection>
            <DetailSection title={t("cluster_nodes.section_slot")}>
              {slot ? (
                <DetailGrid>
                  <DetailItem wide label={t("cluster_nodes.slot_unit")} value={slot.path.split("/").pop() || slot.path} title={slot.path} />
                  <DetailItem
                    label={t("cluster_nodes.slot_quota")}
                    value={slot.quotaCores === null ? t("cluster_nodes.unlimited") : t("cluster_nodes.cores", { value: formatCores(slot.quotaCores) })}
                  />
                  <DetailItem
                    label={t("cluster_nodes.slot_usage")}
                    value={slot.usageCores === null ? EMPTY : t("cluster_nodes.cores", { value: formatCores(slot.usageCores) })}
                  />
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
            <DetailSection title={t("cluster_nodes.section_traffic")}>
              <DetailGrid>
                <DetailItem label={t("cluster_nodes.in_flight")} value={traffic ? String(traffic.inFlight) : EMPTY} />
                <DetailItem
                  label={t("cluster_nodes.window")}
                  value={t("cluster_nodes.seconds", { value: Math.round(snapshot.traffic.window_seconds) })}
                />
                <DetailItem label={t("cluster_nodes.requests")} value={snapshot.traffic.requests.toLocaleString()} />
                <DetailItem
                  label={t("cluster_nodes.requests_per_minute")}
                  value={traffic?.requestsPerMinute == null ? EMPTY : Math.round(traffic.requestsPerMinute).toLocaleString()}
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
                  <DetailItem label={t("cluster_nodes.egress_open_count")} value={String(snapshot.egress.breaker_open)} level={egress?.state === "open" ? "critical" : undefined} />
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
                  label={t(redis?.role === "cluster" ? "cluster_nodes.redis_cluster" : redis?.role === "usage" ? "cluster_nodes.redis_usage" : "cluster_nodes.redis")}
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
                  label={t("cluster_nodes.snapshot_at")}
                  value={snapshotAge === null ? EMPTY : t("cluster_nodes.ago", { age: formatAge(snapshotAge) })}
                  level={stale ? "warn" : undefined}
                />
              </DetailGrid>
            </DetailSection>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
