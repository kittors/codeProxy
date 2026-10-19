import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link, useSearchParams } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import {
  NO_ACCESS_POLICY_CAPABILITIES,
  apiKeyEntriesApi,
  apiKeyPermissionProfilesApi,
  endUsersApi,
  type AccessPolicyCapabilities,
  type ApiKeyPermissionProfile,
  type CreateEndUserResult,
  type EndUser,
  type EndUserDailySpendingResetEvent,
  type EndUserUpdateBody,
  type QuotaResetPeriod,
} from "@code-proxy/api-client";
import {
  Button,
  Card,
  DataTable,
  MaskToggleButton,
  PaginationBar,
  buttonClassName,
  useSensitiveDataMasking,
  useToast,
  type MultiSelectOption,
} from "@code-proxy/ui";
import { PermissionGate } from "@app/providers/PermissionGate";
import { useAuth } from "@app/providers/AuthProvider";
import { describeWindowParts, formatAccessPolicyError, resettableWindows } from "@features/access-policy";
import { useApiKeyPermissionOptions } from "@features/api-key-restrictions";
import { resolvePasswordApiError } from "@features/password-policy";
import { PeriodQuotaResetModal, formatQuotaValidationError } from "@features/period-spending";
import { ApiKeyUsageDialogs } from "../api-keys/components/ApiKeyUsageDialogs";
import { useApiKeyUsageView } from "../api-keys/hooks/useApiKeyUsageView";
import { EndUserBindProfileModal } from "./components/EndUserBindProfileModal";
import { getEndUserColumns } from "./components/EndUserColumns";
import {
  EndUserDeleteModal,
  EndUserNewPasswordModal,
  EndUserResetPasswordModal,
} from "./components/EndUserConfirmModals";
import { EndUserCreatedSecretsModal } from "./components/EndUserCreatedSecretsModal";
import { EndUserCreateModal } from "./components/EndUserCreateModal";
import { EndUserEditModal } from "./components/EndUserEditModal";
import { EndUserKeysModal } from "./components/EndUserKeysModal";
import { EndUserResetHistoryModal } from "./components/EndUserResetHistoryModal";
import {
  EndUserToolbar,
  type EndUserSourceFilter,
  type EndUserStatusFilter,
} from "./components/EndUserToolbar";
import { emptyForm, endUserLabel, type EndUserForm } from "./endUserForm";

const DEFAULT_PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [20, 50, 100];

const errorMessage = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

