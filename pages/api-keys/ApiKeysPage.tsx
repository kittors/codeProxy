import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Plus, KeyRound, RefreshCw, Trash2 } from "lucide-react";
import {
  apiKeyEntriesApi,
  apiKeysApi,
  type ApiKeyEntry,
  type ApiKeyDailySpendingResetEvent,
} from "@code-proxy/api-client/endpoints/api-keys";
import { endUsersApi } from "@code-proxy/api-client/endpoints/end-users";
import {
  applyApiKeyPermissionProfile,
  apiKeyPermissionProfilesApi,
  CUSTOM_PERMISSION_PROFILE_ID,
  resolveEntryPermissionProfileId,
  type ApiKeyPermissionProfile,
} from "@code-proxy/api-client/endpoints/api-key-permission-profiles";
import { ccSwitchImportConfigsApi } from "@code-proxy/api-client/endpoints/ccswitch-import-configs";
import { detectApiBaseFromLocation } from "@code-proxy/api-client";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { generateApiKey, makeEmptyApiKeyForm, maskApiKey } from "./apiKeyPageUtils";
import { createApiKeyColumns } from "./components/ApiKeyColumns";
import { DeleteApiKeyModal } from "./components/DeleteApiKeyModal";
import { copyTextToClipboard } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { Button } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { DataTable } from "@code-proxy/ui";
import { ApiKeyFormModal } from "./components/ApiKeyFormModal";
import { ApiKeyUsageModal } from "./components/ApiKeyUsageModal";
import { ApiKeyResetHistoryModal } from "./components/ApiKeyResetHistoryModal";
import { useApiKeyPermissionOptions } from "@features/api-key-restrictions";
import { useApiKeyUsageView } from "./hooks/useApiKeyUsageView";
import { CcSwitchImportCardList } from "./components/CcSwitchImportCardList";
import { openCcSwitchImportUrl } from "@code-proxy/domain/ccswitch/ccswitchImport";
import {
  appendCcSwitchRoutePath,
  buildCcSwitchImportUrlForConfig,
} from "@code-proxy/domain/ccswitch/ccswitchImportLinks";
import type { CcSwitchImportConfigListItem } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import { ccSwitchConfigMatchesApiKeyPermissions } from "@code-proxy/domain/ccswitch/ccswitchImportCompatibility";
import { LogContentModal } from "@features/log-content-viewer";
import { ErrorDetailModal } from "@features/log-content-viewer";
import type { ApiKeyFormValues } from "./types";

