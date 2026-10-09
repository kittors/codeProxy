import type { TFunction } from "i18next";
import type { ReactNode } from "react";
import {
  BarChart3,
  Copy,
  Infinity as InfinityIcon,
  Info,
  Pencil,
  Power,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import type { ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import { hasPeriodSpendingLimits, normalizePeriodSpendingLimits } from "@code-proxy/api-client";
import { PeriodSpendingCell } from "@features/period-spending";
import {
  formatApiKeyDate,
  formatApiKeyLimit,
  formatApiKeySpendingAmount,
  formatApiKeySpendingLimit,
  maskApiKey,
  VendorIcon,
} from "../apiKeyPageUtils";
import {
  COLUMN_WIDTH,
  Checkbox,
  HoverTooltip,
  OverflowTooltip,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  TooltipChip,
} from "@code-proxy/ui";
import type { DataTableColumn } from "@code-proxy/ui";

type CreateApiKeyColumnsOptions = {
  t: TFunction;
  selectedKeys: Set<string>;
  allRowsSelected: boolean;
  someRowsSelected: boolean;
  onSelectAll: (checked: boolean) => void;
  onSelectRow: (key: string, checked: boolean) => void;
  onToggleDisable: (index: number) => void;
  onViewUsage: (entry: ApiKeyEntry) => void;
  onCopy: (key: string) => void;
  onImportToCcSwitch: (entry: ApiKeyEntry) => void;
  onRotate: (index: number) => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onResetPeriodSpending: (index: number) => void;
  onViewResetHistory: (entry: ApiKeyEntry) => void;
  resettingPeriodSpendingKey?: string | null;
  /** Owned keys share account quota; hide per-key limit columns. */
  accountScoped?: boolean;
};

/**
 * 标签基础是中性淡底、不描边（简约风格）。多彩风格下渠道列叠回青色淡底，
 * 模型 / 渠道分组两列一直是中性的。
 */
const NEUTRAL_TAG = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

type PermissionSummaryTone = "neutral" | "cyan";

const permissionSummaryToneClasses: Record<PermissionSummaryTone, string> = {
  neutral: "",
  cyan: "colorful:bg-cyan-50/65 colorful:text-cyan-700 colorful:dark:bg-cyan-500/10 colorful:dark:text-cyan-200",
};

const permissionCountToneClasses: Record<PermissionSummaryTone, string> = {
  neutral: "",
  cyan: "colorful:bg-cyan-100 colorful:text-cyan-700 colorful:dark:bg-cyan-500/20 colorful:dark:text-cyan-200",
};

// 冻结列的底色要和表格所在的底一致：这张表直接放在页面上（外壳内容区 canvas），不在卡片里。
const stickySelectHeaderClass = "md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickySelectCellClass = "md:sticky md:z-30 md:bg-backdrop";
const stickyNameHeaderClass = "md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickyNameCellClass = "font-medium md:sticky md:z-30 md:bg-backdrop";
const stickyActionsHeaderClass =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickyActionsCellClass = "md:sticky md:z-30 md:bg-backdrop";

function ApiKeyBadge({ value }: { value: string }) {
  return (
    <OverflowTooltip as="div" content={value} className="block min-w-0 max-w-full">
      <code className={`inline-flex min-w-0 max-w-full items-center rounded-md px-2 py-0.5 font-mono text-xs ${NEUTRAL_TAG}`}>
        <span className="block min-w-0 truncate">{value}</span>
      </code>
    </OverflowTooltip>
  );
}

function ApiKeyPermissionSummary({
  count,
  firstValue,
  tone = "neutral",
  tooltipContent,
}: {
  count: number;
  firstValue: string;
  tone?: PermissionSummaryTone;
  tooltipContent: ReactNode;
}) {
  return (
    <HoverTooltip content={tooltipContent} className="!flex min-w-0 max-w-full">
      <span
        className={`flex min-w-0 max-w-full items-center gap-1 rounded-full py-0.5 pl-0.5 pr-1.5 text-xs ${NEUTRAL_TAG} ${permissionSummaryToneClasses[tone]}`}
      >
        <span
          className={`inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-ink/[0.07] px-1.5 font-semibold tabular-nums text-ink ${permissionCountToneClasses[tone]}`}
        >
          {count}
        </span>
        <span className="block min-w-0 flex-1 truncate font-mono text-xs leading-5">
          {firstValue}
        </span>
      </span>
    </HoverTooltip>
  );
}

export const createApiKeyColumns = ({
  t,
  selectedKeys,
  allRowsSelected,
  someRowsSelected,
  onSelectAll,
  onSelectRow,
  onToggleDisable,
  onViewUsage,
  onCopy,
  onImportToCcSwitch,
  onRotate,
  onEdit,
  onDelete,
  onResetPeriodSpending,
  onViewResetHistory,
  resettingPeriodSpendingKey = null,
  accountScoped = false,
}: CreateApiKeyColumnsOptions): DataTableColumn<ApiKeyEntry>[] => {
  const columns: DataTableColumn<ApiKeyEntry>[] = [
    {
      key: "select",
      label: t("api_keys_page.select_all_keys"),
      width: COLUMN_WIDTH.checkbox,
      lockOrder: "start",
      headerClassName: stickySelectHeaderClass,
      cellClassName: stickySelectCellClass,
      headerRender: () => (
        <Checkbox
          checked={allRowsSelected}
          indeterminate={someRowsSelected}
          onCheckedChange={onSelectAll}
          aria-label={t("api_keys_page.select_all_keys")}
        />
      ),
      render: (row) => (
        <Checkbox
          checked={selectedKeys.has(row.key)}
          onCheckedChange={(checked) => onSelectRow(row.key, checked)}
          aria-label={t("api_keys_page.select_key", {
            name: row.name || t("api_keys_page.unnamed"),
          })}
        />
      ),
    },
    {
      key: "name",
      label: t("api_keys_page.col_name"),
      width: COLUMN_WIDTH.toggle,
      lockOrder: "start",
      headerClassName: stickyNameHeaderClass,
      cellClassName: stickyNameCellClass,
      render: (row) => (
        <div className="flex min-w-0 items-center gap-1.5">
          <OverflowTooltip
            content={row.name || t("api_keys_page.unnamed")}
            className="block min-w-0"
          >
            <span className="block min-w-0 truncate">
              {row.name || (
                <span className="text-ink-3">{t("common.unnamed")}</span>
              )}
            </span>
          </OverflowTooltip>
          {row.is_default ? (
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-medium ${NEUTRAL_TAG} colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-300`}
            >
              default
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: "quota",
      label: t("quota.period_spending_column"),
      width: "w-[360px] min-w-[280px]",
      headerRender: () => (
        <HoverTooltip
          content={t("api_keys_page.quota_help")}
          className="inline-flex items-center gap-1"
        >
          <span>{t("quota.period_spending_column")}</span>
          <Info size={12} className="text-ink-3" />
        </HoverTooltip>
      ),
      render: (row) => {
        const limits = normalizePeriodSpendingLimits(
          row["period-spending-limits"],
          row["daily-spending-limit"],
        );
        const fallbackItems =
          limits.day > 0
            ? [
                {
                  period: "day" as const,
                  limit: limits.day,
                  used: row["daily-spending-used"] ?? 0,
                  remaining: Math.max(limits.day - (row["daily-spending-used"] ?? 0), 0),
                },
              ]
            : [];
        return <PeriodSpendingCell t={t} items={row["period-spending"] ?? fallbackItems} />;
      },
    },
    {
      key: "dailySpending",
      label: t("quota.daily_spending_column"),
      width: COLUMN_WIDTH.compact,
      cellClassName: "whitespace-nowrap tabular-nums text-ink-2",
      headerRender: () => (
        <HoverTooltip
          content={t("api_keys_page.daily_spending_fact_help")}
          className="inline-flex items-center gap-1"
        >
          <span>{t("quota.daily_spending_column")}</span>
          <Info size={12} className="text-ink-3" />
        </HoverTooltip>
      ),
      render: (row) => formatApiKeySpendingAmount(row["daily-spending-used"]),
    },
    {
      key: "lifetimeSpending",
      label: t("quota.lifetime_spending_column"),
      width: COLUMN_WIDTH.numericWide,
      cellClassName: "whitespace-nowrap tabular-nums text-ink-2",
      headerRender: () => (
        <HoverTooltip
          content={t("api_keys_page.lifetime_spending_help")}
          className="inline-flex items-center gap-1"
        >
          <span>{t("quota.lifetime_spending_column")}</span>
          <Info size={12} className="text-ink-3" />
        </HoverTooltip>
      ),
      render: (row) => formatApiKeySpendingAmount(row["lifetime-spending-used"]),
    },
    {
      key: "dailySpendingResetCount",
      label: t("quota.total_resets"),
      width: COLUMN_WIDTH.timestamp,
      cellClassName: "whitespace-nowrap text-ink-2",
      headerRender: () => (
        <HoverTooltip
          content={t("api_keys_page.reset_count_help")}
          className="inline-flex items-center gap-1"
        >
          <span>{t("quota.total_resets")}</span>
          <Info size={12} className="text-ink-3" />
        </HoverTooltip>
      ),
      render: (row) => {
        const count = row["daily-spending-reset-count"] ?? 0;
        if (count <= 0) {
          return <span className="tabular-nums text-ink-3">0</span>;
        }
        return (
          <button
            type="button"
            onClick={() => onViewResetHistory(row)}
            className="tabular-nums font-medium text-accent-ink underline-offset-2 hover:underline colorful:text-orange-600 colorful:dark:text-orange-400"
            aria-label={t("api_keys_page.view_reset_history")}
          >
            {count}
          </button>
        );
      },
    },
    {
      key: "key",
      label: t("api_keys_page.col_key"),
      width: COLUMN_WIDTH.composite,
      cellClassName: "whitespace-nowrap",
      render: (row) => <ApiKeyBadge value={maskApiKey(row.key)} />,
    },
    {
      key: "dailyLimit",
      label: t("api_keys_page.col_daily_limit"),
      width: COLUMN_WIDTH.compact,
      cellClassName: "whitespace-nowrap text-ink-2",
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          {!row["daily-limit"] ? (
            <>
              <InfinityIcon size={14} className="text-ink-3 colorful:text-green-500" />{" "}
              {t("api_keys_page.unlimited")}
            </>
          ) : (
            formatApiKeyLimit(row["daily-limit"])
          )}
        </span>
      ),
    },
    {
      key: "totalQuota",
      label: t("api_keys_page.col_total_quota"),
      width: COLUMN_WIDTH.compact,
      cellClassName: "whitespace-nowrap text-ink-2",
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          {!row["total-quota"] ? (
            <>
              <InfinityIcon size={14} className="text-ink-3 colorful:text-green-500" />{" "}
              {t("api_keys_page.unlimited")}
            </>
          ) : (
            formatApiKeyLimit(row["total-quota"])
          )}
        </span>
      ),
    },
    {
      key: "spendingLimit",
      label: t("api_keys_page.col_spending_limit"),
      width: COLUMN_WIDTH.timestamp,
      cellClassName: "whitespace-nowrap text-ink-2",
      headerRender: () => (
        <HoverTooltip
          content={t("api_keys_page.spending_limit_help")}
          className="inline-flex items-center gap-1"
        >
          <span>{t("api_keys_page.col_spending_limit")}</span>
          <Info size={12} className="text-ink-3" />
        </HoverTooltip>
      ),
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          {!row["spending-limit"] ? (
            <>
              <InfinityIcon size={14} className="text-ink-3 colorful:text-green-500" />{" "}
              {t("api_keys_page.unlimited")}
            </>
          ) : (
            formatApiKeySpendingLimit(row["spending-limit"])
          )}
        </span>
      ),
    },
    {
      key: "rpmLimit",
      label: "RPM",
      width: COLUMN_WIDTH.toggle,
      cellClassName: "whitespace-nowrap text-ink-2",
      headerRender: () => (
        <HoverTooltip content={t("api_keys.rpm_full")} className="inline-flex items-center gap-1">
          <span>{t("api_keys_page.rpm")}</span>
          <Info size={12} className="text-ink-3" />
        </HoverTooltip>
      ),
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          {!row["rpm-limit"] ? (
            <>
              <InfinityIcon size={14} className="text-ink-3 colorful:text-green-500" />{" "}
              {t("api_keys_page.unlimited")}
            </>
          ) : (
            formatApiKeyLimit(row["rpm-limit"])
          )}
        </span>
      ),
    },
    {
      key: "tpmLimit",
      label: "TPM",
      width: COLUMN_WIDTH.toggle,
      cellClassName: "whitespace-nowrap text-ink-2",
      headerRender: () => (
        <HoverTooltip content={t("api_keys.tpm_full")} className="inline-flex items-center gap-1">
          <span>{t("api_keys_page.tpm")}</span>
          <Info size={12} className="text-ink-3" />
        </HoverTooltip>
      ),
      render: (row) => (
        <span className="inline-flex items-center gap-1">
          {!row["tpm-limit"] ? (
            <>
              <InfinityIcon size={14} className="text-ink-3 colorful:text-green-500" />{" "}
              {t("api_keys_page.unlimited")}
            </>
          ) : (
            formatApiKeyLimit(row["tpm-limit"])
          )}
        </span>
      ),
    },
    {
      key: "allowedModels",
      label: t("api_keys_page.col_models"),
      width: COLUMN_WIDTH.numericWide,
      cellClassName: "min-w-0 overflow-hidden text-ink-2",
      render: (row) =>
        row["allowed-models"]?.length ? (
          <ApiKeyPermissionSummary
            count={row["allowed-models"].length}
            firstValue={row["allowed-models"][0]}
            tooltipContent={
              <div className="flex max-w-xs flex-wrap gap-1.5">
                {row["allowed-models"].map((model) => (
                  <TooltipChip key={model} mono>
                    <VendorIcon modelId={model} size={12} />
                    {model}
                  </TooltipChip>
                ))}
              </div>
            }
          />
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap colorful:text-green-600 colorful:dark:text-green-400">
            <ShieldCheck
              size={14}
              className="text-ink-3 colorful:text-green-600 colorful:dark:text-green-400"
            />{" "}
            {t("api_keys_page.all_models")}
          </span>
        ),
    },
    {
      key: "allowedChannelGroups",
      label: t("api_keys_page.col_channel_groups"),
      width: COLUMN_WIDTH.badgeGroup,
      cellClassName: "min-w-0 overflow-hidden text-ink-2",
      render: (row) =>
        row["allowed-channel-groups"]?.length ? (
          <ApiKeyPermissionSummary
            count={row["allowed-channel-groups"].length}
            firstValue={row["allowed-channel-groups"][0]}
            tooltipContent={
              <div className="flex max-w-xs flex-wrap gap-1.5">
                {row["allowed-channel-groups"].map((group) => (
                  <TooltipChip key={group} mono>
                    {group}
                  </TooltipChip>
                ))}
              </div>
            }
          />
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap colorful:text-green-600 colorful:dark:text-green-400">
            <ShieldCheck
              size={14}
              className="text-ink-3 colorful:text-green-600 colorful:dark:text-green-400"
            />{" "}
            {t("api_keys_page.all_channel_groups")}
          </span>
        ),
    },
    {
      key: "allowedChannels",
      label: t("api_keys_page.col_channels"),
      width: COLUMN_WIDTH.badgeGroup,
      cellClassName: "min-w-0 overflow-hidden text-ink-2",
      render: (row) =>
        row["allowed-channels"]?.length ? (
          <ApiKeyPermissionSummary
            count={row["allowed-channels"].length}
            firstValue={row["allowed-channels"][0]}
            tone="cyan"
            tooltipContent={
              <div className="flex max-w-xs flex-wrap gap-1.5">
                {row["allowed-channels"].map((channel) => (
                  <TooltipChip key={channel} mono>
                    {channel}
                  </TooltipChip>
                ))}
              </div>
            }
          />
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap colorful:text-green-600 colorful:dark:text-green-400">
            <ShieldCheck
              size={14}
              className="text-ink-3 colorful:text-green-600 colorful:dark:text-green-400"
            />{" "}
            {t("api_keys_page.all_channels")}
          </span>
        ),
    },
    {
      key: "createdAt",
      label: t("api_keys_page.col_created"),
      width: COLUMN_WIDTH.timestamp,
      cellClassName: "whitespace-nowrap text-ink-3",
      render: (row) => <>{formatApiKeyDate(row["created-at"])}</>,
    },
    {
      key: "actions",
      label: t("api_keys_page.col_actions"),
      ...TABLE_ROW_ACTIONS_COLUMN,
      lockOrder: "end",
      headerClassName: stickyActionsHeaderClass,
      cellClassName: stickyActionsCellClass,
      render: (row, idx) => {
        const toggleLabel = row.disabled
          ? t("api_keys_page.click_enable")
          : t("api_keys_page.click_disable");
        const viewUsageLabel = t("api_keys_page.view_usage");
        const copyKeyLabel = t("api_keys_page.copy_key");
        const importLabel = t("ccswitch.import_to_ccswitch");
        const rotateKeyLabel = t("end_users.rotate_key", { defaultValue: "轮换密钥" });
        const editLabel = t("common.edit");
        const deleteLabel = t("common.delete");
        const hasResettablePeriod = hasPeriodSpendingLimits(
          normalizePeriodSpendingLimits(row["period-spending-limits"], row["daily-spending-limit"]),
        );
        const isResetting = resettingPeriodSpendingKey === (row.id ?? row.key);
        const resetLabel = hasResettablePeriod
          ? t("api_keys_page.reset_period_spending")
          : t("api_keys_page.reset_period_spending_disabled");

        return (
          <TableRowActions
            moreLabel={t("common.more_actions")}
            actions={[
              {
                key: "toggle",
                label: toggleLabel,
                icon: <Power size={15} />,
                // 行内操作是纯图标按钮：表示状态的颜色（启用绿、停用悬停红）和悬停淡底挂在
                // colorful:，表示操作身份的图标色（导入青、编辑琥珀……）挂在 icon-hue:。
                className: row.disabled
                  ? "colorful:hover:bg-red-50 colorful:hover:text-red-500 colorful:dark:hover:bg-red-900/20 colorful:dark:hover:text-red-400"
                  : "colorful:text-emerald-500 colorful:hover:bg-emerald-50 colorful:dark:text-emerald-400 colorful:dark:hover:bg-emerald-900/20",
                onClick: () => onToggleDisable(idx),
              },
              {
                key: "usage",
                label: viewUsageLabel,
                icon: <BarChart3 size={15} />,
                visible: !accountScoped,
                onClick: () => onViewUsage(row),
              },
              {
                key: "copy",
                label: copyKeyLabel,
                icon: <Copy size={15} />,
                onClick: () => onCopy(row.key),
              },
              {
                key: "import",
                label: importLabel,
                icon: <Upload size={15} />,
                className: "icon-hue:hover:text-cyan-600 icon-hue:dark:hover:text-cyan-400",
                onClick: () => onImportToCcSwitch(row),
              },
              {
                key: "rotate",
                label: rotateKeyLabel,
                icon: <RotateCcw size={15} />,
                visible: accountScoped,
                className:
                  "colorful:hover:bg-orange-50 colorful:dark:hover:bg-orange-900/20 icon-hue:hover:text-orange-600 icon-hue:dark:hover:text-orange-400",
                onClick: () => onRotate(idx),
              },
              {
                key: "reset-spending",
                label: resetLabel,
                icon: <RotateCcw size={15} className={isResetting ? "animate-spin" : ""} />,
                disabled: !hasResettablePeriod || isResetting,
                className: "icon-hue:hover:text-orange-600 icon-hue:dark:hover:text-orange-400",
                onClick: () => onResetPeriodSpending(idx),
              },
              {
                key: "edit",
                label: editLabel,
                icon: <Pencil size={15} />,
                className: "icon-hue:hover:text-amber-600 icon-hue:dark:hover:text-amber-400",
                onClick: () => onEdit(idx),
              },
              {
                key: "delete",
                label: deleteLabel,
                icon: <Trash2 size={15} />,
                destructive: true,
                onClick: () => onDelete(idx),
              },
            ]}
          />
        );
      },
    },
  ];

  if (!accountScoped) {
    return columns;
  }
  // Owned keys keep their own period quota and spending facts; account-managed fields stay hidden.
  const hide = new Set([
    "dailyLimit",
    "totalQuota",
    "spendingLimit",
    "rpmLimit",
    "tpmLimit",
    "allowedModels",
    "allowedChannelGroups",
    "allowedChannels",
  ]);
  return columns.filter((col) => !hide.has(String(col.key)));
};
