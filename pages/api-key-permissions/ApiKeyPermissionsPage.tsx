import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { endUsersApi, type EndUser } from "@code-proxy/api-client/endpoints/end-users";
import {
  apiKeyPermissionProfilesApi,
  type ApiKeyPermissionProfile,
} from "@code-proxy/api-client/endpoints/api-key-permission-profiles";
import { PeriodSpendingLimitsCell, formatQuotaValidationError } from "@features/period-spending";
import { useApiKeyPermissionOptions } from "@features/api-key-restrictions";
import { Button, COLUMN_WIDTH } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { ConfirmModal } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import {
  DataTable,
  TABLE_ROW_ACTIONS_COLUMN,
  TableRowActions,
  type DataTableColumn,
} from "@code-proxy/ui";
import { PermissionProfileFormModal } from "./PermissionProfileFormModal";
import {
  boundProfileCount,
  draftToProfile,
  emptyDraft,
  readDraft,
  type ProfileDraft,
} from "./profileDraft";

const stickyActionsHeaderClass =
  "text-center md:sticky md:z-40 md:bg-slate-100 md:dark:bg-neutral-800";
// 表格直接放在页面上（外壳内容区 canvas），冻结列的底色跟着它走，不用卡片的 surface。
const stickyActionsCellClass = "md:sticky md:z-30 md:bg-backdrop";

const formatRestrictionCount = (count: number, unlimited: string) =>
  count > 0 ? count.toLocaleString() : unlimited;

const profileToAccountUpdate = (profile: ApiKeyPermissionProfile) => ({
  "permission-profile-id": profile.id,
  "daily-limit": profile["daily-limit"],
  "total-quota": profile["total-quota"],
  "daily-spending-limit": profile["period-spending-limits"].day,
  "period-spending-limits": { ...profile["period-spending-limits"] },
  "concurrency-limit": profile["concurrency-limit"],
  "rpm-limit": profile["rpm-limit"],
  "tpm-limit": profile["tpm-limit"],
  "allowed-models": [...profile["allowed-models"]],
  "allowed-channels": [...profile["allowed-channels"]],
  "allowed-channel-groups": [...profile["allowed-channel-groups"]],
  "system-prompt": profile["system-prompt"],
});

