import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowDownRight,
  ArrowUpRight,
  Cpu,
  Gauge,
  Globe,
  Layers,
  Server,
  type LucideIcon,
} from "lucide-react";
import { Card, HoverTooltip } from "@code-proxy/ui";
import { useConfigCapabilities } from "@features/backend-capabilities";
import type { ClusterNode, NodeRoundTrip } from "@code-proxy/api-client";
import {
  LevelDot,
  LevelPill,
  MeterBar,
  MetricIcon,
  USAGE_LEVEL_LABEL_KEY,
  meterTone,
  type MonitorHue,
  type UsageLevel,
} from "@features/monitor-widgets/monitorVisuals";
import { useClusterNodes } from "./useClusterNodes";
import { formatBytes, formatRate } from "./systemFormat";
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
  type NodeCpuView,
} from "./clusterNodeView";

/*
 * 「服务器节点」：每台应用节点一张卡片，数据来自 GET /cluster 里各节点随心跳上报的资源快照。
 * 后端在 GET /config 的 capabilities 里声明了 node-metrics 才出现、才请求；旧版本整块不出现。
 *
 * 结构与上面的系统监控一致：分区标题 + 网格，网格里每张卡就是一层，卡里不再套淡底块。
 * CPU 的执行与 steal 用一根堆叠条分开画：超卖的宿主机上进程看着忙，其实多半在等宿主机。
 */

const EMPTY = "—";

function Label({
  icon,
  hue,
  children,
}: {
  icon: LucideIcon;
  hue: MonitorHue;
  children: ReactNode;
}) {
  return (
    <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-ink-2">
      <MetricIcon icon={icon} hue={hue} />
      <span className="truncate">{children}</span>
    </span>
  );
}

/** 一行「标签 … 数值」。 */
function Line({ label, value, level }: { label: string; value: string; level?: UsageLevel }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="truncate text-xs text-ink-3">{label}</span>
      <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold tabular-nums text-ink">
        {value}
        {level && level !== "normal" ? (
          <LevelDot level={level} label={t(USAGE_LEVEL_LABEL_KEY[level])} />
        ) : null}
      </span>
    </div>
  );
}

/** 小标签：主节点、当前节点。中性灰，不和在线状态抢颜色。 */
function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-2xs font-semibold text-ink-2 dark:bg-white/[0.07]">
      {children}
    </span>
  );
}

/**
 * 整机 CPU 的堆叠条：左段执行，右段 steal，其余空闲。告警档只给 steal 段换色时不够醒目，
 * 所以整根条的底槽仍按 CPU 的分类色走，steal 段固定琥珀色。
 */
function CpuSplitBar({ cpu }: { cpu: NodeCpuView }) {
  const { t } = useTranslation();
  const busy = Math.min(Math.max(cpu.busyPct, 0), 100);
  const steal = Math.min(Math.max(cpu.stealPct, 0), 100 - busy);
  const tone = meterTone("normal", "sky");
  return (
    <div
      role="img"
      aria-label={t("cluster_nodes.cpu_bar_label", {
        busy: formatCores(cpu.busyCores),
        steal: formatCores(cpu.stealCores),
        cpus: cpu.cpus,
      })}
      className={`relative h-bar w-full overflow-hidden rounded-full ${tone.track}`}
    >
      {busy > 0 ? (
        <div
          data-testid="node-cpu-busy"
          className={`absolute inset-y-0 left-0 ${tone.bar} transition-[width] duration-700 ease-pop motion-reduce:transition-none`}
          style={{ width: `${busy}%` }}
        />
      ) : null}
      {steal > 0 ? (
        <div
          data-testid="node-cpu-steal"
          className="absolute inset-y-0 bg-amber-500 transition-[left,width] duration-700 ease-pop motion-reduce:transition-none dark:bg-amber-400 colorful:bg-gradient-to-r colorful:from-amber-300 colorful:to-orange-500"
          style={{ left: `${busy}%`, width: `${steal}%` }}
        />
      ) : null}
    </div>
  );
}

