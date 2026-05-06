import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, ShieldCheck } from "lucide-react";
import { apiKeyEntriesApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { maskApiKey } from "@/modules/api-keys/apiKeyPageUtils";
import { RestrictionMultiSelect } from "@/modules/api-keys/RestrictionMultiSelect";
import { useApiKeyPermissionOptions } from "@/modules/api-keys/hooks/useApiKeyPermissionOptions";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { Checkbox } from "@/modules/ui/Checkbox";
import { EmptyState } from "@/modules/ui/EmptyState";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";

type PermissionDraft = {
  allowedModels: string[];
  allowedChannels: string[];
  allowedChannelGroups: string[];
  useExactChannelRestrictions: boolean;
};

const emptyPermissionDraft = (): PermissionDraft => ({
  allowedModels: [],
  allowedChannels: [],
  allowedChannelGroups: [],
  useExactChannelRestrictions: false,
});

const readDraftFromEntry = (entry: ApiKeyEntry): PermissionDraft => ({
  allowedModels: entry["allowed-models"] ?? [],
  allowedChannels: entry["allowed-channels"] ?? [],
  allowedChannelGroups: entry["allowed-channel-groups"] ?? [],
  useExactChannelRestrictions: (entry["allowed-channels"] ?? []).length > 0,
});

const readEntryName = (entry: ApiKeyEntry) => entry.name?.trim() || maskApiKey(entry.key);

export function ApiKeyPermissionsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [draft, setDraft] = useState<PermissionDraft>(() => emptyPermissionDraft());
  const {
    availableModels,
    availableChannels,
    availableChannelGroups,
    channelRouteGroupsByName,
    loadModels,
    refreshPermissionOptions,
  } = useApiKeyPermissionOptions();

  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedKeySet.has(entry.key)),
    [entries, selectedKeySet],
  );

  const loadPage = useCallback(async () => {
    setLoading(true);
    try {
      const nextEntries = await apiKeyEntriesApi.list();
      setEntries(nextEntries);
      await refreshPermissionOptions();
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
    if (selectedEntries.length === 1) {
      setDraft(readDraftFromEntry(selectedEntries[0]));
      return;
    }
    setDraft(emptyPermissionDraft());
  }, [selectedEntries]);

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
      const nextAllowedChannels = prev.allowedChannels.filter((channel) =>
        allowedChannelSet.has(channel),
      );
      return nextAllowedChannels.length === prev.allowedChannels.length
        ? prev
        : { ...prev, allowedChannels: nextAllowedChannels };
    });
  }, [
    draft.allowedChannelGroups.length,
    draft.useExactChannelRestrictions,
    filteredAvailableChannels,
  ]);

  const toggleSelection = (entry: ApiKeyEntry, checked: boolean) => {
    setSelectedKeys((prev) => {
      if (checked) {
        return prev.includes(entry.key) ? prev : [...prev, entry.key];
      }
      return prev.filter((key) => key !== entry.key);
    });
  };

  const handleSave = async () => {
    if (selectedKeys.length === 0) {
      notify({ type: "info", message: t("api_key_permissions_page.select_first") });
      return;
    }
    setSaving(true);
    try {
      const nextEntries = entries.map((entry) => {
        if (!selectedKeySet.has(entry.key)) return entry;
        return {
          ...entry,
          "allowed-channel-groups": draft.allowedChannelGroups,
          "allowed-channels":
            draft.useExactChannelRestrictions && draft.allowedChannels.length > 0
              ? draft.allowedChannels
              : [],
          "allowed-models": draft.allowedModels,
        };
      });
      await apiKeyEntriesApi.replace(nextEntries);
      setEntries(nextEntries);
      notify({
        type: "success",
        message: t("api_key_permissions_page.saved", { count: selectedKeys.length }),
      });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_key_permissions_page.save_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title={t("api_key_permissions_page.title")}
        description={t("api_key_permissions_page.description")}
        actions={
          <Button variant="secondary" size="sm" onClick={() => void loadPage()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
            {t("api_key_permissions_page.refresh")}
          </Button>
        }
        loading={loading}
      >
        {entries.length === 0 ? (
          <EmptyState
            title={t("api_key_permissions_page.empty_title")}
            description={t("api_key_permissions_page.empty_desc")}
            icon={<ShieldCheck size={32} />}
          />
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
            <section className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 dark:border-neutral-800">
              <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-500 dark:border-neutral-800 dark:bg-neutral-900/70 dark:text-white/50">
                {t("api_key_permissions_page.selected_count", { count: selectedKeys.length })}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="bg-white text-xs text-slate-500 dark:bg-neutral-950 dark:text-white/45">
                    <tr>
                      <th className="w-12 px-4 py-3 text-left">
                        <span className="sr-only">{t("api_key_permissions_page.selection")}</span>
                      </th>
                      <th className="px-4 py-3 text-left">
                        {t("api_key_permissions_page.col_name")}
                      </th>
                      <th className="px-4 py-3 text-left">
                        {t("api_key_permissions_page.col_key")}
                      </th>
                      <th className="px-4 py-3 text-left">
                        {t("api_key_permissions_page.col_permissions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-neutral-800">
                    {entries.map((entry) => {
                      const name = readEntryName(entry);
                      return (
                        <tr key={entry.key} className="bg-white dark:bg-neutral-950/60">
                          <td className="px-4 py-3">
                            <Checkbox
                              checked={selectedKeySet.has(entry.key)}
                              aria-label={t("api_key_permissions_page.select_key", { name })}
                              onCheckedChange={(checked) => toggleSelection(entry, checked)}
                            />
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                            {name}
                          </td>
                          <td className="px-4 py-3">
                            <code className="rounded-md bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700 dark:bg-neutral-800 dark:text-white/70">
                              {maskApiKey(entry.key)}
                            </code>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 dark:text-white/50">
                            {t("api_key_permissions_page.permission_summary", {
                              groups: entry["allowed-channel-groups"]?.length ?? 0,
                              channels: entry["allowed-channels"]?.length ?? 0,
                              models: entry["allowed-models"]?.length ?? 0,
                            })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950/60"
              aria-label={t("api_key_permissions_page.editor_label")}
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("api_key_permissions_page.editor_title")}
                  </h3>
                  <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                    {t("api_key_permissions_page.editor_desc", { count: selectedKeys.length })}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || selectedKeys.length === 0}
                >
                  {saving
                    ? t("api_key_permissions_page.saving")
                    : t("api_key_permissions_page.save")}
                </Button>
              </div>

              <div className="space-y-4">
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
                      {draft.allowedChannelGroups.length > 0 ? (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-200">
                          {t("api_keys_page.form_exact_channels_intersection_warning")}
                        </p>
                      ) : null}
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
                    onChange={(selected) =>
                      setDraft((prev) => ({ ...prev, allowedModels: selected }))
                    }
                    placeholder={t("api_keys_page.select_models")}
                    unrestrictedLabel={t("api_keys_page.form_all_models")}
                    selectedCountLabel={(count) =>
                      t("api_keys_page.selected_models_count", { count })
                    }
                    searchPlaceholder={t("api_keys_page.search_models")}
                    selectFilteredLabel={t("api_keys_page.select_filtered")}
                    clearRestrictionLabel={t("api_keys_page.clear_restriction")}
                    noResultsLabel={t("api_keys_page.no_results")}
                  />
                </div>
              </div>
            </section>
          </div>
        )}
      </Card>
    </div>
  );
}
