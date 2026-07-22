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
import { endUsersApi, type EndUserAPIKey } from "@code-proxy/api-client/endpoints/end-users";
import {
  applyApiKeyPermissionProfile,
  apiKeyPermissionProfilesApi,
  CUSTOM_PERMISSION_PROFILE_ID,
  resolveEntryPermissionProfileId,
  type ApiKeyPermissionProfile,
} from "@code-proxy/api-client/endpoints/api-key-permission-profiles";
import { ccSwitchImportConfigsApi } from "@code-proxy/api-client/endpoints/ccswitch-import-configs";
import {
  detectApiBaseFromLocation,
  EMPTY_PERIOD_SPENDING_LIMITS,
  normalizePeriodSpendingLimits,
  type PeriodSpendingLimits,
} from "@code-proxy/api-client";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { generateApiKey, makeEmptyApiKeyForm, maskApiKey } from "./apiKeyPageUtils";
import { createApiKeyColumns } from "./components/ApiKeyColumns";
import { DeleteApiKeyModal } from "./components/DeleteApiKeyModal";
import { copyTextToClipboard } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { Button } from "@code-proxy/ui";
import { EmptyState } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { ConfirmModal } from "@code-proxy/ui";
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
import {
  OwnedApiKeyQuotaModal,
  OwnedApiKeysTable,
  formatQuotaValidationError,
  limitsToPeriodSpendingDraft,
  periodSpendingDraftToLimits,
} from "@features/period-spending";

