import type { DataTableColumn } from "@code-proxy/ui";
import { COLUMN_WIDTH, TABLE_ROW_ACTIONS_COLUMN, TableRowActions } from "@code-proxy/ui";
import { Infinity as InfinityIcon, Key, KeyRound, Pencil, RotateCcw, Snowflake, Trash2, Unlock, BarChart3 } from "lucide-react";
import type { ApiKeyPermissionProfile, EndUser } from "@code-proxy/api-client";
import {
  PeriodSpendingCell,
  formatQuotaUsdAmount,
  limitsToPeriodSpendingDraft,
} from "@features/period-spending";
import { normalizePeriodSpendingLimits } from "@code-proxy/api-client";
import { hasResettableQuota, limitToText } from "../endUserForm";
import type { EndUserForm } from "../endUserForm";
import type { Dispatch, SetStateAction } from "react";

const stickyActionsHeaderClass =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickyActionsCellClass = "md:sticky md:z-30 md:bg-white md:dark:bg-neutral-950";

export interface UseEndUserColumnsParams {
  t: (key: string, options?: Record<string, unknown>) => string;
  can: (permission: string) => boolean;
  canWrite: boolean;
  busy: boolean;
  permissionProfiles: ApiKeyPermissionProfile[];
  profileNameById: Map<string, string>;
  handleViewResetHistory: (user: EndUser) => Promise<void>;
  handleViewUserUsage: (user: EndUser) => Promise<void>;
  setFrozen: (row: EndUser, frozen: boolean) => Promise<void>;
  setEditUser: Dispatch<SetStateAction<EndUser | null>>;
  setEditForm: Dispatch<SetStateAction<EndUserForm>>;
  setResetSpendingUser: Dispatch<SetStateAction<EndUser | null>>;
  setResetUser: Dispatch<SetStateAction<EndUser | null>>;
  setDeleteUser: Dispatch<SetStateAction<EndUser | null>>;
  setKeysUser: Dispatch<SetStateAction<EndUser | null>>;
}

