import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card } from "@code-proxy/ui";
import { useConfigCapabilities } from "@features/backend-capabilities";
import { LevelPill } from "@features/monitor-widgets/monitorVisuals";
import { useClusterNodes } from "./useClusterNodes";
import { nodeIssues, issuesLevel } from "./clusterHealth";
import { databaseView } from "./clusterDatabaseView";
import { ClusterNodeCard } from "./ClusterNodeCard";
import { ClusterDatabaseCard } from "./ClusterDatabaseCard";
import {
  ClusterDetailsDrawer,
  databaseTarget,
  nodeTarget,
  type ClusterDetailsTarget,
} from "./ClusterDetailsDrawer";

/*
 * 「服务器节点」：每台应用节点一张卡片，数据库一张，排在同一个网格里，宽屏一行放下。
 * 数据来自 GET /cluster：各节点随心跳上报的资源快照，leader 快照里的数据库段，以及 clirelay-hostagent
 * 上报的数据库主机。后端在 GET /config 的 capabilities 里声明了 node-metrics 才出现、才请求；旧版本整块
 * 不出现。磁盘、数据库、主机是后来加的字段，旧后端没有时对应的格子显示「—」，数据库卡片不出现。
 *
 * 对齐：每张卡片占网格的五行（标题、指标、数字条、胶囊、页脚），行用 subgrid 共享，同一行卡片等高、
 * 各区块在同一条水平线上（见 ClusterCardParts）。详情在右侧抽屉里看，不在卡片里展开。
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
  // 抽屉开关和选中对象分开存：关闭时内容还要陪着退场动画显示一会儿。
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTarget, setDetailsTarget] = useState<ClusterDetailsTarget>("");
  if (!status) return null;

  const now = receivedAt || Date.now();
  const nodes = status.nodes ?? [];
  const online = nodes.filter((node) => node.active).length;
  const database = databaseView(status, now, receivedAt || now);
  const openDetails = (target: ClusterDetailsTarget) => {
    setDetailsTarget(target);
    setDetailsOpen(true);
  };

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
         * 每张卡至少 24rem 宽：2×2 的指标格和四格数字条在这个宽度下不截断。auto-fit 让卡片按区块宽度
         * 自动排：宽屏一行放下三台节点和数据库，窄了两列、一列。卡片占五行、行取 subgrid，所以这里的
         * 行间距就是卡片里各区块之间的间距。
         */}
        <div
          data-testid="cluster-grid"
          className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,24rem),1fr))]"
        >
          {nodes.map((node) => (
            <ClusterNodeCard
              key={node.node_id}
              node={node}
              now={now}
              onOpenDetails={() => openDetails(nodeTarget(node.node_id))}
            />
          ))}
          {database ? (
            <ClusterDatabaseCard view={database} now={now} onOpenDetails={() => openDetails(databaseTarget)} />
          ) : null}
        </div>
      </div>
      <ClusterDetailsDrawer
        open={detailsOpen}
        target={detailsTarget}
        onTargetChange={setDetailsTarget}
        onClose={() => setDetailsOpen(false)}
        nodes={nodes}
        database={database}
        now={now}
      />
    </Card>
  );
}
