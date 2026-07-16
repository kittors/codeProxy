import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Edit3, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@code-proxy/ui";
import { Card } from "@code-proxy/ui";
import { ConfirmModal } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import type { SearchableSelectOption } from "@code-proxy/ui";
import { ToggleSwitch } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { DataTable } from "@code-proxy/ui";
import {
  apiClient,
  apiKeyEntriesApi,
  detectApiBaseFromLocation,
  normalizeApiBase,
} from "@code-proxy/api-client";
import { getActiveCacheTenantId } from "@code-proxy/domain";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { ModelFormModal } from "./components/ModelFormModal";
import { ModelTestModal } from "./components/ModelTestModal";
import { ModelsPageTabs } from "./components/ModelsPageTabs";
import { ModelsStatsCards } from "./components/ModelsStatsCards";
import { OwnerFormModal } from "./components/OwnerFormModal";
import { useModelColumns } from "./hooks/useModelColumns";
import {
  invalidateConfiguredModelAvailability,
  loadConfiguredModelAvailability,
  loadModelPathAvailability,
} from "@features/model-availability";
import type {
  ModelFormState,
  ModelItem,
  ModelOwnerPreset,
  ModelPageTab,
  ModelScope,
  OpenRouterModelSyncState,
  OwnerFormState,
} from "./types";
import {
  buildOwnerPresetDrafts,
  defaultOpenRouterSyncState,
  emptyForm,
  emptyOwnerForm,
  fetchModelConfigs,
  fetchModelsPageTotalCost,
  fetchOwnerPresets,
  formatSyncTimestamp,
  getModelsPageSnapshot,
  hasModelPricingData as hasPricing,
  mergeConfiguredModelAvailability,
  normalizeOpenRouterSyncResult,
  normalizeOpenRouterSyncState,
  normalizeOwnerPresetItems,
  normalizeOwnerValue,
  patchModelsPageSnapshot,
  saveModelConfig,
  setModelsPageSnapshot,
  syncIntervalHoursValue,
  syncIntervalMinutesFromHours,
  toFormState,
  toOwnerFormState,
} from "./modelsUtils";

const openRouterSyncStateByTenant = new Map<string, OpenRouterModelSyncState>();

function readOpenRouterSyncCache(tenantKey: string): OpenRouterModelSyncState | null {
  return openRouterSyncStateByTenant.get(tenantKey) ?? null;
}

function writeOpenRouterSyncCache(tenantKey: string, state: OpenRouterModelSyncState): void {
  openRouterSyncStateByTenant.set(tenantKey, state);
}