export function ApiKeysPage() {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();
  const [searchParams] = useSearchParams();
  const endUserIdFilter = searchParams.get("endUserId")?.trim() || "";

  const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deleteLogsOnDelete, setDeleteLogsOnDelete] = useState(true);
  const [ccSwitchImportEntry, setCcSwitchImportEntry] = useState<ApiKeyEntry | null>(null);
  const [ccSwitchImportConfigs, setCcSwitchImportConfigs] = useState<
    CcSwitchImportConfigListItem[]
  >([]);
  const [copiedCcSwitchImportConfigId, setCopiedCcSwitchImportConfigId] = useState<string | null>(
    null,
  );
  const copiedCcSwitchImportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [saving, setSaving] = useState(false);
  const [createdSecretOnce, setCreatedSecretOnce] = useState<string | null>(null);
  const [resettingDailySpendingKey, setResettingDailySpendingKey] = useState<string | null>(null);
  const [resetHistoryEntry, setResetHistoryEntry] = useState<ApiKeyEntry | null>(null);
  const [resetHistoryLoading, setResetHistoryLoading] = useState(false);
  const [resetHistoryEvents, setResetHistoryEvents] = useState<ApiKeyDailySpendingResetEvent[]>([]);
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
      if (newEntries.length > 0 && !endUserIdFilter) {
        const merged = [...entriesData, ...newEntries];
        try {
          await apiKeyEntriesApi.replace(merged);
          notify({
            type: "success",
            message: t("api_keys_page.auto_import", { count: newEntries.length }),
          });
          finalEntries = merged;
        } catch {
          finalEntries = entriesData;
        }
      } else {
        finalEntries = entriesData;
      }
      if (endUserIdFilter) {
        finalEntries = finalEntries.filter((e) => e.end_user_id === endUserIdFilter);
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
  }, [endUserIdFilter, notify, refreshPermissionOptions, t]);

  useEffect(() => {
    void loadEntries();
  }, [loadEntries]);

  useEffect(
    () => () => {
      if (copiedCcSwitchImportTimerRef.current) {
        clearTimeout(copiedCcSwitchImportTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    setSelectedKeys((prev) => {
      const entryKeys = new Set(entries.map((entry) => entry.key));
      const next = new Set(Array.from(prev).filter((key) => entryKeys.has(key)));
      return next.size === prev.size ? prev : next;
    });
  }, [entries]);

  const showCopiedCcSwitchImportState = useCallback((configId: string) => {
    setCopiedCcSwitchImportConfigId(configId);
    if (copiedCcSwitchImportTimerRef.current) {
      clearTimeout(copiedCcSwitchImportTimerRef.current);
    }
    copiedCcSwitchImportTimerRef.current = setTimeout(() => {
      setCopiedCcSwitchImportConfigId(null);
      copiedCcSwitchImportTimerRef.current = null;
    }, 1800);
  }, []);

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

  const selectedEntries = useMemo(
    () => entries.filter((entry) => selectedKeys.has(entry.key)),
    [entries, selectedKeys],
  );
  const allRowsSelected =
    entries.length > 0 && entries.every((entry) => selectedKeys.has(entry.key));
  const someRowsSelected = selectedEntries.length > 0 && !allRowsSelected;

  const handleSelectAll = useCallback(
    (checked: boolean) => {
      setSelectedKeys(checked ? new Set(entries.map((entry) => entry.key)) : new Set());
    },
    [entries],
  );

  const handleSelectRow = useCallback((key: string, checked: boolean) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedKeys(new Set());
  }, []);

  /* ─── toggle disable ─── */

  const handleToggleDisable = async (index: number) => {
    const entry = entries[index];
    const nextDisabled = !entry.disabled;
    try {
      // Prefer id-based patch so user-scoped lists never replace the whole tenant table.
      if (entry.id) {
        await apiKeyEntriesApi.update({
          id: entry.id,
          value: { disabled: nextDisabled },
        });
      } else if (endUserIdFilter) {
        // Fail closed: never tenant-wide replace when scoped without stable id.
        notify({ type: "error", message: t("api_keys_page.operation_failed") });
        return;
      } else {
        const newEntries = [...entries];
        newEntries[index] = { ...entry, disabled: nextDisabled };
        await apiKeyEntriesApi.replace(newEntries);
      }
      await loadEntries();
      notify({
        type: "success",
        message: nextDisabled
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
    // User-scoped create: server generates the secret; do not show a client-side fake key.
    const next = makeEmptyApiKeyForm(endUserIdFilter ? "" : generateApiKey());
    setForm(next);
    setShowCreate(true);
  };

  const handleSetDefault = useCallback(
    async (entry: ApiKeyEntry) => {
      if (!endUserIdFilter || !entry.id || entry.is_default) return;
      try {
        await endUsersApi.setDefaultKey(endUserIdFilter, entry.id);
        notify({ type: "success", message: t("end_users.default_key_set", { defaultValue: "已设为默认 Key" }) });
        await loadEntries();
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("api_keys_page.operation_failed"),
        });
      }
    },
    [endUserIdFilter, loadEntries, notify, t],
  );

  const handleCreate = async () => {
    if (!form.name.trim()) {
      notify({ type: "error", message: t("api_keys_page.name_required") });
      return;
    }
    setSaving(true);
    try {
      if (endUserIdFilter) {
        // Owner-scoped create: server generates unique key; never tenant-wide replace.
        const created = await endUsersApi.createKey(endUserIdFilter, form.name.trim());
        const keyId = created.api_key?.id;
        const plain = created.plaintext_key;
        if (keyId && form.permissionProfileId && form.permissionProfileId !== CUSTOM_PERMISSION_PROFILE_ID) {
          const profiled = applyApiKeyPermissionProfile(
            { key: plain || "", id: keyId },
            selectedPermissionProfile(form.permissionProfileId),
          );
          await apiKeyEntriesApi.update({
            id: keyId,
            value: {
              name: form.name.trim(),
              "permission-profile-id": profiled["permission-profile-id"],
              "daily-limit": profiled["daily-limit"],
              "total-quota": profiled["total-quota"],
              "spending-limit": profiled["spending-limit"],
              "daily-spending-limit": profiled["daily-spending-limit"],
              "concurrency-limit": profiled["concurrency-limit"],
              "rpm-limit": profiled["rpm-limit"],
              "tpm-limit": profiled["tpm-limit"],
              "allowed-models": profiled["allowed-models"],
              "allowed-channels": profiled["allowed-channels"],
              "allowed-channel-groups": profiled["allowed-channel-groups"],
              "system-prompt": profiled["system-prompt"],
            },
          });
        }
        if (plain) {
          setCreatedSecretOnce(plain);
          void copyTextToClipboard(plain).catch(() => undefined);
        }
        notify({ type: "success", message: t("api_keys_page.created_success") });
      } else {
        if (!form.key.trim()) {
          notify({ type: "error", message: t("api_keys_page.key_empty") });
          return;
        }
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
      }
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
      const permissionPatch =
        form.permissionProfileId === CUSTOM_PERMISSION_PROFILE_ID
          ? {
              "permission-profile-id": entries[editIndex]["permission-profile-id"] ?? "",
              "daily-limit": entries[editIndex]["daily-limit"] ?? 0,
              "total-quota": entries[editIndex]["total-quota"] ?? 0,
              "spending-limit": entries[editIndex]["spending-limit"] ?? 0,
              "daily-spending-limit": entries[editIndex]["daily-spending-limit"] ?? 0,
              "concurrency-limit": entries[editIndex]["concurrency-limit"] ?? 0,
              "rpm-limit": entries[editIndex]["rpm-limit"] ?? 0,
              "tpm-limit": entries[editIndex]["tpm-limit"] ?? 0,
              "allowed-models": entries[editIndex]["allowed-models"] ?? [],
              "allowed-channels": entries[editIndex]["allowed-channels"] ?? [],
              "allowed-channel-groups": entries[editIndex]["allowed-channel-groups"] ?? [],
              "system-prompt": entries[editIndex]["system-prompt"] ?? "",
            }
          : applyApiKeyPermissionProfile(
              { key: newKey },
              selectedPermissionProfile(form.permissionProfileId),
            );
      if (!entries[editIndex].id && endUserIdFilter) {
        notify({ type: "error", message: t("api_keys_page.update_failed") });
        return;
      }
      await apiKeyEntriesApi.update({
        id: entries[editIndex].id,
        // Never pass filtered list index to tenant-wide index resolver.
        ...(entries[editIndex].id ? {} : { index: editIndex }),
        value: {
          ...(newKey !== originalKey ? { key: newKey } : {}),
          name: form.name.trim(),
          ...permissionPatch,
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

  const handleResetDailySpending = useCallback(
    async (index: number) => {
      const entry = entries[index];
      if (!entry || !((entry["daily-spending-limit"] ?? 0) > 0)) return;
      setResettingDailySpendingKey(entry.key);
      try {
        await apiKeyEntriesApi.resetDailySpending(
          entry.id ? { id: entry.id } : { key: entry.key },
        );
        notify({ type: "success", message: t("api_keys_page.reset_today_spending_success") });
        await loadEntries();
      } catch (err: unknown) {
        notify({
          type: "error",
          message:
            err instanceof Error ? err.message : t("api_keys_page.reset_today_spending_failed"),
        });
      } finally {
        setResettingDailySpendingKey(null);
      }
    },
    [entries, loadEntries, notify, t],
  );

  const handleViewResetHistory = useCallback(
    async (entry: ApiKeyEntry) => {
      setResetHistoryEntry(entry);
      setResetHistoryEvents([]);
      setResetHistoryLoading(true);
      try {
        const resp = await apiKeyEntriesApi.listDailySpendingResetHistory(
          entry.id ? { id: entry.id, limit: 200 } : { key: entry.key, limit: 200 },
        );
        setResetHistoryEvents(Array.isArray(resp?.items) ? resp.items : []);
      } catch (err: unknown) {
        notify({
          type: "error",
          message:
            err instanceof Error ? err.message : t("api_keys_page.reset_history_load_failed"),
        });
        setResetHistoryEntry(null);
      } finally {
        setResetHistoryLoading(false);
      }
    },
    [notify, t],
  );

  /* ─── delete ─── */

  const handleDelete = async () => {
    if (deleteIndex === null) return;
    const target = entries[deleteIndex];
    if (!target) return;
    setSaving(true);
    try {
      if (endUserIdFilter) {
        if (!target.id) {
          notify({
            type: "error",
            message: t("api_keys_page.delete_failed"),
          });
          return;
        }
        // Owner-scoped delete promotes default key when needed; never use filtered index.
        await endUsersApi.deleteKey(endUserIdFilter, target.id);
        notify({ type: "success", message: t("api_keys_page.deleted_success") });
      } else {
        const response = (await apiKeyEntriesApi.delete({
          id: target.id,
          key: target.id ? undefined : target.key,
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
      }
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

  const handleBatchDelete = async () => {
    if (selectedEntries.length === 0) return;
    setSaving(true);
    try {
      for (const entry of selectedEntries) {
        await apiKeyEntriesApi.delete({ id: entry.id, key: entry.id ? undefined : entry.key });
      }
      notify({
        type: "success",
        message: t("api_keys_page.batch_deleted_success", { count: selectedEntries.length }),
      });
      setBatchDeleteOpen(false);
      clearSelection();
      await loadEntries();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.delete_failed"),
      });
      await loadEntries();
    } finally {
      setSaving(false);
    }
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
    return ccSwitchImportConfigs.filter((config) =>
      ccSwitchConfigMatchesApiKeyPermissions(config, ccSwitchImportEntry),
    );
  }, [ccSwitchImportEntry, ccSwitchImportConfigs]);

  const handleOpenCcSwitchImport = useCallback((entry: ApiKeyEntry) => {
    setCopiedCcSwitchImportConfigId(null);
    setCcSwitchImportEntry(entry);
  }, []);

  const buildImportUrlWithConfig = useCallback(
    (config: CcSwitchImportConfigListItem) => {
      if (!ccSwitchImportEntry) return "";

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
      const baseUrl = appendCcSwitchRoutePath(baseApiUrl, config.routePath || routePath || "");

      return buildCcSwitchImportUrlForConfig({
        apiKey: ccSwitchImportEntry.key,
        baseUrl,
        config,
        configs: ccSwitchImportConfigs,
        providerName: ccSwitchImportEntry.name,
        usageBaseUrl: baseApiUrl,
        usageLanguage: i18n.language,
      });
    },
    [ccSwitchImportEntry, ccSwitchImportConfigs, channelGroupItems, auth, i18n.language],
  );

  const handleImportWithConfig = useCallback(
    (config: CcSwitchImportConfigListItem) => {
      const url = buildImportUrlWithConfig(config);
      if (!url) return;

      openCcSwitchImportUrl(url, {
        onProtocolUnavailable: () =>
          notify({ type: "error", message: t("ccswitch.protocol_unavailable") }),
      });
      setCcSwitchImportEntry(null);
    },
    [buildImportUrlWithConfig, notify, t],
  );

  const handleCopyCcSwitchImportLink = useCallback(
    async (config: CcSwitchImportConfigListItem) => {
      const url = buildImportUrlWithConfig(config);
      if (!url) return;

      if (await copyTextToClipboard(url)) {
        showCopiedCcSwitchImportState(config.id);
        notify({ type: "success", message: t("ccswitch.copy_import_link_success") });
        return;
      }
      notify({ type: "error", message: t("ccswitch.copy_import_link_failed") });
    },
    [buildImportUrlWithConfig, notify, showCopiedCcSwitchImportState, t],
  );

  /* ─── column definitions ─── */

  const apiKeyColumns = useMemo(
    () =>
      createApiKeyColumns({
        t,
        selectedKeys,
        allRowsSelected,
        someRowsSelected,
        onSelectAll: handleSelectAll,
        onSelectRow: handleSelectRow,
        onToggleDisable: (index) => void handleToggleDisable(index),
        onViewUsage: handleViewUsage,
        onCopy: (key) => void handleCopy(key),
        onImportToCcSwitch: handleOpenCcSwitchImport,
        onEdit: handleOpenEdit,
        onDelete: handleOpenDelete,
        onResetDailySpending: (index) => void handleResetDailySpending(index),
        onViewResetHistory: (entry) => void handleViewResetHistory(entry),
        onSetDefault: endUserIdFilter ? (entry) => void handleSetDefault(entry) : undefined,
        resettingDailySpendingKey,
      }),
    [
      endUserIdFilter,
      handleToggleDisable,
      handleViewUsage,
      handleCopy,
      handleOpenCcSwitchImport,
      handleOpenEdit,
      handleOpenDelete,
      handleResetDailySpending,
      handleViewResetHistory,
      handleSetDefault,
      handleSelectAll,
      handleSelectRow,
      t,
      selectedKeys,
      allRowsSelected,
      someRowsSelected,
      resettingDailySpendingKey,
    ],
  );

  /* ─── main render ─── */

  return (
    <div className="space-y-6">
      <Card
        className="md:flex md:h-[calc(100dvh-112px)] md:min-h-0 md:flex-col md:overflow-hidden"
        bodyClassName="md:flex md:min-h-0 md:flex-1 md:flex-col"
        title={
          endUserIdFilter
            ? t("end_users.manage_keys_title", { defaultValue: "用户 API 密钥" })
            : t("api_keys_page.title")
        }
        description={
          endUserIdFilter
            ? t("end_users.manage_keys_desc", {
                defaultValue: "管理该用户账号下的全部 API 密钥（限额、权限、启停等）。",
              })
            : t("api_keys_page.description")
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            {endUserIdFilter ? (
              <Link
                to="/access/end-users"
                className="inline-flex h-8 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/80 dark:hover:bg-neutral-800"
              >
                {t("end_users.back_to_users", { defaultValue: "返回用户账号" })}
              </Link>
            ) : null}
            <Button variant="primary" size="sm" onClick={handleOpenCreate}>
              <Plus size={14} />
              {t("api_keys_page.create_key")}
            </Button>
            {selectedEntries.length > 0 && !endUserIdFilter ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => setBatchDeleteOpen(true)}
                disabled={saving}
              >
                <Trash2 size={14} />
                {t("api_keys_page.batch_delete")}
              </Button>
            ) : null}
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void loadEntries()}
              disabled={loading}
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("api_keys_page.refresh")}
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
          <div className="space-y-3 md:flex md:min-h-0 md:flex-1 md:flex-col">
            <DataTable<ApiKeyEntry>
              tableId="api-keys"
              rows={entries}
              columns={apiKeyColumns}
              rowKey={(row) => row.key}
              rowHeight={44}
              height="h-[calc(100dvh-260px)] md:h-auto md:flex-1"
              minHeight="min-h-[320px] md:min-h-0"
              minWidth="min-w-[2314px]"
              caption={t("api_keys_page.table_caption")}
              emptyText={t("api_keys_page.no_api_keys")}
              showAllLoadedMessage={false}
              rowClassName={(row) => (row.disabled ? "opacity-50" : "")}
            />
          </div>
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
        serverGeneratesKey={Boolean(endUserIdFilter)}
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

      <Modal
        open={Boolean(createdSecretOnce)}
        onClose={() => setCreatedSecretOnce(null)}
        title={t("end_users.copy_secret", { defaultValue: "请立即复制 API Key" })}
      >
        <p className="mb-2 text-sm text-amber-600 dark:text-amber-300">
          {t("end_users.copy_secret_hint", {
            defaultValue: "离开后无法再查看明文 Key。已尝试复制到剪贴板。",
          })}
        </p>
        <code className="block select-all break-all rounded bg-slate-100 p-3 text-sm dark:bg-neutral-900">
          {createdSecretOnce}
        </code>
      </Modal>

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

      <DeleteApiKeyModal
        t={t}
        entry={null}
        selectedCount={selectedEntries.length}
        open={batchDeleteOpen}
        saving={saving}
        deleteLogsOnDelete={false}
        onDeleteLogsChange={() => undefined}
        onClose={() => setBatchDeleteOpen(false)}
        onConfirm={handleBatchDelete}
      />

      <CcSwitchImportCardList
        open={ccSwitchImportEntry !== null}
        configs={compatibleConfigs}
        copiedConfigId={copiedCcSwitchImportConfigId}
        onCopyLink={(config) => void handleCopyCcSwitchImportLink(config)}
        onSelect={handleImportWithConfig}
        onClose={() => {
          setCcSwitchImportEntry(null);
          setCopiedCcSwitchImportConfigId(null);
        }}
      />

      <ApiKeyResetHistoryModal
        open={resetHistoryEntry !== null}
        onClose={() => {
          setResetHistoryEntry(null);
          setResetHistoryEvents([]);
        }}
        keyName={
          resetHistoryEntry?.name?.trim() ||
          t("api_keys_page.unnamed")
        }
        maskedKey={resetHistoryEntry ? maskApiKey(resetHistoryEntry.key) : ""}
        loading={resetHistoryLoading}
        events={resetHistoryEvents}
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
