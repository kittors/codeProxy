import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, KeyRound, RefreshCw } from "lucide-react";
import { apiKeyEntriesApi, apiKeysApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import {
  applyApiKeyPermissionProfile,
  apiKeyPermissionProfilesApi,
  CUSTOM_PERMISSION_PROFILE_ID,
  resolveEntryPermissionProfileId,
  type ApiKeyPermissionProfile,
} from "@/lib/http/apis/api-key-permission-profiles";
import { ccSwitchImportConfigsApi } from "@/lib/http/apis/ccswitch-import-configs";
import { detectApiBaseFromLocation } from "@/lib/connection";
import { useOptionalAuth } from "@/modules/auth/AuthProvider";
import {
  generateApiKey,
  makeEmptyApiKeyForm,
  maskApiKey,
} from "@/modules/api-keys/apiKeyPageUtils";
import { createApiKeyColumns } from "@/modules/api-keys/components/ApiKeyColumns";
import { DeleteApiKeyModal } from "@/modules/api-keys/components/DeleteApiKeyModal";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";
import { VirtualTable } from "@/modules/ui/VirtualTable";
import { ApiKeyFormModal } from "@/modules/api-keys/components/ApiKeyFormModal";
import { ApiKeyUsageModal } from "@/modules/api-keys/components/ApiKeyUsageModal";
import { useApiKeyPermissionOptions } from "@/modules/api-keys/hooks/useApiKeyPermissionOptions";
import { useApiKeyUsageView } from "@/modules/api-keys/hooks/useApiKeyUsageView";
import { CcSwitchImportCardList } from "@/modules/api-keys/components/CcSwitchImportCardList";
import { buildCcSwitchImportUrl, openCcSwitchImportUrl } from "@/modules/ccswitch/ccswitchImport";
import {
  normalizeCcSwitchClaudeAuthField,
  normalizeCcSwitchImportSettings,
} from "@/modules/ccswitch/ccswitchImportSettings";
import {
  deriveCcSwitchImportSettingsFromConfigList,
  type CcSwitchImportConfigListItem,
} from "@/modules/ccswitch/ccswitchImportConfigList";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { ErrorDetailModal } from "@/modules/monitor/ErrorDetailModal";
import type { ApiKeyFormValues } from "@/modules/api-keys/types";

function normalizeRoutePath(path: string): string {
  const trimmed = String(path ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
}

function appendRoutePath(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.replace(/\/+$/, "");
  const normalizedPath = normalizeRoutePath(path);
  if (!normalizedPath) return normalizedBase;
  if (normalizedBase.toLowerCase().endsWith(normalizedPath.toLowerCase())) {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.opacity = "0";
    textarea.style.position = "fixed";
    textarea.style.top = "-1000px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      return document.execCommand("copy");
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }
}

export function ApiKeysPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();

  const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteLogsOnDelete, setDeleteLogsOnDelete] = useState(true);
  const [ccSwitchImportEntry, setCcSwitchImportEntry] = useState<ApiKeyEntry | null>(null);
  const [ccSwitchImportConfigs, setCcSwitchImportConfigs] = useState<
    CcSwitchImportConfigListItem[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [permissionProfiles, setPermissionProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [form, setForm] = useState<ApiKeyFormValues>(() => makeEmptyApiKeyForm());
  const { channelGroupItems, channelGroupByName, refreshPermissionOptions } =
    useApiKeyPermissionOptions();
  const {
    usageViewKey,
    usageViewName,
    usageLoading,
    usageTotalCount,
    usageCurrentPage,
    usagePageSize,
    setUsagePageSize,
    usageLastUpdatedText,
    usageTimeRange,
    setUsageTimeRange,
    usageChannelQuery,
    setUsageChannelQuery,
    usageChannelGroupQuery,
    setUsageChannelGroupQuery,
    usageModelQuery,
    setUsageModelQuery,
    usageStatusFilter,
    setUsageStatusFilter,
    usageContentModalOpen,
    setUsageContentModalOpen,
    usageContentModalLogId,
    usageContentModalTab,
    usageErrorModalOpen,
    setUsageErrorModalOpen,
    usageErrorModalLogId,
    usageErrorModalModel,
    usageLogColumns,
    usageRows,
    usageTotalPages,
    usageChannelOptions,
    usageChannelGroupOptions,
    usageModelOptions,
    fetchUsageLogs,
    handleViewUsage,
    closeUsageModal,
  } = useApiKeyUsageView({ channelGroupByName });

  /* ─── load ─── */

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const [entriesData, legacyKeys, profilesData, configsData] = await Promise.all([
        apiKeyEntriesApi.list(),
        apiKeysApi.list().catch(() => [] as string[]),
        apiKeyPermissionProfilesApi.list().catch(() => [] as ApiKeyPermissionProfile[]),
        ccSwitchImportConfigsApi.list().catch(() => [] as CcSwitchImportConfigListItem[]),
      ]);
      setPermissionProfiles(profilesData);
      setCcSwitchImportConfigs(configsData);

      // Auto-migrate: old api-keys not in api-key-entries get added as unnamed entries
      const entryKeySet = new Set(entriesData.map((e) => e.key));
      const newEntries = legacyKeys
        .filter((k: string) => k && !entryKeySet.has(k))
        .map((k: string): ApiKeyEntry => ({ key: k, "created-at": new Date().toISOString() }));

      let finalEntries: ApiKeyEntry[];
      if (newEntries.length > 0) {
        const merged = [...entriesData, ...newEntries];
        try {
          await apiKeyEntriesApi.replace(merged);
          notify({
            type: "success",
            message: t("api_keys_page.auto_import", { count: newEntries.length }),
          });
        } catch {
          // silent
        }
        finalEntries = merged;
      } else {
        finalEntries = entriesData;
      }
      setEntries(finalEntries);
      // Load models after entries are available (needs a valid API key)
      void refreshPermissionOptions();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, refreshPermissionOptions, t]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  const permissionProfileById = useMemo(
    () => new Map(permissionProfiles.map((profile) => [profile.id, profile])),
    [permissionProfiles],
  );

  const permissionProfileOptions = useMemo(() => {
    const options = [
      {
        value: "",
        label: t("api_keys_page.permission_profile_unrestricted"),
      },
      ...permissionProfiles.map((profile) => ({
        value: profile.id,
        label: profile.name,
      })),
    ];
    if (
      form.permissionProfileId === CUSTOM_PERMISSION_PROFILE_ID &&
      !options.some((option) => option.value === CUSTOM_PERMISSION_PROFILE_ID)
    ) {
      options.push({
        value: CUSTOM_PERMISSION_PROFILE_ID,
        label: t("api_keys_page.permission_profile_custom_keep"),
      });
    }
    return options;
  }, [form.permissionProfileId, permissionProfiles, t]);

  const selectedPermissionProfile = (profileId: string) =>
    profileId ? (permissionProfileById.get(profileId) ?? null) : null;

  /* ─── toggle disable ─── */

  const handleToggleDisable = async (index: number) => {
    const entry = entries[index];
    const updated = { ...entry, disabled: !entry.disabled };
    const newEntries = [...entries];
    newEntries[index] = updated;

    try {
      await apiKeyEntriesApi.replace(newEntries);
      setEntries(newEntries);
      notify({
        type: "success",
        message: updated.disabled
          ? t("api_keys_page.disabled_toast", { name: entry.name || t("api_keys_page.unnamed") })
          : t("api_keys_page.enabled_toast", { name: entry.name || t("api_keys_page.unnamed") }),
      });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.operation_failed"),
      });
    }
  };

  /* ─── create ─── */

  const handleOpenCreate = () => {
    const next = makeEmptyApiKeyForm(generateApiKey());
    setForm(next);
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      notify({ type: "error", message: t("api_keys_page.name_required") });
      return;
    }
    if (!form.key.trim()) {
      notify({ type: "error", message: t("api_keys_page.key_empty") });
      return;
    }
    setSaving(true);
    try {
      const newEntry: ApiKeyEntry = {
        key: form.key.trim(),
        name: form.name.trim(),
        "created-at": new Date().toISOString(),
      };
      const profiledEntry = applyApiKeyPermissionProfile(
        newEntry,
        selectedPermissionProfile(form.permissionProfileId),
      );
      await apiKeyEntriesApi.replace([...entries, profiledEntry]);
      notify({ type: "success", message: t("api_keys_page.created_success") });
      setShowCreate(false);
      await loadEntries();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.create_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  /* ─── edit ─── */

  const handleOpenEdit = (index: number) => {
    const entry = entries[index];
    const next = {
      name: entry.name || "",
      key: entry.key,
      permissionProfileId: resolveEntryPermissionProfileId(entry, permissionProfiles),
      dailyLimit: entry["daily-limit"]?.toString() || "",
      totalQuota: entry["total-quota"]?.toString() || "",
      spendingLimit: entry["spending-limit"]?.toString() || "",
      concurrencyLimit: entry["concurrency-limit"]?.toString() || "",
      rpmLimit: entry["rpm-limit"]?.toString() || "",
      tpmLimit: entry["tpm-limit"]?.toString() || "",
      allowedModels: entry["allowed-models"] || [],
      allowedChannels: entry["allowed-channels"] || [],
      allowedChannelGroups: entry["allowed-channel-groups"] || [],
      useExactChannelRestrictions: (entry["allowed-channels"] || []).length > 0,
      systemPrompt: entry["system-prompt"] || "",
    };
    setForm(next);
    setEditIndex(index);
  };

  const handleEdit = async () => {
    if (editIndex === null) return;
    if (!form.name.trim()) {
      notify({ type: "error", message: t("api_keys_page.name_required") });
      return;
    }
    const originalKey = entries[editIndex].key;
    const newKey = form.key.trim();
    if (!newKey) {
      notify({ type: "error", message: t("api_keys_page.key_empty") });
      return;
    }
    setSaving(true);
    try {
      await apiKeyEntriesApi.update({
        index: editIndex,
        value: {
          ...(newKey !== originalKey ? { key: newKey } : {}),
          name: form.name.trim(),
          ...(form.permissionProfileId === CUSTOM_PERMISSION_PROFILE_ID
            ? {
                "permission-profile-id": entries[editIndex]["permission-profile-id"] ?? "",
                "daily-limit": entries[editIndex]["daily-limit"] ?? 0,
                "total-quota": entries[editIndex]["total-quota"] ?? 0,
                "spending-limit": entries[editIndex]["spending-limit"] ?? 0,
                "concurrency-limit": entries[editIndex]["concurrency-limit"] ?? 0,
                "rpm-limit": entries[editIndex]["rpm-limit"] ?? 0,
                "tpm-limit": entries[editIndex]["tpm-limit"] ?? 0,
                "allowed-models": entries[editIndex]["allowed-models"] ?? [],
                "allowed-channels": entries[editIndex]["allowed-channels"] ?? [],
                "allowed-channel-groups": entries[editIndex]["allowed-channel-groups"] ?? [],
                "system-prompt": entries[editIndex]["system-prompt"] ?? "",
              }
            : applyApiKeyPermissionProfile(
                {} as ApiKeyEntry,
                selectedPermissionProfile(form.permissionProfileId),
              )),
        },
      });
      notify({ type: "success", message: t("api_keys_page.updated_success") });
      setEditIndex(null);
      await loadEntries();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.update_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  /* ─── delete ─── */

  const handleDelete = async () => {
    if (deleteIndex === null) return;
    setSaving(true);
    try {
      const response = (await apiKeyEntriesApi.delete({
        index: deleteIndex,
        deleteLogs: deleteLogsOnDelete,
      })) as { logs_deleted?: number } | undefined;
      const logsDeleted =
        typeof response?.logs_deleted === "number" ? response.logs_deleted : undefined;
      notify({
        type: "success",
        message:
          deleteLogsOnDelete && typeof logsDeleted === "number"
            ? t("api_keys_page.deleted_success_with_logs", { count: logsDeleted })
            : t("api_keys_page.deleted_success"),
      });
      setDeleteIndex(null);
      setDeleteLogsOnDelete(true);
      await loadEntries();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.delete_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleOpenDelete = (index: number) => {
    setDeleteLogsOnDelete(true);
    setDeleteIndex(index);
  };

  /* ─── copy ─── */

  const handleCopy = async (key: string) => {
    if (await copyTextToClipboard(key)) {
      notify({ type: "success", message: t("api_keys_page.copied_toast") });
      return;
    }
    notify({ type: "error", message: t("api_keys_page.copy_failed") });
  };

  const compatibleConfigs = useMemo(() => {
    if (!ccSwitchImportEntry) return [];
    const entryGroups = (ccSwitchImportEntry["allowed-channel-groups"] ?? [])
      .map((g) =>
        String(g ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    return ccSwitchImportConfigs.filter((config) => {
      if (entryGroups.length === 0) return true;
      return config.allowedChannelGroups.some((g) => entryGroups.includes(g));
    });
  }, [ccSwitchImportEntry, ccSwitchImportConfigs]);

  const handleOpenCcSwitchImport = useCallback((entry: ApiKeyEntry) => {
    setCcSwitchImportEntry(entry);
  }, []);

  const handleImportWithConfig = useCallback(
    (config: CcSwitchImportConfigListItem) => {
      if (!ccSwitchImportEntry) return;

      const entryGroups = (ccSwitchImportEntry["allowed-channel-groups"] ?? [])
        .map((g) =>
          String(g ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
      const matchingGroup =
        config.allowedChannelGroups.find((g) => entryGroups.includes(g)) ??
        config.allowedChannelGroups[0] ??
        "";
      const groupItem = channelGroupItems.find(
        (g) =>
          String(g.name ?? "")
            .trim()
            .toLowerCase() === matchingGroup,
      );
      const routePath = Array.isArray(groupItem?.["path-routes"])
        ? groupItem["path-routes"][0]
        : "";
      const baseApiUrl = auth?.state.apiBase || detectApiBaseFromLocation();
      const baseUrl = appendRoutePath(baseApiUrl, config.routePath || routePath || "");

      const settings =
        ccSwitchImportConfigs.length > 0
          ? deriveCcSwitchImportSettingsFromConfigList(ccSwitchImportConfigs)
          : normalizeCcSwitchImportSettings();
      const clientSettings = {
        ...settings[config.clientType],
        endpointPath: config.endpointPath ?? settings[config.clientType].endpointPath,
        usageAutoInterval:
          config.usageAutoInterval ?? settings[config.clientType].usageAutoInterval,
        defaultModel: config.defaultModel ?? settings[config.clientType].defaultModel,
      };
      const importSettings =
        config.clientType === "claude"
          ? {
              ...settings,
              claude: {
                ...clientSettings,
                apiKeyField: normalizeCcSwitchClaudeAuthField(config.apiKeyField),
              },
            }
          : {
              ...settings,
              [config.clientType]: clientSettings,
            };

      const url = buildCcSwitchImportUrl({
        apiKey: ccSwitchImportEntry.key,
        baseUrl,
        clientType: config.clientType,
        enabled: true,
        providerName: config.providerName || ccSwitchImportEntry.name || "CliProxy",
        model: config.defaultModel,
        modelMappings: config.modelMappings,
        models: [],
        settings: importSettings,
      });

      openCcSwitchImportUrl(url, {
        onProtocolUnavailable: () =>
          notify({ type: "error", message: t("ccswitch.protocol_unavailable") }),
      });
      setCcSwitchImportEntry(null);
    },
    [ccSwitchImportEntry, ccSwitchImportConfigs, channelGroupItems, auth, notify, t],
  );

  /* ─── column definitions ─── */

  const apiKeyColumns = useMemo(
    () =>
      createApiKeyColumns({
        t,
        onToggleDisable: (index) => void handleToggleDisable(index),
        onViewUsage: handleViewUsage,
        onCopy: (key) => void handleCopy(key),
        onImportToCcSwitch: handleOpenCcSwitchImport,
        onEdit: handleOpenEdit,
        onDelete: handleOpenDelete,
      }),
    [
      handleToggleDisable,
      handleViewUsage,
      handleCopy,
      handleOpenCcSwitchImport,
      handleOpenEdit,
      handleOpenDelete,
      t,
    ],
  );

  /* ─── main render ─── */

  return (
    <div className="space-y-6">
      <Card
        title={t("api_keys_page.title")}
        description={t("api_keys_page.description")}
        actions={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadEntries()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("api_keys_page.refresh")}
            </Button>
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus size={14} />
              {t("api_keys_page.create_key")}
            </Button>
          </div>
        }
        loading={loading}
      >
        {entries.length === 0 ? (
          <EmptyState
            title={t("api_keys_page.no_keys")}
            description={t("api_keys_page.no_keys_desc")}
            icon={<KeyRound size={32} className="text-slate-400" />}
          />
        ) : (
          <VirtualTable<ApiKeyEntry>
            rows={entries}
            columns={apiKeyColumns}
            rowKey={(row) => row.key}
            rowHeight={44}
            height="h-[calc(100dvh-260px)] max-h-[70vh]"
            minHeight="min-h-[320px]"
            minWidth="min-w-[1820px]"
            caption={t("api_keys_page.table_caption")}
            emptyText={t("api_keys_page.no_api_keys")}
            rowClassName={(row) => (row.disabled ? "opacity-50" : "")}
          />
        )}
      </Card>

      <ApiKeyFormModal
        t={t}
        open={showCreate}
        editMode={false}
        saving={saving}
        form={form}
        setForm={setForm}
        permissionProfileOptions={permissionProfileOptions}
        onClose={() => setShowCreate(false)}
        onSubmit={handleCreate}
        regenerateKey={() => setForm((prev) => ({ ...prev, key: generateApiKey() }))}
      />

      <ApiKeyFormModal
        t={t}
        open={editIndex !== null}
        editMode
        saving={saving}
        form={form}
        setForm={setForm}
        permissionProfileOptions={permissionProfileOptions}
        onClose={() => setEditIndex(null)}
        onSubmit={handleEdit}
        regenerateKey={() => setForm((prev) => ({ ...prev, key: generateApiKey() }))}
      />

      <DeleteApiKeyModal
        t={t}
        entry={deleteIndex === null ? null : (entries[deleteIndex] ?? null)}
        open={deleteIndex !== null}
        saving={saving}
        deleteLogsOnDelete={deleteLogsOnDelete}
        onDeleteLogsChange={setDeleteLogsOnDelete}
        onClose={() => {
          setDeleteIndex(null);
          setDeleteLogsOnDelete(true);
        }}
        onConfirm={handleDelete}
      />

      <CcSwitchImportCardList
        open={ccSwitchImportEntry !== null}
        configs={compatibleConfigs}
        onSelect={handleImportWithConfig}
        onClose={() => setCcSwitchImportEntry(null)}
      />

      <ApiKeyUsageModal
        open={usageViewKey !== null}
        onClose={closeUsageModal}
        usageViewName={usageViewName}
        maskedKey={usageViewKey ? maskApiKey(usageViewKey) : ""}
        usageTotalCount={usageTotalCount}
        usageTimeRange={usageTimeRange}
        setUsageTimeRange={setUsageTimeRange}
        fetchUsageLogs={fetchUsageLogs}
        usagePageSize={usagePageSize}
        usageLoading={usageLoading}
        usageLastUpdatedText={usageLastUpdatedText}
        usageChannelGroupQuery={usageChannelGroupQuery}
        setUsageChannelGroupQuery={setUsageChannelGroupQuery}
        setUsageChannelQuery={setUsageChannelQuery}
        usageChannelGroupOptions={usageChannelGroupOptions}
        usageChannelQuery={usageChannelQuery}
        setUsageChannelQueryDirect={setUsageChannelQuery}
        usageChannelOptions={usageChannelOptions}
        usageModelQuery={usageModelQuery}
        setUsageModelQuery={setUsageModelQuery}
        usageModelOptions={usageModelOptions}
        usageStatusFilter={usageStatusFilter}
        setUsageStatusFilter={setUsageStatusFilter}
        usageLogColumns={usageLogColumns}
        usageRows={usageRows}
        usageCurrentPage={usageCurrentPage}
        usageTotalPages={usageTotalPages}
        setUsagePageSize={setUsagePageSize}
      />

      <LogContentModal
        open={usageContentModalOpen}
        logId={usageContentModalLogId}
        initialTab={usageContentModalTab}
        onClose={() => setUsageContentModalOpen(false)}
      />
      <ErrorDetailModal
        open={usageErrorModalOpen}
        logId={usageErrorModalLogId}
        model={usageErrorModalModel}
        onClose={() => setUsageErrorModalOpen(false)}
      />
    </div>
  );
}
