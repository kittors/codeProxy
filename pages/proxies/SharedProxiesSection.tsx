import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { CheckCircle2, RefreshCw } from "lucide-react";
import type { SharedProxyEntry } from "@code-proxy/api-client/endpoints/proxies";
import {
  Button,
  Card,
  COLUMN_WIDTH,
  DataTable,
  TABLE_ROW_ACTIONS_COLUMN,
  type DataTableColumn,
} from "@code-proxy/ui";
import {
  proxyEndpoint,
  proxyProtocol,
  type ProxyCheckState,
} from "@features/proxy-pool/proxy-utils";
import { SharingNoticeBadge } from "@features/resource-sharing";
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
}: {
  entries: readonly SharedProxyEntry[];
  checkState: ProxyCheckState;
  onCheck: (entry: SharedProxyEntry) => void;
}) {
  const { t } = useTranslation();
  const rows = useMemo(() => [...entries].sort((a, b) => a.name.localeCompare(b.name)), [entries]);

  const columns = useMemo<DataTableColumn<SharedProxyEntry>[]>(
    () => [
      {
        key: "name",
        label: t("proxies.name"),
        width: COLUMN_WIDTH.nameStacked,
        render: (entry) => (
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
        key: "endpoint",
        label: t("proxies.endpoint_label"),
        width: COLUMN_WIDTH.badgeGroup,
        render: (entry) => (
          <div className="flex min-w-0 items-center gap-2">
            <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-semibold text-ink-2 dark:bg-white/[0.07]">
              {proxyProtocol(entry.maskedUrl)}
            </span>
            <span className="truncate font-mono text-xs text-ink-2">{proxyEndpoint(entry)}</span>
          </div>
        ),
      },
      {
        key: "enabled",
        label: t("proxies.shared_status_label"),
        width: COLUMN_WIDTH.badge,
        render: (entry) =>
          entry.enabled ? (
            <span className="text-xs text-ink-2">{t("proxies.shared_status_enabled")}</span>
          ) : (
            <span className="inline-flex rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">
              {t("proxies.disabled")}
            </span>
          ),
      },
      {
        key: "status",
        label: t("proxies.latency"),
        width: COLUMN_WIDTH.badgeStacked,
        render: (entry) =>
          entry.overridden ? (
            <span className="text-xs text-ink-3">--</span>
          ) : (
            <ProxyLatencyCell result={checkState[entry.id]} />
          ),
      },
      {
        key: "description",
        label: t("proxies.remark_label"),
        width: COLUMN_WIDTH.badgeGroup,
        render: (entry) => (
          <p className="truncate text-xs text-ink-2">{entry.description || "--"}</p>
        ),
      },
      {
        key: "actions",
        label: t("proxies.actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (entry) => {
          const checking = Boolean(checkState[entry.id]?.checking);
          const label = t("proxies.check_label", { name: entry.name });
          return (
            <div className="flex justify-end gap-1">
              <Button
                aria-label={label}
                title={entry.overridden ? t("proxies.shared_overridden_tooltip") : label}
                onClick={() => onCheck(entry)}
                disabled={checking || entry.overridden}
                size="xs"
              >
                {checking ? (
                  <RefreshCw size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
              </Button>
            </div>
          );
        },
      },
    ],
    [checkState, onCheck, t],
  );

  return (
    <Card
      flat
      title={t("proxies.shared_section_title")}
      description={t("proxies.shared_section_desc")}
    >
      <DataTable<SharedProxyEntry>
        tableId="proxy-pool-shared"
        rows={rows}
        columns={columns}
        rowKey={(entry) => entry.id}
        rowHeight={56}
        height="h-auto max-h-[40vh]"
        minHeight="min-h-0"
        minWidth="min-w-[960px]"
        caption={t("proxies.shared_table_caption")}
        emptyText={t("proxies.shared_section_title")}
        showAllLoadedMessage={false}
      />
    </Card>
  );
}
