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
import { apiClient } from "@code-proxy/api-client";
import { ModelFormModal } from "./components/ModelFormModal";
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
  fetchOwnerPresets,
  formatSyncTimestamp,
  hasModelPricingData as hasPricing,
  mergeConfiguredModelAvailability,
  normalizeOpenRouterSyncResult,
  normalizeOpenRouterSyncState,
  normalizeOwnerPresetItems,
  normalizeOwnerValue,
  saveModelConfig,
  syncIntervalHoursValue,
  syncIntervalMinutesFromHours,
  toFormState,
  toOwnerFormState,
} from "./modelsUtils";

export function ModelsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [totalCost, setTotalCost] = useState(0);
  const [form, setForm] = useState<ModelFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<ModelPageTab>("active");
  const [ownerPresets, setOwnerPresets] = useState<ModelOwnerPreset[]>([]);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [ownerSearchFilter, setOwnerSearchFilter] = useState("");
  const [ownerForm, setOwnerForm] = useState<OwnerFormState | null>(null);
  const [deleteOwnerTarget, setDeleteOwnerTarget] = useState<ModelOwnerPreset | null>(null);
  const [savingOwnerPresets, setSavingOwnerPresets] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ModelItem | null>(null);
  const [bulkDeleteTargetIds, setBulkDeleteTargetIds] = useState<string[] | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedModelIds, setSelectedModelIds] = useState<Set<string>>(() => new Set());
  const [openRouterSyncState, setOpenRouterSyncState] = useState<OpenRouterModelSyncState>(
    defaultOpenRouterSyncState,
  );
  const [openRouterSyncLoading, setOpenRouterSyncLoading] = useState(false);
  const [openRouterSyncSaving, setOpenRouterSyncSaving] = useState(false);
  const [openRouterSyncRunning, setOpenRouterSyncRunning] = useState(false);
  const [openRouterSyncError, setOpenRouterSyncError] = useState<string | null>(null);
  const [modelIdSuggestionsOpen, setModelIdSuggestionsOpen] = useState(false);
  const [syncIntervalHours, setSyncIntervalHours] = useState(
    syncIntervalHoursValue(defaultOpenRouterSyncState.intervalMinutes),
  );
  const skipSyncIntervalBlurRef = useRef(false);

  const modelScope: ModelScope = activeTab;

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const [data, presets, availability, pathAvailability] = await Promise.all([
        fetchModelConfigs(modelScope),
        fetchOwnerPresets(),
        modelScope === "active" ? loadConfiguredModelAvailability() : Promise.resolve(null),
        loadModelPathAvailability().catch(() => null),
      ]);
      const pathItems = pathAvailability?.items ?? [];
      const visibleData = mergeConfiguredModelAvailability(data, availability, pathItems);
      setModels(visibleData);
      setOwnerPresets(presets);
      setOwnerFilter((current) => {
        if (!current) return "";
        return buildOwnerPresetDrafts(visibleData, presets).some((owner) => owner.value === current)
          ? current
          : "";
      });
      try {
        const usageData = await apiClient.get<{ stats?: { total_cost?: number } }>(
          "/usage/logs?days=9999&size=1",
        );
        setTotalCost(usageData?.stats?.total_cost ?? 0);
      } catch {
        setTotalCost(0);
      }
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("models_page.load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [modelScope, notify, t]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const loadOpenRouterSyncState = useCallback(async () => {
    setOpenRouterSyncLoading(true);
    setOpenRouterSyncError(null);
    try {
      const state = normalizeOpenRouterSyncState(await apiClient.get("/model-openrouter-sync"));
      setOpenRouterSyncState(state);
      setSyncIntervalHours(syncIntervalHoursValue(state.intervalMinutes));
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("models_page.openrouter_sync_load_failed");
      setOpenRouterSyncError(message);
    } finally {
      setOpenRouterSyncLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (activeTab === "library") {
      void loadOpenRouterSyncState();
    }
  }, [activeTab, loadOpenRouterSyncState]);

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
      setModels((prev) => {
        const existing = prev.find((model) => model.id === (form.originalId ?? saved.id));
        const savedWithCapabilities = existing
          ? {
              ...saved,
              inputModalities: existing.inputModalities,
              outputModalities: existing.outputModalities,
              supportsVision: existing.supportsVision,
            }
          : saved;
        const withoutOriginal = prev.filter((model) => model.id !== (form.originalId ?? saved.id));
        return [...withoutOriginal, savedWithCapabilities].sort((a, b) => a.id.localeCompare(b.id));
      });
      setOwnerPresets((prev) => buildOwnerPresetDrafts([saved], prev));
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

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/model-configs/${encodeURIComponent(deleteTarget.id)}`);
      invalidateConfiguredModelAvailability();
      setModels((prev) => prev.filter((model) => model.id !== deleteTarget.id));
      setSelectedModelIds((prev) => {
        if (!prev.has(deleteTarget.id)) return prev;
        const next = new Set(prev);
        next.delete(deleteTarget.id);
        return next;
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
  }, [deleteTarget, notify, t]);

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
      setModels((prev) => prev.filter((model) => !deletedIds.has(model.id)));
      setSelectedModelIds((current) => {
        const next = new Set(current);
        for (const modelId of ids) next.delete(modelId);
        return next;
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
  }, [bulkDeleteTargetIds, notify, t]);

  const persistOwnerPresets = useCallback(
    async (nextPresets: ModelOwnerPreset[]) => {
      const deduped = normalizeOwnerPresetItems(nextPresets);
      setSavingOwnerPresets(true);
      try {
        await apiClient.put("/model-owner-presets", { items: deduped });
        setOwnerPresets(deduped);
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
    [notify, t],
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
    [notify, syncIntervalHours, t],
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
      setOpenRouterSyncState({
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
      });
      setSyncIntervalHours(syncIntervalHoursValue(state.intervalMinutes));
      await loadModels();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : t("models_page.openrouter_sync_run_failed");
      setOpenRouterSyncError(message);
      notify({ type: "error", message });
    } finally {
      setOpenRouterSyncRunning(false);
    }
  }, [loadModels, notify, t]);

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
                    onClick={() => void loadModels()}
                    disabled={loading}
                    title={t("models_page.refresh")}
                    aria-label={t("models_page.refresh")}
                  >
                    <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                  </Button>
                </div>
              }
            >
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
                onClick={() => void loadModels()}
                disabled={loading}
                title={t("models_page.refresh")}
                aria-label={t("models_page.refresh")}
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
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
    </section>
  );
}
