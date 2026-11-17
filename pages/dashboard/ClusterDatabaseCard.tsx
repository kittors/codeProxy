import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { Database } from "lucide-react";
import { Card } from "@code-proxy/ui";
import { MeterBar, MetricIcon, meterTone, type UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import { formatBytes } from "./systemFormat";
import { formatFillTime } from "./clusterDiskView";
import { databaseHostMachine, formatHitRatio, type DatabaseView } from "./clusterDatabaseView";
import { formatAge, formatCores, formatPercent, worstLevel } from "./clusterNodeView";
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
} from "./ClusterCardParts";

/*
 * 数据库卡片，和节点卡片并排、结构相同：2×2 关键指标（连接、数据库主机磁盘、WAL 与复制槽、事务与缓存命中），
 * 一行状态胶囊，其余在「详情」里。库的数据来自主节点快照（每 30 秒），主机的数据来自 clirelay-hostagent；
 * 主机没有上报时磁盘那一格说明怎么接入，库的部分照常显示。
 */

function formatTime(iso: string | undefined): string {
  if (!iso) return EMPTY;
  const at = Date.parse(iso);
  return Number.isFinite(at) ? new Date(at).toLocaleString() : EMPTY;
}

function formatCount(value: number): string {
  return value.toLocaleString();
}

/** 事务 ID 年龄的简短写法：84,510 → 85K，5 亿 → 500M。 */
function formatXid(age: number): string {
  if (age >= 1_000_000) return `${Math.round(age / 1_000_000)}M`;
  if (age >= 1_000) return `${Math.round(age / 1_000)}K`;
  return String(age);
}

