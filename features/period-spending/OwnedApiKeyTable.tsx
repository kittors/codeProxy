import { Copy, History, KeyRound, Pencil, Power, RotateCcw, Trash2 } from "lucide-react";
import type { EndUserAPIKey } from "@code-proxy/api-client";
import {
  DataTable,
  EmptyState,
  HoverTooltip,
  OverflowTooltip,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PeriodSpendingCell, formatQuotaUsdAmount } from "./PeriodSpendingCell";

const iconButtonClass =
  "rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-35 dark:text-white/50 dark:hover:bg-neutral-800";

export interface OwnedApiKeyActions {
  onToggleDisabled?: (key: EndUserAPIKey) => void;
  onCopy?: (key: EndUserAPIKey) => void;
  onRotate?: (key: EndUserAPIKey) => void;
  onEdit?: (key: EndUserAPIKey) => void;
  onResetDailySpending?: (key: EndUserAPIKey) => void;
  onViewResetHistory?: (key: EndUserAPIKey) => void;
  onDelete?: (key: EndUserAPIKey) => void;
}

export const createOwnedApiKeyColumns = ({
  t,
  actions,
  busyKeyId,
  busy: busyAll = false,
  canDelete = () => true,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  actions: OwnedApiKeyActions;
  busyKeyId?: string | null;
  busy?: boolean;
  canDelete?: (key: EndUserAPIKey) => boolean;
}): DataTableColumn<EndUserAPIKey>[] => [
  {
    key: "name",
    label: t("api_keys_page.col_name"),
    width: "w-[150px] min-w-[150px]",
    cellClassName: "font-medium",
    render: (row) => (
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <OverflowTooltip content={row.name || row.id} className="block min-w-0">
            <span className="block truncate text-slate-900 dark:text-white">
              {row.name || t("api_keys_page.unnamed")}
            </span>
          </OverflowTooltip>
          {row.is_default ? (
            <span className="shrink-0 rounded-full bg-emerald-50 px-1.5 py-0.5 text-2xs font-medium text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              default
            </span>
          ) : null}
        </div>
      </div>
    ),
  },
  {
    key: "key",
    label: t("api_keys_page.col_key"),
    width: "w-[220px] min-w-[220px]",
    // Masked secret is already shown in-cell; overflow tooltip only leaks noise.
    overflowTooltip: false,
    render: (row) => (
      <code className="block truncate rounded-md bg-slate-100 px-2 py-1 font-mono text-xs text-slate-700 dark:bg-neutral-800 dark:text-white/70">
        {row.key_masked || row.key || row.id}
      </code>
    ),
  },
  {
    key: "status",
    label: t("api_keys_page.col_status"),
    width: "w-[92px] min-w-[92px]",
    cellClassName: "text-center",
    render: (row) => (
      <span
        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${row.disabled ? "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/50" : "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"}`}
      >
        {row.disabled ? t("common.disabled") : t("common.enabled")}
      </span>
    ),
  },
  {
    key: "quota",
    label: t("quota.period_spending_column"),
    width: "w-[360px] min-w-[260px]",
    render: (row) => <PeriodSpendingCell t={t} items={row["period-spending"]} />,
  },
  {
    key: "dailySpending",
    label: t("quota.daily_spending_column"),
    width: "w-[130px] min-w-[130px]",
    cellClassName: "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
    render: (row) => formatQuotaUsdAmount(row["daily-spending-used"]),
  },
  {
    key: "lifetimeSpending",
    label: t("quota.lifetime_spending_column"),
    width: "w-[130px] min-w-[130px]",
    cellClassName: "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
    render: (row) => formatQuotaUsdAmount(row["lifetime-spending-used"]),
  },
  {
    key: "resetCount",
    label: t("quota.total_resets"),
    width: "w-[118px] min-w-[118px]",
    cellClassName: "text-center",
    render: (row) => {
      const count = row["daily-spending-reset-count"] ?? 0;
      return actions.onViewResetHistory && count > 0 ? (
        <button
          type="button"
          onClick={() => actions.onViewResetHistory?.(row)}
          className="tabular-nums font-medium text-orange-600 underline-offset-2 hover:underline dark:text-orange-400"
          aria-label={t("api_keys_page.view_reset_history")}
        >
          {count}
        </button>
      ) : (
        <span className="tabular-nums text-slate-500 dark:text-white/55">{count}</span>
      );
    },
  },
  {
    key: "created",
    label: t("api_keys_page.col_created"),
    width: "w-[150px] min-w-[150px]",
    cellClassName: "whitespace-nowrap text-xs text-slate-500 dark:text-white/50",
    render: (row) => (row.created_at ? new Date(row.created_at).toLocaleString() : "-"),
  },
  {
    key: "actions",
    label: t("api_keys_page.col_actions"),
    // 7 icon buttons + gaps; keep sticky actions fully visible without squeeze.
    width: "w-[304px] min-w-[304px]",
    minWidthPx: 304,
    lockOrder: "end",
    overflowTooltip: false,
    headerClassName: "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800",
    cellClassName: "md:sticky md:z-30 md:bg-white md:dark:bg-neutral-950",
    render: (row) => {
      const busy = busyAll || busyKeyId === row.id;
      const hasDayLimit =
        (row["period-spending-limits"]?.day ?? row["daily-spending-limit"] ?? 0) > 0;
      const deletable = canDelete(row);
      return (
        <div className="flex flex-nowrap items-center justify-center gap-0.5">
          {actions.onToggleDisabled ? (
            <HoverTooltip
              content={
                row.disabled ? t("api_keys_page.click_enable") : t("api_keys_page.click_disable")
              }
            >
              <button
                type="button"
                disabled={busy}
                onClick={() => actions.onToggleDisabled?.(row)}
                className={iconButtonClass}
                aria-label={
                  row.disabled ? t("api_keys_page.click_enable") : t("api_keys_page.click_disable")
                }
              >
                <Power size={15} />
              </button>
            </HoverTooltip>
          ) : null}
          {actions.onCopy ? (
            <HoverTooltip content={t("api_keys_page.copy_key")}>
              <button
                type="button"
                disabled={busy || !row.key}
                onClick={() => actions.onCopy?.(row)}
                className={iconButtonClass}
                aria-label={t("api_keys_page.copy_key")}
              >
                <Copy size={15} />
              </button>
            </HoverTooltip>
          ) : null}
          {actions.onRotate ? (
            <HoverTooltip content={t("end_users.rotate_key")}>
              <button
                type="button"
                disabled={busy}
                onClick={() => actions.onRotate?.(row)}
                className={`${iconButtonClass} hover:text-orange-600`}
                aria-label={t("end_users.rotate_key")}
              >
                <RotateCcw size={15} />
              </button>
            </HoverTooltip>
          ) : null}
          {actions.onEdit ? (
            <HoverTooltip content={t("api_keys_page.edit_key_quota")}>
              <button
                type="button"
                disabled={busy}
                onClick={() => actions.onEdit?.(row)}
                className={`${iconButtonClass} hover:text-amber-600`}
                aria-label={t("api_keys_page.edit_key_quota")}
              >
                <Pencil size={15} />
              </button>
            </HoverTooltip>
          ) : null}
          {actions.onResetDailySpending ? (
            <HoverTooltip
              content={
                hasDayLimit
                  ? t("api_keys_page.reset_today_spending")
                  : t("api_keys_page.reset_today_spending_disabled")
              }
            >
              <button
                type="button"
                disabled={busy || !hasDayLimit}
                onClick={() => actions.onResetDailySpending?.(row)}
                className={`${iconButtonClass} hover:text-orange-600`}
                aria-label={t("api_keys_page.reset_today_spending")}
              >
                <RotateCcw size={15} className={busy ? "animate-spin" : ""} />
              </button>
            </HoverTooltip>
          ) : null}
          {actions.onViewResetHistory ? (
            <HoverTooltip content={t("api_keys_page.view_reset_history")}>
              <button
                type="button"
                disabled={busy}
                onClick={() => actions.onViewResetHistory?.(row)}
                className={iconButtonClass}
                aria-label={t("api_keys_page.view_reset_history")}
              >
                <History size={15} />
              </button>
            </HoverTooltip>
          ) : null}
          {actions.onDelete ? (
            <HoverTooltip
              content={deletable ? t("common.delete") : t("apikey_lookup.keep_one_key")}
            >
              <button
                type="button"
                disabled={busy || !deletable}
                onClick={() => actions.onDelete?.(row)}
                className={`${iconButtonClass} hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/20`}
                aria-label={deletable ? t("common.delete") : t("apikey_lookup.keep_one_key")}
              >
                <Trash2 size={15} />
              </button>
            </HoverTooltip>
          ) : null}
        </div>
      );
    },
  },
];

export function OwnedApiKeysTable({
  t,
  keys,
  actions,
  busyKeyId,
  busy = false,
  loading = false,
  canDelete,
  height = "h-[460px]",
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keys: EndUserAPIKey[];
  actions: OwnedApiKeyActions;
  busyKeyId?: string | null;
  busy?: boolean;
  loading?: boolean;
  canDelete?: (key: EndUserAPIKey) => boolean;
  height?: string;
}) {
  // Avoid flashing the empty state while the owner-scoped list is still loading.
  if (loading && keys.length === 0) {
    return (
      <div
        className="flex min-h-[240px] flex-1 items-center justify-center text-sm text-slate-500 dark:text-white/55"
        role="status"
        aria-live="polite"
      >
        {t("common.loading_ellipsis")}
      </div>
    );
  }
  if (!loading && keys.length === 0) {
    return (
      <EmptyState
        title={t("api_keys_page.no_keys")}
        description={t("api_keys_page.no_keys_desc")}
        icon={<KeyRound size={32} className="text-slate-400" />}
      />
    );
  }
  return (
    <DataTable
      tableId="owned-api-keys"
      rows={keys}
      columns={createOwnedApiKeyColumns({ t, actions, busyKeyId, busy, canDelete })}
      rowKey={(row) => row.id}
      rowHeight={52}
      height={height}
      loading={loading}
      minHeight="min-h-[320px]"
      minWidth="min-w-[1580px]"
      caption={t("api_keys_page.table_caption")}
      emptyText={t("api_keys_page.no_api_keys")}
      showAllLoadedMessage={false}
      rowClassName={(row) => (row.disabled ? "opacity-55" : "")}
    />
  );
}
