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
import type { ChannelGroupItem } from "@/lib/http/apis/channel-groups";
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
import {
  CcSwitchImportModal,
  type CcSwitchImportConfigOption,
  type CcSwitchImportGroupOption,
  type CcSwitchImportSelection,
} from "@/modules/ccswitch/CcSwitchImportModal";
import {
  buildCcSwitchImportUrl,
  openCcSwitchImportUrl,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import {
  normalizeCcSwitchClaudeAuthField,
  normalizeCcSwitchImportSettings,
  type CcSwitchClaudeAuthField,
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
  const [ccSwitchImportClientType, setCcSwitchImportClientType] =
    useState<CcSwitchClientType>("claude");
  const [ccSwitchImportGroup, setCcSwitchImportGroup] = useState("");
  const [ccSwitchImportClaudeApiKeyField, setCcSwitchImportClaudeApiKeyField] =
    useState<CcSwitchClaudeAuthField>("ANTHROPIC_API_KEY");
  const [ccSwitchImportProviderName, setCcSwitchImportProviderName] = useState("");
  const [ccSwitchImportEnabled, setCcSwitchImportEnabled] = useState(true);
  const [ccSwitchImportModel, setCcSwitchImportModel] = useState("");
  const [ccSwitchImportModels, setCcSwitchImportModels] = useState<string[]>([]);
  const [ccSwitchImportModelsLoading, setCcSwitchImportModelsLoading] = useState(false);
  const [ccSwitchImportConfigId, setCcSwitchImportConfigId] = useState("");
  const [ccSwitchImportConfigs, setCcSwitchImportConfigs] = useState<
    CcSwitchImportConfigListItem[]
  >([]);
  const [saving, setSaving] = useState(false);
  const [permissionProfiles, setPermissionProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [form, setForm] = useState<ApiKeyFormValues>(() => makeEmptyApiKeyForm());
  const { channelGroupItems, channelGroupByName, fetchModelOptions, refreshPermissionOptions } =
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

  const ccSwitchImportBaseApiUrl = useMemo(
    () => auth?.state.apiBase || detectApiBaseFromLocation(),
    [auth?.state.apiBase],
  );
  const ccSwitchImportConfigsForClient = useMemo(
    () => ccSwitchImportConfigs.filter((config) => config.clientType === ccSwitchImportClientType),
    [ccSwitchImportClientType, ccSwitchImportConfigs],
  );

  const ccSwitchImportAllowedGroups = useMemo(() => {
    const entryGroups = (ccSwitchImportEntry?.["allowed-channel-groups"] ?? [])
      .map((group) =>
        String(group ?? "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);
    if (entryGroups.length > 0) {
      return Array.from(new Set(entryGroups));
    }
    return Array.from(
      new Set(
        channelGroupItems
          .map((group) =>
            String(group.name ?? "")
              .trim()
              .toLowerCase(),
          )
          .filter(Boolean),
      ),
    );
  }, [ccSwitchImportEntry, channelGroupItems]);

  const ccSwitchImportGroupOptions = useMemo<CcSwitchImportGroupOption[]>(() => {
    const groupByName = new Map(
      channelGroupItems
        .map((group) => {
          const name = String(group.name ?? "")
            .trim()
            .toLowerCase();
          return name ? ([name, group] as const) : null;
        })
        .filter((item): item is readonly [string, ChannelGroupItem] => Boolean(item)),
    );
    return ccSwitchImportAllowedGroups.map((groupName) => {
      const group = groupByName.get(groupName);
      const routePath = Array.isArray(group?.["path-routes"]) ? group["path-routes"][0] : "";
      return {
        value: groupName,
        label: groupName,
        baseUrl: appendRoutePath(ccSwitchImportBaseApiUrl, routePath || ""),
        description:
          typeof group?.description === "string" && group.description.trim()
            ? group.description.trim()
            : undefined,
      };
    });
  }, [ccSwitchImportAllowedGroups, ccSwitchImportBaseApiUrl, channelGroupItems]);

  const ccSwitchImportBaseUrl = useMemo(() => {
    return (
      ccSwitchImportGroupOptions.find((option) => option.value === ccSwitchImportGroup)?.baseUrl ??
      ccSwitchImportBaseApiUrl
    );
  }, [ccSwitchImportBaseApiUrl, ccSwitchImportGroup, ccSwitchImportGroupOptions]);

  const loadCcSwitchImportModels = useCallback(
    async (groupName: string, preferredModel?: string) => {
      setCcSwitchImportModelsLoading(true);
      try {
        const opts = await fetchModelOptions([], groupName ? [groupName] : []);
        const nextModels = opts.map((option) => option.value);
        setCcSwitchImportModels(nextModels);
        setCcSwitchImportModel((current) =>
          preferredModel?.trim()
            ? preferredModel.trim()
            : current && nextModels.includes(current)
              ? current
              : (nextModels[0] ?? ""),
        );
      } finally {
        setCcSwitchImportModelsLoading(false);
      }
    },
    [fetchModelOptions],
  );

  const applyCcSwitchImportConfig = useCallback(
    (config: CcSwitchImportConfigListItem | null, fallbackGroup = "") => {
      if (!config) {
        setCcSwitchImportConfigId("");
        setCcSwitchImportClaudeApiKeyField("ANTHROPIC_API_KEY");
        return fallbackGroup;
      }

      const nextGroup =
        config.allowedChannelGroups.find((group) => ccSwitchImportAllowedGroups.includes(group)) ??
        config.allowedChannelGroups[0] ??
        fallbackGroup;

      setCcSwitchImportConfigId(config.id);
      setCcSwitchImportClaudeApiKeyField(config.apiKeyField ?? "ANTHROPIC_API_KEY");
      setCcSwitchImportProviderName(config.providerName || "CliProxy");
      setCcSwitchImportModel(config.defaultModel);
      setCcSwitchImportGroup(nextGroup);
      void loadCcSwitchImportModels(nextGroup, config.defaultModel);
      return nextGroup;
    },
    [ccSwitchImportAllowedGroups, loadCcSwitchImportModels],
  );

  const handleCcSwitchImportClientTypeChange = useCallback(
    (clientType: CcSwitchClientType) => {
      setCcSwitchImportClientType(clientType);
      const preset =
        ccSwitchImportConfigs.find((config) => config.clientType === clientType) ?? null;
      if (!preset) {
        setCcSwitchImportConfigId("");
        setCcSwitchImportClaudeApiKeyField("ANTHROPIC_API_KEY");
        setCcSwitchImportProviderName(ccSwitchImportEntry?.name || "CliProxy");
        setCcSwitchImportModel("");
        void loadCcSwitchImportModels(ccSwitchImportGroup);
        return;
      }
      applyCcSwitchImportConfig(preset, ccSwitchImportGroup);
    },
    [
      applyCcSwitchImportConfig,
      ccSwitchImportConfigs,
      ccSwitchImportEntry?.name,
      ccSwitchImportGroup,
      loadCcSwitchImportModels,
    ],
  );

  const handleOpenCcSwitchImport = useCallback(
    (entry: ApiKeyEntry) => {
      const entryGroups = (entry["allowed-channel-groups"] ?? [])
        .map((group) =>
          String(group ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
      const knownGroups = channelGroupItems
        .map((group) =>
          String(group.name ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
      const initialGroup = entryGroups[0] ?? knownGroups[0] ?? "";
      setCcSwitchImportEntry(entry);
      setCcSwitchImportClientType("claude");
      setCcSwitchImportEnabled(true);
      setCcSwitchImportModels([]);
      const initialPreset =
        ccSwitchImportConfigs.find((config) => config.clientType === "claude") ?? null;
      if (initialPreset) {
        applyCcSwitchImportConfig(initialPreset, initialGroup);
      } else {
        setCcSwitchImportConfigId("");
        setCcSwitchImportGroup(initialGroup);
        setCcSwitchImportClaudeApiKeyField("ANTHROPIC_API_KEY");
        setCcSwitchImportProviderName(entry.name || "CliProxy");
        setCcSwitchImportModel("");
        void loadCcSwitchImportModels(initialGroup);
      }
    },
    [applyCcSwitchImportConfig, ccSwitchImportConfigs, channelGroupItems, loadCcSwitchImportModels],
  );

  const handleCcSwitchImportGroupChange = useCallback(
    (groupName: string) => {
      setCcSwitchImportGroup(groupName);
      setCcSwitchImportModel((current) => current);
      void loadCcSwitchImportModels(groupName);
    },
    [loadCcSwitchImportModels],
  );

  const handleCcSwitchImportConfigChange = useCallback(
    (configId: string) => {
      if (!configId) {
        setCcSwitchImportConfigId("");
        return;
      }
      const config = ccSwitchImportConfigsForClient.find((item) => item.id === configId) ?? null;
      applyCcSwitchImportConfig(config, ccSwitchImportGroup);
    },
    [applyCcSwitchImportConfig, ccSwitchImportConfigsForClient, ccSwitchImportGroup],
  );

  const ccSwitchImportConfigOptions = useMemo<CcSwitchImportConfigOption[]>(
    () =>
      ccSwitchImportConfigsForClient.length > 0
        ? [
            {
              value: "",
              label: t("ccswitch.import_saved_config_none"),
            },
            ...ccSwitchImportConfigsForClient.map((config) => ({
              value: config.id,
              label: config.note ? `${config.providerName} · ${config.note}` : config.providerName,
            })),
          ]
        : [],
    [ccSwitchImportConfigsForClient, t],
  );

  const handleImportToCcSwitch = useCallback(
    (selection: CcSwitchImportSelection) => {
      if (!ccSwitchImportEntry) return;
      const settings =
        ccSwitchImportConfigs.length > 0
          ? deriveCcSwitchImportSettingsFromConfigList(ccSwitchImportConfigs)
          : normalizeCcSwitchImportSettings();
      const selectedPreset =
        ccSwitchImportConfigId && ccSwitchImportConfigsForClient.length > 0
          ? (ccSwitchImportConfigsForClient.find((item) => item.id === ccSwitchImportConfigId) ??
            null)
          : null;
      const clientSettings = {
        ...settings[selection.clientType],
        endpointPath: selectedPreset?.endpointPath ?? settings[selection.clientType].endpointPath,
        usageAutoInterval:
          selectedPreset?.usageAutoInterval ?? settings[selection.clientType].usageAutoInterval,
        defaultModel: selectedPreset?.defaultModel ?? settings[selection.clientType].defaultModel,
      };
      const importSettings =
        selection.clientType === "claude"
          ? {
              ...settings,
              claude: {
                ...clientSettings,
                apiKeyField: normalizeCcSwitchClaudeAuthField(
                  selection.apiKeyField ?? selectedPreset?.apiKeyField,
                ),
              },
            }
          : {
              ...settings,
              [selection.clientType]: clientSettings,
            };
      const url = buildCcSwitchImportUrl({
        apiKey: ccSwitchImportEntry.key,
        baseUrl: selection.baseUrl,
        clientType: selection.clientType,
        enabled: selection.enabled,
        providerName: selection.providerName || ccSwitchImportEntry.name || "CliProxy",
        model: selection.model,
        models: ccSwitchImportModels,
        settings: importSettings,
      });

      openCcSwitchImportUrl(url, {
        onProtocolUnavailable: () =>
          notify({ type: "error", message: t("ccswitch.protocol_unavailable") }),
      });
      setCcSwitchImportEntry(null);
    },
    [
      ccSwitchImportConfigId,
      ccSwitchImportConfigs,
      ccSwitchImportConfigsForClient,
      ccSwitchImportEntry,
      ccSwitchImportModels,
      notify,
      t,
    ],
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

      <CcSwitchImportModal
        t={t}
        open={ccSwitchImportEntry !== null}
        baseUrl={ccSwitchImportBaseUrl}
        channelGroup={ccSwitchImportGroup}
        channelGroupOptions={ccSwitchImportGroupOptions}
        configOptions={ccSwitchImportConfigOptions}
        clientType={ccSwitchImportClientType}
        claudeApiKeyField={ccSwitchImportClaudeApiKeyField}
        enabled={ccSwitchImportEnabled}
        model={ccSwitchImportModel}
        models={ccSwitchImportModels}
        modelsLoading={ccSwitchImportModelsLoading}
        providerName={ccSwitchImportProviderName}
        selectedConfigId={ccSwitchImportConfigId}
        onChannelGroupChange={handleCcSwitchImportGroupChange}
        onConfigChange={handleCcSwitchImportConfigChange}
        onClientTypeChange={handleCcSwitchImportClientTypeChange}
        onClose={() => setCcSwitchImportEntry(null)}
        onClaudeApiKeyFieldChange={setCcSwitchImportClaudeApiKeyField}
        onEnabledChange={setCcSwitchImportEnabled}
        onModelChange={setCcSwitchImportModel}
        onProviderNameChange={setCcSwitchImportProviderName}
        onSelect={handleImportToCcSwitch}
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
