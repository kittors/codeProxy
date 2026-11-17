import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Database, Server } from "lucide-react";
import type { ClusterNode } from "@code-proxy/api-client";
import { Drawer, Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import type { UsageLevel } from "@features/monitor-widgets/monitorVisuals";
import { issuesLevel, nodeIssues } from "./clusterHealth";
import type { DatabaseView } from "./clusterDatabaseView";
import { ClusterNodeDetails } from "./ClusterNodeDetails";
import { ClusterDatabaseDetails } from "./ClusterDatabaseDetails";
import { HealthPill } from "./ClusterCardParts";

/*
 * 节点与数据库的详情：右侧抽屉，顶部一排标签在各节点和数据库之间切换，下面分节列出完整的数。
 *
 * 以前详情在卡片里原地展开：一张卡被拉到页面底部，同一行的其他卡不动，右边留下大片空白。抽屉不改变
 * 卡片网格，内容随每 10 秒的刷新一起更新。Drawer 负责 role=dialog、焦点限制在抽屉里、Esc 关闭，
 * 以及关闭后把焦点还给打开它的「详情」按钮。
 */

/** 抽屉里选中的对象："node:<节点 ID>" 或 "database"。 */
export type ClusterDetailsTarget = string;

export const databaseTarget = "database";
export const nodeTarget = (nodeId: string) => `node:${nodeId}`;

const LEVEL_DOT: Record<UsageLevel, string> = {
  normal: "bg-emerald-500",
  warn: "bg-amber-500",
  critical: "bg-rose-500",
};

export function ClusterDetailsDrawer({
  open,
  target,
  onTargetChange,
  onClose,
  nodes,
  database,
  now,
}: {
  open: boolean;
  target: ClusterDetailsTarget;
  onTargetChange: (next: ClusterDetailsTarget) => void;
  onClose: () => void;
  nodes: ClusterNode[];
  database: DatabaseView | null;
  now: number;
}) {
  const { t } = useTranslation();
  const baseId = useId();
  const panelId = `${baseId}-panel`;

  const items = [
    ...nodes.map((node) => ({
      value: nodeTarget(node.node_id),
      label: node.node_id,
      level: issuesLevel(nodeIssues(node, now)),
    })),
    ...(database ? [{ value: databaseTarget, label: t("cluster_nodes.database_title"), level: database.level }] : []),
  ];
  // 选中的节点不在了（下线后从成员表里移除）：落到第一项，抽屉不至于空着。
  const current = items.some((item) => item.value === target) ? target : (items[0]?.value ?? "");
  const currentIndex = Math.max(0, items.findIndex((item) => item.value === current));
  const node = nodes.find((candidate) => nodeTarget(candidate.node_id) === current);
  const showDatabase = !node && current === databaseTarget && database !== null;

  const title = node ? node.node_id : t("cluster_nodes.database_title");
  const description = node
    ? [node.snapshot?.version || node.version, node.advertise].filter(Boolean).join(" · ")
    : database
      ? [database.db.version ? `PostgreSQL ${database.db.version}` : "PostgreSQL", t("cluster_nodes.database_leader", { node: database.leaderId })].join(" · ")
      : undefined;
  const issues = node ? nodeIssues(node, now) : showDatabase && database ? database.issues : [];

  return (
    <Drawer
      open={open}
      title={title}
      description={description}
      icon={node || !showDatabase ? <Server size={18} aria-hidden="true" /> : <Database size={18} aria-hidden="true" />}
      widthClassName="w-[min(640px,100vw)]"
      onClose={onClose}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Tabs value={current} onValueChange={onTargetChange} size="sm">
            <TabsList aria-label={t("cluster_nodes.details_switch")}>
              {items.map((item, index) => (
                <TabsTrigger
                  key={item.value}
                  value={item.value}
                  id={`${baseId}-tab-${index}`}
                  aria-controls={panelId}
                >
                  <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${LEVEL_DOT[item.level]}`} />
                  {item.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {items.length > 0 ? <HealthPill issues={issues} /> : null}
        </div>
        <div role="tabpanel" id={panelId} aria-labelledby={`${baseId}-tab-${currentIndex}`} data-testid="cluster-details">
          {node ? (
            <ClusterNodeDetails node={node} now={now} />
          ) : showDatabase && database ? (
            <ClusterDatabaseDetails view={database} now={now} />
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}
