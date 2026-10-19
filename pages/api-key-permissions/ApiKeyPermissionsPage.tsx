import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Copy, MessageSquareText, Pencil, Plus, RefreshCw, ShieldCheck, Trash2, Users } from "lucide-react";
import { endUsersApi, type EndUser } from "@code-proxy/api-client/endpoints/end-users";
import {
  apiKeyPermissionProfilesApi,
  type ApiKeyPermissionProfile,
} from "@code-proxy/api-client/endpoints/api-key-permission-profiles";
import {
  NO_ACCESS_POLICY_CAPABILITIES,
  type AccessPolicyCapabilities,
} from "@code-proxy/api-client";
import {
  Button,
  Card,
  ConfirmModal,
  EmptyState,
  EntityCard,
  HUE_GLYPH,
  HUE_SOFT,
  cn,
  entityCardGridClass,
  useToast,
  type MultiSelectOption,
} from "@code-proxy/ui";
import { PolicyBadges, QuotaUsageCell, formatAccessPolicyError, formatQuotaAmount } from "@features/access-policy";
import { useApiKeyPermissionOptions } from "@features/api-key-restrictions";
import { formatQuotaValidationError } from "@features/period-spending";
import { PermissionProfileFormModal } from "./PermissionProfileFormModal";
import {
  boundProfileCount,
  draftToProfile,
  duplicateDraft,
  emptyDraft,
  readDraft,
  type ProfileDraft,
} from "./profileDraft";

const CHIP = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
const NEUTRAL = "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]";

function ScopeLine({ profile }: { profile: ApiKeyPermissionProfile }) {
  const { t } = useTranslation();
  const parts = [
    profile["allowed-channel-groups"].length > 0
      ? t("access_policy.scope_groups", { count: profile["allowed-channel-groups"].length })
      : null,
    profile["allowed-channels"].length > 0
      ? t("access_policy.scope_channels", { count: profile["allowed-channels"].length })
      : null,
    profile["allowed-models"].length > 0
      ? t("access_policy.scope_models", { count: profile["allowed-models"].length })
      : null,
    profile["concurrency-limit"] > 0
      ? t("access_policy.rate_short.concurrency", { value: profile["concurrency-limit"] })
      : null,
    profile["rpm-limit"] > 0
      ? t("access_policy.rate_short.rpm", { value: profile["rpm-limit"].toLocaleString() })
      : null,
    profile["tpm-limit"] > 0
      ? t("access_policy.rate_short.tpm", {
          value: formatQuotaAmount("tokens", profile["tpm-limit"], { compact: true }),
        })
      : null,
  ].filter(Boolean);
  return (
    <p className="truncate text-xs text-ink-3">
      {parts.length > 0 ? parts.join(" · ") : t("access_policy.scope_unrestricted")}
    </p>
  );
}

/**
 * 门户账号的权限模板。模板是成批管理的主入口：一处改动，同步到全部绑定账号。
 *
 * 一张卡一个模板：限了哪些额度、有几条按模型规则与路由、能访问什么、多少账号在用，
 * 不用点进去就能比较几个模板的差别。「复制」用现有模板做变体，最常见的「同一套、额度高一档」
 * 不必从零填。
 */