export function ModelsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const auth = useOptionalAuth();
  const canManageOpenRouterSync = auth ? auth.can("system.config.read") : true;
  // Stable tenant key for session caches (matches model-availability cache buckets).
  const cacheTenantKey = getActiveCacheTenantId();

  const initialActiveSnapshot = getModelsPageSnapshot("active");
  const [models, setModels] = useState<ModelItem[]>(() => initialActiveSnapshot?.models ?? []);
  // Only block the table with skeleton when we have nothing to paint yet.
  const [loading, setLoading] = useState(() => !initialActiveSnapshot);
  const [refreshing, setRefreshing] = useState(false);
  const [searchFilter, setSearchFilter] = useState("");
  const [totalCost, setTotalCost] = useState(() => initialActiveSnapshot?.totalCost ?? 0);
  const [form, setForm] = useState<ModelFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ModelPageTab>("active");
  const [ownerPresets, setOwnerPresets] = useState<ModelOwnerPreset[]>(
    () => initialActiveSnapshot?.ownerPresets ?? [],
  );
  const [ownerFilter, setOwnerFilter] = useState("");
  const [ownerSearchFilter, setOwnerSearchFilter] = useState("");
  const [ownerForm, setOwnerForm] = useState<OwnerFormState | null>(null);
  const [deleteOwnerTarget, setDeleteOwnerTarget] = useState<ModelOwnerPreset | null>(null);
  const [savingOwnerPresets, setSavingOwnerPresets] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ModelItem | null>(null);
  const [bulkDeleteTargetIds, setBulkDeleteTargetIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [togglingModelId, setTogglingModelId] = useState<string | null>(null);
  const [testTarget, setTestTarget] = useState<ModelItem | null>(null);
  const [testRunning, setTestRunning] = useState(false);
  const [testResultText, setTestResultText] = useState<string | null>(null);
  const [testErrorText, setTestErrorText] = useState<string | null>(null);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set());
  const cachedOpenRouter = readOpenRouterSyncCache(cacheTenantKey);
  const [openRouterSyncState, setOpenRouterSyncState] = useState<OpenRouterModelSyncState>(
    () => cachedOpenRouter ?? defaultOpenRouterSyncState,
  );
  // Only set true while fetching without a cached sync state to show.
  const [openRouterSyncLoading, setOpenRouterSyncLoading] = useState(false);
  const [openRouterSyncSaving, setOpenRouterSyncSaving] = useState(false);
  const [openRouterSyncRunning, setOpenRouterSyncRunning] = useState(false);
  const [openRouterSyncError, setOpenRouterSyncError] = useState<string | null>(null);
  const [modelIdSuggestionsOpen, setModelIdSuggestionsOpen] = useState(false);
  const [syncIntervalHours, setSyncIntervalHours] = useState(() =>
    syncIntervalHoursValue(
      (cachedOpenRouter ?? defaultOpenRouterSyncState).intervalMinutes,
    ),
  );
  const skipSyncIntervalBlurRef = useRef(false);
  const loadSeqRef = useRef(0);
  const modelsRef = useRef(models);
  const ownerPresetsRef = useRef(ownerPresets);
  const totalCostRef = useRef(totalCost);
  // Keep last path-availability rows per scope so soft refresh does not drop path-only models.
  const pathItemsByScopeRef = useRef<
    Record<ModelScope, import("@features/model-availability").ModelPathAvailabilityItem[]>
  >({
    active: [],
    library: [],
  });
  // Last configured-availability for the active tab. Secondary path merge must
  // re-apply scoped AllowedModels; passing null re-adds path-only blocked models.
  const lastAvailabilityRef = useRef<
    import("@features/model-availability").ConfiguredModelAvailability | null
  >(null);
  // After first successful paint (or warm snapshot), keep refreshes non-blocking.
  const warmPaintByScopeRef = useRef<Record<ModelScope, boolean>>({
    active: Boolean(initialActiveSnapshot),
    library: Boolean(getModelsPageSnapshot("library")),
  });
  // Avoid re-fetching total cost on every tab switch when we already have a value this session.
  const totalCostLoadedRef = useRef(Boolean(initialActiveSnapshot?.hasTotalCost));

  useEffect(() => {
    modelsRef.current = models;
  }, [models]);
  useEffect(() => {
    ownerPresetsRef.current = ownerPresets;
  }, [ownerPresets]);
  useEffect(() => {
    totalCostRef.current = totalCost;
  }, [totalCost]);

  const modelScope: ModelScope = activeTab;

  const applyScopeSnapshot = useCallback((scope: ModelScope) => {
    const snapshot = getModelsPageSnapshot(scope);
    if (!snapshot) return false;
    setModels(snapshot.models);
    setOwnerPresets(snapshot.ownerPresets);
    if (snapshot.hasTotalCost) {
      setTotalCost(snapshot.totalCost);
      totalCostLoadedRef.current = true;
    }
    warmPaintByScopeRef.current[scope] = true;
    return true;
  }, []);

  const loadModels = useCallback(
    async (options?: { force?: boolean }) => {
      const scope = modelScope;
      const seq = ++loadSeqRef.current;
      const isActive = () => loadSeqRef.current === seq;

      // Soft-refresh when we already painted this scope (in-memory list or session snapshot).
      const hasExisting =
        warmPaintByScopeRef.current[scope] ||
        modelsRef.current.length > 0 ||
        Boolean(getModelsPageSnapshot(scope));
      if (hasExisting) {
        setRefreshing(true);
        setLoading(false);
      } else {
        setLoading(true);
        setRefreshing(false);
      }

      try {
        // Critical path only: configs + owner presets + (active) configured availability.
        // Path availability and usage totals are secondary and must not block first paint.
        const [data, presets, availability] = await Promise.all([
          fetchModelConfigs(scope),
          fetchOwnerPresets(),
          scope === "active" ? loadConfiguredModelAvailability() : Promise.resolve(null),
        ]);
        if (!isActive()) return;

        if (scope === "active") {
          lastAvailabilityRef.current = availability;
        }

        // Reuse last path items for this scope during soft refresh so path-only rows do not vanish.
        const visibleData = mergeConfiguredModelAvailability(
          data,
          availability,
          pathItemsByScopeRef.current[scope],
        );
        setModels(visibleData);
        setOwnerPresets(presets);
        warmPaintByScopeRef.current[scope] = true;
        setOwnerFilter((current) => {
          if (!current) return "";
          return buildOwnerPresetDrafts(visibleData, presets).some((owner) => owner.value === current)
            ? current
            : "";
        });
        setModelsPageSnapshot(scope, {
          models: visibleData,
          ownerPresets: presets,
          totalCost: totalCostRef.current,
          hasTotalCost: totalCostLoadedRef.current,
        });

        // Secondary: enrich with path-only models without blanking the table.
        // Merge into the current list (not a stale critical snapshot) so in-flight saves/deletes win.
        // Keep last configured-availability so scoped allow-lists still apply.
        void loadModelPathAvailability()
          .then((pathAvailability) => {
            if (!isActive()) return;
            const pathItems = pathAvailability?.items ?? [];
            pathItemsByScopeRef.current[scope] = pathItems;
            if (!pathItems.length) return;
            const current = modelsRef.current;
            const availabilityForMerge =
              scope === "active" ? lastAvailabilityRef.current : null;
            const merged = mergeConfiguredModelAvailability(
              current,
              availabilityForMerge,
              pathItems,
            );
            if (merged.length === current.length) return;
            setModels(merged);
            setModelsPageSnapshot(scope, {
              models: merged,
              ownerPresets: ownerPresetsRef.current,
              totalCost: totalCostRef.current,
              hasTotalCost: totalCostLoadedRef.current,
            });
          })
          .catch(() => {
            // Path availability is best-effort enrichment.
          });

        // Secondary: total cost card — fetch once per session unless forced refresh.
        if (options?.force || !totalCostLoadedRef.current) {
          void fetchModelsPageTotalCost().then((cost) => {
            if (!isActive()) return;
            totalCostLoadedRef.current = true;
            setTotalCost(cost);
            patchModelsPageSnapshot(scope, { totalCost: cost, hasTotalCost: true });
          });
        }
      } catch (err: unknown) {
        if (!isActive()) return;
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("models_page.load_failed"),
        });
      } finally {
        if (isActive()) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [modelScope, notify, t],
  );

  // When the tab changes, paint that scope's snapshot immediately (if any),
  // then soft-refresh in the background so a warm tab does not flash empty.
  // Cold tabs still show skeleton instead of the previous tab's rows.
  useEffect(() => {
    const hadSnapshot = applyScopeSnapshot(modelScope);
    if (!hadSnapshot && !warmPaintByScopeRef.current[modelScope]) {
      setModels([]);
      setLoading(true);
    }
    void loadModels();
  }, [applyScopeSnapshot, loadModels, modelScope]);

  const loadOpenRouterSyncState = useCallback(async () => {
    const hasCached = Boolean(readOpenRouterSyncCache(cacheTenantKey));
    // Keep last known sync status visible; only show loading text on cold start.
    if (!hasCached) setOpenRouterSyncLoading(true);
    setOpenRouterSyncError(null);
    try {
      const state = normalizeOpenRouterSyncState(await apiClient.get("/model-openrouter-sync"));
      writeOpenRouterSyncCache(cacheTenantKey, state);
      setOpenRouterSyncState(state);
      setSyncIntervalHours(syncIntervalHoursValue(state.intervalMinutes));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("models_page.openrouter_sync_load_failed");
      setOpenRouterSyncError(message);
    } finally {
      setOpenRouterSyncLoading(false);
    }
  }, [cacheTenantKey, t]);

  useEffect(() => {
    if (activeTab === "library" && canManageOpenRouterSync) {
      void loadOpenRouterSyncState();
    }
  }, [activeTab, canManageOpenRouterSync, loadOpenRouterSyncState]);

  const filteredModels = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase();
    const ownerNeedle = activeTab === "library" ? ownerFilter : "";
    return models.filter((model) => {
      if (ownerNeedle && normalizeOwnerValue(model.owned_by) !== ownerNeedle) return false;
      if (!needle) return true;
      const haystack = `${model.id} ${model.owned_by} ${model.description}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [activeTab, models, ownerFilter, searchFilter]);

  const filteredModelIds = useMemo(() => filteredModels.map((model) => model.id), [filteredModels]);

  const selectedModels = useMemo(
    () => models.filter((model) => selectedModelIds.has(model.id)),
    [models, selectedModelIds],
  );
  const selectedModelCount = selectedModels.length;
  const allVisibleModelsSelected =
    filteredModelIds.length > 0 && filteredModelIds.every((id) => selectedModelIds.has(id));
  const someVisibleModelsSelected = filteredModelIds.some((id) => selectedModelIds.has(id));

  useEffect(() => {
    setSelectedModelIds((current) => {
      if (current.size === 0) return current;
      const validIds = new Set(models.map((model) => model.id));
      const next = new Set(Array.from(current).filter((id) => validIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [models]);

  useEffect(() => {
    setSelectedModelIds(new Set());
    setBulkDeleteTargetIds(null);
    setOwnerSearchFilter("");
  }, [activeTab]);

  const totalStats = useMemo(() => {
    const pricedCount = models.filter(hasPricing).length;
    const enabledCount = models.filter((model) => model.enabled).length;
    return { modelCount: models.length, pricedCount, enabledCount };
  }, [models]);

  const ownerModelCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models) {
      const owner = normalizeOwnerValue(model.owned_by);
      if (!owner) continue;
      counts.set(owner, (counts.get(owner) ?? 0) + 1);
    }
    return counts;
  }, [models]);

  const ownerOptions = useMemo<SearchableSelectOption[]>(() => {
    const optionMap = new Map<string, SearchableSelectOption>();
    for (const owner of ownerPresets) {
      if (!owner.enabled) continue;
      const value = normalizeOwnerValue(owner.value);
      if (!value) continue;
      optionMap.set(value, {
        value,
        label: owner.label || value,
        searchText: `${value} ${owner.label} ${owner.description}`,
      });
    }

    for (const model of models) {
      const value = normalizeOwnerValue(model.owned_by);
      if (!value || optionMap.has(value)) continue;
      optionMap.set(value, {
        value,
        label: model.owned_by,
        searchText: model.owned_by,
      });
    }

    const currentOwner = form?.ownedBy ?? "";
    const currentValue = normalizeOwnerValue(currentOwner);
    if (currentValue && !optionMap.has(currentValue)) {
      optionMap.set(currentValue, {
        value: currentValue,
        label: currentOwner.trim(),
        searchText: currentOwner,
      });
    }

    return Array.from(optionMap.values());
  }, [form?.ownedBy, models, ownerPresets]);

  const libraryOwners = useMemo(
    () => buildOwnerPresetDrafts(models, ownerPresets),
    [models, ownerPresets],
  );

  const filteredLibraryOwners = useMemo(() => {
    const needle = ownerSearchFilter.trim().toLowerCase();
    if (!needle) return libraryOwners;
    return libraryOwners.filter((owner) => {
      const haystack = `${owner.label} ${owner.value} ${owner.description}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [libraryOwners, ownerSearchFilter]);

  const reusableModelCandidates = useMemo(() => {
    if (!form || form.originalId || activeTab !== "library") return [];
    const modelNeedle = form.id.trim().toLowerCase();
    if (!modelNeedle) return [];
    const seen = new Set<string>();
    return models
      .filter((model) => {
        if (seen.has(model.id)) return false;
        seen.add(model.id);
        const haystack = `${model.id} ${model.owned_by} ${model.description}`.toLowerCase();
        return haystack.includes(modelNeedle);
      })
      .slice(0, 8);
  }, [activeTab, form, models]);

  const showReusableModelCandidates =
    modelIdSuggestionsOpen &&
    reusableModelCandidates.length > 0 &&
    Boolean(form && !form.originalId);

  const openEditModel = useCallback(
    (modelId: string) => {
      const model = models.find((entry) => entry.id === modelId);
      if (model) setForm(toFormState(model));
    },
    [models],
  );

  const openAddModel = useCallback((ownedBy = "") => {
    setForm({ ...emptyForm, ownedBy });
    setModelIdSuggestionsOpen(false);
  }, []);

  const updateForm = useCallback((patch: Partial<ModelFormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const applyReusableModel = useCallback((model: ModelItem) => {
    const template = toFormState(model);
    setForm((current) =>
      current
        ? {
            ...current,
            id: template.id,
            ownedBy: current.ownedBy || template.ownedBy,
            description: template.description,
            mode: template.mode,
            inputPrice: template.inputPrice,
            outputPrice: template.outputPrice,
            cachedPrice: template.cachedPrice,
            pricePerCall: template.pricePerCall,
          }
        : current,
    );
    setModelIdSuggestionsOpen(false);
  }, []);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await saveModelConfig(form, modelScope);
      const existing = modelsRef.current.find((model) => model.id === (form.originalId ?? saved.id));
      const savedWithCapabilities = existing
        ? {
            ...saved,
            inputModalities: existing.inputModalities,
            outputModalities: existing.outputModalities,
            supportsVision: existing.supportsVision,
            ...(existing.sources?.length ? { sources: existing.sources } : {}),
          }
        : saved;
      const next = [
        ...modelsRef.current.filter((model) => model.id !== (form.originalId ?? saved.id)),
        savedWithCapabilities,
      ].sort((a, b) => a.id.localeCompare(b.id));
      const nextPresets = buildOwnerPresetDrafts([saved], ownerPresetsRef.current);
      setModels(next);
      setOwnerPresets(nextPresets);
      setModelsPageSnapshot(modelScope, {
        models: next,
        ownerPresets: nextPresets,
        totalCost: totalCostRef.current,
        hasTotalCost: totalCostLoadedRef.current,
      });
      setForm(null);
      notify({ type: "success", message: t("models_page.config_saved") });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("models_page.save_failed"),
      });
    } finally {
      setSaving(false);
    }
  }, [form, modelScope, notify, t]);

  const handleToggleEnabled = useCallback(
    async (model: ModelItem) => {
      if (togglingModelId) return;
      setTogglingModelId(model.id);
      try {
        const nextForm: ModelFormState = {
          ...toFormState(model),
          enabled: !model.enabled,
        };
        const saved = await saveModelConfig(nextForm, modelScope);
        const next = modelsRef.current.map((entry) =>
          entry.id === model.id
            ? {
                ...entry,
                enabled: saved.enabled,
              }
            : entry,
        );
        setModels(next);
        setModelsPageSnapshot(modelScope, {
          models: next,
          ownerPresets: ownerPresetsRef.current,
          totalCost: totalCostRef.current,
          hasTotalCost: totalCostLoadedRef.current,
        });
        notify({
          type: "success",
          message: saved.enabled
            ? t("models_page.enable_success", { model: model.id })
            : t("models_page.disable_success", { model: model.id }),
        });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("models_page.save_failed"),
        });
      } finally {
        setTogglingModelId(null);
      }
    },
    [modelScope, notify, t, togglingModelId],
  );

  const openTestModel = useCallback((model: ModelItem) => {
    setTestTarget(model);
    setTestResultText(null);
    setTestErrorText(null);
  }, []);

  const handleRunModelTest = useCallback(
    async (input: { channel: string; prompt: string }) => {
      if (!testTarget) return;
      setTestRunning(true);
      setTestResultText(null);
      setTestErrorText(null);
      try {
        const entries = await apiKeyEntriesApi.list();
        const channelNeedle = input.channel.trim().toLowerCase();
        const enabledKeys = entries.filter((entry) => !entry.disabled && entry.key?.trim());
        // Prefer keys whose allowed-channels pin the selected channel; fall back to unrestricted keys.
        const scoreKey = (entry: (typeof enabledKeys)[number]): number => {
          const allowed = (entry["allowed-channels"] ?? [])
            .map((name) => name.trim().toLowerCase())
            .filter(Boolean);
          if (allowed.length === 0) return 1;
          if (!allowed.includes(channelNeedle)) return -1;
          // Exact single-channel restriction is the strongest pin available without a dedicated test API.
          return allowed.length === 1 ? 3 : 2;
        };
        const matchingKey =
          enabledKeys
            .map((entry) => ({ entry, score: scoreKey(entry) }))
            .filter((item) => item.score > 0)
            .sort((a, b) => b.score - a.score)[0]?.entry ?? null;
        if (!matchingKey) {
          throw new Error(t("models_page.test_no_api_key"));
        }

        const base = normalizeApiBase(auth?.state.apiBase || detectApiBaseFromLocation());
        const endpoint = `${base}/v1/chat/completions`;
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${matchingKey.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: testTarget.id,
            messages: [{ role: "user", content: input.prompt }],
            stream: false,
          }),
        });
        const rawText = await response.text();
        let payload: unknown = null;
        try {
          payload = rawText ? JSON.parse(rawText) : null;
        } catch {
          payload = rawText;
        }
        if (!response.ok) {
          const fallback = rawText || `HTTP ${response.status}`;
          const message =
            payload &&
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload
              ? typeof (payload as { error: unknown }).error === "string"
                ? (payload as { error: string }).error
                : ((payload as { error?: { message?: string } }).error?.message ?? fallback)
              : fallback;
          throw new Error(message);
        }

        const content =
          payload &&
          typeof payload === "object" &&
          payload !== null &&
          Array.isArray((payload as { choices?: unknown }).choices)
            ? (() => {
                const choice = (payload as { choices: Array<{ message?: { content?: unknown } }> })
                  .choices[0];
                const text = choice?.message?.content;
                return typeof text === "string" ? text : JSON.stringify(payload, null, 2);
              })()
            : typeof payload === "string"
              ? payload
              : JSON.stringify(payload, null, 2);
        setTestResultText(content || t("models_page.test_empty_response"));
      } catch (err: unknown) {
        setTestErrorText(
          err instanceof Error ? err.message : t("models_page.test_failed"),
        );
      } finally {
        setTestRunning(false);
      }
    },
    [auth?.state.apiBase, t, testTarget],
  );

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/model-configs/${encodeURIComponent(deleteTarget.id)}`);
      invalidateConfiguredModelAvailability();
      const next = modelsRef.current.filter((model) => model.id !== deleteTarget.id);
      setModels(next);
      setModelsPageSnapshot(modelScope, {
        models: next,
        ownerPresets: ownerPresetsRef.current,
        totalCost: totalCostRef.current,
        hasTotalCost: totalCostLoadedRef.current,
      });
      setSelectedModelIds((prev) => {
        if (!prev.has(deleteTarget.id)) return prev;
        const nextSelection = new Set(prev);
        nextSelection.delete(deleteTarget.id);
        return nextSelection;
      });
      setDeleteTarget(null);
      notify({ type: "success", message: t("models_page.delete_saved") });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("models_page.delete_failed"),
      });
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, modelScope, notify, t]);

  const toggleModelSelection = useCallback((modelId: string, checked: boolean) => {
    setSelectedModelIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(modelId);
      } else {
        next.delete(modelId);
      }
      return next;
    });
  }, []);

  const toggleVisibleModelSelection = useCallback(
    (checked: boolean) => {
      setSelectedModelIds((current) => {
        const next = new Set(current);
        for (const modelId of filteredModelIds) {
          if (checked) {
            next.add(modelId);
          } else {
            next.delete(modelId);
          }
        }
        return next;
      });
    },
    [filteredModelIds],
  );

  const handleBulkDelete = useCallback(async () => {
    if (!bulkDeleteTargetIds || bulkDeleteTargetIds.length === 0) return;
    const ids = [...bulkDeleteTargetIds];
    setDeleting(true);
    try {
      for (const modelId of ids) {
        await apiClient.delete(`/model-configs/${encodeURIComponent(modelId)}`);
      }
      invalidateConfiguredModelAvailability();
      const deletedIds = new Set(ids);
      const next = modelsRef.current.filter((model) => !deletedIds.has(model.id));
      setModels(next);
      setModelsPageSnapshot(modelScope, {
        models: next,
        ownerPresets: ownerPresetsRef.current,
        totalCost: totalCostRef.current,
        hasTotalCost: totalCostLoadedRef.current,
      });
      setSelectedModelIds((current) => {
        const nextSelection = new Set(current);
        for (const modelId of ids) nextSelection.delete(modelId);
        return nextSelection;
      });
      setBulkDeleteTargetIds(null);
      notify({
        type: "success",
        message: t("models_page.delete_selected_models_success", { count: ids.length }),
      });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("models_page.delete_failed"),
      });
    } finally {
      setDeleting(false);
    }
  }, [bulkDeleteTargetIds, modelScope, notify, t]);

  const persistOwnerPresets = useCallback(
    async (nextPresets: ModelOwnerPreset[]) => {
      const deduped = normalizeOwnerPresetItems(nextPresets);
      setSavingOwnerPresets(true);
      try {
        await apiClient.put("/model-owner-presets", { items: deduped });
        setOwnerPresets(deduped);
        patchModelsPageSnapshot(modelScope, { ownerPresets: deduped });
        notify({ type: "success", message: t("models_page.owner_presets_saved") });
        return true;
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("models_page.owner_presets_save_failed"),
        });
        return false;
      } finally {
        setSavingOwnerPresets(false);
      }
    },
    [modelScope, notify, t],
  );

  const updateOwnerForm = useCallback((patch: Partial<OwnerFormState>) => {
    setOwnerForm((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const saveOwnerForm = useCallback(async () => {
    if (!ownerForm) return;
    const value = normalizeOwnerValue(ownerForm.value);
    const label = ownerForm.label.trim() || value;
    if (!value || !label) return;

    const nextOwner: ModelOwnerPreset = {
      value,
      label,
      description: ownerForm.description.trim(),
      enabled: ownerForm.enabled,
      modelCount: ownerForm.originalValue
        ? (ownerModelCounts.get(ownerForm.originalValue) ?? 0)
        : 0,
    };

    const withoutOriginal = ownerPresets.filter(
      (owner) => owner.value !== (ownerForm.originalValue ?? value) && owner.value !== value,
    );
    const saved = await persistOwnerPresets([...withoutOriginal, nextOwner]);
    if (saved) {
      setOwnerForm(null);
      setOwnerFilter((current) => (current === ownerForm.originalValue ? value : current));
    }
  }, [ownerForm, ownerModelCounts, ownerPresets, persistOwnerPresets]);

  const deleteOwnerPreset = useCallback(async () => {
    if (!deleteOwnerTarget) return;
    const saved = await persistOwnerPresets(
      ownerPresets.filter((owner) => owner.value !== deleteOwnerTarget.value),
    );
    if (saved) {
      setDeleteOwnerTarget(null);
      setOwnerFilter((current) => (current === deleteOwnerTarget.value ? "" : current));
    }
  }, [deleteOwnerTarget, ownerPresets, persistOwnerPresets]);

  const saveOpenRouterSyncSettings = useCallback(
    async (enabled: boolean, intervalHours = syncIntervalHours) => {
      const intervalMinutes = syncIntervalMinutesFromHours(intervalHours);
      setOpenRouterSyncSaving(true);
      setOpenRouterSyncError(null);
      try {
        const state = normalizeOpenRouterSyncState(
          await apiClient.put("/model-openrouter-sync", {
            enabled,
            interval_minutes: intervalMinutes,
          }),
        );
        writeOpenRouterSyncCache(cacheTenantKey, state);
        setOpenRouterSyncState(state);
        setSyncIntervalHours(syncIntervalHoursValue(state.intervalMinutes));
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : t("models_page.openrouter_sync_save_failed");
        setOpenRouterSyncError(message);
        notify({ type: "error", message });
      } finally {
        setOpenRouterSyncSaving(false);
      }
    },
    [cacheTenantKey, notify, syncIntervalHours, t],
  );

  const runOpenRouterSync = useCallback(async () => {
    setOpenRouterSyncRunning(true);
    setOpenRouterSyncError(null);
    try {
      const payload = await apiClient.post<{
        result?: unknown;
        state?: unknown;
      }>("/model-openrouter-sync/run");
      const result = normalizeOpenRouterSyncResult(payload?.result);
      const state = normalizeOpenRouterSyncState(payload?.state ?? payload);
      const nextState: OpenRouterModelSyncState = {
        ...state,
        ...(result
          ? {
              lastSeen: result.seen,
              lastAdded: result.added,
              lastUpdated: result.updated,
              lastSkipped: result.skipped,
            }
          : {}),
        running: false,
      };
      writeOpenRouterSyncCache(cacheTenantKey, nextState);
      setOpenRouterSyncState(nextState);
      setSyncIntervalHours(syncIntervalHoursValue(state.intervalMinutes));
      await loadModels({ force: true });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("models_page.openrouter_sync_run_failed");
      setOpenRouterSyncError(message);
      notify({ type: "error", message });
    } finally {
      setOpenRouterSyncRunning(false);
    }
  }, [cacheTenantKey, loadModels, notify, t]);

  const canDeleteModels = activeTab === "library";

  const modelColumns = useModelColumns({
    canDeleteModels,
    allVisibleModelsSelected,
    someVisibleModelsSelected,
    visibleModelCount: filteredModelIds.length,
    selectedModelIds,
    onSelectModel: toggleModelSelection,
    onSelectVisibleModels: toggleVisibleModelSelection,
    onEditModel: openEditModel,
    onDeleteModel: setDeleteTarget,
    onToggleEnabled: (model) => void handleToggleEnabled(model),
    onTestModel: openTestModel,
    togglingModelId,
  });
  const selectionToolbar =
    canDeleteModels && selectedModelCount > 0 ? (
      <>
        <span className="inline-flex h-8 items-center rounded-full bg-slate-100 px-3 text-xs font-semibold text-slate-600 dark:bg-white/[0.08] dark:text-white/65">
          {t("models_page.selected_models_count", { count: selectedModelCount })}
        </span>
        <Button
          variant="danger"
          size="sm"
          onClick={() => setBulkDeleteTargetIds(selectedModels.map((model) => model.id))}
          disabled={deleting}
        >
          <Trash2 size={14} />
          {t("models_page.delete_selected_models", { count: selectedModelCount })}
        </Button>
      </>
    ) : null;

  return (
    <section className="flex flex-1 flex-col gap-4 md:h-[calc(100dvh-112px)] md:min-h-0 md:overflow-hidden">
      <ModelsStatsCards stats={totalStats} totalCost={totalCost} />

      <ModelsPageTabs activeTab={activeTab} onTabChange={setActiveTab} />

      {activeTab === "library" ? (
        <div
          data-testid="owner-library-layout"
          className="grid h-[calc(100dvh-300px)] min-h-[28rem] gap-4 md:h-auto md:min-h-0 md:flex-1 lg:grid-cols-[18rem_minmax(0,1fr)]"
        >
          <div data-testid="owner-sidebar-card" className="h-full min-h-0 min-w-0">
            <Card
              title={t("models_page.model_owners")}
              className="flex h-full min-h-0 flex-col overflow-hidden"
              bodyClassName="flex min-h-0 flex-1 flex-col gap-2"
              actions={
                <Button
                  variant="secondary"
                  size="xs"
                  onClick={() => setOwnerForm(emptyOwnerForm)}
                  aria-label={t("models_page.add_owner")}
                  title={t("models_page.add_owner")}
                >
                  <Plus size={13} />
                  {t("models_page.add_owner")}
                </Button>
              }
            >
              <TextInput
                value={ownerSearchFilter}
                onChange={(e) => setOwnerSearchFilter(e.target.value)}
                placeholder={t("models_page.owner_sidebar_search_placeholder")}
                size="sm"
                startAdornment={<Search size={14} className="text-slate-400 dark:text-white/35" />}
              />

              <button
                type="button"
                onClick={() => setOwnerFilter("")}
                className={[
                  "flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-left text-sm transition",
                  ownerFilter === ""
                    ? "bg-slate-950 text-white shadow-sm dark:bg-white dark:text-slate-950"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-white/[0.04] dark:text-white/70 dark:hover:bg-white/[0.08]",
                ].join(" ")}
              >
                <span className="min-w-0 truncate font-medium">{t("models_page.all_owners")}</span>
                <span
                  className={[
                    "shrink-0 rounded-full px-2 py-0.5 text-xs",
                    ownerFilter === ""
                      ? "bg-white/15 text-white/80 dark:bg-slate-950/10 dark:text-slate-700"
                      : "bg-white text-slate-500 dark:bg-neutral-950 dark:text-white/45",
                  ].join(" ")}
                >
                  {t("models_page.owner_model_count", { count: models.length })}
                </span>
              </button>

              <div
                data-testid="owner-sidebar-list"
                className="-mx-1 min-h-0 flex-1 space-y-2 overflow-x-hidden overflow-y-auto px-1 py-1"
              >
                {libraryOwners.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-neutral-800 dark:text-white/45">
                    {t("models_page.no_owner_presets")}
                  </div>
                ) : filteredLibraryOwners.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 px-3 py-6 text-center text-sm text-slate-500 dark:border-neutral-800 dark:text-white/45">
                    {t("models_page.no_owner_search_results")}
                  </div>
                ) : (
                  filteredLibraryOwners.map((owner) => {
                    const count = ownerModelCounts.get(owner.value) ?? owner.modelCount ?? 0;
                    const selected = ownerFilter === owner.value;
                    return (
                      <div
                        key={owner.value}
                        className={[
                          "group/owner relative flex items-center gap-2 overflow-hidden rounded-xl px-2 py-1.5 transition-colors duration-200 ease-out",
                          selected
                            ? "bg-slate-100 ring-1 ring-slate-200 dark:bg-white/[0.08] dark:ring-white/10"
                            : "hover:bg-slate-50 dark:hover:bg-white/[0.04]",
                        ].join(" ")}
                      >
                        <button
                          type="button"
                          onClick={() => setOwnerFilter(owner.value)}
                          className="min-w-0 flex-1 text-left"
                          title={owner.description || owner.value}
                        >
                          <span className="block truncate text-sm font-medium text-slate-900 dark:text-white">
                            {owner.label || owner.value}
                          </span>
                          <span className="block truncate text-xs text-slate-500 dark:text-white/45">
                            {owner.value}
                          </span>
                        </button>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 transition-transform duration-200 ease-out group-focus-within/owner:-translate-x-16 group-hover/owner:-translate-x-16 motion-reduce:transition-none dark:bg-white/[0.08] dark:text-white/45">
                          {t("models_page.owner_model_count", { count })}
                        </span>
                        <div className="pointer-events-none absolute right-2 top-1/2 flex -translate-y-1/2 translate-x-3 items-center gap-1 opacity-0 transition-all duration-200 ease-out group-focus-within/owner:pointer-events-auto group-focus-within/owner:translate-x-0 group-focus-within/owner:opacity-100 group-hover/owner:pointer-events-auto group-hover/owner:translate-x-0 group-hover/owner:opacity-100 motion-reduce:transition-none">
                          <Button
                            size="xs"
                            variant="ghost"
                            className="transition-all duration-200 ease-out"
                            onClick={() => setOwnerForm(toOwnerFormState(owner))}
                            aria-label={t("models_page.edit_owner_aria", { owner: owner.label })}
                            title={t("models_page.edit_owner_aria", { owner: owner.label })}
                          >
                            <Edit3 size={13} />
                          </Button>
                          <Button
                            size="xs"
                            variant="ghost"
                            className="transition-all duration-200 ease-out"
                            onClick={() => setDeleteOwnerTarget(owner)}
                            aria-label={t("models_page.delete_owner_aria", { owner: owner.label })}
                            title={t("models_page.delete_owner_aria", { owner: owner.label })}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>

          <div data-testid="model-library-card" className="h-full min-h-0 min-w-0">
            <Card
              title={t("models_page.model_library")}
              className="flex h-full flex-col overflow-hidden md:min-h-0"
              bodyClassName="relative flex min-h-0 flex-1 flex-col"
              actions={
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {selectionToolbar}
                  <TextInput
                    value={searchFilter}
                    onChange={(e) => setSearchFilter(e.target.value)}
                    placeholder={t("models_page.search")}
                    className="!w-48"
                    startAdornment={
                      <Search size={14} className="text-slate-400 dark:text-white/35" />
                    }
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => openAddModel(ownerFilter)}
                    aria-label={t("models_page.add_model")}
                    title={t("models_page.add_model")}
                  >
                    <Plus size={14} />
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => void loadModels({ force: true })}
                    disabled={loading || refreshing}
                    title={t("models_page.refresh")}
                    aria-label={t("models_page.refresh")}
                  >
                    <RefreshCw
                      size={14}
                      className={loading || refreshing ? "animate-spin" : ""}
                    />
                  </Button>
                </div>
              }
            >
              {canManageOpenRouterSync ? (
                <div
                  data-testid="openrouter-sync-section"
                  className="mb-3 border-b border-slate-200 pb-3 dark:border-neutral-800"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-slate-900 dark:text-white">
                        <span>{t("models_page.openrouter_sync_title")}</span>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-2xs font-semibold",
                            openRouterSyncState.enabled
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "bg-slate-100 text-slate-500 dark:bg-white/[0.08] dark:text-white/45",
                          ].join(" ")}
                        >
                          {openRouterSyncState.enabled
                            ? t("models_page.openrouter_sync_auto_on")
                            : t("models_page.openrouter_sync_auto_off")}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-white/55">
                        <span>
                          {t("models_page.openrouter_sync_last_sync", {
                            value: formatSyncTimestamp(
                              openRouterSyncState.lastSyncAt,
                              t("models_page.openrouter_sync_never"),
                            ),
                          })}
                        </span>
                        <span>
                          {t("models_page.openrouter_sync_result", {
                            seen: openRouterSyncState.lastSeen,
                            added: openRouterSyncState.lastAdded,
                            updated: openRouterSyncState.lastUpdated,
                            skipped: openRouterSyncState.lastSkipped,
                          })}
                        </span>
                        {openRouterSyncLoading ? <span>{t("models_page.loading")}</span> : null}
                      </div>
                      {openRouterSyncState.lastError || openRouterSyncError ? (
                        <div className="mt-2 text-xs text-rose-600 dark:text-rose-300">
                          {t("models_page.openrouter_sync_error", {
                            error: openRouterSyncError || openRouterSyncState.lastError,
                          })}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-28">
                        <label
                          htmlFor="openrouter-sync-interval"
                          className="mb-1 block text-xs font-medium text-slate-600 dark:text-white/60"
                        >
                          {t("models_page.openrouter_sync_interval")}
                        </label>
                        <TextInput
                          id="openrouter-sync-interval"
                          type="number"
                          value={syncIntervalHours}
                          onChange={(e) => setSyncIntervalHours(e.target.value)}
                          onBlur={() => {
                            if (skipSyncIntervalBlurRef.current) {
                              skipSyncIntervalBlurRef.current = false;
                              return;
                            }
                            void saveOpenRouterSyncSettings(openRouterSyncState.enabled);
                          }}
                          min={1}
                          step={1}
                          size="sm"
                        />
                      </div>
                      <div
                        onMouseDownCapture={() => {
                          skipSyncIntervalBlurRef.current = true;
                        }}
                        className="flex flex-wrap items-end gap-3"
                      >
                        <ToggleSwitch
                          checked={openRouterSyncState.enabled}
                          onCheckedChange={(enabled) => void saveOpenRouterSyncSettings(enabled)}
                          label={t("models_page.openrouter_sync_auto")}
                          disabled={openRouterSyncSaving}
                        />
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => void runOpenRouterSync()}
                          disabled={
                            openRouterSyncRunning ||
                            openRouterSyncState.running ||
                            openRouterSyncLoading
                          }
                        >
                          <RefreshCw
                            size={14}
                            className={
                              openRouterSyncRunning || openRouterSyncState.running
                                ? "animate-spin"
                                : ""
                            }
                          />
                          {t("models_page.openrouter_sync_now")}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}

              <DataTable<ModelItem>
                tableId="models-library"
                rows={filteredModels}
                columns={modelColumns}
                rowKey={(row) => row.id}
                loading={loading}
                rowHeight={52}
                caption={t("models_page.table_caption")}
                emptyText={
                  searchFilter ? t("models_page.no_results") : t("models_page.no_model_data")
                }
                minWidth="min-w-[1440px]"
                height="h-full"
                minHeight="min-h-0"
              />
            </Card>
          </div>
        </div>
      ) : (
        <Card
          title={t("models_page.model_configs")}
          description={t("models_page.model_configs_desc")}
          className="flex flex-1 flex-col overflow-hidden md:min-h-0"
          bodyClassName="relative flex min-h-0 flex-1 flex-col"
          actions={
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectionToolbar}
              <TextInput
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder={t("models_page.search")}
                className="!w-48"
                startAdornment={<Search size={14} className="text-slate-400 dark:text-white/35" />}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => openAddModel()}
                aria-label={t("models_page.add_model")}
                title={t("models_page.add_model")}
              >
                <Plus size={14} />
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => void loadModels({ force: true })}
                disabled={loading || refreshing}
                title={t("models_page.refresh")}
                aria-label={t("models_page.refresh")}
              >
                <RefreshCw size={14} className={loading || refreshing ? "animate-spin" : ""} />
              </Button>
            </div>
          }
        >
          <DataTable<ModelItem>
            tableId="model-configs"
            rows={filteredModels}
            columns={modelColumns}
            rowKey={(row) => row.id}
            loading={loading}
            rowHeight={52}
            caption={t("models_page.table_caption")}
            emptyText={searchFilter ? t("models_page.no_results") : t("models_page.no_model_data")}
            minWidth="min-w-[1440px]"
            height="h-[calc(100vh-430px)] md:h-auto md:flex-1"
            minHeight="min-h-[360px] md:min-h-0"
          />
        </Card>
      )}

      <ModelFormModal
        form={form}
        activeTab={activeTab}
        saving={saving}
        ownerOptions={ownerOptions}
        reusableModelCandidates={reusableModelCandidates}
        showReusableModelCandidates={showReusableModelCandidates}
        onClose={() => {
          setForm(null);
          setModelIdSuggestionsOpen(false);
        }}
        onSave={() => void handleSave()}
        onUpdateForm={updateForm}
        onApplyReusableModel={applyReusableModel}
        onSuggestionsOpenChange={setModelIdSuggestionsOpen}
      />

      <OwnerFormModal
        ownerForm={ownerForm}
        saving={savingOwnerPresets}
        onClose={() => setOwnerForm(null)}
        onSave={() => void saveOwnerForm()}
        onUpdateOwnerForm={updateOwnerForm}
      />

      <ConfirmModal
        open={deleteOwnerTarget !== null}
        title={t("models_page.delete_owner_title")}
        description={t("models_page.delete_owner_desc", {
          owner: deleteOwnerTarget?.label ?? "",
          count: deleteOwnerTarget
            ? (ownerModelCounts.get(deleteOwnerTarget.value) ?? deleteOwnerTarget.modelCount ?? 0)
            : 0,
        })}
        confirmText={t("models_page.delete")}
        busy={savingOwnerPresets}
        onClose={() => setDeleteOwnerTarget(null)}
        onConfirm={() => void deleteOwnerPreset()}
      />

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("models_page.delete_model_title")}
        description={t("models_page.delete_model_desc", { model: deleteTarget?.id ?? "" })}
        confirmText={t("models_page.delete")}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />

      <ConfirmModal
        open={bulkDeleteTargetIds !== null}
        title={t("models_page.delete_selected_models_title")}
        description={t("models_page.delete_selected_models_desc", {
          count: bulkDeleteTargetIds?.length ?? 0,
        })}
        confirmText={t("models_page.delete")}
        busy={deleting}
        onClose={() => setBulkDeleteTargetIds(null)}
        onConfirm={() => void handleBulkDelete()}
      />

      <ModelTestModal
        model={testTarget}
        running={testRunning}
        resultText={testResultText}
        errorText={testErrorText}
        onClose={() => {
          if (testRunning) return;
          setTestTarget(null);
          setTestResultText(null);
          setTestErrorText(null);
        }}
        onRun={(input) => void handleRunModelTest(input)}
      />
    </section>
  );
}