function CpuBlock({ cpu }: { cpu: NodeCpuView | null }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <HoverTooltip content={t("cluster_nodes.cpu_hint")} placement="top">
          <Label icon={Cpu} hue="sky">
            {cpu ? t("cluster_nodes.cpu_with_cores", { count: cpu.cpus }) : t("cluster_nodes.cpu")}
          </Label>
        </HoverTooltip>
        {cpu ? <LevelDot level={cpu.level} label={t(USAGE_LEVEL_LABEL_KEY[cpu.level])} /> : null}
      </div>
      {cpu ? (
        <>
          <CpuSplitBar cpu={cpu} />
          <div className="grid grid-cols-2 gap-3">
            <Line
              label={t("cluster_nodes.cpu_busy")}
              value={t("cluster_nodes.cores", { value: formatCores(cpu.busyCores) })}
            />
            <Line
              label={t("cluster_nodes.cpu_steal")}
              value={t("cluster_nodes.cores", { value: formatCores(cpu.stealCores) })}
            />
          </div>
          {cpu.stealShare !== null ? (
            <p className="text-xs text-ink-3">
              {t("cluster_nodes.steal_share", { pct: formatPercent(cpu.stealShare) })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="text-xs text-ink-3">{t("cluster_nodes.cpu_pending")}</p>
      )}
    </div>
  );
}

function roundTripText(rtt: NodeRoundTrip | undefined, t: (key: string) => string): string {
  if (!rtt) return EMPTY;
  if (rtt.error === "timeout") return t("cluster_nodes.rtt_timeout");
  if (rtt.error) return t("cluster_nodes.rtt_error");
  return rtt.rtt_ms === undefined ? EMPTY : `${rtt.rtt_ms.toFixed(1)} ms`;
}

function NodeCard({ node, now }: { node: ClusterNode; now: number }) {
  const { t } = useTranslation();
  const snapshot = node.snapshot;
  const cpu = nodeCpuView(snapshot);
  const memory = nodeMemoryView(snapshot);
  const slot = nodeSlotView(snapshot);
  const traffic = nodeTrafficView(snapshot);
  const egress = nodeEgressView(snapshot);
  const uptime = nodeUptimeSeconds(node, now);
  const lastSeen = secondsSince(node.last_seen, now);
  const snapshotAge = secondsSince(node.snapshot_at, now);
  const stale = isSnapshotStale(node, now);
  const version = snapshot?.version || node.version;
  const load = snapshot?.host?.load;
  const subtitle = [version, node.advertise].filter(Boolean).join(" · ");

  const egressText = !egress
    ? EMPTY
    : egress.state === "open"
      ? t("cluster_nodes.egress_open", { count: egress.open })
      : egress.state === "degraded"
        ? t("cluster_nodes.egress_degraded", { count: egress.unreachable, total: egress.total })
        : egress.state === "off"
          ? t("cluster_nodes.egress_off")
          : t("cluster_nodes.egress_ok");
  // 集群模式才有：限流与会话粘性是否还跨节点共享。
  const shared = snapshot?.shared_redis;
  const redisLabel =
    snapshot?.redis?.role === "cluster"
      ? t("cluster_nodes.redis_cluster")
      : snapshot?.redis?.role === "usage"
        ? t("cluster_nodes.redis_usage")
        : t("cluster_nodes.redis");

  return (
    // 每张节点卡是一个以节点 ID 命名的分组，读屏和测试都按名字找到它。
    <div role="group" aria-label={node.node_id} className="h-full">
      <Card bodyClassName="mt-0 flex h-full flex-col gap-4" className="h-full">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <MetricIcon icon={Server} hue={node.active ? "emerald" : "rose"} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{node.node_id}</p>
              {subtitle ? <p className="truncate text-xs text-ink-3">{subtitle}</p> : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {node.leader ? <Tag>{t("cluster_nodes.leader")}</Tag> : null}
            {node.self ? <Tag>{t("cluster_nodes.self")}</Tag> : null}
            <LevelPill level={node.active ? "normal" : "critical"}>
              {t(node.active ? "cluster_nodes.online" : "cluster_nodes.offline")}
            </LevelPill>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Line
            label={t("cluster_nodes.uptime")}
            value={uptime === null ? EMPTY : formatAge(uptime)}
          />
          <Line
            label={t("cluster_nodes.last_seen")}
            value={lastSeen === null ? EMPTY : t("cluster_nodes.ago", { age: formatAge(lastSeen) })}
          />
        </div>

        {snapshot ? (
          <>
            <CpuBlock cpu={cpu} />

            <div className="space-y-2">
              <Label icon={Gauge} hue="violet">
                {t("cluster_nodes.load_memory")}
              </Label>
              <Line
                label={t("cluster_nodes.load")}
                value={
                  load
                    ? `${load.load1.toFixed(2)} / ${load.load5.toFixed(2)} / ${load.load15.toFixed(2)}`
                    : EMPTY
                }
              />
              <Line
                label={t("cluster_nodes.memory")}
                value={
                  memory
                    ? `${formatBytes(memory.usedBytes)} / ${formatBytes(memory.totalBytes)}`
                    : EMPTY
                }
                level={memory?.level}
              />
              {memory ? (
                <MeterBar
                  pct={memory.pct}
                  tone={meterTone(memory.level, "violet")}
                  className="h-bar-sm"
                />
              ) : null}
            </div>

            <div className="space-y-2">
              <HoverTooltip content={t("cluster_nodes.slot_hint")} placement="top">
                <Label icon={Layers} hue="sky">
                  {t("cluster_nodes.slot")}
                </Label>
              </HoverTooltip>
              {slot ? (
                <>
                  <Line
                    label={t("cluster_nodes.slot_quota")}
                    value={
                      slot.quotaCores === null
                        ? t("cluster_nodes.unlimited")
                        : t("cluster_nodes.cores", { value: formatCores(slot.quotaCores) })
                    }
                  />
                  <Line
                    label={t("cluster_nodes.slot_usage")}
                    value={
                      slot.usageCores === null
                        ? EMPTY
                        : t("cluster_nodes.cores", { value: formatCores(slot.usageCores) })
                    }
                  />
                  <Line
                    label={t("cluster_nodes.slot_throttled")}
                    value={
                      slot.throttledRatio === null ? EMPTY : formatPercent(slot.throttledRatio)
                    }
                    level={slot.cpuLevel}
                  />
                  <Line
                    label={t("cluster_nodes.slot_memory")}
                    value={
                      slot.memoryCurrent === null
                        ? EMPTY
                        : slot.memoryLimit === null
                          ? formatBytes(slot.memoryCurrent)
                          : `${formatBytes(slot.memoryCurrent)} / ${formatBytes(slot.memoryLimit)}`
                    }
                    level={slot.memoryLevel}
                  />
                </>
              ) : (
                <p className="text-xs text-ink-3">{t("cluster_nodes.slot_unavailable")}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label icon={Globe} hue="emerald">
                {t("cluster_nodes.traffic")}
              </Label>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                <Line
                  label={t("cluster_nodes.in_flight")}
                  value={traffic ? String(traffic.inFlight) : EMPTY}
                />
                <Line
                  label={t("cluster_nodes.requests_per_minute")}
                  value={
                    traffic?.requestsPerMinute == null
                      ? EMPTY
                      : Math.round(traffic.requestsPerMinute).toLocaleString()
                  }
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
                <span className="inline-flex items-center gap-1">
                  <ArrowDownRight size={14} aria-hidden="true" />
                  {t("cluster_nodes.bytes_in", {
                    rate:
                      traffic?.bytesInPerSecond == null
                        ? EMPTY
                        : formatRate(traffic.bytesInPerSecond),
                  })}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ArrowUpRight size={14} aria-hidden="true" />
                  {t("cluster_nodes.bytes_out", {
                    rate:
                      traffic?.bytesOutPerSecond == null
                        ? EMPTY
                        : formatRate(traffic.bytesOutPerSecond),
                  })}
                </span>
              </div>
              <Line label={t("cluster_nodes.egress")} value={egressText} level={egress?.level} />
              <Line
                label={t("cluster_nodes.db_rtt")}
                value={roundTripText(snapshot.db, t)}
                level={roundTripLevel(snapshot.db)}
              />
              <Line
                label={redisLabel}
                value={roundTripText(snapshot.redis, t)}
                level={roundTripLevel(snapshot.redis)}
              />
              {shared ? (
                <Line
                  label={t("cluster_nodes.shared_redis")}
                  value={t(
                    !shared.configured
                      ? "cluster_nodes.shared_redis_none"
                      : shared.available
                        ? "cluster_nodes.shared_redis_ok"
                        : "cluster_nodes.shared_redis_down",
                  )}
                  level={!shared.configured ? "warn" : shared.available ? "normal" : "critical"}
                />
              ) : null}
            </div>

            <p
              className={`mt-auto text-xs ${stale ? "text-amber-700 dark:text-amber-300" : "text-ink-3"}`}
            >
              {snapshotAge === null
                ? EMPTY
                : t(stale ? "cluster_nodes.snapshot_stale" : "cluster_nodes.snapshot_age", {
                    age: formatAge(snapshotAge),
                  })}
            </p>
          </>
        ) : (
          <p className="text-xs text-ink-3">{t("cluster_nodes.no_snapshot")}</p>
        )}
      </Card>
    </div>
  );
}

/**
 * 面板会自动更新到最新 release，旧后端没有节点快照：GET /config 没声明 node-metrics（或读不到
 * 声明）就什么都不请求、不渲染。
 */
export function ClusterNodesSection({ enabled }: { enabled: boolean }) {
  const capabilities = useConfigCapabilities();
  if (capabilities.status !== "ready" || !capabilities.capabilities.nodeMetrics) return null;
  return <ClusterNodesView enabled={enabled} />;
}

function ClusterNodesView({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const { status, receivedAt, stale } = useClusterNodes(enabled);
  if (!status) return null;

  const now = receivedAt || Date.now();
  const nodes = status.nodes ?? [];
  const online = nodes.filter((node) => node.active).length;

  return (
    <Card
      flat
      title={t("cluster_nodes.title")}
      description={t(
        status.enabled ? "cluster_nodes.description_cluster" : "cluster_nodes.description_single",
      )}
      actions={
        <LevelPill level={online === nodes.length ? "normal" : "warn"}>
          {t("cluster_nodes.online_count", { online, total: nodes.length })}
        </LevelPill>
      }
    >
      <div className="space-y-3">
        {status.nodes_error ? (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
            {t("cluster_nodes.nodes_error", { message: status.nodes_error })}
          </p>
        ) : null}
        {stale ? (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
            {t("cluster_nodes.refresh_failed")}
          </p>
        ) : null}
        <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {nodes.map((node) => (
            <NodeCard key={node.node_id} node={node} now={now} />
          ))}
        </div>
      </div>
    </Card>
  );
}
