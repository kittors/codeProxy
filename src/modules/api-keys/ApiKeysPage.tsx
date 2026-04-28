import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, KeyRound, RefreshCw } from "lucide-react";
import { apiKeyEntriesApi, apiKeysApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { channelGroupsApi, type ChannelGroupItem } from "@/lib/http/apis/channel-groups";
import { authFilesApi, providersApi } from "@/lib/http/apis";
import { apiClient } from "@/lib/http/client";
import {
  generateApiKey,
  makeEmptyApiKeyForm,
  normalizeChannelKey,
  readAuthFileChannelName,
  maskApiKey,
  VendorIcon,
} from "@/modules/api-keys/apiKeyPageUtils";
import { createApiKeyColumns } from "@/modules/api-keys/components/ApiKeyColumns";
import { DeleteApiKeyModal } from "@/modules/api-keys/components/DeleteApiKeyModal";
import { Card } from "@/modules/ui/Card";
import { Button } from "@/modules/ui/Button";
import { EmptyState } from "@/modules/ui/EmptyState";
import { useToast } from "@/modules/ui/ToastProvider";
import type { MultiSelectOption } from "@/modules/ui/MultiSelect";
import { VirtualTable } from "@/modules/ui/VirtualTable";
import { ApiKeyFormModal } from "@/modules/api-keys/components/ApiKeyFormModal";
import { ApiKeyUsageModal } from "@/modules/api-keys/components/ApiKeyUsageModal";
import { useApiKeyUsageView } from "@/modules/api-keys/hooks/useApiKeyUsageView";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { ErrorDetailModal } from "@/modules/monitor/ErrorDetailModal";
import type { ApiKeyFormValues } from "@/modules/api-keys/types";

export function ApiKeysPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [deleteLogsOnDelete, setDeleteLogsOnDelete] = useState(true);
  const [saving, setSaving] = useState(false);
  const [availableModels, setAvailableModels] = useState<MultiSelectOption[]>([]);
  const [availableChannels, setAvailableChannels] = useState<MultiSelectOption[]>([]);
  const [availableChannelGroups, setAvailableChannelGroups] = useState<MultiSelectOption[]>([]);
  const [channelRouteGroupsByName, setChannelRouteGroupsByName] = useState<
    Record<string, string[]>
  >({});
  const [channelGroupByName, setChannelGroupByName] = useState<Record<string, string>>({});
  const [form, setForm] = useState<ApiKeyFormValues>(() => makeEmptyApiKeyForm());
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

  /* ─── load models ─── */

  const loadModels = useCallback(async (channels?: string[], groups?: string[]) => {
    try {
      const normalizedChannels = (Array.isArray(channels) ? channels : [])
        .map((c) => String(c ?? "").trim())
        .filter(Boolean);
      const normalizedGroups = (Array.isArray(groups) ? groups : [])
        .map((group) =>
          String(group ?? "")
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean);
      const params = new URLSearchParams();
      if (normalizedChannels.length > 0) {
        params.set("allowed_channels", normalizedChannels.join(","));
      }
      if (normalizedGroups.length > 0) {
        params.set("allowed_channel_groups", normalizedGroups.join(","));
      }
      const qs = params.toString() ? `?${params.toString()}` : "";
      const data = await apiClient.get<{ data?: Array<{ id?: string }> }>(`/models${qs}`);
      if (data?.data) {
        const opts: MultiSelectOption[] = data.data
          .filter((m) => m.id)
          .map((m) => ({
            value: m.id!,
            label: m.id!,
            icon: <VendorIcon modelId={m.id!} size={14} />,
          }))
          .sort((a, b) => a.label.localeCompare(b.label));
        setAvailableModels(opts);
        const allowedSet = new Set(opts.map((o) => o.value));
        setForm((p) => ({
          ...p,
          allowedModels: p.allowedModels.filter((m) => allowedSet.has(m)),
        }));
      }
    } catch {
      // silent — models list is supplementary
    }
  }, []);

  const loadChannelGroups = useCallback(async () => {
    try {
      const groups = await channelGroupsApi.list();
      const options: MultiSelectOption[] = groups
        .map((group) => ({
          value: String(group.name ?? "")
            .trim()
            .toLowerCase(),
          label: String(group.name ?? "")
            .trim()
            .toLowerCase(),
          description:
            typeof group.description === "string" && group.description.trim()
              ? group.description.trim()
              : undefined,
        }))
        .filter((option) => option.value)
        .sort((a, b) => a.label.localeCompare(b.label));
      setAvailableChannelGroups(options);

      const nextMembership: Record<string, string[]> = {};
      groups.forEach((group: ChannelGroupItem) => {
        const groupName = String(group.name ?? "")
          .trim()
          .toLowerCase();
        if (!groupName) return;
        const channels = Array.isArray(group.channels) ? group.channels : [];
        channels.forEach((channel) => {
          const name = String(channel ?? "").trim();
          if (!name) return;
          const existing = nextMembership[name] ?? [];
          if (!existing.includes(groupName)) {
            nextMembership[name] = [...existing, groupName];
          }
        });
      });
      Object.keys(nextMembership).forEach((name) => {
        nextMembership[name] = [...nextMembership[name]].sort((a, b) => a.localeCompare(b));
      });
      setChannelRouteGroupsByName(nextMembership);
    } catch {
      // silent — routing group list is supplementary
    }
  }, []);

  const loadChannels = useCallback(async () => {
    try {
      const [geminiKeys, claudeKeys, codexKeys, vertexKeys, openaiProviders, authFiles] =
        await Promise.all([
          providersApi.getGeminiKeys().catch(() => []),
          providersApi.getClaudeConfigs().catch(() => []),
          providersApi.getCodexConfigs().catch(() => []),
          providersApi.getVertexConfigs().catch(() => []),
          providersApi.getOpenAIProviders().catch(() => []),
          authFilesApi.list().catch(() => ({ files: [] })),
        ]);

      const seen = new Set<string>();
      const options: MultiSelectOption[] = [];
      const nextGroupByName: Record<string, string> = {};
      const push = (rawName: string, source: string, groupKey: string) => {
        const name = String(rawName ?? "").trim();
        const key = normalizeChannelKey(name);
        if (!key || seen.has(key)) return;
        seen.add(key);
        nextGroupByName[name] = groupKey;
        options.push({
          value: name,
          label: name,
          icon: (
            <span className="inline-flex rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:bg-neutral-800 dark:text-white/60">
              {source}
            </span>
          ),
        });
      };

      geminiKeys.forEach((item) => push(item.name || "", "API", "gemini"));
      claudeKeys.forEach((item) => push(item.name || "", "API", "claude"));
      codexKeys.forEach((item) => push(item.name || "", "API", "codex"));
      vertexKeys.forEach((item) => push(item.name || "", "API", "vertex"));
      openaiProviders.forEach((item) => push(item.name || "", "API", "openai"));
      (authFiles.files || []).forEach((file) => {
        if (
          String(file.account_type || "")
            .trim()
            .toLowerCase() !== "oauth"
        )
          return;
        const groupKey = String(file.type || file.provider || "")
          .trim()
          .toLowerCase();
        push(readAuthFileChannelName(file), "OAuth", groupKey);
      });

      options.sort((a, b) => a.label.localeCompare(b.label));
      setAvailableChannels(options);
      setChannelGroupByName(nextGroupByName);
    } catch {
      // silent — channel list is supplementary
    }
  }, []);

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
      void loadModels();
      void loadChannels();
      void loadChannelGroups();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, loadChannelGroups, loadChannels, loadModels]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    if (!showCreate && editIndex === null) return;
    void loadModels(
      form.useExactChannelRestrictions ? form.allowedChannels : [],
      form.allowedChannelGroups,
    );
  }, [
    editIndex,
    form.allowedChannelGroups,
    form.allowedChannels,
    form.useExactChannelRestrictions,
    loadModels,
    showCreate,
  ]);

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
    void loadModels([], next.allowedChannelGroups);
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
    void loadModels(
      next.useExactChannelRestrictions ? next.allowedChannels : [],
      next.allowedChannelGroups,
    );
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

  /* ─── column definitions ─── */

  const apiKeyColumns = useMemo(
    () =>
      createApiKeyColumns({
        t,
        onToggleDisable: (index) => void handleToggleDisable(index),
        onViewUsage: handleViewUsage,
        onCopy: (key) => void handleCopy(key),
        onEdit: handleOpenEdit,
        onDelete: handleOpenDelete,
      }),
    [handleToggleDisable, handleViewUsage, handleCopy, handleOpenEdit, handleOpenDelete, t],
  );

  const filteredAvailableChannels = useMemo(() => {
    if (!form.useExactChannelRestrictions || form.allowedChannelGroups.length === 0) {
      return availableChannels;
    }
    const allowedGroups = new Set(form.allowedChannelGroups.map((group) => group.toLowerCase()));
    return availableChannels.filter((option) => {
      const groups = channelRouteGroupsByName[option.value] ?? [];
      return groups.some((group) => allowedGroups.has(group));
    });
  }, [
    availableChannels,
    channelRouteGroupsByName,
    form.allowedChannelGroups,
    form.useExactChannelRestrictions,
  ]);

  useEffect(() => {
    if (!form.useExactChannelRestrictions || form.allowedChannelGroups.length === 0) {
      return;
    }
    const allowedChannelSet = new Set(filteredAvailableChannels.map((option) => option.value));
    setForm((prev) => {
      const nextAllowedChannels = prev.allowedChannels.filter((channel) =>
        allowedChannelSet.has(channel),
      );
      return nextAllowedChannels.length === prev.allowedChannels.length
        ? prev
        : { ...prev, allowedChannels: nextAllowedChannels };
    });
  }, [
    filteredAvailableChannels,
    form.allowedChannelGroups.length,
    form.useExactChannelRestrictions,
  ]);

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
        availableChannels={filteredAvailableChannels}
        availableChannelGroups={availableChannelGroups}
        availableModels={availableModels}
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
        availableChannels={filteredAvailableChannels}
        availableChannelGroups={availableChannelGroups}
        availableModels={availableModels}
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
