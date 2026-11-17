import type { ReactNode } from "react";
import { BarChart3, Copy, History, KeyRound, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import {
  hasPeriodSpendingLimits,
  normalizePeriodSpendingLimits,
  type EndUserAPIKey,
} from "@code-proxy/api-client";
import {
  DataGrid,
  GRID_ROW_ACTIONS_COLUMN,
  GRID_WIDTH,
  GridRowActions,
  OverflowTooltip,
  type DataGridColumn,
} from "@code-proxy/ui";
import { PeriodSpendingCell, formatQuotaUsdAmount } from "./PeriodSpendingCell";

export interface OwnedApiKeyActions {
  onViewUsage?: (key: EndUserAPIKey) => void;
  onToggleDisabled?: (key: EndUserAPIKey) => void;
  onCopy?: (key: EndUserAPIKey) => void;
  onRotate?: (key: EndUserAPIKey) => void;
  onEdit?: (key: EndUserAPIKey) => void;
  onResetPeriodSpending?: (key: EndUserAPIKey) => void;
  onViewResetHistory?: (key: EndUserAPIKey) => void;
  onDelete?: (key: EndUserAPIKey) => void;
}

/** 次要标签（default、掩码 Key）：中性淡底，不描边；多彩风格下 default 叠回绿色。 */
const NEUTRAL_TAG = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

export interface OwnedApiKeyColumnOptions {
  /**
   * 额度列的内容。缺省是美元四周期胶囊；后端支持访问策略时，页面传入完整矩阵的用量格
   * （本特性不依赖访问策略特性，渲染由页面注入）。
   */
  renderQuota?: (key: EndUserAPIKey) => ReactNode;
  /** 额度列之后追加的列（例如 Key 的按模型规则）。 */
  extraColumns?: DataGridColumn<EndUserAPIKey>[];
  /** 复制时再按需取明文：列表里没有明文也不禁用复制。 */
  copyOnDemand?: boolean;
  /** 能否重置额度；缺省只看美元四周期。 */
  canResetQuota?: (key: EndUserAPIKey) => boolean;
  /** 额度列的表头；缺省是「配额」（美元四周期）。 */
  quotaLabel?: string;
  /**
   * 弹窗等窄容器用的紧凑布局：密钥并到名称下面一行，停用改成名称旁的标签；当日消费（额度格里已有）、
   * 重置次数（操作菜单里有重置记录）与创建时间不再单列，整张表不必横向滚动。
   */
  compact?: boolean;
}

const buildOwnedApiKeyColumns = ({
  t,
  actions,
  busyKeyId,
  busy: busyAll = false,
  canDelete = () => true,
  renderQuota,
  extraColumns = [],
  copyOnDemand = false,
  canResetQuota,
  quotaLabel,
  compact = false,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  actions: OwnedApiKeyActions;
  busyKeyId?: string | null;
  busy?: boolean;
  canDelete?: (key: EndUserAPIKey) => boolean;
} & OwnedApiKeyColumnOptions): DataGridColumn<EndUserAPIKey>[] => [
  {
    id: "name",
    header: t("api_keys_page.col_name"),
    width: compact ? GRID_WIDTH.name : GRID_WIDTH.numericWide,
    // 紧凑布局的名称格是两行（名称、掩码密钥），整格的溢出提示只会重复第一行。
    overflowTooltip: compact ? false : undefined,
    cell: (row) => (
      <div className="min-w-0 font-medium">
        <div className="flex min-w-0 items-center gap-1.5">
          <OverflowTooltip content={row.name || row.id} className="block min-w-0">
            <span className="block truncate text-ink">
              {row.name || t("api_keys_page.unnamed")}
            </span>
          </OverflowTooltip>
          {row.is_default ? (
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-2xs font-medium ${NEUTRAL_TAG} colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/15 colorful:dark:text-emerald-300`}
            >
              default
            </span>
          ) : null}
          {compact && row.disabled ? (
            <span className="shrink-0 rounded-full bg-ink/[0.05] px-1.5 py-0.5 text-2xs font-medium text-ink-3 dark:bg-white/[0.07]">
              {t("common.disabled")}
            </span>
          ) : null}
        </div>
        {compact ? (
          <code className="mt-0.5 block truncate font-mono text-2xs font-normal text-ink-3">
            {row.key_masked || row.key || row.id}
          </code>
        ) : null}
      </div>
    ),
  },
  {
    id: "key",
    header: t("api_keys_page.col_key"),
    width: 220,
    minWidth: 220,
    // Masked secret is already shown in-cell; overflow tooltip only leaks noise.
    overflowTooltip: false,
    cell: (row) => (
      <code className={`block truncate rounded-md px-2 py-1 font-mono text-xs ${NEUTRAL_TAG}`}>
        {row.key_masked || row.key || row.id}
      </code>
    ),
  },
  {
    id: "status",
    header: t("api_keys_page.col_status"),
    align: "center",
    width: GRID_WIDTH.badge,
    cell: (row) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.disabled ? "bg-ink/[0.05] text-ink-3 dark:bg-white/[0.07]" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"}`}
      >
        {row.disabled ? t("common.disabled") : t("common.enabled")}
      </span>
    ),
  },
  {
    id: "quota",
    header: quotaLabel ?? t("quota.period_spending_column"),
    // 额度格最宽，弹窗里吃掉剩下的宽度。
    width: 360,
    minWidth: 260,
    grow: true,
    // Keys have no lifetime cap of their own — it lives on the account and is
    // enforced across all of the account's keys — so this column stays periodic.
    cell: (row) => (renderQuota ? renderQuota(row) : <PeriodSpendingCell t={t} items={row["period-spending"]} />),
  },
  ...extraColumns,
  {
    id: "dailySpending",
    header: t("quota.daily_spending_column"),
    align: "end",
    width: GRID_WIDTH.compact,
    cell: (row) => (
      <span className="truncate whitespace-nowrap tabular-nums text-ink-2">
        {formatQuotaUsdAmount(row["daily-spending-used"])}
      </span>
    ),
  },
  {
    id: "lifetimeSpending",
    header: t("quota.lifetime_spending_column"),
    align: "end",
    width: GRID_WIDTH.compact,
    cell: (row) => (
      <span className="truncate whitespace-nowrap tabular-nums text-ink-2">
        {formatQuotaUsdAmount(row["lifetime-spending-used"])}
      </span>
    ),
  },
  {
    id: "resetCount",
    header: t("quota.total_resets"),
    align: "end",
    width: GRID_WIDTH.numericWide,
    cell: (row) => {
      const count = row["daily-spending-reset-count"] ?? 0;
      return actions.onViewResetHistory && count > 0 ? (
        <button
          type="button"
          onClick={() => actions.onViewResetHistory?.(row)}
          className="tabular-nums font-medium text-accent-ink underline-offset-2 hover:underline colorful:text-orange-600 colorful:dark:text-orange-400"
          aria-label={t("api_keys_page.view_reset_history")}
        >
          {count}
        </button>
      ) : (
        <span className="tabular-nums text-ink-3">{count}</span>
      );
    },
  },
  {
    id: "created",
    header: t("api_keys_page.col_created"),
    width: GRID_WIDTH.timestamp,
    cell: (row) => (
      <span className="truncate whitespace-nowrap text-xs text-ink-3">
        {row.created_at ? new Date(row.created_at).toLocaleString() : "-"}
      </span>
    ),
  },
  {
    id: "actions",
    header: t("api_keys_page.col_actions"),
    // 冻结在右侧：横向滚动时操作一直在眼前（底色跟随所在的底，见 DataGrid 的 --grid-cell-bg）。
    ...GRID_ROW_ACTIONS_COLUMN,
    cell: (row) => {
      const busy = busyAll || busyKeyId === row.id;
      const hasResettablePeriod = canResetQuota
        ? canResetQuota(row)
        : hasPeriodSpendingLimits(
            normalizePeriodSpendingLimits(row["period-spending-limits"], row["daily-spending-limit"]),
          );
      const deletable = canDelete(row);
      return (
        <GridRowActions
          moreLabel={t("common.more_actions")}
          // 行内只放前三个：编辑（子额度与按模型规则都在里面）最常用排第一；轮换会让旧密钥立即失效，
          // 留在更多菜单里，避免误点。
          actions={[
            {
              key: "edit",
              label: t("api_keys_page.edit_key_quota"),
              icon: <Pencil size={15} />,
              visible: Boolean(actions.onEdit),
              disabled: busy,
              className: "icon-hue:hover:text-amber-600 icon-hue:dark:hover:text-amber-400",
              onClick: () => actions.onEdit?.(row),
            },
            {
              key: "toggle",
              label: row.disabled
                ? t("api_keys_page.click_enable")
                : t("api_keys_page.click_disable"),
              icon: <Power size={15} />,
              visible: Boolean(actions.onToggleDisabled),
              disabled: busy,
              onClick: () => actions.onToggleDisabled?.(row),
            },
            {
              key: "copy",
              label: t("api_keys_page.copy_key"),
              icon: <Copy size={15} />,
              visible: Boolean(actions.onCopy),
              disabled: busy || (!row.key && !copyOnDemand),
              onClick: () => actions.onCopy?.(row),
            },
            {
              key: "rotate",
              label: t("end_users.rotate_key"),
              icon: <RotateCcw size={15} />,
              visible: Boolean(actions.onRotate),
              disabled: busy,
              className: "icon-hue:hover:text-orange-600 icon-hue:dark:hover:text-orange-400",
              onClick: () => actions.onRotate?.(row),
            },
            {
              key: "reset-spending",
              label: hasResettablePeriod
                ? t("api_keys_page.reset_period_spending")
                : t("api_keys_page.reset_period_spending_disabled"),
              icon: <RotateCcw size={15} className={busy ? "animate-spin" : ""} />,
              visible: Boolean(actions.onResetPeriodSpending),
              disabled: busy || !hasResettablePeriod,
              className: "icon-hue:hover:text-orange-600 icon-hue:dark:hover:text-orange-400",
              onClick: () => actions.onResetPeriodSpending?.(row),
            },
            {
              key: "reset-history",
              label: t("api_keys_page.view_reset_history"),
              icon: <History size={15} />,
              visible: Boolean(actions.onViewResetHistory),
              disabled: busy,
              onClick: () => actions.onViewResetHistory?.(row),
            },
            {
              key: "usage",
              label: t("api_keys_page.view_usage"),
              icon: <BarChart3 size={15} />,
              visible: Boolean(actions.onViewUsage),
              onClick: () => actions.onViewUsage?.(row),
            },
            {
              key: "delete",
              label: deletable ? t("common.delete") : t("apikey_lookup.keep_one_key"),
              icon: <Trash2 size={15} />,
              visible: Boolean(actions.onDelete),
              disabled: busy || !deletable,
              destructive: true,
              onClick: () => actions.onDelete?.(row),
            },
          ]}
        />
      );
    },
  },
];

/** 紧凑布局不单列的几列（密钥与停用状态并进了名称格）。 */
const COMPACT_OMITTED_COLUMNS = new Set(["key", "status", "dailySpending", "resetCount", "created"]);

/** 停用的 Key 整行内容变淡；只淡内容不淡底色，冻结的操作列盖住滚过去的格子时仍是不透明的。 */
const DISABLED_ROW = "[&>td>[data-cell-inner]]:opacity-55";

export const createOwnedApiKeyColumns = (
  options: Parameters<typeof buildOwnedApiKeyColumns>[0],
): DataGridColumn<EndUserAPIKey>[] => {
  const columns = buildOwnedApiKeyColumns(options);
  return options.compact ? columns.filter((column) => !COMPACT_OMITTED_COLUMNS.has(column.id)) : columns;
};

/**
 * 某个账号名下的 Key 列表（门户「管理 Key」、用户详情里的 Key 弹窗）。都嵌在卡片或弹窗里，
 * 所以不套外框；加载、空、有数据都是同一张表，首次加载是骨架而不是一块单独的「加载中」。
 */
export function OwnedApiKeysTable({
  t,
  keys,
  actions,
  busyKeyId,
  busy = false,
  loading = false,
  canDelete,
  fill = false,
  maxHeight,
  id = "owned-api-keys",
  ...columnOptions
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keys: EndUserAPIKey[];
  actions: OwnedApiKeyActions;
  busyKeyId?: string | null;
  busy?: boolean;
  loading?: boolean;
  canDelete?: (key: EndUserAPIKey) => boolean;
  /** 父容器给了确定高度（flex-1 min-h-0 的槽位）时铺满它；不传就按行数收高。 */
  fill?: boolean;
  /** 按行收高时的封顶高度（CSS 长度）。 */
  maxHeight?: string;
  /** 列宽、列顺序按表格 id 记忆；列不同的两处用法用不同的 id。 */
  id?: string;
} & OwnedApiKeyColumnOptions) {
  return (
    <DataGrid
      id={id}
      frame={false}
      fill={fill}
      maxHeight={maxHeight}
      label={t("api_keys_page.table_caption")}
      columns={createOwnedApiKeyColumns({ t, actions, busyKeyId, busy, canDelete, ...columnOptions })}
      rows={keys}
      rowKey={(row) => row.id}
      loading={loading}
      empty={{
        title: t("api_keys_page.no_keys"),
        description: t("api_keys_page.no_keys_desc"),
        icon: <KeyRound size={20} strokeWidth={1.5} aria-hidden="true" />,
      }}
      rowClassName={(row) => (row.disabled ? DISABLED_ROW : undefined)}
    />
  );
}
