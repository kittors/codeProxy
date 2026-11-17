import { useTranslation } from "react-i18next";
import { Database } from "lucide-react";
import { MeterBar, meterTone, type UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import { formatBytes } from "./systemFormat";
import { formatFillTime } from "./clusterDiskView";
import { formatHitRatio, type DatabaseView } from "./clusterDatabaseView";
import { formatAge, formatPercent, worstLevel } from "./clusterNodeView";
import { formatXid, uptimeSeconds } from "./clusterFormat";
import {
  CardFooter,
  CardHeader,
  CardShell,
  Chip,
  ChipRow,
  EMPTY,
  MetricCell,
  MetricGrid,
  Stat,
  StatStrip,
  Tag,
} from "./ClusterCardParts";

/*
 * 数据库卡片，和节点卡片同一套五行骨架：标题、2×2 指标（连接、数据库主机磁盘、WAL 与归档槽、缓存
 * 命中）、四格数字条（库大小、每秒事务、事务 ID 年龄、主机负载）、复制与事务胶囊、页脚。库的数据来自主节点快照
 * （每 30 秒），主机的数据来自 clirelay-hostagent；主机没有上报时磁盘那一格说明怎么接入。
 */

export function ClusterDatabaseCard({
  view,
  now,
  onOpenDetails,
}: {
  view: DatabaseView;
  now: number;
  onOpenDetails: () => void;
}) {
  const { t } = useTranslation();
  const { db, connections, host } = view;
  const hostDisk = host?.disks[0] ?? null;
  const hostLoad = host?.host.snapshot?.host?.load;

  // WAL 那一格：保留最多的那个复制槽占 max_slot_wal_keep_size 的比例画成条。
  const mainSlot = [...view.slots].sort((a, b) => (b.retainedBytes ?? 0) - (a.retainedBytes ?? 0))[0] ?? null;
  const slotsLevel = worstLevel(...view.slots.map((slot) => slot.level));
  const walBytes = db.wal?.bytes;
  const maxSlotKeep = db.wal?.max_slot_keep_bytes;

  const activity = db.activity;
  const longestTx = activity
    ? Math.max(activity.longest_transaction_seconds, activity.longest_idle_in_transaction_seconds)
    : null;

  const uptime = uptimeSeconds(db.started_at, now);
  const lastOkAge = db.last_ok_at ? uptimeSeconds(db.last_ok_at, now) : null;
  const metaLevel: UsageLevel = db.error ? "critical" : view.stale ? "warn" : "normal";
  const queried = db.error
    ? t("cluster_nodes.database_query_failed", {
        error: t(db.error === "timeout" ? "cluster_nodes.rtt_timeout" : "cluster_nodes.rtt_error"),
        age: lastOkAge === null ? EMPTY : formatAge(lastOkAge),
      })
    : t("cluster_nodes.database_queried", { age: view.ageSeconds === null ? EMPTY : formatAge(view.ageSeconds) });
  const meta = [
    uptime === null ? null : t("cluster_nodes.footer_uptime", { uptime: formatAge(uptime) }),
    <span
      key="queried"
      className={
        metaLevel === "critical"
          ? "font-semibold text-rose-600 dark:text-rose-300"
          : metaLevel === "warn"
            ? "text-amber-700 dark:text-amber-300"
            : undefined
      }
    >
      {queried}
    </span>,
  ]
    .filter(Boolean)
    .flatMap((part, index) => (index === 0 ? [part] : [" · ", part]));

  return (
    <CardShell label={t("cluster_nodes.database_title")} testId="cluster-database-card">
      <CardHeader
        icon={Database}
        hue="sky"
        title={t("cluster_nodes.database_title")}
        tags={host ? <Tag>{host.host.host_id}</Tag> : null}
        subtitle={[
          db.version ? `PostgreSQL ${db.version}` : "PostgreSQL",
          t("cluster_nodes.database_leader", { node: view.leaderId }),
        ].join(" · ")}
        issues={view.issues}
      />

      <MetricGrid>
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
          label={hostDisk ? t("cluster_nodes.host_disk_cell", { mount: hostDisk.mount }) : t("cluster_nodes.host_disk")}
          aside={hostDisk ? `${Math.round(hostDisk.pct)}%` : undefined}
          level={hostDisk?.level}
          value={
            hostDisk
              ? t("cluster_nodes.disk_available", { size: formatBytes(hostDisk.availableBytes) })
              : t("cluster_nodes.host_disk_none")
          }
          bar={hostDisk ? <MeterBar pct={hostDisk.pct} tone={meterTone(hostDisk.level, "sky")} className="h-bar-sm" /> : undefined}
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
          level={worstLevel(view.walLevel, slotsLevel)}
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
          level={view.cacheLevel}
          value={view.cacheHitRatio === null ? EMPTY : formatHitRatio(view.cacheHitRatio)}
          bar={
            view.cacheHitRatio === null ? undefined : (
              <MeterBar pct={view.cacheHitRatio * 100} tone={meterTone(view.cacheLevel, "emerald")} className="h-bar-sm" />
            )
          }
          foot={
            db.window
              ? t("cluster_nodes.rollback_foot", {
                  rollback: view.rollbackRatio === null ? EMPTY : formatPercent(view.rollbackRatio),
                  deadlocks: db.window.deadlocks,
                })
              : t("cluster_nodes.window_pending")
          }
          footLevel={db.window && db.window.deadlocks > 0 ? "warn" : undefined}
        />
      </MetricGrid>

      <StatStrip>
        <Stat label={t("cluster_nodes.stat_db_size")} value={formatBytes(db.size_bytes)} />
        <Stat
          label={t("cluster_nodes.stat_tps")}
          value={view.commitsPerSecond === null ? EMPTY : view.commitsPerSecond.toFixed(1)}
        />
        <Stat
          label={t("cluster_nodes.stat_xid")}
          value={formatXid(db.xid_age)}
          level={view.xidLevel}
          title={t("cluster_nodes.xid_title", { age: db.xid_age.toLocaleString() })}
        />
        <Stat
          label={t("cluster_nodes.stat_host_load")}
          value={hostLoad ? hostLoad.load1.toFixed(2) : EMPTY}
          title={
            hostLoad
              ? t("cluster_nodes.load_title", {
                  load: `${hostLoad.load1.toFixed(2)} / ${hostLoad.load5.toFixed(2)} / ${hostLoad.load15.toFixed(2)}`,
                })
              : undefined
          }
        />
      </StatStrip>

      <ChipRow>
        {view.replicas.map((replica, index) => (
          <Chip key={`${replica.name}-${index}`} testId="chip-replica" level={replica.level}>
            {t("cluster_nodes.chip_replica", { name: replica.name, state: replica.state })}
          </Chip>
        ))}
        {activity ? (
          <Chip testId="chip-transactions" level={worstLevel(view.transactionLevel, view.idleTransactionLevel)}>
            {t("cluster_nodes.chip_longest_tx", { age: formatAge(longestTx ?? 0) })}
          </Chip>
        ) : null}
        {activity ? (
          <Chip testId="chip-locks" level={view.lockLevel}>
            {t("cluster_nodes.chip_lock_waits", { count: activity.lock_waits })}
          </Chip>
        ) : null}
      </ChipRow>

      <CardFooter
        meta={meta}
        onOpenDetails={onOpenDetails}
        detailsLabel={t("cluster_nodes.open_details", { name: t("cluster_nodes.database_title") })}
      />
    </CardShell>
  );
}