export function getEndUserColumns({
  t,
  can,
  canWrite,
  busy,
  permissionProfiles,
  profileNameById,
  handleViewResetHistory,
  handleViewUserUsage,
  setFrozen,
  setEditUser,
  setEditForm,
  setResetSpendingUser,
  setResetUser,
  setDeleteUser,
  setKeysUser,
}: UseEndUserColumnsParams): DataTableColumn<EndUser>[] {
  return [
    {
      key: "account",
      label: t("end_users.username"),
      width: "w-56 min-w-[14rem]",
      minWidthPx: 160,
      maxWidthPx: 480,
      cellClassName: "text-left",
      render: (row) => (
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate font-medium text-slate-900 dark:text-white">
              {row.display_name}
            </span>
            <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-2xs font-medium text-slate-600 dark:bg-white/10 dark:text-white/70">
              {row.api_key_count ?? 0} Key
            </span>
          </div>
          <div className="truncate text-xs text-slate-400">{row.username}</div>
        </div>
      ),
    },
    {
      key: "status",
      label: t("end_users.status"),
      width: COLUMN_WIDTH.badge,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (row) => {
        const active = row.status === "active";
        return (
          <span
            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"}`}
          >
            {active ? t("end_users.status_active") : t("end_users.status_frozen")}
          </span>
        );
      },
    },
    {
      key: "permission",
      label: t("end_users.account_permission_profile"),
      width: COLUMN_WIDTH.name,
      headerClassName: "text-center",
      cellClassName: "text-center text-slate-700 dark:text-white/70",
      render: (row) => {
        const id = row["permission-profile-id"]?.trim() ?? "";
        return id
          ? profileNameById.get(id) || id
          : t("api_keys_page.permission_profile_unrestricted");
      },
    },
    {
      key: "quota",
      label: t("quota.period_spending_column"),
      width: "w-[390px] min-w-[280px]",
      render: (row) => (
        <PeriodSpendingCell
          t={t}
          items={row["period-spending"]}
          lifetime={{
            used: row["lifetime-spending-used"],
            limit: row["spending-limit"],
          }}
        />
      ),
    },
    {
      key: "dailySpending",
      label: t("quota.daily_spending_column"),
      width: COLUMN_WIDTH.compact,
      cellClassName:
        "text-center whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => formatQuotaUsdAmount(row["daily-spending-used"]),
    },
    {
      key: "lifetimeSpending",
      label: t("quota.lifetime_spending_column"),
      width: COLUMN_WIDTH.compact,
      cellClassName:
        "text-center whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => formatQuotaUsdAmount(row["lifetime-spending-used"]),
    },
    {
      key: "dailyLimit",
      label: t("api_keys_page.col_daily_limit"),
      width: COLUMN_WIDTH.compact,
      headerClassName: "text-center",
      cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
      render: (row) => {
        const profile = row["permission-profile-id"]
          ? (permissionProfiles.find((item) => item.id === row["permission-profile-id"]) ?? null)
          : null;
        const limit = profile?.["daily-limit"] ?? row["daily-limit"];
        return (
          <span className="inline-flex items-center gap-1">
            {!limit ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              limit.toLocaleString()
            )}
          </span>
        );
      },
    },
    {
      key: "totalQuota",
      label: t("api_keys_page.col_total_quota"),
      width: COLUMN_WIDTH.compact,
      headerClassName: "text-center",
      cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
      render: (row) => {
        const profile = row["permission-profile-id"]
          ? (permissionProfiles.find((item) => item.id === row["permission-profile-id"]) ?? null)
          : null;
        const limit = profile?.["total-quota"] ?? row["total-quota"];
        return (
          <span className="inline-flex items-center gap-1">
            {!limit ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              limit.toLocaleString()
            )}
          </span>
        );
      },
    },
    {
      key: "concurrencyLimit",
      label: t("end_users.concurrency_limit_col", { defaultValue: "并发" }),
      width: COLUMN_WIDTH.toggle,
      headerClassName: "text-center",
      cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
      render: (row) => {
        const profile = row["permission-profile-id"]
          ? (permissionProfiles.find((item) => item.id === row["permission-profile-id"]) ?? null)
          : null;
        const limit = profile?.["concurrency-limit"] ?? row["concurrency-limit"];
        return (
          <span className="inline-flex items-center gap-1">
            {!limit ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              limit.toLocaleString()
            )}
          </span>
        );
      },
    },
    {
      key: "rpmLimit",
      label: "RPM",
      width: COLUMN_WIDTH.toggle,
      headerClassName: "text-center",
      cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
      render: (row) => {
        const profile = row["permission-profile-id"]
          ? (permissionProfiles.find((item) => item.id === row["permission-profile-id"]) ?? null)
          : null;
        const limit = profile?.["rpm-limit"] ?? row["rpm-limit"];
        return (
          <span className="inline-flex items-center gap-1">
            {!limit ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              limit.toLocaleString()
            )}
          </span>
        );
      },
    },
    {
      key: "tpmLimit",
      label: "TPM",
      width: COLUMN_WIDTH.toggle,
      headerClassName: "text-center",
      cellClassName: "text-center whitespace-nowrap text-slate-700 dark:text-white/70",
      render: (row) => {
        const profile = row["permission-profile-id"]
          ? (permissionProfiles.find((item) => item.id === row["permission-profile-id"]) ?? null)
          : null;
        const limit = profile?.["tpm-limit"] ?? row["tpm-limit"];
        return (
          <span className="inline-flex items-center gap-1">
            {!limit ? (
              <>
                <InfinityIcon size={14} className="text-green-500" />{" "}
                {t("api_keys_page.unlimited")}
              </>
            ) : (
              limit.toLocaleString()
            )}
          </span>
        );
      },
    },
    {
      key: "totalResets",
      label: t("quota.total_resets"),
      width: COLUMN_WIDTH.timestamp,
      headerClassName: "text-center",
      cellClassName: "text-center",
      render: (row) => {
        const count = row["daily-spending-reset-count"] ?? 0;
        return count > 0 ? (
          <button
            type="button"
            onClick={() => void handleViewResetHistory(row)}
            className="tabular-nums font-medium text-orange-600 underline-offset-2 hover:underline dark:text-orange-400"
            aria-label={t("end_users.view_reset_history")}
          >
            {count}
          </button>
        ) : (
          <span className="tabular-nums text-slate-400 dark:text-white/40">0</span>
        );
      },
    },
    {
      key: "lastLogin",
      label: t("end_users.last_login"),
      width: COLUMN_WIDTH.timestamp,
      cellClassName: "text-center text-xs text-slate-500 dark:text-white/50",
      render: (row) => (row.last_login_at ? new Date(row.last_login_at).toLocaleString() : "-"),
    },
    {
      key: "actions",
      label: t("common.action"),
      ...TABLE_ROW_ACTIONS_COLUMN,
      lockOrder: "end",
      headerClassName: stickyActionsHeaderClass,
      cellClassName: stickyActionsCellClass,
      render: (row) => {
        const hasResettablePeriod = hasResettableQuota(row);
        const resetLabel = hasResettablePeriod
          ? t("end_users.reset_period_spending")
          : t("end_users.reset_period_spending_disabled");
        return (
          <TableRowActions
            moreLabel={t("common.more_actions")}
            actions={[
              {
                key: "usage",
                label: t("end_users.view_usage"),
                icon: <BarChart3 className="h-4 w-4" />,
                onClick: () => void handleViewUserUsage(row),
              },
              {
                key: "keys",
                label: t("end_users.manage_keys"),
                icon: <Key className="h-4 w-4" />,
                visible: can("api_keys.read"),
                onClick: () => setKeysUser(row),
              },
              {
                key: "edit",
                label: t("end_users.edit"),
                icon: <Pencil className="h-4 w-4" />,
                visible: canWrite,
                onClick: () => {
                  const profile = row["permission-profile-id"]
                    ? (permissionProfiles.find(
                        (item) => item.id === row["permission-profile-id"],
                      ) ?? null)
                    : null;
                  setEditUser(row);
                  setEditForm({
                    username: row.username,
                    displayName: row.display_name,
                    password: "",
                    permissionProfileId: row["permission-profile-id"] ?? "",
                    spendingLimit: limitToText(row["spending-limit"]),
                    dailyLimit: limitToText(profile?.["daily-limit"] ?? row["daily-limit"]),
                    totalQuota: limitToText(profile?.["total-quota"] ?? row["total-quota"]),
                    concurrencyLimit: limitToText(
                      profile?.["concurrency-limit"] ?? row["concurrency-limit"],
                    ),
                    rpmLimit: limitToText(profile?.["rpm-limit"] ?? row["rpm-limit"]),
                    tpmLimit: limitToText(profile?.["tpm-limit"] ?? row["tpm-limit"]),
                    periodSpending: limitsToPeriodSpendingDraft(
                      profile?.["period-spending-limits"] ??
                        normalizePeriodSpendingLimits(
                          row["period-spending-limits"],
                          row["daily-spending-limit"],
                        ),
                    ),
                  });
                },
              },
              {
                key: "status",
                label: row.status === "active" ? t("end_users.freeze") : t("end_users.activate"),
                icon:
                  row.status === "active" ? (
                    <Snowflake className="h-4 w-4" />
                  ) : (
                    <Unlock className="h-4 w-4" />
                  ),
                visible: canWrite,
                disabled: busy,
                onClick: () => void setFrozen(row, row.status === "active"),
              },
              {
                key: "reset-spending",
                label: resetLabel,
                icon: <RotateCcw className="h-4 w-4" />,
                visible: canWrite,
                disabled: busy || !hasResettablePeriod,
                onClick: () => setResetSpendingUser(row),
              },
              {
                key: "reset-password",
                label: t("end_users.reset_password"),
                icon: <KeyRound className="h-4 w-4" />,
                visible: canWrite,
                onClick: () => setResetUser(row),
              },
              {
                key: "delete",
                label: t("common.delete"),
                icon: <Trash2 className="h-4 w-4" />,
                visible: canWrite,
                destructive: true,
                onClick: () => setDeleteUser(row),
              },
            ]}
          />
        );
      },
    },
  ];
}