export function ApiKeyPermissionsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [profiles, setProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [accounts, setAccounts] = useState<EndUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => emptyDraft());
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyPermissionProfile | null>(null);
  const {
    availableModels,
    availableChannels,
    availableChannelGroups,
    channelRouteGroupsByName,
    loadModels,
    refreshPermissionOptions,
  } = useApiKeyPermissionOptions();

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [nextProfiles, accountResponse] = await Promise.all([
        apiKeyPermissionProfilesApi.list(),
        endUsersApi.list().catch(() => ({ items: [] as EndUser[] })),
        refreshPermissionOptions(),
      ]);
      setProfiles(nextProfiles);
      setAccounts(accountResponse.items ?? []);
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_key_permissions_page.load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, refreshPermissionOptions, t]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    void loadModels(
      draft.useExactChannelRestrictions ? draft.allowedChannels : [],
      draft.allowedChannelGroups,
    );
  }, [
    draft.allowedChannelGroups,
    draft.allowedChannels,
    draft.useExactChannelRestrictions,
    loadModels,
  ]);

  const filteredAvailableChannels = useMemo(() => {
    if (!draft.useExactChannelRestrictions || draft.allowedChannelGroups.length === 0) {
      return availableChannels;
    }
    const allowedGroups = new Set(draft.allowedChannelGroups.map((group) => group.toLowerCase()));
    return availableChannels.filter((option) => {
      const groups = channelRouteGroupsByName[option.value] ?? [];
      return groups.some((group) => allowedGroups.has(group));
    });
  }, [
    availableChannels,
    channelRouteGroupsByName,
    draft.allowedChannelGroups,
    draft.useExactChannelRestrictions,
  ]);

  useEffect(() => {
    if (!draft.useExactChannelRestrictions || draft.allowedChannelGroups.length === 0) return;
    if (filteredAvailableChannels.length === 0) return;
    const allowedChannelSet = new Set(filteredAvailableChannels.map((option) => option.value));
    setDraft((prev) => {
      const allowedChannels = prev.allowedChannels.filter((channel) =>
        allowedChannelSet.has(channel),
      );
      return allowedChannels.length === prev.allowedChannels.length
        ? prev
        : { ...prev, allowedChannels };
    });
  }, [
    draft.allowedChannelGroups.length,
    draft.useExactChannelRestrictions,
    filteredAvailableChannels,
  ]);

  const openCreateModal = () => {
    setDraft(emptyDraft());
    setModalOpen(true);
  };

  const openEditModal = (profile: ApiKeyPermissionProfile) => {
    setDraft(readDraft(profile));
    setModalOpen(true);
  };

  // 名称必填等字段校验由表单弹窗就地完成，走到这里时已经通过。
  const handleSaveProfile = async () => {
    const profile = draftToProfile(draft);
    setSaving(true);
    try {
      const isEdit = profiles.some((item) => item.id === profile.id);
      const nextProfiles = isEdit
        ? profiles.map((item) => (item.id === profile.id ? profile : item))
        : [...profiles, profile];
      const result = await apiKeyPermissionProfilesApi.replace(nextProfiles, {
        syncAccounts: true,
      });

      let nextAccounts = accounts;
      if (isEdit) {
        const update = profileToAccountUpdate(profile);
        nextAccounts = accounts.map((account) =>
          account["permission-profile-id"] === profile.id ? { ...account, ...update } : account,
        );
      }

      setProfiles(nextProfiles);
      setAccounts(nextAccounts);
      setModalOpen(false);
      notify({
        type: "success",
        message:
          result.appliedCount > 0 || result.cappedKeys.length > 0
            ? t("api_key_permissions_page.saved_with_sync", {
                accounts: result.appliedCount,
                keys: result.cappedKeys.length,
              })
            : t("api_key_permissions_page.profile_saved"),
      });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: formatQuotaValidationError(err, t),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const nextProfiles = profiles.filter((profile) => profile.id !== deleteTarget.id);
      await apiKeyPermissionProfilesApi.replace(nextProfiles, { syncAccounts: true });
      setProfiles(nextProfiles);
      setAccounts(
        accounts.map((account) =>
          account["permission-profile-id"] === deleteTarget.id
            ? { ...account, "permission-profile-id": "" }
            : account,
        ),
      );
      setDeleteTarget(null);
      notify({ type: "success", message: t("api_key_permissions_page.profile_deleted") });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_key_permissions_page.delete_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const columns = useMemo<DataTableColumn<ApiKeyPermissionProfile>[]>(
    () => [
      {
        key: "name",
        label: t("api_key_permissions_page.col_name"),
        width: COLUMN_WIDTH.badgeGroup,
        cellClassName: "font-medium text-ink",
        render: (profile) => profile.name,
      },
      {
        key: "limits",
        label: t("quota.period_spending_column"),
        width: "w-[360px] min-w-[300px]",
        render: (profile) => (
          <PeriodSpendingLimitsCell t={t} limits={profile["period-spending-limits"]} />
        ),
      },
      {
        key: "permissions",
        label: t("api_key_permissions_page.col_permissions"),
        width: "w-[220px] min-w-[220px]",
        render: (profile) =>
          t("api_key_permissions_page.permission_summary", {
            groups: formatRestrictionCount(
              profile["allowed-channel-groups"].length,
              t("api_keys_page.unlimited"),
            ),
            channels: formatRestrictionCount(
              profile["allowed-channels"].length,
              t("api_keys_page.unlimited"),
            ),
            models: formatRestrictionCount(
              profile["allowed-models"].length,
              t("api_keys_page.unlimited"),
            ),
          }),
      },
      {
        key: "prompt",
        label: t("api_key_permissions_page.col_system_prompt"),
        width: "w-[260px] min-w-[260px]",
        cellClassName: "min-w-0 text-ink-2",
        render: (profile) =>
          profile["system-prompt"] ? (
            <span className="block truncate">{profile["system-prompt"]}</span>
          ) : (
            <span className="text-ink-3">{t("api_key_permissions_page.no_system_prompt")}</span>
          ),
      },
      {
        key: "bound",
        label: t("api_key_permissions_page.col_bound_keys"),
        width: COLUMN_WIDTH.timestamp,
        render: (profile) =>
          t("api_key_permissions_page.bound_count", {
            count: boundProfileCount(profile, accounts),
          }),
      },
      {
        key: "actions",
        label: t("api_key_permissions_page.col_actions"),
        ...TABLE_ROW_ACTIONS_COLUMN,
        lockOrder: "end",
        headerClassName: stickyActionsHeaderClass,
        cellClassName: stickyActionsCellClass,
        render: (profile) => (
          <TableRowActions
            moreLabel={t("common.more_actions")}
            actions={[
              {
                key: "edit",
                label: t("common.edit"),
                icon: <Pencil size={15} />,
                onClick: () => openEditModal(profile),
              },
              {
                key: "delete",
                label: t("common.delete"),
                icon: <Trash2 size={15} />,
                destructive: true,
                onClick: () => setDeleteTarget(profile),
              },
            ]}
          />
        ),
      },
    ],
    [accounts, t],
  );

  return (
    <div data-page-fill="always" className="flex flex-1 flex-col">
      {/* 外壳内容区就是页面面板：这里是页面分区（flat），不再包一张大卡。 */}
      <Card
        flat
        className="md:flex md:min-h-0 md:flex-1 md:flex-col"
        bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
        title={t("api_key_permissions_page.title")}
        description={t("api_key_permissions_page.description")}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadPage()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("api_key_permissions_page.refresh")}
            </Button>
            <Button variant="primary" size="sm" onClick={openCreateModal}>
              <Plus size={14} />
              {t("api_key_permissions_page.create")}
            </Button>
          </div>
        }
        loading={loading}
      >
        {profiles.length === 0 ? (
          <EmptyState
            title={t("api_key_permissions_page.empty_title")}
            description={t("api_key_permissions_page.empty_desc")}
            icon={<ShieldCheck size={32} />}
          />
        ) : (
          <DataTable<ApiKeyPermissionProfile>
            tableId="api-key-permission-profiles"
            rows={profiles}
            columns={columns}
            rowKey={(profile) => profile.id}
            loading={loading}
            virtualize={false}
            minWidth="min-w-[1120px]"
            height="h-[calc(100dvh-260px)] md:h-auto md:flex-1"
            minHeight="min-h-[320px] md:min-h-0"
            emptyText={t("api_key_permissions_page.empty_title")}
            caption={t("api_key_permissions_page.table_caption")}
            showAllLoadedMessage={false}
          />
        )}
      </Card>

      <PermissionProfileFormModal
        open={modalOpen}
        draft={draft}
        setDraft={setDraft}
        saving={saving}
        availableChannelGroups={availableChannelGroups}
        availableChannels={filteredAvailableChannels}
        availableModels={availableModels}
        onSubmit={() => void handleSaveProfile()}
        onClose={() => setModalOpen(false)}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("api_key_permissions_page.delete_title")}
        description={t("api_key_permissions_page.delete_lead")}
        subject={
          deleteTarget ? (
            <span className="flex min-w-0 items-center justify-between gap-3">
              <span className="truncate font-medium">{deleteTarget.name}</span>
              <span className="shrink-0 text-xs text-ink-3">
                {t("api_key_permissions_page.bound_count", {
                  count: boundProfileCount(deleteTarget, accounts),
                })}
              </span>
            </span>
          ) : null
        }
        consequences={[t("api_key_permissions_page.delete_consequence_accounts")]}
        confirmText={t("api_key_permissions_page.delete_confirm")}
        busy={saving}
        onConfirm={() => void handleDeleteProfile()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