export function ClusterDatabaseCard({ view, now }: { view: DatabaseView; now: number }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const detailsId = useId();
  const { db, connections, host } = view;
  const hostDisk = host?.disks[0] ?? null;
  const { cpu: hostCpu, memory: hostMemory } = databaseHostMachine(host);

  // WAL 那一格：主槽（保留最多的那个）占 max_slot_wal_keep_size 的比例画成条。
  const mainSlot = [...view.slots].sort((a, b) => (b.retainedBytes ?? 0) - (a.retainedBytes ?? 0))[0] ?? null;
  const slotsLevel = worstLevel(...view.slots.map((slot) => slot.level));
  const walCellLevel = worstLevel(view.walLevel, slotsLevel);
  const walBytes = db.wal?.bytes;
  const maxSlotKeep = db.wal?.max_slot_keep_bytes;

  const activity = db.activity;
  const transactionChipLevel = worstLevel(view.transactionLevel, view.idleTransactionLevel);
  const longestTx = activity
    ? Math.max(activity.longest_transaction_seconds, activity.longest_idle_in_transaction_seconds)
    : null;

  const subtitle = [
    db.version ? `PostgreSQL ${db.version}` : "PostgreSQL",
    t("cluster_nodes.db_size_short", { size: formatBytes(db.size_bytes) }),
    db.started_at ? t("cluster_nodes.footer_uptime", { uptime: formatAge(Math.max(0, (now - Date.parse(db.started_at)) / 1000)) }) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const queriedAge = view.ageSeconds === null ? EMPTY : formatAge(view.ageSeconds);
  const footer = db.error
    ? t("cluster_nodes.database_query_failed", {
        error: t(db.error === "timeout" ? "cluster_nodes.rtt_timeout" : "cluster_nodes.rtt_error"),
        age: db.last_ok_at ? formatAge(Math.max(0, (now - Date.parse(db.last_ok_at)) / 1000)) : EMPTY,
      })
    : t("cluster_nodes.database_queried_by", { node: view.leaderId, age: queriedAge });
  const footerLevel: UsageLevel = db.error ? "critical" : view.stale ? "warn" : "normal";

  return (
    <div role="group" aria-label={t("cluster_nodes.database_title")} data-testid="cluster-database-card" className="min-w-0">
      <Card padding="compact" bodyClassName="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <MetricIcon icon={Database} hue="sky" />
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-ink">{t("cluster_nodes.database_title")}</p>
                {host ? <Tag>{host.host.host_id}</Tag> : null}
              </div>
              <p className="truncate text-2xs text-ink-3">{subtitle}</p>
            </div>
          </div>
          <HealthPill issues={view.issues} />
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-3">
          <MetricCell
            testId="db-connections"
            label={t("cluster_nodes.connections")}
            aside={connections ? `${Math.round(connections.pct)}%` : undefined}
            level={connections?.level}
            value={connections ? `${connections.client} / ${connections.max}` : EMPTY}
            bar={
              connections ? (
                <MeterBar pct={connections.pct} tone={meterTone(connections.level, "sky")} className="h-bar-sm" />
              ) : undefined
            }
            foot={
              db.connections
                ? t("cluster_nodes.connections_foot", {
                    active: db.connections.active,
                    idle: db.connections.idle,
                    idleTx: db.connections.idle_in_transaction,
                  })
                : undefined
            }
          />
          <MetricCell
            testId="db-host-disk"
            label={
              hostDisk ? t("cluster_nodes.host_disk_cell", { mount: hostDisk.mount }) : t("cluster_nodes.host_disk")
            }
            aside={hostDisk ? `${Math.round(hostDisk.pct)}%` : undefined}
            level={hostDisk?.level}
            value={
              hostDisk
                ? t("cluster_nodes.disk_available", { size: formatBytes(hostDisk.availableBytes) })
                : t("cluster_nodes.host_disk_none")
            }
            bar={
              hostDisk ? <MeterBar pct={hostDisk.pct} tone={meterTone(hostDisk.level, "sky")} className="h-bar-sm" /> : undefined
            }
            foot={
              !host
                ? t("cluster_nodes.host_disk_none_foot")
                : !hostDisk
                  ? t("cluster_nodes.disks_unavailable")
                  : hostDisk.concern === "fill" && hostDisk.fillSeconds !== null
                    ? t("cluster_nodes.disk_fill", { time: formatFillTime(hostDisk.fillSeconds) ?? EMPTY })
                    : `${formatBytes(hostDisk.usedBytes)} / ${formatBytes(hostDisk.totalBytes)}`
            }
            footLevel={hostDisk && hostDisk.concern && hostDisk.concern !== "space" ? hostDisk.level : undefined}
          />
          <MetricCell
            testId="db-wal"
            label={t("cluster_nodes.wal")}
            level={walCellLevel}
            value={walBytes === undefined ? EMPTY : formatBytes(walBytes)}
            bar={
              mainSlot?.keepRatio == null ? undefined : (
                <MeterBar pct={mainSlot.keepRatio * 100} tone={meterTone(mainSlot.level, "indigo")} className="h-bar-sm" />
              )
            }
            foot={
              !mainSlot
                ? t("cluster_nodes.wal_foot_no_slot")
                : maxSlotKeep !== undefined && maxSlotKeep > 0
                  ? t("cluster_nodes.wal_foot_slot_limit", {
                      size: mainSlot.retainedBytes === null ? EMPTY : formatBytes(mainSlot.retainedBytes),
                      limit: formatBytes(maxSlotKeep),
                    })
                  : t("cluster_nodes.wal_foot_slot", {
                      size: mainSlot.retainedBytes === null ? EMPTY : formatBytes(mainSlot.retainedBytes),
                    })
            }
            footTitle={mainSlot?.name}
            footLevel={slotsLevel}
          />
          <MetricCell
            testId="db-throughput"
            label={t("cluster_nodes.cache_hit")}
            aside={
              view.commitsPerSecond === null ? undefined : t("cluster_nodes.tps", { value: view.commitsPerSecond.toFixed(1) })
            }
            level={view.cacheLevel}
            value={view.cacheHitRatio === null ? EMPTY : formatHitRatio(view.cacheHitRatio)}
            bar={
              view.cacheHitRatio === null ? undefined : (
                <MeterBar pct={view.cacheHitRatio * 100} tone={meterTone(view.cacheLevel, "emerald")} className="h-bar-sm" />
              )
            }
            foot={
              db.window
                ? t("cluster_nodes.throughput_foot", {
                    rollback: view.rollbackRatio === null ? EMPTY : formatPercent(view.rollbackRatio),
                    deadlocks: db.window.deadlocks,
                  })
                : t("cluster_nodes.window_pending")
            }
            footLevel={db.window && db.window.deadlocks > 0 ? "warn" : undefined}
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {view.replicas.map((replica) => (
            <Chip key={`${replica.name}-${replica.state}`} testId="chip-replica" level={replica.level}>
              {t("cluster_nodes.chip_replica", { name: replica.name, state: replica.state })}
            </Chip>
          ))}
          {activity ? (
            <Chip testId="chip-transactions" level={transactionChipLevel}>
              {t("cluster_nodes.chip_longest_tx", { age: formatAge(longestTx ?? 0) })}
            </Chip>
          ) : null}
          {activity ? (
            <Chip testId="chip-locks" level={view.lockLevel}>
              {t("cluster_nodes.chip_lock_waits", { count: activity.lock_waits })}
            </Chip>
          ) : null}
          <Chip testId="chip-xid" level={view.xidLevel}>
            {t("cluster_nodes.chip_xid", { age: formatXid(db.xid_age) })}
          </Chip>
        </div>

        <div className="flex items-center justify-between gap-2">
          <p
            className={`min-w-0 truncate text-2xs ${
              footerLevel === "critical"
                ? "font-semibold text-rose-600 dark:text-rose-300"
                : footerLevel === "warn"
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-ink-3"
            }`}
          >
            {footer}
          </p>
          <ExpandToggle expanded={expanded} onToggle={() => setExpanded((open) => !open)} controls={detailsId} />
        </div>

        {expanded ? (
          <div id={detailsId} data-testid="database-details" className="space-y-3 pt-1">
            <IssueList issues={view.issues} />
            <DetailSection title={t("cluster_nodes.section_connections")}>
              {db.connections ? (
                <DetailGrid>
                  <DetailItem
                    wide
                    label={t("cluster_nodes.client_connections")}
                    value={t("cluster_nodes.connections_value", {
                      client: db.connections.client,
                      max: db.connections.max,
                      reserved: db.connections.reserved,
                    })}
                    level={connections?.level}
                  />
                  <DetailItem label={t("cluster_nodes.active")} value={String(db.connections.active)} />
                  <DetailItem label={t("cluster_nodes.idle")} value={String(db.connections.idle)} />
                  <DetailItem label={t("cluster_nodes.idle_in_transaction")} value={String(db.connections.idle_in_transaction)} />
                  <DetailItem label={t("cluster_nodes.wal_senders")} value={String(db.connections.wal_senders)} />
                </DetailGrid>
              ) : (
                <p className="text-xs text-ink-3">{t("cluster_nodes.not_readable")}</p>
              )}
            </DetailSection>
            <DetailSection title={t("cluster_nodes.section_transactions")}>
              {activity ? (
                <DetailGrid>
                  <DetailItem
                    label={t("cluster_nodes.longest_transaction")}
                    value={formatAge(activity.longest_transaction_seconds)}
                    level={view.transactionLevel}
                  />
                  <DetailItem label={t("cluster_nodes.long_transactions")} value={String(activity.long_transactions)} />
                  <DetailItem
                    label={t("cluster_nodes.longest_idle_transaction")}
                    value={formatAge(activity.longest_idle_in_transaction_seconds)}
                    level={view.idleTransactionLevel}
                  />
                  <DetailItem label={t("cluster_nodes.lock_waits")} value={String(activity.lock_waits)} level={view.lockLevel} />
                  <DetailItem
                    wide
                    label={t("cluster_nodes.longest_lock_wait")}
                    value={activity.lock_waits > 0 ? formatAge(activity.longest_lock_wait_seconds) : EMPTY}
                    level={view.lockLevel}
                  />
                </DetailGrid>
              ) : (
                <p className="text-xs text-ink-3">{t("cluster_nodes.not_readable")}</p>
              )}
            </DetailSection>
            <DetailSection
              title={
                db.window
                  ? t("cluster_nodes.section_rates", { window: formatAge(db.window.seconds) })
                  : t("cluster_nodes.section_rates_pending")
              }
            >
              {db.window ? (
                <DetailGrid>
                  <DetailItem
                    label={t("cluster_nodes.commits")}
                    value={view.commitsPerSecond === null ? EMPTY : t("cluster_nodes.tps", { value: view.commitsPerSecond.toFixed(1) })}
                  />
                  <DetailItem
                    label={t("cluster_nodes.rollbacks")}
                    value={view.rollbackRatio === null ? formatCount(db.window.rollbacks) : formatPercent(view.rollbackRatio)}
                  />
                  <DetailItem
                    label={t("cluster_nodes.cache_hit")}
                    value={view.cacheHitRatio === null ? EMPTY : formatHitRatio(view.cacheHitRatio)}
                    level={view.cacheLevel}
                  />
                  <DetailItem label={t("cluster_nodes.blocks_read")} value={formatCount(db.window.blocks_read)} />
                  <DetailItem
                    label={t("cluster_nodes.deadlocks")}
                    value={String(db.window.deadlocks)}
                    level={db.window.deadlocks > 0 ? "warn" : undefined}
                  />
                  <DetailItem label={t("cluster_nodes.temp_bytes")} value={formatBytes(db.window.temp_bytes)} />
                </DetailGrid>
              ) : (
                <p className="text-xs text-ink-3">{t("cluster_nodes.window_pending")}</p>
              )}
            </DetailSection>
            <DetailSection title={t("cluster_nodes.section_storage")}>
              <DetailGrid>
                <DetailItem label={t("cluster_nodes.db_size")} value={formatBytes(db.size_bytes)} />
                <DetailItem
                  label={t("cluster_nodes.wal_dir")}
                  value={
                    walBytes === undefined
                      ? t("cluster_nodes.not_readable")
                      : t("cluster_nodes.wal_dir_value", { size: formatBytes(walBytes), count: db.wal?.files ?? 0 })
                  }
                  level={view.walLevel}
                />
                <DetailItem
                  label="max_wal_size"
                  value={db.wal?.max_wal_size_bytes ? formatBytes(db.wal.max_wal_size_bytes) : EMPTY}
                />
                <DetailItem
                  label={t("cluster_nodes.max_slot_keep")}
                  value={
                    maxSlotKeep === undefined
                      ? EMPTY
                      : maxSlotKeep < 0
                        ? t("cluster_nodes.unlimited")
                        : formatBytes(maxSlotKeep)
                  }
                />
                <DetailItem
                  wide
                  label={t("cluster_nodes.xid_age")}
                  value={formatCount(db.xid_age)}
                  level={view.xidLevel}
                />
              </DetailGrid>
            </DetailSection>
            <DetailSection title={t("cluster_nodes.section_slots")}>
              {view.slots.length === 0 ? (
                <p className="text-xs text-ink-3">{t("cluster_nodes.no_slots")}</p>
              ) : (
                <ul className="space-y-2">
                  {view.slots.map((slot) => (
                    <li key={slot.name} data-testid="slot-row" data-level={slot.level} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-mono text-xs font-semibold text-ink">{slot.name}</span>
                        <Chip level={slot.level}>
                          {[slot.active ? t("cluster_nodes.slot_active") : t("cluster_nodes.slot_inactive"), slot.walStatus]
                            .filter(Boolean)
                            .join(" · ")}
                        </Chip>
                      </div>
                      {slot.keepRatio !== null ? (
                        <MeterBar pct={slot.keepRatio * 100} tone={meterTone(slot.level, "indigo")} className="h-bar-sm" />
                      ) : null}
                      <DetailGrid>
                        <DetailItem label={t("cluster_nodes.slot_type")} value={slot.type || EMPTY} />
                        <DetailItem
                          label={t("cluster_nodes.retained")}
                          value={slot.retainedBytes === null ? EMPTY : formatBytes(slot.retainedBytes)}
                          level={slot.level}
                        />
                        <DetailItem
                          wide
                          label={t("cluster_nodes.safe_wal_size")}
                          value={slot.safeBytes === null ? t("cluster_nodes.unlimited") : formatBytes(slot.safeBytes)}
                        />
                      </DetailGrid>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
            <DetailSection title={t("cluster_nodes.section_replication")}>
              {view.replicas.length === 0 ? (
                <p className="text-xs text-ink-3">{t("cluster_nodes.no_replicas")}</p>
              ) : (
                <ul className="space-y-2">
                  {view.replicas.map((replica, index) => (
                    <li key={`${replica.name}-${index}`} className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate font-mono text-xs font-semibold text-ink">{replica.name}</span>
                        <Chip level={replica.level}>
                          {[replica.state, replica.syncState].filter(Boolean).join(" · ")}
                        </Chip>
                      </div>
                      <DetailGrid>
                        <DetailItem
                          label={t("cluster_nodes.sent_lag")}
                          value={replica.sentLagBytes === null ? EMPTY : formatBytes(replica.sentLagBytes)}
                        />
                        <DetailItem
                          label={t("cluster_nodes.flush_lag")}
                          value={replica.flushLagBytes === null ? EMPTY : formatBytes(replica.flushLagBytes)}
                        />
                        <DetailItem
                          wide
                          label={t("cluster_nodes.reply_age")}
                          value={
                            replica.replyAgeSeconds === null
                              ? EMPTY
                              : t("cluster_nodes.ago", { age: formatAge(replica.replyAgeSeconds) })
                          }
                          level={replica.level}
                        />
                      </DetailGrid>
                    </li>
                  ))}
                </ul>
              )}
            </DetailSection>
            <DetailSection title={t("cluster_nodes.section_host")}>
              {host ? (
                <div className="space-y-2.5">
                  <p className={`text-2xs ${host.stale ? "text-amber-700 dark:text-amber-300" : "text-ink-3"}`}>
                    {t("cluster_nodes.host_reported", { host: host.host.host_id, age: formatAge(host.ageSeconds) })}
                  </p>
                  {hostCpu ? (
                    <div className="space-y-1">
                      <div className="flex items-baseline justify-between gap-2 text-xs">
                        <span className="text-ink-3">{t("cluster_nodes.cpu_with_cores", { count: hostCpu.cpus })}</span>
                        <span className="tabular-nums text-ink-2">
                          {t("cluster_nodes.host_cpu_value", {
                            busy: formatCores(hostCpu.busyCores),
                            steal: formatCores(hostCpu.stealCores),
                          })}
                        </span>
                      </div>
                      <CpuSplitBar cpu={hostCpu} />
                    </div>
                  ) : null}
                  <DetailGrid>
                    <DetailItem
                      label={t("cluster_nodes.memory")}
                      value={hostMemory ? `${formatBytes(hostMemory.usedBytes)} / ${formatBytes(hostMemory.totalBytes)}` : EMPTY}
                      level={hostMemory?.level}
                    />
                    <DetailItem
                      label={t("cluster_nodes.load_label")}
                      value={
                        host.host.snapshot?.host?.load
                          ? `${host.host.snapshot.host.load.load1.toFixed(2)} / ${host.host.snapshot.host.load.load5.toFixed(2)} / ${host.host.snapshot.host.load.load15.toFixed(2)}`
                          : EMPTY
                      }
                    />
                  </DetailGrid>
                  <DiskRows disks={host.disks} />
                </div>
              ) : (
                <p className="text-xs text-ink-3">{t("cluster_nodes.host_none")}</p>
              )}
            </DetailSection>
            <DetailSection title={t("cluster_nodes.section_server")}>
              <DetailGrid>
                <DetailItem wide label={t("cluster_nodes.version")} value={db.version ? `PostgreSQL ${db.version}` : EMPTY} />
                <DetailItem wide label={t("cluster_nodes.started_at")} value={formatTime(db.started_at)} />
                <DetailItem
                  label={t("cluster_nodes.in_recovery")}
                  value={t(db.in_recovery ? "cluster_nodes.yes" : "cluster_nodes.no")}
                  level={db.in_recovery ? "critical" : undefined}
                />
                <DetailItem label={t("cluster_nodes.queried_by")} value={view.leaderId} />
                <DetailItem
                  wide
                  label={t("cluster_nodes.queried_at")}
                  value={formatTime(db.collected_at)}
                  level={view.stale ? "warn" : undefined}
                />
                {db.last_ok_at ? (
                  <DetailItem wide label={t("cluster_nodes.last_ok_at")} value={formatTime(db.last_ok_at)} />
                ) : null}
              </DetailGrid>
            </DetailSection>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
