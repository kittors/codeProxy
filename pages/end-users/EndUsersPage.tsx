import { lazy, Suspense, useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Key,
  KeyRound,
  Pencil,
  RotateCcw,
  Search,
  Snowflake,
  Trash2,
  Unlock,
} from "lucide-react";
import {
  apiKeyEntriesApi,
  apiKeyPermissionProfilesApi,
  endUsersApi,
  type ApiKeyPermissionProfile,
  type CreateEndUserResult,
  type EndUser,
  type EndUserDailySpendingResetEvent,
  type EndUserUpdateBody,
  type QuotaResetPeriod,
} from "@code-proxy/api-client";
import {
  Button,
  COLUMN_WIDTH,
  Card,
  ConfirmModal,
  DataTable,
  Modal,
  PaginationBar,
  SecretRevealModal,
  Select,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  TextInput,
  useToast,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/providers/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";
import { useApiKeyPermissionOptions } from "@features/api-key-restrictions";
import { ErrorDetailModal, LogContentModal } from "@features/log-content-viewer";
import { ApiKeyUsageModal } from "../api-keys/components/ApiKeyUsageModal";
import { useApiKeyUsageView } from "../api-keys/hooks/useApiKeyUsageView";
import { EndUserResetHistoryModal } from "./components/EndUserResetHistoryModal";
import { EndUserEditModal } from "./components/EndUserEditModal";
import {
  emptyForm,
  hasResettableQuota,
  limitToText,
  requestLimitFromText,
  spendingLimitFromText,
} from "./endUserForm";
import type { EndUserForm } from "./endUserForm";
import {
  PeriodSpendingCell,
  PeriodQuotaResetModal,
  formatQuotaValidationError,
  formatQuotaUsdAmount,
  limitsToPeriodSpendingDraft,
  periodSpendingDraftToLimits,
} from "@features/period-spending";
import { normalizePeriodSpendingLimits } from "@code-proxy/api-client";

type EndUserStatusFilter = "all" | "active" | "frozen";
const DEFAULT_END_USER_PAGE_SIZE = 20;
const END_USER_PAGE_SIZE_OPTIONS = [20, 50, 100];

const stickyActionsHeaderClass =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
const stickyActionsCellClass = "md:sticky md:z-30 md:bg-white md:dark:bg-neutral-950";

const ApiKeysPage = lazy(() =>
  import("../api-keys/ApiKeysPage").then((m) => ({ default: m.ApiKeysPage })),
);

export function EndUsersPage() {
  const { notify } = useToast();
  const { t } = useTranslation();
  const { can } = useAuth();
  const [users, setUsers] = useState<EndUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<EndUserForm>(() => emptyForm());
  const [createdSecrets, setCreatedSecrets] = useState<CreateEndUserResult | null>(null);
  const [editUser, setEditUser] = useState<EndUser | null>(null);
  const [editForm, setEditForm] = useState<EndUserForm>(() => emptyForm());
  const [resetUser, setResetUser] = useState<EndUser | null>(null);
  const [resetSpendingUser, setResetSpendingUser] = useState<EndUser | null>(null);
  const [generatedReset, setGeneratedReset] = useState("");
  const [deleteUser, setDeleteUser] = useState<EndUser | null>(null);
  const [keysUser, setKeysUser] = useState<EndUser | null>(null);
  const [resetHistoryUser, setResetHistoryUser] = useState<EndUser | null>(null);
  const [resetHistoryLoading, setResetHistoryLoading] = useState(false);
  const [resetHistoryEvents, setResetHistoryEvents] = useState<EndUserDailySpendingResetEvent[]>(
    [],
  );
  const [resetHistoryRawTodayCost, setResetHistoryRawTodayCost] = useState<number>();
  const [resetHistoryDailySpendingUsed, setResetHistoryDailySpendingUsed] = useState<number>();
  const [busy, setBusy] = useState(false);
  const [permissionProfiles, setPermissionProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<EndUserStatusFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_END_USER_PAGE_SIZE);
  const canWrite = can("end_users.write");
  const { refreshPermissionOptions } = useApiKeyPermissionOptions();
  const {
    usageViewKey,
    usageViewName,
    usageLoading,
    usageTotalCount,
    usageSummary,
    usageCurrentPage,
    usagePageSize,
    setUsagePageSize,
    usageLastUpdatedText,
    usageTimeRange,
    setUsageTimeRange,
    usageKeyQuery,
    setUsageKeyQuery,
    usageChannelQuery,
    setUsageChannelQuery,
    usageModelQuery,
    setUsageModelQuery,
    usageStatusFilter,
    setUsageStatusFilter,
    usageContentModalOpen,
    setUsageContentModalOpen,
    usageContentModalLogId,
    usageContentModalModel,
    usageContentModalTab,
    usageErrorModalOpen,
    setUsageErrorModalOpen,
    usageErrorModalLogId,
    usageErrorModalModel,
    usageLogColumns,
    usageRows,
    usageTotalPages,
    usageKeyOptions,
    usageChannelOptions,
    usageModelOptions,
    usageStatusOptions,
    fetchUsageLogs,
    openUsageView,
    closeUsageModal,
  } = useApiKeyUsageView();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await endUsersApi.list();
      setUsers(res.items ?? []);
    } catch (e) {
      notify({ type: "error", message: e instanceof Error ? e.message : "load failed" });
    } finally {
      setLoading(false);
    }
  }, [notify]);

  const loadProfiles = useCallback(async () => {
    try {
      const profiles = await apiKeyPermissionProfilesApi.list();
      setPermissionProfiles(Array.isArray(profiles) ? profiles : []);
    } catch {
      setPermissionProfiles([]);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadProfiles();
    void refreshPermissionOptions();
  }, [load, loadProfiles, refreshPermissionOptions]);

  const profileNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of permissionProfiles) map.set(p.id, p.name);
    return map;
  }, [permissionProfiles]);

  const permissionProfileOptions = useMemo(
    () => [
      {
        value: "",
        label: t("api_keys_page.permission_profile_unrestricted", { defaultValue: "不限制" }),
      },
      ...permissionProfiles.map((p) => ({ value: p.id, label: p.name })),
    ],
    [permissionProfiles, t],
  );

  const statusFilterOptions = useMemo(
    () => [
      { value: "all", label: t("end_users.status_all", { defaultValue: "全部状态" }) },
      { value: "active", label: t("end_users.status_active") },
      { value: "frozen", label: t("end_users.status_frozen") },
    ],
    [t],
  );

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return users.filter((user) => {
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" ? user.status === "active" : user.status !== "active");
      if (!matchesStatus) return false;
      if (!query) return true;
      return [user.username, user.display_name, user.id].some((value) =>
        value.toLowerCase().includes(query),
      );
    });
  }, [searchQuery, statusFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const effectivePage = Math.min(currentPage, totalPages);
  const paginatedUsers = useMemo(() => {
    const start = (effectivePage - 1) * pageSize;
    return filteredUsers.slice(start, start + pageSize);
  }, [effectivePage, filteredUsers, pageSize]);
  const hasActiveFilters = searchQuery.trim().length > 0 || statusFilter !== "all";

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, totalPages));
  }, [totalPages]);

  const selectedEditProfile = useMemo(
    () =>
      editForm.permissionProfileId
        ? (permissionProfiles.find((profile) => profile.id === editForm.permissionProfileId) ??
          null)
        : null,
    [editForm.permissionProfileId, permissionProfiles],
  );

  const setFrozen = useCallback(
    async (row: EndUser, frozen: boolean) => {
      setBusy(true);
      try {
        await endUsersApi.update(row.id, { status: frozen ? "locked" : "active" });
        notify({
          type: "success",
          message: frozen
            ? t("end_users.frozen_success", { defaultValue: "账号已冻结" })
            : t("end_users.activated_success", { defaultValue: "账号已激活" }),
        });
        await load();
      } catch (e) {
        notify({ type: "error", message: e instanceof Error ? e.message : "failed" });
      } finally {
        setBusy(false);
      }
    },
    [load, notify, t],
  );

  const resetPeriodSpending = useCallback(
    async (row: EndUser, periods: QuotaResetPeriod[]) => {
      if (periods.length === 0) return;
      setBusy(true);
      try {
        await endUsersApi.resetPeriodSpending(row.id, periods);
        notify({
          type: "success",
          message: t("end_users.reset_period_spending_success"),
        });
        setResetSpendingUser(null);
        await load();
      } catch (e) {
        notify({
          type: "error",
          message: e instanceof Error ? e.message : t("end_users.reset_period_spending_failed"),
        });
      } finally {
        setBusy(false);
      }
    },
    [load, notify, t],
  );

  const handleViewResetHistory = useCallback(
    async (row: EndUser) => {
      setResetHistoryUser(row);
      setResetHistoryEvents([]);
      setResetHistoryRawTodayCost(undefined);
      setResetHistoryDailySpendingUsed(row["daily-spending-used"]);
      setResetHistoryLoading(true);
      try {
        const response = await endUsersApi.listDailySpendingResetHistory(row.id, 200);
        setResetHistoryEvents(Array.isArray(response?.items) ? response.items : []);
        setResetHistoryRawTodayCost(response?.["raw-today-cost"]);
        setResetHistoryDailySpendingUsed(
          response?.["daily-spending-used"] ?? row["daily-spending-used"],
        );
      } catch (e) {
        notify({
          type: "error",
          message:
            e instanceof Error
              ? e.message
              : t("end_users.reset_history_load_failed", {
                  defaultValue: "加载重置历史失败",
                }),
        });
        setResetHistoryUser(null);
      } finally {
        setResetHistoryLoading(false);
      }
    },
    [notify, t],
  );

  const handleViewUserUsage = useCallback(
    async (row: EndUser) => {
      const name =
        row.display_name || row.username || t("end_users.unnamed", { defaultValue: "未命名用户" });
      try {
        const entries = await apiKeyEntriesApi.list();
        const keyNames: Record<string, string> = {};
        const keys = entries
          .filter((e) => e.end_user_id === row.id && e.key?.trim())
          .map((e) => {
            const key = e.key.trim();
            if (e.name?.trim()) keyNames[key] = e.name.trim();
            return key;
          });
        if (keys.length === 0) {
          notify({
            type: "info",
            message: t("end_users.no_keys_for_usage", {
              defaultValue: "该用户暂无 API 密钥，无法查看用量",
            }),
          });
          return;
        }
        openUsageView(keys, name, keyNames);
      } catch (e) {
        notify({
          type: "error",
          message: e instanceof Error ? e.message : t("api_keys_page.load_usage_failed"),
        });
      }
    },
    [notify, openUsageView, t],
  );

  const columns = useMemo<DataTableColumn<EndUser>[]>(
    () => [
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
    ],
    [
      busy,
      can,
      canWrite,
      handleViewResetHistory,
      handleViewUserUsage,
      permissionProfiles,
      profileNameById,
      setFrozen,
      t,
    ],
  );

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const result = await endUsersApi.create({
        username: form.username.trim() || undefined,
        display_name: form.displayName.trim(),
        password: form.password || undefined,
      });
      setCreateOpen(false);
      setForm(emptyForm());
      if (result.generated_password || result.default_api_key?.key) {
        setCreatedSecrets(result);
      } else {
        notify({ type: "success", message: t("end_users.created", { defaultValue: "已创建" }) });
      }
      await load();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!resetUser) return;
    setBusy(true);
    try {
      const res = await endUsersApi.resetPassword(resetUser.id);
      setGeneratedReset(res.generated_password || "");
      notify({
        type: "success",
        message: t("end_users.password_reset", { defaultValue: "密码已重置，请立即复制" }),
      });
      setResetUser(null);
      await load();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  };

  const onEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setBusy(true);
    try {
      const body: EndUserUpdateBody = {};
      const nextUsername = editForm.username.trim();
      const nextDisplay = editForm.displayName.trim();
      const nextProfile = editForm.permissionProfileId.trim();
      const prevProfile = (editUser["permission-profile-id"] ?? "").trim();
      const nextSpendingLimit = spendingLimitFromText(editForm.spendingLimit);
      const previousSpendingLimit = editUser["spending-limit"] ?? 0;
      const directLimits = {
        "daily-limit": requestLimitFromText(editForm.dailyLimit),
        "total-quota": requestLimitFromText(editForm.totalQuota),
        "concurrency-limit": requestLimitFromText(editForm.concurrencyLimit),
        "rpm-limit": requestLimitFromText(editForm.rpmLimit),
        "tpm-limit": requestLimitFromText(editForm.tpmLimit),
      };

      if (nextUsername && nextUsername !== editUser.username) body.username = nextUsername;
      if (nextDisplay && nextDisplay !== editUser.display_name) body.display_name = nextDisplay;
      if (editForm.password.trim()) body.password = editForm.password;
      if (nextSpendingLimit !== previousSpendingLimit) {
        body["spending-limit"] = nextSpendingLimit;
      }

      if (nextProfile !== prevProfile) {
        body["permission-profile-id"] = nextProfile;
      }

      const profile = nextProfile
        ? (permissionProfiles.find((item) => item.id === nextProfile) ?? null)
        : null;
      if (profile && nextProfile !== prevProfile) {
        body["daily-limit"] = profile["daily-limit"];
        body["total-quota"] = profile["total-quota"];
        body["concurrency-limit"] = profile["concurrency-limit"];
        body["rpm-limit"] = profile["rpm-limit"];
        body["tpm-limit"] = profile["tpm-limit"];
        body["allowed-models"] = [...profile["allowed-models"]];
        body["allowed-channels"] = [...profile["allowed-channels"]];
        body["allowed-channel-groups"] = [...profile["allowed-channel-groups"]];
        body["system-prompt"] = profile["system-prompt"];
      }

      if (!profile) {
        if (directLimits["daily-limit"] !== (editUser["daily-limit"] ?? 0)) {
          body["daily-limit"] = directLimits["daily-limit"];
        }
        if (directLimits["total-quota"] !== (editUser["total-quota"] ?? 0)) {
          body["total-quota"] = directLimits["total-quota"];
        }
        if (directLimits["concurrency-limit"] !== (editUser["concurrency-limit"] ?? 0)) {
          body["concurrency-limit"] = directLimits["concurrency-limit"];
        }
        if (directLimits["rpm-limit"] !== (editUser["rpm-limit"] ?? 0)) {
          body["rpm-limit"] = directLimits["rpm-limit"];
        }
        if (directLimits["tpm-limit"] !== (editUser["tpm-limit"] ?? 0)) {
          body["tpm-limit"] = directLimits["tpm-limit"];
        }
        const nextLimits = periodSpendingDraftToLimits(editForm.periodSpending);
        const previousLimits = normalizePeriodSpendingLimits(
          editUser["period-spending-limits"],
          editUser["daily-spending-limit"],
        );
        if (JSON.stringify(nextLimits) !== JSON.stringify(previousLimits)) {
          body["daily-spending-limit"] = nextLimits.day;
          body["period-spending-limits"] = nextLimits;
        }
      }

      if (Object.keys(body).length === 0) {
        setEditUser(null);
        return;
      }
      const updated = await endUsersApi.update(editUser.id, body);
      notify({
        type: "success",
        message: updated["capped-keys"]?.length
          ? t("api_key_permissions_page.saved_with_caps", {
              keys: updated["capped-keys"].length,
            })
          : t("end_users.updated"),
      });
      setEditUser(null);
      setEditForm(emptyForm());
      await load();
    } catch (err) {
      notify({ type: "error", message: formatQuotaValidationError(err, t) });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!deleteUser) return;
    setBusy(true);
    try {
      await endUsersApi.remove(deleteUser.id);
      setDeleteUser(null);
      await load();
    } catch (err) {
      notify({ type: "error", message: err instanceof Error ? err.message : "failed" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PermissionGate permission="end_users.read" anyOf={["api_keys.read"]}>
      {/* Match AI accounts / api-keys card height so top/bottom shell padding stay even on large screens. */}
      <div className="space-y-6">
        <Card
          className="md:flex md:h-[calc(100dvh-112px)] md:min-h-0 md:flex-col md:overflow-hidden"
          bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
          title={t("end_users.title", { defaultValue: "用户账号" })}
          description={t("end_users.subtitle", {
            defaultValue:
              "门户用户账号（与后台管理员隔离）。每日限额/总配额/权限在账号上统一配置，该用户下全部 API Key 共用同一额度池。",
          })}
          actions={
            canWrite ? (
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                {t("end_users.create", { defaultValue: "创建用户" })}
              </Button>
            ) : null
          }
          loading={loading}
        >
          <div className="mb-3 flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1 sm:max-w-sm">
              <TextInput
                size="sm"
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setCurrentPage(1);
                }}
                placeholder={t("end_users.search_placeholder", {
                  defaultValue: "搜索用户名、昵称或 ID",
                })}
                aria-label={t("end_users.search_label", { defaultValue: "搜索用户账号" })}
                startAdornment={
                  <Search className="h-4 w-4 text-slate-400 dark:text-white/40" aria-hidden />
                }
              />
            </div>
            <Select
              size="sm"
              value={statusFilter}
              onChange={(value) => {
                setStatusFilter(value === "active" || value === "frozen" ? value : "all");
                setCurrentPage(1);
              }}
              options={statusFilterOptions}
              aria-label={t("end_users.status_filter", { defaultValue: "按状态筛选" })}
              className="w-full sm:w-40"
            />
            {hasActiveFilters ? (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                onClick={() => {
                  setSearchQuery("");
                  setStatusFilter("all");
                  setCurrentPage(1);
                }}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                {t("end_users.clear_filters", { defaultValue: "清除筛选" })}
              </Button>
            ) : null}
          </div>
          <DataTable
            tableId="end-users"
            rows={paginatedUsers}
            columns={columns}
            rowKey={(r) => r.id}
            virtualize={false}
            rowHeight={60}
            height="h-[calc(100dvh-360px)] md:h-auto md:flex-1"
            minHeight="min-h-[320px] md:min-h-0"
            minWidth="min-w-[1720px]"
            emptyText={
              hasActiveFilters
                ? t("end_users.filtered_empty", { defaultValue: "没有符合筛选条件的用户账号" })
                : t("end_users.empty", { defaultValue: "暂无用户账号" })
            }
            showAllLoadedMessage={false}
            columnResizable
          />
          <PaginationBar
            currentPage={effectivePage}
            totalPages={totalPages}
            totalCount={filteredUsers.length}
            pageSize={pageSize}
            onPageChange={setCurrentPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setCurrentPage(1);
            }}
            pageSizeOptions={END_USER_PAGE_SIZE_OPTIONS}
            className="mt-3 border-t border-slate-100 pt-3 dark:border-white/8"
            labels={{
              firstPage: t("end_users.first_page", { defaultValue: "首页" }),
              previousPage: t("end_users.previous_page", { defaultValue: "上一页" }),
              nextPage: t("end_users.next_page", { defaultValue: "下一页" }),
              lastPage: t("end_users.last_page", { defaultValue: "末页" }),
              rowsPerPage: t("end_users.rows_per_page", { defaultValue: "每页行数" }),
              pageInfo: ({ start, end, total }) =>
                t("end_users.page_info", {
                  defaultValue: "第 {{start}}-{{end}} 条，共 {{total}} 条",
                  start,
                  end,
                  total,
                }),
            }}
          />
        </Card>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title={t("end_users.create", { defaultValue: "创建用户" })}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>{t("common.cancel")}</Button>
            <Button
              type="submit"
              form="create-end-user-form"
              variant="primary"
              disabled={busy || !form.displayName.trim()}
            >
              {t("end_users.create", { defaultValue: "创建" })}
            </Button>
          </>
        }
      >
        <form id="create-end-user-form" className="space-y-3" onSubmit={onCreate}>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.display_name", { defaultValue: "昵称" })}
            </span>
            <TextInput
              value={form.displayName}
              onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
              required
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.username", { defaultValue: "用户名（可选）" })}
            </span>
            <TextInput
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              placeholder={t("end_users.username_placeholder")}
            />
          </label>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium">
              {t("end_users.password", { defaultValue: "密码（可选）" })}
            </span>
            <TextInput
              type="password"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={t("end_users.password_placeholder")}
            />
          </label>
          <p className="text-xs text-amber-600">
            {t("end_users.password_hint", {
              defaultValue: "不填密码将随机生成；生成后只展示一次，哈希后无法再查看。",
            })}
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(createdSecrets)}
        onClose={() => setCreatedSecrets(null)}
        title={t("end_users.copy_secrets", { defaultValue: "请立即复制凭证" })}
      >
        {createdSecrets ? (
          <div className="space-y-3 text-sm">
            <p className="font-medium text-amber-600">{t("end_users.secrets_one_time_hint")}</p>
            <div>
              用户名：<code>{createdSecrets.user.username}</code>
            </div>
            {createdSecrets.generated_password ? (
              <div>
                密码：
                <code className="select-all break-all">{createdSecrets.generated_password}</code>
              </div>
            ) : null}
            {createdSecrets.default_api_key?.key ? (
              <div>
                {t("end_users.initial_api_key", { defaultValue: "初始 API Key" })}：
                <code className="select-all break-all">{createdSecrets.default_api_key.key}</code>
              </div>
            ) : null}
            <Button onClick={() => setCreatedSecrets(null)}>{t("end_users.secrets_copied_close")}</Button>
          </div>
        ) : null}
      </Modal>

      <EndUserEditModal
        t={t}
        open={Boolean(editUser)}
        user={editUser}
        form={editForm}
        onFormChange={setEditForm}
        permissionProfiles={permissionProfiles}
        permissionProfileOptions={permissionProfileOptions}
        selectedProfile={selectedEditProfile}
        busy={busy}
        onSubmit={onEdit}
        onClose={() => {
          setEditUser(null);
          setEditForm(emptyForm());
        }}
      />

      <SecretRevealModal
        open={Boolean(generatedReset)}
        onClose={() => setGeneratedReset("")}
        title={t("end_users.new_password_title", { defaultValue: "新密码（请立即复制）" })}
        secret={generatedReset}
        warning={t("end_users.new_password_warning", {
          defaultValue: "请立即复制新密码，关闭后将无法再次查看。",
        })}
      />

      <ConfirmModal
        open={Boolean(resetUser)}
        onClose={() => setResetUser(null)}
        title={t("end_users.reset_password_title")}
        description={`将为 ${resetUser?.username ?? ""} 生成新随机密码，旧会话失效。`}
        confirmText="重置"
        busy={busy}
        onConfirm={() => void onReset()}
      />
      <PeriodQuotaResetModal
        open={Boolean(resetSpendingUser)}
        scope="account"
        subjectName={
          resetSpendingUser
            ? resetSpendingUser.display_name &&
              resetSpendingUser.display_name !== resetSpendingUser.username
              ? `${resetSpendingUser.display_name} / ${resetSpendingUser.username}`
              : resetSpendingUser.username
            : ""
        }
        configuredLimits={
          resetSpendingUser
            ? normalizePeriodSpendingLimits(
                resetSpendingUser["period-spending-limits"],
                resetSpendingUser["daily-spending-limit"],
              )
            : undefined
        }
        periodSpendingItems={resetSpendingUser?.["period-spending"]}
        lifetimeLimit={resetSpendingUser?.["spending-limit"]}
        busy={busy}
        onClose={() => setResetSpendingUser(null)}
        onConfirm={(periods) => resetSpendingUser && void resetPeriodSpending(resetSpendingUser, periods)}
      />
      <ConfirmModal
        open={Boolean(deleteUser)}
        onClose={() => setDeleteUser(null)}
        title={t("end_users.delete_title", { defaultValue: "删除用户账号" })}
        description={`删除 ${deleteUser?.username ?? ""}？其 API Key 将被禁用并解除归属，且无法再用于调用。`}
        confirmText="删除"
        busy={busy}
        onConfirm={() => void onDelete()}
      />

      <Modal
        open={Boolean(keysUser)}
        onClose={() => {
          setKeysUser(null);
          void load();
        }}
        title={
          keysUser
            ? t("end_users.manage_keys_title_for", {
                defaultValue: "管理密钥 · {{name}}",
                name: keysUser.display_name || keysUser.username,
              })
            : t("end_users.manage_keys_title", { defaultValue: "用户 API 密钥" })
        }
        description={t("end_users.manage_keys_desc", {
          defaultValue:
            "管理该账号下各把 API Key 的名称、启停、轮换与 Key 子额度；账号额度与权限请在账号编辑中配置。",
        })}
        maxWidth="max-w-[96vw]"
        panelClassName="h-[min(90dvh,920px)]"
        bodyHeightClassName="h-[calc(min(90dvh,920px)-7.5rem)]"
        bodyOverflowClassName="overflow-hidden"
        bodyClassName="!p-0"
      >
        {keysUser ? (
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center text-sm text-slate-500">
                Loading…
              </div>
            }
          >
            <ApiKeysPage
              endUserId={keysUser.id}
              accountPeriodSpendingLimits={normalizePeriodSpendingLimits(
                keysUser["period-spending-limits"],
                keysUser["daily-spending-limit"],
              )}
              embed
            />
          </Suspense>
        ) : null}
      </Modal>

      <EndUserResetHistoryModal
        open={resetHistoryUser !== null}
        onClose={() => {
          setResetHistoryUser(null);
          setResetHistoryEvents([]);
          setResetHistoryRawTodayCost(undefined);
          setResetHistoryDailySpendingUsed(undefined);
        }}
        userName={
          resetHistoryUser
            ? resetHistoryUser.display_name.trim() &&
              resetHistoryUser.display_name.trim() !== resetHistoryUser.username.trim()
              ? `${resetHistoryUser.display_name.trim()} / ${resetHistoryUser.username.trim()}`
              : resetHistoryUser.display_name.trim() || resetHistoryUser.username.trim()
            : ""
        }
        loading={resetHistoryLoading}
        events={resetHistoryEvents}
        rawTodayCost={resetHistoryRawTodayCost}
        dailySpendingUsed={resetHistoryDailySpendingUsed}
      />

      <ApiKeyUsageModal
        open={usageViewKey !== null}
        onClose={closeUsageModal}
        usageViewName={usageViewName}
        maskedKey={
          usageViewKey
            ? t("end_users.usage_keys_summary", {
                defaultValue: "账号下全部密钥",
              })
            : ""
        }
        usageTotalCount={usageTotalCount}
        usageSummary={usageSummary}
        usageTimeRange={usageTimeRange}
        setUsageTimeRange={setUsageTimeRange}
        fetchUsageLogs={fetchUsageLogs}
        usagePageSize={usagePageSize}
        usageLoading={usageLoading}
        usageLastUpdatedText={usageLastUpdatedText}
        usageKeyQuery={usageKeyQuery}
        setUsageKeyQuery={setUsageKeyQuery}
        usageKeyOptions={usageKeyOptions}
        usageChannelQuery={usageChannelQuery}
        setUsageChannelQuery={setUsageChannelQuery}
        usageChannelOptions={usageChannelOptions}
        usageModelQuery={usageModelQuery}
        setUsageModelQuery={setUsageModelQuery}
        usageModelOptions={usageModelOptions}
        usageStatusFilter={usageStatusFilter}
        setUsageStatusFilter={setUsageStatusFilter}
        usageStatusOptions={usageStatusOptions}
        usageLogColumns={usageLogColumns}
        usageRows={usageRows}
        usageCurrentPage={usageCurrentPage}
        usageTotalPages={usageTotalPages}
        setUsagePageSize={setUsagePageSize}
      />
      <LogContentModal
        open={usageContentModalOpen}
        logId={usageContentModalLogId}
        displayModel={usageContentModalModel}
        initialTab={usageContentModalTab}
        onClose={() => setUsageContentModalOpen(false)}
      />
      <ErrorDetailModal
        open={usageErrorModalOpen}
        logId={usageErrorModalLogId}
        model={usageErrorModalModel}
        onClose={() => setUsageErrorModalOpen(false)}
      />
    </PermissionGate>
  );
}