export function ApiKeysPage({
  endUserId,
  accountPeriodSpendingLimits = EMPTY_PERIOD_SPENDING_LIMITS,
  embed = false,
}: {
  endUserId?: string;
  accountPeriodSpendingLimits?: PeriodSpendingLimits;
  /** When true, hide outer card chrome for modal embedding. */
  embed?: boolean;
} = {}) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();
  const [searchParams] = useSearchParams();
  const endUserIdFilter = (endUserId ?? searchParams.get("endUserId") ?? "").trim();

  const [entries, setEntries] = useState<ApiKeyEntry[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [rotateIndex, setRotateIndex] = useState<number | null>(null);
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
  const [quotaFormError, setQuotaFormError] = useState("");
  const [resettingDailySpendingKey, setResettingDailySpendingKey] = useState<string | null>(null);
  const [resetHistoryEntry, setResetHistoryEntry] = useState<ApiKeyEntry | null>(null);
  const [resetHistoryLoading, setResetHistoryLoading] = useState(false);
  const [resetHistoryEvents, setResetHistoryEvents] = useState<ApiKeyDailySpendingResetEvent[]>([]);
  const [permissionProfiles, setPermissionProfiles] = useState<ApiKeyPermissionProfile[]>([]);
  const [form, setForm] = useState<ApiKeyFormValues>(() => makeEmptyApiKeyForm());
  const { channelGroupItems, refreshPermissionOptions } = useApiKeyPermissionOptions();
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
    usageKeyQuery,
    setUsageKeyQuery,
    usageChannelQuery,
    setUsageChannelQuery,
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
    usageKeyOptions,
    usageChannelOptions,
    usageModelOptions,
    usageStatusOptions,
    fetchUsageLogs,
    handleViewUsage,
    closeUsageModal,
  } = useApiKeyUsageView();

  /* ─── load ─── */

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      if (endUserIdFilter) {
        const ownerResponse = await endUsersApi.listKeys(endUserIdFilter);
        const ownerKeys = ownerResponse.items ?? [];
        const secretById = new Map<string, string>();
        try {
          const compatibilityEntries = await apiKeyEntriesApi.list();
          for (const entry of compatibilityEntries) {
            if (entry.id && entry.end_user_id === endUserIdFilter && entry.key) {
              secretById.set(entry.id, entry.key);
            }
          }
        } catch {
          // Owner-scoped rows are authoritative; secret enrichment is compatibility-only.
        }
        setEntries(
          ownerKeys.map((key) => ({
            id: key.id,
            key: secretById.get(key.id) ?? key.key ?? "",
            name: key.name,
            disabled: key.disabled,
            end_user_id: key.end_user_id,
            is_default: key.is_default,
            "created-at": key.created_at,
            "daily-spending-limit": key["daily-spending-limit"],
            "period-spending-limits": normalizePeriodSpendingLimits(
              key["period-spending-limits"],
              key["daily-spending-limit"],
            ),
            "period-spending": key["period-spending"],
            "daily-spending-used": key["daily-spending-used"],
            "lifetime-spending-used": key["lifetime-spending-used"],
            "daily-spending-reset-count": key["daily-spending-reset-count"],
          })),
        );
        setPermissionProfiles([]);
        setCcSwitchImportConfigs([]);
        return;
      }

      const [entriesData, legacyKeys, profilesData, configsData] = await Promise.all([
        apiKeyEntriesApi.list(),
        apiKeysApi.list().catch(() => [] as string[]),
        apiKeyPermissionProfilesApi.list().catch(() => [] as ApiKeyPermissionProfile[]),
        ccSwitchImportConfigsApi.list().catch(() => [] as CcSwitchImportConfigListItem[]),
      ]);
      setPermissionProfiles(profilesData);
      setCcSwitchImportConfigs(configsData);

      const entryKeySet = new Set(entriesData.map((entry) => entry.key));
      const newEntries = legacyKeys
        .filter((key) => key && !entryKeySet.has(key))
        .map((key): ApiKeyEntry => ({ key, "created-at": new Date().toISOString() }));

      if (newEntries.length > 0) {
        const merged = [...entriesData, ...newEntries];
        try {
          await apiKeyEntriesApi.replace(merged);
          notify({
            type: "success",
            message: t("api_keys_page.auto_import", { count: newEntries.length }),
          });
          setEntries(merged);
        } catch {
          setEntries(entriesData);
        }
      } else {
        setEntries(entriesData);
      }
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
  const ownedKeys = useMemo<EndUserAPIKey[]>(
    () =>
      entries.map((entry) => ({
        id: entry.id ?? entry.key,
        tenant_id: "",
        end_user_id: endUserIdFilter,
        key: entry.key || undefined,
        key_masked: entry.key ? maskApiKey(entry.key) : undefined,
        name: entry.name ?? "",
        disabled: Boolean(entry.disabled),
        is_default: Boolean(entry.is_default),
        created_at: entry["created-at"],
        "daily-spending-limit": entry["daily-spending-limit"],
        "period-spending-limits": normalizePeriodSpendingLimits(
          entry["period-spending-limits"],
          entry["daily-spending-limit"],
        ),
        "period-spending": entry["period-spending"],
        "daily-spending-used": entry["daily-spending-used"],
        "lifetime-spending-used": entry["lifetime-spending-used"],
        "daily-spending-reset-count": entry["daily-spending-reset-count"],
      })),
    [endUserIdFilter, entries],
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
    const next = makeEmptyApiKeyForm(endUserIdFilter ? "" : generateApiKey());
    setQuotaFormError("");
    setForm(next);
    setShowCreate(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      notify({ type: "error", message: t("api_keys_page.name_required") });
      return;
    }
    setSaving(true);
    try {
      if (endUserIdFilter) {
        const limits = periodSpendingDraftToLimits(form.periodSpending);
        const created = await endUsersApi.createKey(endUserIdFilter, {
          name: form.name.trim(),
          "daily-spending-limit": limits.day,
          "period-spending-limits": limits,
        });
        const plain = created.plaintext_key;
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
      const message = endUserIdFilter
        ? formatQuotaValidationError(err, t)
        : err instanceof Error
          ? err.message
          : t("api_keys_page.create_failed");
      if (endUserIdFilter) setQuotaFormError(message);
      else notify({ type: "error", message });
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
      periodSpending: limitsToPeriodSpendingDraft(
        normalizePeriodSpendingLimits(
          entry["period-spending-limits"],
          entry["daily-spending-limit"],
        ),
      ),
      concurrencyLimit: entry["concurrency-limit"]?.toString() || "",
      rpmLimit: entry["rpm-limit"]?.toString() || "",
      tpmLimit: entry["tpm-limit"]?.toString() || "",
      allowedModels: entry["allowed-models"] || [],
      allowedChannels: entry["allowed-channels"] || [],
      allowedChannelGroups: entry["allowed-channel-groups"] || [],
      useExactChannelRestrictions: (entry["allowed-channels"] || []).length > 0,
      systemPrompt: entry["system-prompt"] || "",
    };
    setQuotaFormError("");
    setForm(next);
    setEditIndex(index);
  };

  const handleEdit = async () => {
    if (editIndex === null) return;
    const currentEntry = entries[editIndex];
    if (!currentEntry) return;
    if (!form.name.trim()) {
      notify({ type: "error", message: t("api_keys_page.name_required") });
      return;
    }
    const originalKey = currentEntry.key;
    const newKey = form.key.trim();
    if (!endUserIdFilter && !newKey) {
      notify({ type: "error", message: t("api_keys_page.key_empty") });
      return;
    }
    setSaving(true);
    try {
      if (endUserIdFilter) {
        if (!currentEntry.id) {
          notify({ type: "error", message: t("api_keys_page.update_failed") });
          return;
        }
        const limits = periodSpendingDraftToLimits(form.periodSpending);
        await endUsersApi.updateKey(endUserIdFilter, currentEntry.id, {
          name: form.name.trim(),
          "daily-spending-limit": limits.day,
          "period-spending-limits": limits,
        });
      } else {
        const permissionPatch =
          form.permissionProfileId === CUSTOM_PERMISSION_PROFILE_ID
            ? {
                "permission-profile-id": currentEntry["permission-profile-id"] ?? "",
                "daily-limit": currentEntry["daily-limit"] ?? 0,
                "total-quota": currentEntry["total-quota"] ?? 0,
                "spending-limit": currentEntry["spending-limit"] ?? 0,
                "daily-spending-limit": currentEntry["daily-spending-limit"] ?? 0,
                "period-spending-limits": normalizePeriodSpendingLimits(
                  currentEntry["period-spending-limits"],
                  currentEntry["daily-spending-limit"],
                ),
                "concurrency-limit": currentEntry["concurrency-limit"] ?? 0,
                "rpm-limit": currentEntry["rpm-limit"] ?? 0,
                "tpm-limit": currentEntry["tpm-limit"] ?? 0,
                "allowed-models": currentEntry["allowed-models"] ?? [],
                "allowed-channels": currentEntry["allowed-channels"] ?? [],
                "allowed-channel-groups": currentEntry["allowed-channel-groups"] ?? [],
                "system-prompt": currentEntry["system-prompt"] ?? "",
              }
            : applyApiKeyPermissionProfile(
                { key: newKey },
                selectedPermissionProfile(form.permissionProfileId),
              );
        await apiKeyEntriesApi.update({
          id: currentEntry.id,
          // Never pass filtered list index to tenant-wide index resolver.
          ...(currentEntry.id ? {} : { index: editIndex }),
          value: {
            ...(newKey !== originalKey ? { key: newKey } : {}),
            name: form.name.trim(),
            ...permissionPatch,
          },
        });
      }
      notify({ type: "success", message: t("api_keys_page.updated_success") });
      setEditIndex(null);
      await loadEntries();
    } catch (err: unknown) {
      const message = endUserIdFilter
        ? formatQuotaValidationError(err, t)
        : err instanceof Error
          ? err.message
          : t("api_keys_page.update_failed");
      if (endUserIdFilter) setQuotaFormError(message);
      else notify({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  const handleRotate = async () => {
    if (rotateIndex === null || !endUserIdFilter) return;
    const target = entries[rotateIndex];
    if (!target?.id) {
      notify({ type: "error", message: t("api_keys_page.operation_failed") });
      return;
    }
    setSaving(true);
    try {
      const rotated = await endUsersApi.rotateKey(endUserIdFilter, target.id);
      if (rotated.plaintext_key) {
        setCreatedSecretOnce(rotated.plaintext_key);
        void copyTextToClipboard(rotated.plaintext_key).catch(() => undefined);
      }
      setRotateIndex(null);
      notify({
        type: "success",
        message: t("end_users.rotate_key_success", { defaultValue: "密钥已轮换，旧密钥已失效" }),
      });
      await loadEntries();
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("api_keys_page.operation_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResetDailySpending = useCallback(
    async (index: number) => {
      const entry = entries[index];
      const dayLimit = normalizePeriodSpendingLimits(
        entry?.["period-spending-limits"],
        entry?.["daily-spending-limit"],
      ).day;
      if (!entry || dayLimit <= 0) return;
      setResettingDailySpendingKey(entry.id ?? entry.key);
      try {
        if (endUserIdFilter && entry.id) {
          await endUsersApi.resetKeyDailySpending(endUserIdFilter, entry.id);
        } else {
          await apiKeyEntriesApi.resetDailySpending(
            entry.id ? { id: entry.id } : { key: entry.key },
          );
        }
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
    [endUserIdFilter, entries, loadEntries, notify, t],
  );

  const handleViewResetHistory = useCallback(
    async (entry: ApiKeyEntry) => {
      setResetHistoryEntry(entry);
      setResetHistoryEvents([]);
      setResetHistoryLoading(true);
      try {
        const resp =
          endUserIdFilter && entry.id
            ? await endUsersApi.listKeyDailySpendingResetHistory(endUserIdFilter, entry.id, 200)
            : await apiKeyEntriesApi.listDailySpendingResetHistory(
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
    [endUserIdFilter, notify, t],
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
        // Owner-scoped delete enforces the account's at-least-one-key invariant server-side.
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
        onRotate: setRotateIndex,
        onEdit: handleOpenEdit,
        onDelete: handleOpenDelete,
        onResetDailySpending: (index) => void handleResetDailySpending(index),
        onViewResetHistory: (entry) => void handleViewResetHistory(entry),
        resettingDailySpendingKey,
        accountScoped: Boolean(endUserIdFilter),
      }),
    [
      endUserIdFilter,
      handleToggleDisable,
      handleViewUsage,
      handleCopy,
      handleOpenCcSwitchImport,
      setRotateIndex,
      handleOpenEdit,
      handleOpenDelete,
      handleResetDailySpending,
      handleViewResetHistory,
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

  const toolbar = (
    <div className="flex flex-wrap justify-end gap-2">
      {endUserIdFilter && !embed ? (
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
      <Button variant="secondary" size="sm" onClick={() => void loadEntries()} disabled={loading}>
        <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        {t("api_keys_page.refresh")}
      </Button>
    </div>
  );

  const tableBody = endUserIdFilter ? (
    <div className={embed ? "flex min-h-0 flex-1 flex-col" : "space-y-3"}>
      <OwnedApiKeysTable
        t={t}
        keys={ownedKeys}
        busyKeyId={resettingDailySpendingKey}
        busy={saving}
        canDelete={() => ownedKeys.length > 1}
        height={embed ? "min-h-0 flex-1" : "h-[calc(100dvh-260px)]"}
        actions={{
          onToggleDisabled: (key) => {
            const index = entries.findIndex((entry) => entry.id === key.id);
            if (index >= 0) void handleToggleDisable(index);
          },
          onCopy: (key) => {
            if (key.key) void handleCopy(key.key);
          },
          onRotate: (key) => {
            const index = entries.findIndex((entry) => entry.id === key.id);
            if (index >= 0) setRotateIndex(index);
          },
          onEdit: (key) => {
            const index = entries.findIndex((entry) => entry.id === key.id);
            if (index >= 0) handleOpenEdit(index);
          },
          onResetDailySpending: (key) => {
            const index = entries.findIndex((entry) => entry.id === key.id);
            if (index >= 0) void handleResetDailySpending(index);
          },
          onViewResetHistory: (key) => {
            const entry = entries.find((item) => item.id === key.id);
            if (entry) void handleViewResetHistory(entry);
          },
          onDelete: (key) => {
            const index = entries.findIndex((entry) => entry.id === key.id);
            if (index >= 0) handleOpenDelete(index);
          },
        }}
      />
    </div>
  ) : entries.length === 0 ? (
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
        rowHeight={52}
        height="h-[calc(100dvh-260px)] md:h-auto md:flex-1"
        minHeight="min-h-[320px] md:min-h-0"
        minWidth="min-w-[2500px]"
        caption={t("api_keys_page.table_caption")}
        emptyText={t("api_keys_page.no_api_keys")}
        showAllLoadedMessage={false}
        rowClassName={(row) => (row.disabled ? "opacity-50" : "")}
      />
    </div>
  );

  return (
    <div className={embed ? "flex h-full min-h-0 flex-col" : "space-y-6"}>
      {embed ? (
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex shrink-0 items-center justify-end border-b border-slate-100 px-4 py-3 dark:border-white/10">
            {toolbar}
          </div>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 py-3">{tableBody}</div>
        </div>
      ) : (
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
          actions={toolbar}
          loading={loading}
        >
          {tableBody}
        </Card>
      )}

      {endUserIdFilter ? (
        <>
          <OwnedApiKeyQuotaModal
            t={t}
            open={showCreate}
            mode="create"
            value={{ name: form.name, periods: form.periodSpending }}
            accountLimits={accountPeriodSpendingLimits}
            saving={saving}
            serverError={quotaFormError}
            onChange={(next) =>
              setForm((current) => ({
                ...current,
                name: next.name,
                periodSpending: next.periods,
              }))
            }
            onClose={() => {
              setShowCreate(false);
              setQuotaFormError("");
            }}
            onSubmit={() => void handleCreate()}
          />
          <OwnedApiKeyQuotaModal
            t={t}
            open={editIndex !== null}
            mode="edit"
            value={{ name: form.name, periods: form.periodSpending }}
            accountLimits={accountPeriodSpendingLimits}
            saving={saving}
            serverError={quotaFormError}
            onChange={(next) =>
              setForm((current) => ({
                ...current,
                name: next.name,
                periodSpending: next.periods,
              }))
            }
            onClose={() => {
              setEditIndex(null);
              setQuotaFormError("");
            }}
            onSubmit={() => void handleEdit()}
          />
        </>
      ) : (
        <>
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
        </>
      )}

      <ConfirmModal
        open={rotateIndex !== null}
        onClose={() => setRotateIndex(null)}
        title={t("end_users.rotate_key_title", { defaultValue: "轮换 API 密钥" })}
        description={t("end_users.rotate_key_desc", {
          defaultValue: "轮换后旧密钥会立即失效。新密钥只展示一次，请立即复制并更新调用方。",
        })}
        confirmText={t("end_users.rotate_key", { defaultValue: "轮换密钥" })}
        busy={saving}
        onConfirm={() => void handleRotate()}
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
        keyName={resetHistoryEntry?.name?.trim() || t("api_keys_page.unnamed")}
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
        usageKeyQuery={usageKeyQuery}
        setUsageKeyQuery={setUsageKeyQuery}
        usageKeyOptions={usageKeyOptions}
        usageChannelQuery={usageChannelQuery}
        setUsageChannelQuery={setUsageChannelQuery}
        usageChannelOptions={usageChannelOptions}
        usageModelQuery={usageModelQuery}
        setUsageModelQuery={setUsageModelQuery}
        usageModelOptions={usageModelOptions}
        usageStatusFilter={usageStatusFilter}
        setUsageStatusFilter={setUsageStatusFilter}
        usageStatusOptions={usageStatusOptions}
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