export function EndUsersPage() {
  const { notify } = useToast();
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [masked, setMasked] = useSensitiveDataMasking();
  const [users, setUsers] = useState<EndUser[]>([]);
  const [capabilities, setCapabilities] = useState<AccessPolicyCapabilities>(NO_ACCESS_POLICY_CAPABILITIES);
  const [profiles, setProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<EndUserStatusFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<EndUserSourceFilter>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<EndUserForm>(() => emptyForm());
  const [createPasswordError, setCreatePasswordError] = useState("");
  const [createdSecrets, setCreatedSecrets] = useState<CreateEndUserResult | null>(null);
  const [editUser, setEditUser] = useState<EndUser | null>(null);
  const [editError, setEditError] = useState("");
  const [keysUser, setKeysUser] = useState<EndUser | null>(null);
  const [bindOpen, setBindOpen] = useState(false);
  const [resetUser, setResetUser] = useState<EndUser | null>(null);
  const [resetQuotaUser, setResetQuotaUser] = useState<EndUser | null>(null);
  const [resetQuotaError, setResetQuotaError] = useState("");
  const [generatedReset, setGeneratedReset] = useState("");
  const [deleteUser, setDeleteUser] = useState<EndUser | null>(null);
  const [historyUser, setHistoryUser] = useState<EndUser | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyEvents, setHistoryEvents] = useState<EndUserDailySpendingResetEvent[]>([]);
  const [historyRawTodayCost, setHistoryRawTodayCost] = useState<number>();
  const [historyDailyUsed, setHistoryDailyUsed] = useState<number>();
  const [catalog, setCatalog] = useState<MultiSelectOption[]>([]);
  /** 用量弹窗描述里的对象：「账号下全部密钥」或单把 Key 的名称。 */
  const [usageLabel, setUsageLabel] = useState("");
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const canWrite = can("end_users.write");
  const permissionOptions = useApiKeyPermissionOptions();
  const { fetchModelOptions, refreshPermissionOptions, loadModels } = permissionOptions;
  const usageView = useApiKeyUsageView();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, profileList] = await Promise.all([
        endUsersApi.list(),
        apiKeyPermissionProfilesApi.listDetailed().catch(() => null),
      ]);
      setUsers(list.items);
      setCapabilities(list.capabilities);
      if (profileList) setProfiles(profileList.items);
    } catch (err) {
      notify({ type: "error", message: errorMessage(err, t("end_users.load_failed")) });
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // 渠道、分组与模型目录只在打开编辑 / Key 弹窗时才需要：以前一进列表页就并发十几个请求去拉。
  const ensurePolicyOptions = useCallback(() => {
    if (optionsLoaded) return;
    setOptionsLoaded(true);
    void refreshPermissionOptions();
    void fetchModelOptions().then(setCatalog);
  }, [fetchModelOptions, optionsLoaded, refreshPermissionOptions]);

  // 旧的 /access/api-keys?endUserId= 深链改到这里，直接打开该账号的 Key 管理。
  const keysParam = searchParams.get("keys");
  useEffect(() => {
    if (!keysParam || loading) return;
    const target = users.find((user) => user.id === keysParam);
    if (target) {
      ensurePolicyOptions();
      setKeysUser(target);
    }
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("keys");
        return next;
      },
      { replace: true },
    );
  }, [ensurePolicyOptions, keysParam, loading, setSearchParams, users]);

  const profileById = useMemo(() => new Map(profiles.map((profile) => [profile.id, profile])), [profiles]);
  const boundCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const user of users) {
      const id = user["permission-profile-id"]?.trim();
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }, [users]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      if (statusFilter === "active" && user.status !== "active") return false;
      if (statusFilter === "frozen" && user.status === "active") return false;
      const profileId = user["permission-profile-id"]?.trim() ?? "";
      if (sourceFilter === "custom" && profileId) return false;
      if (sourceFilter !== "all" && sourceFilter !== "custom" && profileId !== sourceFilter) return false;
      if (!query) return true;
      return [user.username, user.display_name, user.id].some((value) => value.toLowerCase().includes(query));
    });
  }, [search, sourceFilter, statusFilter, users]);

  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageUsers = useMemo(
    () => filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, filteredUsers, pageSize],
  );
  const hasFilters = search.trim().length > 0 || statusFilter !== "all" || sourceFilter !== "all";

  // 列表刷新或筛选后，选中项只保留仍然存在的账号。
  useEffect(() => {
    setSelected((current) => {
      if (current.size === 0) return current;
      const alive = new Set(users.map((user) => user.id));
      const next = new Set([...current].filter((id) => alive.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [users]);

  const batchEnabled = canWrite && capabilities.batchProfileBinding && profiles.length > 0;
  const pageIds = pageUsers.map((user) => user.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const openEdit = useCallback(
    (user: EndUser) => {
      ensurePolicyOptions();
      setEditError("");
      setEditUser(user);
    },
    [ensurePolicyOptions],
  );

  const toggleFrozen = useCallback(
    async (user: EndUser) => {
      const frozen = user.status === "active";
      setBusy(true);
      try {
        await endUsersApi.update(user.id, { status: frozen ? "locked" : "active" });
        notify({ type: "success", message: frozen ? t("end_users.frozen_success") : t("end_users.activated_success") });
        await load();
      } catch (err) {
        notify({ type: "error", message: errorMessage(err, t("common.operation_failed")) });
      } finally {
        setBusy(false);
      }
    },
    [load, notify, t],
  );

  const openHistory = useCallback(
    async (user: EndUser) => {
      setHistoryUser(user);
      setHistoryEvents([]);
      setHistoryRawTodayCost(undefined);
      setHistoryDailyUsed(user["daily-spending-used"]);
      setHistoryLoading(true);
      try {
        const response = await endUsersApi.listDailySpendingResetHistory(user.id, 200);
        setHistoryEvents(Array.isArray(response?.items) ? response.items : []);
        setHistoryRawTodayCost(response?.["raw-today-cost"]);
        setHistoryDailyUsed(response?.["daily-spending-used"] ?? user["daily-spending-used"]);
      } catch (err) {
        notify({ type: "error", message: errorMessage(err, t("end_users.reset_history_load_failed")) });
        setHistoryUser(null);
      } finally {
        setHistoryLoading(false);
      }
    },
    [notify, t],
  );

  const viewUsage = useCallback(
    (user: EndUser) => {
      const name = user.display_name || user.username || t("end_users.unnamed");
      // 新后端按账号 id 过滤日志；旧后端不认识 end_user_id，会返回整个租户的日志，所以只在声明了能力时用。
      setUsageLabel(t("end_users.usage_keys_summary"));
      if (capabilities.ownedKeyAdmin) {
        usageView.openEndUserUsageView(user.id, name);
        return;
      }
      void (async () => {
        try {
          // 旧后端的账号 Key 列表不带明文，只能从租户的 Key 条目里按账号挑出来。
          const entries = await apiKeyEntriesApi.list();
          const keyNames: Record<string, string> = {};
          const keys = entries.flatMap((entry) => {
            const key = entry.key?.trim();
            if (entry.end_user_id !== user.id || !key) return [];
            if (entry.name?.trim()) keyNames[key] = entry.name.trim();
            return [key];
          });
          if (keys.length === 0) {
            notify({ type: "info", message: t("end_users.no_keys_for_usage") });
            return;
          }
          usageView.openUsageView(keys, name, keyNames);
        } catch (err) {
          notify({ type: "error", message: errorMessage(err, t("api_keys_page.load_usage_failed")) });
        }
      })();
    },
    [capabilities.ownedKeyAdmin, notify, t, usageView],
  );

  const columns = useMemo(
    () =>
      getEndUserColumns({
        t,
        locale: i18n.resolvedLanguage ?? "en",
        can,
        canWrite,
        busy,
        masked,
        profileById,
        selection: batchEnabled
          ? {
              selected,
              allSelected: allPageSelected,
              someSelected: !allPageSelected && pageIds.some((id) => selected.has(id)),
              onSelectAll: (checked) =>
                setSelected((current) => {
                  const next = new Set(current);
                  for (const id of pageIds) {
                    if (checked) next.add(id);
                    else next.delete(id);
                  }
                  return next;
                }),
              onSelect: (id, checked) =>
                setSelected((current) => {
                  const next = new Set(current);
                  if (checked) next.add(id);
                  else next.delete(id);
                  return next;
                }),
            }
          : undefined,
        onViewUsage: viewUsage,
        onManageKeys: (user) => {
          ensurePolicyOptions();
          setKeysUser(user);
        },
        onEdit: openEdit,
        onToggleFrozen: (user) => void toggleFrozen(user),
        onResetQuota: (user) => {
          setResetQuotaError("");
          setResetQuotaUser(user);
        },
        onViewResetHistory: (user) => void openHistory(user),
        onResetPassword: setResetUser,
        onDelete: setDeleteUser,
      }),
    // pageIds 由 pageUsers 推出，allPageSelected 由 selected 推出。
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [allPageSelected, batchEnabled, busy, can, canWrite, ensurePolicyOptions, i18n.resolvedLanguage, masked, openEdit, openHistory, pageUsers, profileById, selected, t, toggleFrozen, viewUsage],
  );

  const onCreate = async (event: FormEvent) => {
    event.preventDefault();
    setCreatePasswordError("");
    setBusy(true);
    try {
      const profileId = capabilities.createWithProfile ? createForm.permissionProfileId.trim() : "";
      const result = await endUsersApi.create({
        username: createForm.username.trim() || undefined,
        display_name: createForm.displayName.trim(),
        password: createForm.password || undefined,
        ...(profileId ? { "permission-profile-id": profileId } : {}),
      });
      setCreateOpen(false);
      setCreateForm(emptyForm());
      if (result.generated_password || result.default_api_key?.key) setCreatedSecrets(result);
      else notify({ type: "success", message: t("end_users.created") });
      await load();
    } catch (err) {
      const policy = resolvePasswordApiError(err, t);
      if (policy) {
        setCreatePasswordError(policy);
        return;
      }
      notify({ type: "error", message: errorMessage(err, t("common.operation_failed")) });
    } finally {
      setBusy(false);
    }
  };

  const onEdit = async (body: EndUserUpdateBody) => {
    if (!editUser) return;
    if (Object.keys(body).length === 0) {
      setEditUser(null);
      return;
    }
    setBusy(true);
    setEditError("");
    try {
      const updated = await endUsersApi.update(editUser.id, body);
      const capped = updated["capped-cells"]?.length ?? updated["capped-keys"]?.length ?? 0;
      notify({
        type: "success",
        message: capped > 0 ? t("access_policy.saved_with_caps", { count: capped }) : t("end_users.updated"),
      });
      setEditUser(null);
      await load();
    } catch (err) {
      setEditError(formatAccessPolicyError(err, t) ?? formatQuotaValidationError(err, t));
    } finally {
      setBusy(false);
    }
  };

  const onBind = async (profileId: string) => {
    setBusy(true);
    try {
      const result = await endUsersApi.bindProfile([...selected], profileId);
      const capped = result["capped-cells"]?.length ?? result["capped-keys"]?.length ?? 0;
      notify({
        type: "success",
        message:
          capped > 0
            ? t("access_policy.batch_bind_done_with_caps", { count: result.updated, keys: capped })
            : t("access_policy.batch_bind_done", { count: result.updated }),
      });
      setBindOpen(false);
      setSelected(new Set());
      await load();
    } catch (err) {
      notify({ type: "error", message: formatAccessPolicyError(err, t) ?? errorMessage(err, t("common.operation_failed")) });
    } finally {
      setBusy(false);
    }
  };

  const onResetQuota = async (periods: QuotaResetPeriod[]) => {
    if (!resetQuotaUser || periods.length === 0) return;
    setBusy(true);
    setResetQuotaError("");
    try {
      await endUsersApi.resetPeriodSpending(resetQuotaUser.id, periods);
      notify({ type: "success", message: t("end_users.reset_period_spending_success") });
      setResetQuotaUser(null);
      await load();
    } catch (err) {
      setResetQuotaError(errorMessage(err, t("end_users.reset_period_spending_failed")));
    } finally {
      setBusy(false);
    }
  };

  const runConfirmed = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      notify({ type: "error", message: errorMessage(err, t("common.operation_failed")) });
    } finally {
      setBusy(false);
    }
  };

  const resetWindows = resetQuotaUser
    ? resettableWindows(resetQuotaUser["quota-limits"], resetQuotaUser["model-rules"], resetQuotaUser["quota-usage"])
    : [];

  return (
    <PermissionGate permission="end_users.read" anyOf={["api_keys.read"]}>
      {/*
       * 页面根撑满外壳，分区再撑满页面根，底部留白才等于其余三边。
       * 外壳内容区本身就是页面面板，这里不再包一张大卡（flat），表格直接落在内容区上。
       */}
      <div data-page-fill="md" className="flex flex-1 flex-col">
        <Card
          flat
          className="md:flex md:min-h-0 md:flex-1 md:flex-col"
          bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
          title={t("end_users.title")}
          description={t("access_policy.page_subtitle")}
          actions={
            <div className="flex items-center gap-2">
              <MaskToggleButton masked={masked} onToggle={() => setMasked((prev) => !prev)} />
              {can("api_key_profiles.read") ? (
                <Link to="/access/api-key-permissions" className={buttonClassName({ size: "sm", variant: "secondary" })}>
                  <ShieldCheck size={14} aria-hidden="true" />
                  {t("access_policy.manage_profiles")}
                </Link>
              ) : null}
              {canWrite ? (
                <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)}>
                  {t("end_users.create")}
                </Button>
              ) : null}
            </div>
          }
          loading={loading}
        >
          <EndUserToolbar
            search={search}
            onSearchChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
            status={statusFilter}
            onStatusChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
            source={sourceFilter}
            onSourceChange={(value) => {
              setSourceFilter(value);
              setPage(1);
            }}
            profiles={profiles}
            showSourceFilter={profiles.length > 0}
            selectedCount={selected.size}
            onBindSelected={batchEnabled ? () => setBindOpen(true) : undefined}
            onClearSelection={() => setSelected(new Set())}
            onClearFilters={() => {
              setSearch("");
              setStatusFilter("all");
              setSourceFilter("all");
              setPage(1);
            }}
          />
          <DataTable
            tableId="end-users"
            rows={pageUsers}
            columns={columns}
            rowKey={(row) => row.id}
            virtualize={false}
            rowHeight={64}
            height="h-[calc(100dvh-360px)] md:h-auto md:flex-1"
            minHeight="min-h-[320px] md:min-h-0"
            minWidth="min-w-[1520px]"
            rowClassName={(row) => (selected.has(row.id) ? "bg-accent-soft/60" : "")}
            emptyText={hasFilters ? t("end_users.filtered_empty") : t("end_users.empty")}
            showAllLoadedMessage={false}
            columnResizable
          />
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            totalCount={filteredUsers.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size);
              setPage(1);
            }}
            pageSizeOptions={PAGE_SIZE_OPTIONS}
            className="mt-3"
            labels={{
              firstPage: t("end_users.first_page"),
              previousPage: t("end_users.previous_page"),
              nextPage: t("end_users.next_page"),
              lastPage: t("end_users.last_page"),
              rowsPerPage: t("end_users.rows_per_page"),
              pageInfo: ({ start, end, total }) => t("end_users.page_info", { start, end, total }),
            }}
          />
        </Card>
      </div>

      <EndUserCreateModal
        t={t}
        open={createOpen}
        form={createForm}
        setForm={setCreateForm}
        busy={busy}
        createPasswordError={createPasswordError}
        setCreatePasswordError={setCreatePasswordError}
        profiles={profiles}
        allowProfile={capabilities.createWithProfile}
        onSubmit={onCreate}
        onClose={() => setCreateOpen(false)}
      />
      <EndUserCreatedSecretsModal createdSecrets={createdSecrets} onClose={() => setCreatedSecrets(null)} />

      <EndUserEditModal
        open={Boolean(editUser)}
        user={editUser}
        profiles={profiles}
        boundCounts={boundCounts}
        capabilities={capabilities}
        catalog={catalog}
        availableChannelGroups={permissionOptions.availableChannelGroups}
        availableChannels={permissionOptions.availableChannels}
        channelRouteGroupsByName={permissionOptions.channelRouteGroupsByName}
        availableModels={permissionOptions.availableModels}
        onAccessScopeChange={(channels, groups) => void loadModels(channels, groups)}
        saving={busy}
        serverError={editError}
        onSubmit={(body) => void onEdit(body)}
        onClose={() => setEditUser(null)}
      />

      <EndUserKeysModal
        user={keysUser}
        catalog={catalog}
        canWrite={canWrite || can("api_keys.write")}
        onViewKeyUsage={(key, secret) => {
          setUsageLabel(key.key_masked || key.name || t("api_keys_page.unnamed"));
          usageView.openUsageView(
            [secret],
            key.name || t("api_keys_page.unnamed"),
            key.name ? { [secret]: key.name } : undefined,
          );
        }}
        onClose={() => {
          setKeysUser(null);
          void load();
        }}
      />

      <EndUserBindProfileModal
        open={bindOpen}
        count={selected.size}
        profiles={profiles}
        boundCounts={boundCounts}
        busy={busy}
        onConfirm={(profileId) => void onBind(profileId)}
        onClose={() => setBindOpen(false)}
      />

      <EndUserNewPasswordModal password={generatedReset} onClose={() => setGeneratedReset("")} />
      <EndUserResetPasswordModal
        user={resetUser}
        busy={busy}
        onClose={() => setResetUser(null)}
        onConfirm={() =>
          void runConfirmed(async () => {
            if (!resetUser) return;
            const res = await endUsersApi.resetPassword(resetUser.id);
            setGeneratedReset(res.generated_password || "");
            notify({ type: "success", message: t("end_users.password_reset") });
            setResetUser(null);
          })
        }
      />
      <PeriodQuotaResetModal
        open={Boolean(resetQuotaUser)}
        scope="account"
        subjectName={resetQuotaUser ? endUserLabel(resetQuotaUser) : ""}
        configuredLimits={resetQuotaUser?.["period-spending-limits"]}
        periodSpendingItems={resetQuotaUser?.["period-spending"]}
        lifetimeLimit={resetQuotaUser?.["spending-limit"]}
        windows={
          capabilities.accessPolicy
            ? resetWindows.map((item) => ({ period: item.window, description: describeWindowParts(t, item.parts) }))
            : undefined
        }
        busy={busy}
        error={resetQuotaError}
        onClose={() => setResetQuotaUser(null)}
        onConfirm={(periods) => void onResetQuota(periods)}
      />
      <EndUserDeleteModal
        user={deleteUser}
        busy={busy}
        onClose={() => setDeleteUser(null)}
        onConfirm={() =>
          void runConfirmed(async () => {
            if (!deleteUser) return;
            await endUsersApi.remove(deleteUser.id);
            setDeleteUser(null);
          })
        }
      />
      <EndUserResetHistoryModal
        open={historyUser !== null}
        onClose={() => setHistoryUser(null)}
        userName={historyUser ? endUserLabel(historyUser) : ""}
        loading={historyLoading}
        events={historyEvents}
        rawTodayCost={historyRawTodayCost}
        dailySpendingUsed={historyDailyUsed}
      />
      <ApiKeyUsageDialogs view={usageView} maskedKey={usageView.usageOpen ? usageLabel : ""} />
    </PermissionGate>
  );
}
