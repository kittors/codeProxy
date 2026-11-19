import { useTranslation } from "react-i18next";
import { MeterBar, meterTone } from "@features/monitor-widgets/monitorVisuals";
import { formatBytes } from "./systemFormat";
import { databaseHostMachine, formatHitRatio, type DatabaseView } from "./clusterDatabaseView";
import { formatAge, formatCores, formatPercent } from "./clusterNodeView";
import { Chip, CpuSplitBar, EMPTY } from "./ClusterCardParts";
import { DetailGrid, DetailItem, DetailSection, DiskRows, IssueList } from "./ClusterDetailParts";
import { formatTime, formatXid, uptimeSeconds } from "./clusterFormat";

/*
 * 详情抽屉里数据库的全部数：需要注意、连接、事务与锁、近 5 分钟的速率、存储、每个复制槽、每条复制
 * 连接、数据库主机（clirelay-hostagent 上报的 CPU、内存、负载、磁盘）、服务本身。
 */

export function ClusterDatabaseDetails({ view, now }: { view: DatabaseView; now: number }) {
  const { t } = useTranslation();
  const { db, connections, host } = view;
  const { cpu: hostCpu, memory: hostMemory } = databaseHostMachine(host);
  const activity = db.activity;
  const walBytes = db.wal?.bytes;
  const maxSlotKeep = db.wal?.max_slot_keep_bytes;
  const uptime = uptimeSeconds(db.started_at, now);
  const hostLoad = host?.host.snapshot?.host?.load;

  return (
    <div className="space-y-6">
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
        title={db.window ? t("cluster_nodes.section_rates", { window: formatAge(db.window.seconds) }) : t("cluster_nodes.section_rates_pending")}
      >
        {db.window ? (
          <DetailGrid>
            <DetailItem
              label={t("cluster_nodes.commits")}
              value={view.commitsPerSecond === null ? EMPTY : t("cluster_nodes.tps", { value: view.commitsPerSecond.toFixed(1) })}
            />
            <DetailItem
              label={t("cluster_nodes.rollbacks")}
              value={view.rollbackRatio === null ? db.window.rollbacks.toLocaleString() : formatPercent(view.rollbackRatio)}
            />
            <DetailItem
              label={t("cluster_nodes.cache_hit")}
              value={view.cacheHitRatio === null ? EMPTY : formatHitRatio(view.cacheHitRatio)}
              level={view.cacheLevel}
            />
            <DetailItem label={t("cluster_nodes.blocks_read")} value={db.window.blocks_read.toLocaleString()} />
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
          <DetailItem label="max_wal_size" value={db.wal?.max_wal_size_bytes ? formatBytes(db.wal.max_wal_size_bytes) : EMPTY} />
          <DetailItem
            label={t("cluster_nodes.max_slot_keep")}
            value={maxSlotKeep === undefined ? EMPTY : maxSlotKeep < 0 ? t("cluster_nodes.unlimited") : formatBytes(maxSlotKeep)}
          />
          <DetailItem wide label={t("cluster_nodes.xid_age")} value={`${db.xid_age.toLocaleString()} (${formatXid(db.xid_age)})`} level={view.xidLevel} />
        </DetailGrid>
      </DetailSection>

      <DetailSection title={t("cluster_nodes.section_slots")}>
        {view.slots.length === 0 ? (
          <p className="text-xs text-ink-3">{t("cluster_nodes.no_slots")}</p>
        ) : (
          <ul className="space-y-3">
            {view.slots.map((slot) => (
              <li key={slot.name} data-testid="slot-row" data-level={slot.level} className="space-y-1.5">
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
          <ul className="space-y-3">
            {view.replicas.map((replica, index) => (
              <li key={`${replica.name}-${index}`} className="space-y-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-mono text-xs font-semibold text-ink">{replica.name}</span>
                  <Chip level={replica.level}>{[replica.state, replica.syncState].filter(Boolean).join(" · ")}</Chip>
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
                    value={replica.replyAgeSeconds === null ? EMPTY : t("cluster_nodes.ago", { age: formatAge(replica.replyAgeSeconds) })}
                    level={replica.level}
                  />
                </DetailGrid>
              </li>
            ))}
          </ul>
        )}
      </DetailSection>

      <DetailSection
        title={t("cluster_nodes.section_host")}
        aside={host ? t("cluster_nodes.host_reported", { host: host.host.host_id, age: formatAge(host.ageSeconds) }) : undefined}
      >
        {host ? (
          <div className="space-y-3">
            {hostCpu ? (
              <div className="space-y-1.5">
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
                value={hostLoad ? `${hostLoad.load1.toFixed(2)} / ${hostLoad.load5.toFixed(2)} / ${hostLoad.load15.toFixed(2)}` : EMPTY}
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
          <DetailItem label={t("cluster_nodes.uptime_label")} value={uptime === null ? EMPTY : formatAge(uptime)} />
          <DetailItem
            label={t("cluster_nodes.in_recovery")}
            value={t(db.in_recovery ? "cluster_nodes.yes" : "cluster_nodes.no")}
            level={db.in_recovery ? "critical" : undefined}
          />
          <DetailItem label={t("cluster_nodes.queried_by")} value={view.leaderId} />
          <DetailItem
            label={t("cluster_nodes.queried_at")}
            value={view.ageSeconds === null ? EMPTY : t("cluster_nodes.ago", { age: formatAge(view.ageSeconds) })}
            level={view.stale ? "warn" : undefined}
          />
          {db.last_ok_at ? <DetailItem wide label={t("cluster_nodes.last_ok_at")} value={formatTime(db.last_ok_at)} /> : null}
        </DetailGrid>
      </DetailSection>
    </div>
  );
}
