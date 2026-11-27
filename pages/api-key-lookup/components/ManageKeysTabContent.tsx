import { CalendarClock, Plus, RefreshCw } from "@code-proxy/ui/icons";
import type { EndUser, EndUserAPIKey } from "@code-proxy/api-client";
import { Button, Card, surface, type DataGridColumn } from "@code-proxy/ui";
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
  const hasAnyExpiry = keys.some((k) => Boolean(k.expires_at));
  const extraColumns: DataGridColumn<EndUserAPIKey>[] = [];
  if (accessPolicy) {
    extraColumns.push({
      id: "rules",
      header: t("access_policy.col_model_policy"),
      width: 160,
      minWidth: 144,
      overflowTooltip: false,
      cell: (row) => <PolicyBadges rules={row["model-rules"]} usage={row["quota-usage"]} />,
    });
  }
  if (hasAnyExpiry) {
    extraColumns.push({
      id: "expiry",
      header: t("apikey_lookup.col_expiry"),
      width: 144,
      minWidth: 120,
      overflowTooltip: false,
      cell: (row) => {
        if (!row.expires_at) {
          return <span className="text-xs text-sn-label3">{t("billing.no_expiry_limit")}</span>;
        }
        const ms = Date.parse(row.expires_at);
        if (Number.isNaN(ms)) return null;
        const diff = ms - Date.now();
        const expired = diff <= 0;
        const days = Math.max(1, Math.ceil(diff / (24 * 3600 * 1000)));
        return (
          <span
            title={new Date(ms).toLocaleString()}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-medium tabular-nums ${
              expired
                ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                : diff <= 3 * 24 * 3600 * 1000
                  ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                  : "bg-sn-label/[0.05] text-sn-label2 dark:bg-white/[0.07]"
            }`}
          >
            <CalendarClock size={11} />
            {expired
              ? t("billing.expiry_expired")
              : t("billing.expiry_remaining_days", { days })}
          </span>
        );
      },
    });
  }

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
          <span className="shrink-0 text-xs font-semibold text-sn-label2">{t("access_policy.my_account_quota")}</span>
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
      {/* Key 通常就几条：表格按行数收高，下面的「最近登录」紧跟着，不再被一整屏的空框推到下一屏。 */}
      <div data-testid="apikey-lookup-keys-table-viewport" className="relative">
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
          extraColumns={extraColumns.length > 0 ? extraColumns : undefined}
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
