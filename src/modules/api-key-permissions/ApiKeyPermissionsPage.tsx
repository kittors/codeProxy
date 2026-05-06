import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { apiKeyEntriesApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import {
  applyApiKeyPermissionProfile,
  apiKeyPermissionProfilesApi,
  makePermissionProfileId,
  type ApiKeyPermissionProfile,
} from "@/lib/http/apis/api-key-permission-profiles";
import { RestrictionMultiSelect } from "@/modules/api-keys/RestrictionMultiSelect";
import { useApiKeyPermissionOptions } from "@/modules/api-keys/hooks/useApiKeyPermissionOptions";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";

type ProfileDraft = {
  id: string;
  name: string;
  dailyLimit: string;
  totalQuota: string;
  concurrencyLimit: string;
  rpmLimit: string;
  tpmLimit: string;
  allowedModels: string[];
  allowedChannels: string[];
  allowedChannelGroups: string[];
  useExactChannelRestrictions: boolean;
  systemPrompt: string;
};

const emptyDraft = (): ProfileDraft => ({
  id: "",
  name: "",
  dailyLimit: "",
  totalQuota: "",
  concurrencyLimit: "",
  rpmLimit: "",
  tpmLimit: "",
  allowedModels: [],
  allowedChannels: [],
  allowedChannelGroups: [],
  useExactChannelRestrictions: false,
  systemPrompt: "",
});

const limitToText = (value: number | undefined) => (value && value > 0 ? String(value) : "");

const limitFromText = (value: string) => {
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const readDraft = (profile: ApiKeyPermissionProfile): ProfileDraft => ({
  id: profile.id,
  name: profile.name,
  dailyLimit: limitToText(profile["daily-limit"]),
  totalQuota: limitToText(profile["total-quota"]),
  concurrencyLimit: limitToText(profile["concurrency-limit"]),
  rpmLimit: limitToText(profile["rpm-limit"]),
  tpmLimit: limitToText(profile["tpm-limit"]),
  allowedModels: [...profile["allowed-models"]],
  allowedChannels: [...profile["allowed-channels"]],
  allowedChannelGroups: [...profile["allowed-channel-groups"]],
  useExactChannelRestrictions: profile["allowed-channels"].length > 0,
  systemPrompt: profile["system-prompt"],
});

const draftToProfile = (draft: ProfileDraft): ApiKeyPermissionProfile => ({
  id: draft.id || makePermissionProfileId(draft.name),
  name: draft.name.trim(),
  "daily-limit": limitFromText(draft.dailyLimit),
  "total-quota": limitFromText(draft.totalQuota),
  "concurrency-limit": limitFromText(draft.concurrencyLimit),
  "rpm-limit": limitFromText(draft.rpmLimit),
  "tpm-limit": limitFromText(draft.tpmLimit),
  "allowed-channel-groups": draft.allowedChannelGroups,
  "allowed-channels": draft.useExactChannelRestrictions ? draft.allowedChannels : [],
  "allowed-models": draft.allowedModels,
  "system-prompt": draft.systemPrompt.trim(),
});

const formatLimit = (value: number, unlimited: string) =>
  value > 0 ? value.toLocaleString() : unlimited;

const boundProfileCount = (profile: ApiKeyPermissionProfile, entries: ApiKeyEntry[]) =>
  entries.filter((entry) => entry["permission-profile-id"] === profile.id).length;

export function ApiKeyPermissionsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [profiles, setProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
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
      const [nextProfiles, nextEntries] = await Promise.all([
        apiKeyPermissionProfilesApi.list(),
        apiKeyEntriesApi.list().catch(() => [] as ApiKeyEntry[]),
        refreshPermissionOptions(),
      ]);
      setProfiles(nextProfiles);
      setEntries(nextEntries);
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

  const handleSaveProfile = async () => {
    const profile = draftToProfile(draft);
    if (!profile.name) {
      notify({ type: "error", message: t("api_key_permissions_page.name_required") });
      return;
    }

    setSaving(true);
    try {
      const isEdit = profiles.some((item) => item.id === profile.id);
      const nextProfiles = isEdit
        ? profiles.map((item) => (item.id === profile.id ? profile : item))
        : [...profiles, profile];
      await apiKeyPermissionProfilesApi.replace(nextProfiles);

      let nextEntries = entries;
      if (isEdit) {
        nextEntries = entries.map((entry) =>
          entry["permission-profile-id"] === profile.id
            ? applyApiKeyPermissionProfile(entry, profile)
            : entry,
        );
        if (JSON.stringify(nextEntries) !== JSON.stringify(entries)) {
          await apiKeyEntriesApi.replace(nextEntries);
        }
      }

      setProfiles(nextProfiles);
      setEntries(nextEntries);
      setModalOpen(false);
      notify({ type: "success", message: t("api_key_permissions_page.profile_saved") });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_key_permissions_page.save_failed"),
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
      await apiKeyPermissionProfilesApi.replace(nextProfiles);
      const nextEntries = entries.map((entry) =>
        entry["permission-profile-id"] === deleteTarget.id
          ? { ...entry, "permission-profile-id": "" }
          : entry,
      );
      if (JSON.stringify(nextEntries) !== JSON.stringify(entries)) {
        await apiKeyEntriesApi.replace(nextEntries);
      }
      setProfiles(nextProfiles);
      setEntries(nextEntries);
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

  const columns = useMemo<VirtualTableColumn<ApiKeyPermissionProfile>[]>(
    () => [
      {
        key: "name",
        label: t("api_key_permissions_page.col_name"),
        width: "w-[180px] min-w-[180px]",
        cellClassName: "font-medium text-slate-900 dark:text-white",
        render: (profile) => profile.name,
      },
      {
        key: "limits",
        label: t("api_key_permissions_page.col_limits"),
        width: "w-[220px] min-w-[220px]",
        render: (profile) => (
          <div className="space-y-1 text-xs text-slate-600 dark:text-white/60">
            <div>
              {t("api_key_permissions_page.limit_daily", {
                value: formatLimit(profile["daily-limit"], t("api_keys_page.unlimited")),
              })}
            </div>
            <div>
              {t("api_key_permissions_page.limit_total", {
                value: formatLimit(profile["total-quota"], t("api_keys_page.unlimited")),
              })}
            </div>
            <div>
              {t("api_key_permissions_page.limit_rpm_tpm", {
                rpm: formatLimit(profile["rpm-limit"], t("api_keys_page.unlimited")),
                tpm: formatLimit(profile["tpm-limit"], t("api_keys_page.unlimited")),
              })}
            </div>
          </div>
        ),
      },
      {
        key: "permissions",
        label: t("api_key_permissions_page.col_permissions"),
        width: "w-[220px] min-w-[220px]",
        render: (profile) =>
          t("api_key_permissions_page.permission_summary", {
            groups: profile["allowed-channel-groups"].length,
            channels: profile["allowed-channels"].length,
            models: profile["allowed-models"].length,
          }),
      },
      {
        key: "prompt",
        label: t("api_key_permissions_page.col_system_prompt"),
        width: "w-[260px] min-w-[260px]",
        cellClassName: "min-w-0 text-slate-600 dark:text-white/60",
        render: (profile) =>
          profile["system-prompt"] ? (
            <span className="block truncate">{profile["system-prompt"]}</span>
          ) : (
            <span className="text-slate-400 dark:text-white/40">
              {t("api_key_permissions_page.no_system_prompt")}
            </span>
          ),
      },
      {
        key: "bound",
        label: t("api_key_permissions_page.col_bound_keys"),
        width: "w-[120px] min-w-[120px]",
        render: (profile) =>
          t("api_key_permissions_page.bound_count", {
            count: boundProfileCount(profile, entries),
          }),
      },
      {
        key: "actions",
        label: t("api_key_permissions_page.col_actions"),
        width: "w-[120px] min-w-[120px]",
        render: (profile) => (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => openEditModal(profile)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-amber-600 dark:text-white/50 dark:hover:bg-neutral-800 dark:hover:text-amber-400"
              aria-label={t("common.edit")}
            >
              <Pencil size={15} />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(profile)}
              className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-white/50 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              aria-label={t("common.delete")}
            >
              <Trash2 size={15} />
            </button>
          </div>
        ),
      },
    ],
    [entries, t],
  );

  return (
    <div className="space-y-6">
      <Card
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
          <VirtualTable<ApiKeyPermissionProfile>
            rows={profiles}
            columns={columns}
            rowKey={(profile) => profile.id}
            loading={loading}
            virtualize={false}
            minWidth="min-w-[1120px]"
            height="h-auto max-h-[calc(100dvh-280px)]"
            emptyText={t("api_key_permissions_page.empty_title")}
            caption={t("api_key_permissions_page.table_caption")}
            showAllLoadedMessage={false}
          />
        )}
      </Card>

      <Modal
        open={modalOpen}
        title={
          draft.id
            ? t("api_key_permissions_page.edit_config")
            : t("api_key_permissions_page.create_config")
        }
        description={t("api_key_permissions_page.config_modal_desc")}
        onClose={() => setModalOpen(false)}
        maxWidth="max-w-4xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)} disabled={saving}>
              {t("common.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void handleSaveProfile()} disabled={saving}>
              {saving
                ? t("api_key_permissions_page.saving")
                : t("api_key_permissions_page.save_config")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
              {t("api_key_permissions_page.form_name")}
            </label>
            <TextInput
              type="text"
              value={draft.name}
              aria-label={t("api_key_permissions_page.form_name")}
              onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
              placeholder={t("api_key_permissions_page.form_name_placeholder")}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {[
              ["dailyLimit", "form_daily_limit"],
              ["totalQuota", "form_total_quota"],
              ["concurrencyLimit", "form_concurrency_limit"],
              ["rpmLimit", "form_rpm_limit"],
              ["tpmLimit", "form_tpm_limit"],
            ].map(([key, labelKey]) => (
              <div key={key}>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                  {t(`api_key_permissions_page.${labelKey}`)}
                </label>
                <TextInput
                  type="number"
                  min={0}
                  value={draft[key as keyof ProfileDraft] as string}
                  aria-label={t(`api_key_permissions_page.${labelKey}`)}
                  placeholder={t("api_key_permissions_page.form_unlimited_hint")}
                  onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
              {t("api_keys_page.form_allowed_channel_groups")}
            </label>
            <RestrictionMultiSelect
              options={availableChannelGroups}
              value={draft.allowedChannelGroups}
              onChange={(selected) =>
                setDraft((prev) => ({ ...prev, allowedChannelGroups: selected }))
              }
              placeholder={t("api_keys_page.select_channel_groups")}
              unrestrictedLabel={t("api_keys_page.form_all_channel_groups")}
              selectedCountLabel={(count) =>
                t("api_keys_page.selected_channel_groups_count", { count })
              }
              searchPlaceholder={t("api_keys_page.search_channel_groups")}
              selectFilteredLabel={t("api_keys_page.select_filtered")}
              clearRestrictionLabel={t("api_keys_page.clear_restriction")}
              noResultsLabel={t("api_keys_page.no_results")}
            />
          </div>

          <div>
            <div className="mb-2 flex items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-500/25 dark:bg-amber-500/10">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-800 dark:text-white/85">
                  {t("api_keys_page.form_exact_channels")}
                </div>
                <p className="mt-0.5 text-xs text-amber-800 dark:text-amber-100/75">
                  {t("api_keys_page.form_exact_channels_desc")}
                </p>
              </div>
              <ToggleSwitch
                checked={draft.useExactChannelRestrictions}
                ariaLabel={t("api_keys_page.form_exact_channels")}
                onCheckedChange={(checked) =>
                  setDraft((prev) => ({
                    ...prev,
                    useExactChannelRestrictions: checked,
                    allowedChannels: checked ? prev.allowedChannels : [],
                  }))
                }
              />
            </div>
            {draft.useExactChannelRestrictions ? (
              <>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                  {t("api_keys_page.form_allowed_channels")}
                </label>
                <RestrictionMultiSelect
                  options={filteredAvailableChannels}
                  value={draft.allowedChannels}
                  onChange={(selected) =>
                    setDraft((prev) => ({ ...prev, allowedChannels: selected }))
                  }
                  placeholder={t("api_keys_page.select_channels")}
                  unrestrictedLabel={t("api_keys_page.form_all_channels")}
                  selectedCountLabel={(count) =>
                    t("api_keys_page.selected_channels_count", { count })
                  }
                  searchPlaceholder={t("api_keys_page.search_channels")}
                  selectFilteredLabel={t("api_keys_page.select_filtered")}
                  clearRestrictionLabel={t("api_keys_page.clear_restriction")}
                  noResultsLabel={t("api_keys_page.no_results")}
                />
              </>
            ) : null}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
              {t("api_keys_page.form_allowed_models")}
            </label>
            <RestrictionMultiSelect
              options={availableModels}
              value={draft.allowedModels}
              onChange={(selected) => setDraft((prev) => ({ ...prev, allowedModels: selected }))}
              placeholder={t("api_keys_page.select_models")}
              unrestrictedLabel={t("api_keys_page.form_all_models")}
              selectedCountLabel={(count) => t("api_keys_page.selected_models_count", { count })}
              searchPlaceholder={t("api_keys_page.search_models")}
              selectFilteredLabel={t("api_keys_page.select_filtered")}
              clearRestrictionLabel={t("api_keys_page.clear_restriction")}
              noResultsLabel={t("api_keys_page.no_results")}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
              {t("api_key_permissions_page.form_system_prompt")}
            </label>
            <textarea
              value={draft.systemPrompt}
              aria-label={t("api_key_permissions_page.form_system_prompt")}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, systemPrompt: event.target.value }))
              }
              placeholder={t("api_keys_page.system_prompt_hint")}
              rows={3}
              className="w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition-all focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:focus:border-indigo-500"
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("api_key_permissions_page.delete_title")}
        description={t("api_key_permissions_page.delete_desc", {
          name: deleteTarget?.name ?? "",
        })}
        confirmText={t("common.delete")}
        busy={saving}
        onConfirm={() => void handleDeleteProfile()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
