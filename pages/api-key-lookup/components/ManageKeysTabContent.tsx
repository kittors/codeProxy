import { Plus, RefreshCw } from "lucide-react";
import type { EndUser, EndUserAPIKey } from "@code-proxy/api-client";
import { Button, Card, surface } from "@code-proxy/ui";
import { PolicyBadges, QuotaUsageCell, resettableWindows } from "@features/access-policy";
import { OwnedApiKeysTable } from "@features/period-spending";
import { PortalRecentSignIns } from "./PortalRecentSignIns";

export function ManageKeysTabContent({
  t,
  keys,
  account,
  accessPolicy = false,
  busy,
  loading = false,
  onRefresh,
  onCreate,
  onRotate,
  onDelete,
  onEdit,
  onResetPeriodSpending,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keys: EndUserAPIKey[];
  /** 当前登录的账号：顶部显示它的额度用量（Key 的子额度不能超过它）。 */
  account?: EndUser | null;
  /** 后端支持访问策略时显示完整矩阵、按模型规则。 */
  accessPolicy?: boolean;
  busy?: boolean;
  loading?: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  onRotate: (key: EndUserAPIKey) => void;
  onDelete: (key: EndUserAPIKey) => void;
  onEdit: (key: EndUserAPIKey) => void;
  onResetPeriodSpending: (key: EndUserAPIKey) => void;
}) {
  // 「管理 API Key」页签就是页面本身（flat）：操作按钮、Key 表格直接落在页面上，最近登录是下面
  // 唯一的一张卡片。以前整页包在一张卡里，按钮行和表格之间再画一道分隔线。
  return (
    <Card flat bodyClassName="mt-0">
      <div
        data-testid="apikey-lookup-keys-card-toolbar"
        className="flex flex-wrap items-center justify-end gap-2 pb-3"
      >
        <Button size="sm" variant="secondary" onClick={onRefresh} disabled={loading || busy}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("common.refresh")}
        </Button>
        <Button size="sm" variant="primary" onClick={onCreate} disabled={busy}>
          <Plus size={14} />
          {t("apikey_lookup.create_key", { defaultValue: "新建 Key" })}
        </Button>
      </div>

      {accessPolicy && account ? (
        <div className={`${surface({ tone: "inset", radius: "2xl" })} mb-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3`}>
          <span className="shrink-0 text-xs font-semibold text-ink-2">{t("access_policy.my_account_quota")}</span>
          <QuotaUsageCell
            limits={account["quota-limits"]}
            usage={account["quota-usage"]?.total}
            inFlight={account["quota-usage"]?.["in-flight"]}
            max={4}
            className="min-w-0 flex-1 sm:grid-cols-4"
          />
          <PolicyBadges rules={account["model-rules"]} routes={account["model-routes"]} usage={account["quota-usage"]} />
        </div>
      ) : null}
      <div
        data-testid="apikey-lookup-keys-table-viewport"
        className="relative min-h-[360px] h-[calc(100dvh-240px)] overflow-hidden"
      >
        <OwnedApiKeysTable
          t={t}
          keys={keys}
          busy={busy}
          loading={loading}
          canDelete={() => keys.length > 1}
          renderQuota={
            accessPolicy
              ? (row) => (
                  <QuotaUsageCell
                    limits={row["quota-limits"]}
                    usage={row["quota-usage"]?.total}
                    inFlight={row["quota-usage"]?.["in-flight"]}
                  />
                )
              : undefined
          }
          canResetQuota={
            accessPolicy ? (row) => resettableWindows(row["quota-limits"], row["model-rules"]).length > 0 : undefined
          }
          extraColumns={
            accessPolicy
              ? [
                  {
                    key: "rules",
                    label: t("access_policy.col_model_policy"),
                    width: "w-40 min-w-[9rem]",
                    overflowTooltip: false,
                    render: (row) => <PolicyBadges rules={row["model-rules"]} usage={row["quota-usage"]} />,
                  },
                ]
              : undefined
          }
          height="h-full"
          minHeight="min-h-full"
          actions={{
            onRotate,
            onDelete,
            onEdit,
            onResetPeriodSpending,
          }}
        />
      </div>
      <PortalRecentSignIns />
    </Card>
  );
}
