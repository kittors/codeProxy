import { useTranslation } from "react-i18next";
import { Card } from "@code-proxy/ui";
import { useConfigCapabilities } from "@features/backend-capabilities";
import { LevelPill } from "@features/monitor-widgets/monitorVisuals";
import { useClusterNodes } from "./useClusterNodes";
import { nodeIssues, issuesLevel } from "./clusterHealth";
import { databaseView } from "./clusterDatabaseView";
import { ClusterNodeCard } from "./ClusterNodeCard";
import { ClusterDatabaseCard } from "./ClusterDatabaseCard";

/*
 * 「服务器节点」：每台应用节点一张紧凑卡片，数据库一张，排在同一个网格里，宽屏一行放下。
 * 数据来自 GET /cluster：各节点随心跳上报的资源快照，主节点快照里的数据库段，以及 clirelay-hostagent
 * 上报的数据库主机。后端在 GET /config 的 capabilities 里声明了 node-metrics 才出现、才请求；旧版本整块
 * 不出现。磁盘、数据库、主机是后来加的字段，旧后端没有时对应的格子显示「—」，数据库卡片不出现。
 *
 * 结构与上面的系统监控一致：分区标题 + 网格，网格里每张卡就是一层，卡里不再套淡底块。
 */

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
  const database = databaseView(status, now, receivedAt || now);

  // 标题旁的汇总：几张卡片有告急、几张需要留意。
  const cardLevels = [
    ...nodes.map((node) => issuesLevel(nodeIssues(node, now))),
    ...(database ? [database.level] : []),
  ];
  const critical = cardLevels.filter((level) => level === "critical").length;
  const warn = cardLevels.filter((level) => level === "warn").length;

  return (
    <Card
      flat
      title={t("cluster_nodes.title")}
      description={t(
        status.enabled ? "cluster_nodes.description_cluster" : "cluster_nodes.description_single",
      )}
      actions={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <LevelPill level={online === nodes.length ? "normal" : "critical"}>
            {t("cluster_nodes.online_count", { online, total: nodes.length })}
          </LevelPill>
          {critical > 0 ? (
            <LevelPill level="critical">{t("cluster_nodes.critical_count", { count: critical })}</LevelPill>
          ) : null}
          {warn > 0 ? <LevelPill level="warn">{t("cluster_nodes.warn_count", { count: warn })}</LevelPill> : null}
        </div>
      }
    >
      <div className="space-y-3">
        {status.nodes_error ? (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
            {t("cluster_nodes.nodes_error", { message: status.nodes_error })}
          </p>
        ) : null}
        {status.hosts_error ? (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
            {t("cluster_nodes.hosts_error", { message: status.hosts_error })}
          </p>
        ) : null}
        {stale ? (
          <p role="status" className="text-xs text-amber-700 dark:text-amber-300">
            {t("cluster_nodes.refresh_failed")}
          </p>
        ) : null}
        {/*
         * 每张卡至少 24rem 宽：2×2 的指标格在这个宽度下数值不会被截断。auto-fit 让卡片按区块宽度
         * 自动排列：1700px 左右的主区一行四张（三台节点 + 数据库），笔记本上一行三张。items-start：
         * 展开一张卡的详情时，同一行别的卡不被拉高。
         */}
        <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]">
          {nodes.map((node) => (
            <ClusterNodeCard key={node.node_id} node={node} now={now} />
          ))}
          {database ? <ClusterDatabaseCard view={database} now={now} /> : null}
        </div>
      </div>
    </Card>
  );
}