export function ApiKeyPermissionsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [profiles, setProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [capabilities, setCapabilities] = useState<AccessPolicyCapabilities>(NO_ACCESS_POLICY_CAPABILITIES);
  const [accounts, setAccounts] = useState<EndUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<ProfileDraft>(() => emptyDraft());
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ApiKeyPermissionProfile | null>(null);
  const [catalog, setCatalog] = useState<MultiSelectOption[]>([]);
  const {
    availableModels,
    availableChannels,
    availableChannelGroups,
    channelRouteGroupsByName,
    fetchModelOptions,
    loadModels,
    refreshPermissionOptions,
  } = useApiKeyPermissionOptions();

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const [profileList, accountResponse] = await Promise.all([
        apiKeyPermissionProfilesApi.listDetailed(),
        endUsersApi.list().catch(() => ({ items: [] as EndUser[], capabilities: NO_ACCESS_POLICY_CAPABILITIES })),
      ]);
      setProfiles(profileList.items);
      setCapabilities(profileList.capabilities);
      setAccounts(accountResponse.items);
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_key_permissions_page.load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  // 渠道、分组、模型选项只有打开编辑弹窗时才用得上，第一次打开时再拉。
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  const ensureOptions = () => {
    if (optionsLoaded) return;
    setOptionsLoaded(true);
    void refreshPermissionOptions();
    void fetchModelOptions().then(setCatalog);
  };

  useEffect(() => {
    if (!modalOpen) return;
    void loadModels(
      draft.access.useExactChannels ? draft.access.allowedChannels : [],
      draft.access.allowedChannelGroups,
    );
  }, [draft.access.allowedChannelGroups, draft.access.allowedChannels, draft.access.useExactChannels, loadModels, modalOpen]);

  const filteredChannels = useMemo(() => {
    if (!draft.access.useExactChannels || draft.access.allowedChannelGroups.length === 0) return availableChannels;
    const allowed = new Set(draft.access.allowedChannelGroups.map((group) => group.toLowerCase()));
    return availableChannels.filter((option) =>
      (channelRouteGroupsByName[option.value] ?? []).some((group) => allowed.has(group)),
    );
  }, [availableChannels, channelRouteGroupsByName, draft.access.allowedChannelGroups, draft.access.useExactChannels]);

  const openEditor = (next: ProfileDraft) => {
    ensureOptions();
    setDraft(next);
    setModalOpen(true);
  };

  // 名称必填等字段校验由表单弹窗就地完成，走到这里时已经通过。
  const handleSave = async () => {
    const profile = draftToProfile(draft);
    setSaving(true);
    try {
      const isEdit = profiles.some((item) => item.id === profile.id);
      const nextProfiles = isEdit
        ? profiles.map((item) => (item.id === profile.id ? profile : item))
        : [...profiles, profile];
      const result = await apiKeyPermissionProfilesApi.replace(nextProfiles, {
        syncAccounts: true,
        accessPolicy: capabilities.accessPolicy,
      });
      setModalOpen(false);
      const capped = result.cappedCells.length || result.cappedKeys.length;
      notify({
        type: "success",
        message:
          result.appliedCount > 0 || capped > 0
            ? t("api_key_permissions_page.saved_with_sync", { accounts: result.appliedCount, keys: capped })
            : t("api_key_permissions_page.profile_saved"),
      });
      // 重新读取：同步后账号与模板的生效值以服务端为准（规则与路由的 id 也由服务端生成）。
      await loadPage();
    } catch (err: unknown) {
      notify({ type: "error", message: formatAccessPolicyError(err, t) ?? formatQuotaValidationError(err, t) });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const nextProfiles = profiles.filter((profile) => profile.id !== deleteTarget.id);
      await apiKeyPermissionProfilesApi.replace(nextProfiles, {
        syncAccounts: true,
        accessPolicy: capabilities.accessPolicy,
      });
      setDeleteTarget(null);
      notify({ type: "success", message: t("api_key_permissions_page.profile_deleted") });
      await loadPage();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_key_permissions_page.delete_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const editingBound = draft.id
    ? accounts.filter((account) => account["permission-profile-id"] === draft.id).length
    : 0;

  return (
    <div data-page-fill="always" className="flex flex-1 flex-col">
      {/* 外壳内容区就是页面面板：这里是页面分区（flat），不再包一张大卡。 */}
      <Card
        flat
        className="md:flex md:min-h-0 md:flex-1 md:flex-col"
        bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
        title={t("api_key_permissions_page.title")}
        description={t("access_policy.profiles_page_desc")}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => void loadPage()} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("api_key_permissions_page.refresh")}
            </Button>
            <Button variant="primary" size="sm" onClick={() => openEditor(emptyDraft())}>
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
            icon={<ShieldCheck size={32} className={cn("text-ink-3", HUE_GLYPH.violet)} />}
            action={
              <Button variant="primary" size="sm" onClick={() => openEditor(emptyDraft())}>
                <Plus size={14} />
                {t("api_key_permissions_page.create")}
              </Button>
            }
          />
        ) : (
          <div className="md:min-h-0 md:flex-1 md:overflow-y-auto">
            <div className={entityCardGridClass({ columns: 3, align: "start" })}>
              {profiles.map((profile) => {
                const bound = boundProfileCount(profile, accounts);
                return (
                  <EntityCard
                    key={profile.id}
                    title={profile.name}
                    fill={false}
                    titleAdornment={
                      <span className={cn(CHIP, NEUTRAL, HUE_SOFT.violet)}>
                        <Users size={12} aria-hidden="true" className={cn("text-ink-3", HUE_GLYPH.violet)} />
                        {t("access_policy.bound_accounts", { count: bound })}
                      </span>
                    }
                    header={<ScopeLine profile={profile} />}
                    footer={
                      <>
                        <span className="flex min-w-0 items-center gap-1 text-xs text-ink-3">
                          <MessageSquareText size={13} aria-hidden="true" className="shrink-0" />
                          <span className="truncate">
                            {profile["system-prompt"] || t("api_key_permissions_page.no_system_prompt")}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-0.5">
                          <Button
                            size="xs"
                            variant="ghost"
                            aria-label={t("access_policy.duplicate_profile", { name: profile.name })}
                            onClick={() =>
                              openEditor(duplicateDraft(profile, t("access_policy.profile_copy_name", { name: profile.name })))
                            }
                          >
                            <Copy size={14} />
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            aria-label={t("access_policy.edit_profile", { name: profile.name })}
                            onClick={() => openEditor(readDraft(profile))}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            aria-label={t("access_policy.delete_profile", { name: profile.name })}
                            onClick={() => setDeleteTarget(profile)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </span>
                      </>
                    }
                  >
                    <div className="space-y-3">
                      <QuotaUsageCell limits={profile["quota-limits"]} max={6} />
                      <PolicyBadges rules={profile["model-rules"]} routes={profile["model-routes"]} />
                    </div>
                  </EntityCard>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <PermissionProfileFormModal
        open={modalOpen}
        draft={draft}
        setDraft={setDraft}
        saving={saving}
        capabilities={capabilities}
        catalog={catalog}
        boundCount={editingBound}
        availableChannelGroups={availableChannelGroups}
        availableChannels={filteredChannels}
        availableModels={availableModels}
        onSubmit={() => void handleSave()}
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
                {t("api_key_permissions_page.bound_count", { count: boundProfileCount(deleteTarget, accounts) })}
              </span>
            </span>
          ) : null
        }
        consequences={[t("api_key_permissions_page.delete_consequence_accounts")]}
        confirmText={t("api_key_permissions_page.delete_confirm")}
        busy={saving}
        onConfirm={() => void handleDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
