import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, KeyRound, RefreshCw } from "lucide-react";
import { apiKeyEntriesApi, apiKeysApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
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
  readCcSwitchImportSettings,
  type CcSwitchClaudeAuthField,
} from "@/modules/ccswitch/ccswitchImportSettings";
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
  const [saving, setSaving] = useState(false);
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
      const [entriesData, legacyKeys] = await Promise.all([
        apiKeyEntriesApi.list(),
        apiKeysApi.list().catch(() => [] as string[]),
      ]);

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
        "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : undefined,
        "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : undefined,
        "concurrency-limit": form.concurrencyLimit
          ? parseInt(form.concurrencyLimit, 10) || 0
          : undefined,
        "rpm-limit": form.rpmLimit ? parseInt(form.rpmLimit, 10) || 0 : undefined,
        "tpm-limit": form.tpmLimit ? parseInt(form.tpmLimit, 10) || 0 : undefined,
        "allowed-models": form.allowedModels.length > 0 ? form.allowedModels : undefined,
        "allowed-channels":
          form.useExactChannelRestrictions && form.allowedChannels.length > 0
            ? form.allowedChannels
            : undefined,
        "allowed-channel-groups":
          form.allowedChannelGroups.length > 0 ? form.allowedChannelGroups : undefined,
        "system-prompt": form.systemPrompt.trim() || undefined,
        "created-at": new Date().toISOString(),
      };
      await apiKeyEntriesApi.replace([...entries, newEntry]);
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
      dailyLimit: entry["daily-limit"]?.toString() || "",
      totalQuota: entry["total-quota"]?.toString() || "",
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
          "daily-limit": form.dailyLimit ? parseInt(form.dailyLimit, 10) || 0 : 0,
          "total-quota": form.totalQuota ? parseInt(form.totalQuota, 10) || 0 : 0,
          "concurrency-limit": form.concurrencyLimit ? parseInt(form.concurrencyLimit, 10) || 0 : 0,
          "rpm-limit": form.rpmLimit ? parseInt(form.rpmLimit, 10) || 0 : 0,
          "tpm-limit": form.tpmLimit ? parseInt(form.tpmLimit, 10) || 0 : 0,
          "allowed-models": form.allowedModels.length > 0 ? form.allowedModels : [],
          "allowed-channels":
            form.useExactChannelRestrictions && form.allowedChannels.length > 0
              ? form.allowedChannels
              : [],
          "allowed-channel-groups":
            form.allowedChannelGroups.length > 0 ? form.allowedChannelGroups : [],
          "system-prompt": form.systemPrompt.trim(),
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
    try {
      await navigator.clipboard.writeText(key);
      notify({ type: "success", message: t("api_keys_page.copied_toast") });
    } catch {
      notify({ type: "error", message: t("api_keys_page.copy_failed") });
    }
  };

  const ccSwitchImportBaseApiUrl = useMemo(
    () => auth?.state.apiBase || detectApiBaseFromLocation(),
    [auth?.state.apiBase],
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
    async (groupName: string) => {
      setCcSwitchImportModelsLoading(true);
      try {
        const opts = await fetchModelOptions([], groupName ? [groupName] : []);
        const nextModels = opts.map((option) => option.value);
        setCcSwitchImportModels(nextModels);
        setCcSwitchImportModel((current) =>
          current && nextModels.includes(current) ? current : (nextModels[0] ?? ""),
        );
      } finally {
        setCcSwitchImportModelsLoading(false);
      }
    },
    [fetchModelOptions],
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
      setCcSwitchImportGroup(initialGroup);
      setCcSwitchImportClaudeApiKeyField("ANTHROPIC_API_KEY");
      setCcSwitchImportProviderName(entry.name || "CliProxy");
      setCcSwitchImportEnabled(true);
      setCcSwitchImportModel("");
      setCcSwitchImportModels([]);
      void loadCcSwitchImportModels(initialGroup);
    },
    [channelGroupItems, loadCcSwitchImportModels],
  );

  const handleCcSwitchImportGroupChange = useCallback(
    (groupName: string) => {
      setCcSwitchImportGroup(groupName);
      setCcSwitchImportModel("");
      void loadCcSwitchImportModels(groupName);
    },
    [loadCcSwitchImportModels],
  );

  const handleImportToCcSwitch = useCallback(
    (selection: CcSwitchImportSelection) => {
      if (!ccSwitchImportEntry) return;
      const settings = readCcSwitchImportSettings();
      const importSettings =
        selection.clientType === "claude"
          ? {
              ...settings,
              claude: {
                ...settings.claude,
                apiKeyField: normalizeCcSwitchClaudeAuthField(selection.apiKeyField),
              },
            }
          : settings;
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
    [ccSwitchImportEntry, ccSwitchImportModels, notify, t],
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
            minWidth="min-w-[1740px]"
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
        clientType={ccSwitchImportClientType}
        claudeApiKeyField={ccSwitchImportClaudeApiKeyField}
        enabled={ccSwitchImportEnabled}
        model={ccSwitchImportModel}
        models={ccSwitchImportModels}
        modelsLoading={ccSwitchImportModelsLoading}
        providerName={ccSwitchImportProviderName}
        onChannelGroupChange={handleCcSwitchImportGroupChange}
        onClientTypeChange={setCcSwitchImportClientType}
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
