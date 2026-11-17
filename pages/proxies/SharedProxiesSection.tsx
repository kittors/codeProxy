import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, RefreshCw } from "lucide-react";
import {
  egressStatusFor,
  type ProxyEgressListing,
  type SharedProxyEntry,
} from "@code-proxy/api-client/endpoints/proxies";
import {
  Card,
  DataGrid,
  GRID_WIDTH,
  GridRowActions,
  gridRowActionsColumn,
  type DataGridColumn,
} from "@code-proxy/ui";
import {
  proxyEndpoint,
  proxyProtocol,
  type ProxyCheckState,
} from "@features/proxy-pool/proxy-utils";
import { SharingNoticeBadge } from "@features/resource-sharing";
import { ProxyEgressCell } from "./ProxyEgressCell";
import { ProxyLatencyCell } from "./ProxyLatencyCell";

/**
 * 租户视角下的「平台共享代理」：系统管理员共享给本租户的代理，只读。
 *
 * 只给名称、协议和主机（后端不下发地址和凭据）；能按 ID 在服务端测延迟。本租户有同 ID 的
 * 自有代理时，账号实际用的是自有那条——这时按 ID 检测测到的也是自有那条，所以不再提供检测，
 * 只标出「已被覆盖」。
 */
export function SharedProxiesSection({
  entries,
  checkState,
  onCheck,
  egress,
}: {
  entries: readonly SharedProxyEntry[];
  checkState: ProxyCheckState;
  onCheck: (entry: SharedProxyEntry) => void;
  /** 出口熔断状态；后端不支持或节点关了熔断时不传，这一列就不显示。 */
  egress?: { listing: ProxyEgressListing; known: boolean };
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => [...entries].sort((a, b) => a.name.localeCompare(b.name)), [entries]);

  const columns = useMemo<DataGridColumn<SharedProxyEntry>[]>(
    () => [
      {
        id: "name",
        header: t("proxies.name"),
        width: GRID_WIDTH.nameStacked,
        cell: (entry) => (
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-1.5">
              <p className="truncate font-semibold text-ink">{entry.name}</p>
              {entry.overridden ? (
                <SharingNoticeBadge
                  tone="warning"
                  label={t("proxies.shared_overridden_badge")}
                  tooltip={t("proxies.shared_overridden_tooltip")}
                  testId="shared-proxy-overridden"
                />
              ) : null}
            </div>
            <p className="mt-1 truncate font-mono text-xs text-ink-3">{entry.id}</p>
          </div>
        ),
      },
      {
        id: "endpoint",
        header: t("proxies.endpoint_label"),
        width: GRID_WIDTH.badgeGroup,
        cell: (entry) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
              {proxyProtocol(entry.maskedUrl)}
            </span>
            <span className="truncate font-mono text-xs text-ink-2">{proxyEndpoint(entry)}</span>
          </div>
        ),
      },
      {
        id: "enabled",
        header: t("proxies.shared_status_label"),
        width: GRID_WIDTH.badge,
        cell: (entry) =>
          entry.enabled ? (
            <span className="text-xs text-ink-2">{t("proxies.shared_status_enabled")}</span>
          ) : (
            <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {t("proxies.disabled")}
            </span>
          ),
      },
      {
        id: "status",
        header: t("proxies.latency"),
        width: GRID_WIDTH.badgeStacked,
        cell: (entry) =>
          entry.overridden ? (
            <span className="text-xs text-ink-3">--</span>
          ) : (
            <ProxyLatencyCell result={checkState[entry.id]} />
          ),
      },
      ...(egress
        ? [
            {
              id: "egress",
              header: t("proxies.egress_column"),
              width: GRID_WIDTH.name,
              // 被覆盖的共享代理本租户的账号用不到，停用的不承载流量，都没有熔断可言。
              cell: (entry: SharedProxyEntry) =>
                entry.enabled && !entry.overridden ? (
                  <ProxyEgressCell
                    known={egress.known}
                    status={egressStatusFor(egress.listing, entry.id, true)}
                  />
                ) : (
                  <span className="text-xs text-ink-3">--</span>
                ),
            },
          ]
        : []),
      {
        id: "description",
        header: t("proxies.remark_label"),
        width: GRID_WIDTH.badgeGroup,
        cell: (entry) => (
          <p className="truncate text-xs text-ink-2">{entry.description || "--"}</p>
        ),
      },
      {
        id: "actions",
        header: t("proxies.actions"),
        ...gridRowActionsColumn(1),
        cell: (entry) => {
          const checking = Boolean(checkState[entry.id]?.checking);
          const label = t("proxies.check_label", { name: entry.name });
          return (
            <GridRowActions
              actions={[
                {
                  key: "check",
                  label,
                  tooltip: entry.overridden ? t("proxies.shared_overridden_tooltip") : label,
                  icon: checking ? <RefreshCw className="animate-spin" /> : <CheckCircle2 />,
                  disabled: checking || entry.overridden,
                  onClick: () => onCheck(entry),
                },
              ]}
            />
          );
        },
      },
    ],
    [checkState, egress, onCheck, t],
  );

  return (
    <Card
      flat
      title={t("proxies.shared_section_title")}
      description={t("proxies.shared_section_desc")}
    >
      {/* 页面在有共享分区时随内容流动：这张表按行收高，最高四成屏高，超出在表内滚动。 */}
      <DataGrid<SharedProxyEntry>
        id="proxy-pool-shared"
        label={t("proxies.shared_table_caption")}
        rows={rows}
        columns={columns}
        rowKey={(entry) => entry.id}
        maxHeight="40vh"
        empty={{ title: t("proxies.shared_section_title") }}
      />
    </Card>
  );
}
