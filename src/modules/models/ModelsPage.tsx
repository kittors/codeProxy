import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Check, Cpu, Edit3, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { Checkbox } from "@/modules/ui/Checkbox";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { SearchableSelect, type SearchableSelectOption } from "@/modules/ui/SearchableSelect";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";
import { OverflowTooltip } from "@/modules/ui/Tooltip";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { apiClient } from "@/lib/http/client";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconDeepseek from "@/assets/icons/deepseek.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import iconGlm from "@/assets/icons/glm.svg";
import iconGrok from "@/assets/icons/grok.svg";
import iconIflow from "@/assets/icons/iflow.svg";
import iconKimiDark from "@/assets/icons/kimi-dark.svg";
import iconKimiLight from "@/assets/icons/kimi-light.svg";
import iconKiro from "@/assets/icons/kiro.svg";
import iconMinimax from "@/assets/icons/minimax.svg";
import iconOpenai from "@/assets/icons/openai.svg";
import iconQwen from "@/assets/icons/qwen.svg";
import {
  filterByConfiguredModelAvailability,
  loadConfiguredModelAvailability,
  type ConfiguredModelAvailability,
  type ModelAvailabilityItem,
} from "@/modules/models/modelAvailability";
import iconVertex from "@/assets/icons/vertex.svg";

type PricingMode = "token" | "call";
type ModelScope = "active" | "library";
type ModelPageTab = ModelScope;

interface ModelPricing {
  mode: PricingMode;
  inputPricePerMillion: number;
  outputPricePerMillion: number;
  cachedPricePerMillion: number;
  pricePerCall: number;
}

interface ModelItem {
  id: string;
  owned_by: string;
  description: string;
  enabled: boolean;
  source: string;
  pricing: ModelPricing;
}

interface ModelOwnerPreset {
  value: string;
  label: string;
  description: string;
  enabled: boolean;
  modelCount?: number;
}

interface ModelFormState {
  originalId: string | null;
  id: string;
  ownedBy: string;
  description: string;
  enabled: boolean;
  mode: PricingMode;
  inputPrice: string;
  outputPrice: string;
  cachedPrice: string;
  pricePerCall: string;
}

interface OwnerFormState {
  originalValue: string | null;
  value: string;
  label: string;
  description: string;
  enabled: boolean;
}

interface OpenRouterModelSyncState {
  enabled: boolean;
  intervalMinutes: number;
  lastSyncAt: string;
  lastSuccessAt: string;
  lastError: string;
  lastSeen: number;
  lastAdded: number;
  lastUpdated: number;
  lastSkipped: number;
  running: boolean;
}

interface OpenRouterModelSyncResult {
  seen: number;
  added: number;
  updated: number;
  skipped: number;
}

const VENDOR_ICONS: Record<string, { light: string; dark: string }> = {
  claude: { light: iconClaude, dark: iconClaude },
  codex: { light: iconCodex, dark: iconCodex },
  deepseek: { light: iconDeepseek, dark: iconDeepseek },
  gemini: { light: iconGemini, dark: iconGemini },
  glm: { light: iconGlm, dark: iconGlm },
  gpt: { light: iconOpenai, dark: iconOpenai },
  grok: { light: iconGrok, dark: iconGrok },
  iflow: { light: iconIflow, dark: iconIflow },
  kiro: { light: iconKiro, dark: iconKiro },
  kimi: { light: iconKimiLight, dark: iconKimiDark },
  minimax: { light: iconMinimax, dark: iconMinimax },
  o1: { light: iconOpenai, dark: iconOpenai },
  o3: { light: iconOpenai, dark: iconOpenai },
  o4: { light: iconOpenai, dark: iconOpenai },
  qwen: { light: iconQwen, dark: iconQwen },
  vertex: { light: iconVertex, dark: iconVertex },
};

const emptyPricing: ModelPricing = {
  mode: "token",
  inputPricePerMillion: 0,
  outputPricePerMillion: 0,
  cachedPricePerMillion: 0,
  pricePerCall: 0,
};

const emptyForm: ModelFormState = {
  originalId: null,
  id: "",
  ownedBy: "",
  description: "",
  enabled: true,
  mode: "token",
  inputPrice: "",
  outputPrice: "",
  cachedPrice: "",
  pricePerCall: "",
};

const emptyOwnerForm: OwnerFormState = {
  originalValue: null,
  value: "",
  label: "",
  description: "",
  enabled: true,
};

const defaultOpenRouterSyncState: OpenRouterModelSyncState = {
  enabled: false,
  intervalMinutes: 1440,
  lastSyncAt: "",
  lastSuccessAt: "",
  lastError: "",
  lastSeen: 0,
  lastAdded: 0,
  lastUpdated: 0,
  lastSkipped: 0,
  running: false,
};

function getVendorPrefix(modelId: string): string {
  const lower = modelId.toLowerCase();
  for (const prefix of Object.keys(VENDOR_ICONS)) {
    if (lower.startsWith(prefix)) return prefix;
  }
  return "";
}

function VendorIcon({ modelId, size = 14 }: { modelId: string; size?: number }) {
  const prefix = getVendorPrefix(modelId);
  const icons = prefix ? VENDOR_ICONS[prefix] : null;
  if (!icons) return null;
  return (
    <>
      <img src={icons.light} alt="" width={size} height={size} className="dark:hidden" />
      <img src={icons.dark} alt="" width={size} height={size} className="hidden dark:block" />
    </>
  );
}

function asNumber(value: unknown): number {
  const num = Number(value);
  return Number.isFinite(num) && num >= 0 ? num : 0;
}

function parsePriceInput(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeModelConfig(raw: Record<string, unknown>): ModelItem | null {
  const id = String(raw.id ?? raw.model_id ?? raw.name ?? "").trim();
  if (!id) return null;

  const pricing = raw.pricing && typeof raw.pricing === "object" ? raw.pricing : {};
  const pricingRecord = pricing as Record<string, unknown>;
  const mode: PricingMode =
    pricingRecord.mode === "call" || raw.pricing_mode === "call" ? "call" : "token";

  return {
    id,
    owned_by: String(raw.owned_by ?? raw.owner ?? ""),
    description: String(raw.description ?? ""),
    enabled: raw.enabled === false ? false : true,
    source: String(raw.source ?? ""),
    pricing: {
      mode,
      inputPricePerMillion: asNumber(pricingRecord.input_price_per_million ?? pricingRecord.prompt),
      outputPricePerMillion: asNumber(
        pricingRecord.output_price_per_million ?? pricingRecord.completion,
      ),
      cachedPricePerMillion: asNumber(
        pricingRecord.cached_price_per_million ?? pricingRecord.cache,
      ),
      pricePerCall: asNumber(pricingRecord.price_per_call ?? pricingRecord.perCall),
    },
  };
}

function normalizeModelConfigResponse(payload: unknown): ModelItem[] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rawList = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : Array.isArray(payload)
        ? payload
        : [];

  return rawList
    .map((item) =>
      item && typeof item === "object"
        ? normalizeModelConfig(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is ModelItem => Boolean(item))
    .sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeOwnerPreset(raw: Record<string, unknown>): ModelOwnerPreset | null {
  const value = normalizeOwnerValue(String(raw.value ?? raw.id ?? raw.owner ?? "")).trim();
  if (!value) return null;
  return {
    value,
    label: String(raw.label ?? raw.name ?? value).trim() || value,
    description: String(raw.description ?? ""),
    enabled: raw.enabled === false ? false : true,
    modelCount: asNumber(raw.model_count ?? raw.modelCount),
  };
}

function normalizeOwnerPresetResponse(payload: unknown): ModelOwnerPreset[] {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const rawList = Array.isArray(record.items)
    ? record.items
    : Array.isArray(record.data)
      ? record.data
      : Array.isArray(payload)
        ? payload
        : [];

  return rawList
    .map((item) =>
      item && typeof item === "object"
        ? normalizeOwnerPreset(item as Record<string, unknown>)
        : null,
    )
    .filter((item): item is ModelOwnerPreset => Boolean(item))
    .sort((a, b) => a.label.localeCompare(b.label));
}

async function fetchModelConfigs(scope: ModelScope): Promise<ModelItem[]> {
  try {
    return normalizeModelConfigResponse(await apiClient.get(`/model-configs?scope=${scope}`));
  } catch (error) {
    const legacyPayload = await apiClient.get("/models");
    const legacyModels = normalizeModelConfigResponse(legacyPayload);
    if (legacyModels.length > 0) return legacyModels;
    throw error;
  }
}

async function fetchOwnerPresets(): Promise<ModelOwnerPreset[]> {
  return normalizeOwnerPresetResponse(await apiClient.get("/model-owner-presets"));
}

function availabilityItemToModel(item: ModelAvailabilityItem): ModelItem {
  return {
    id: item.id,
    owned_by: item.owned_by ?? "",
    description: item.description ?? "",
    enabled: true,
    source: item.source ?? "configured",
    pricing: { ...emptyPricing },
  };
}

function mergeConfiguredModelAvailability(
  data: ModelItem[],
  availability: ConfiguredModelAvailability | null,
): ModelItem[] {
  if (!availability?.scoped) return data;
  const visible = filterByConfiguredModelAvailability(data, availability);
  const seen = new Set(visible.map((model) => model.id.toLowerCase()));
  for (const item of availability.items) {
    const key = item.id.toLowerCase();
    if (seen.has(key)) continue;
    visible.push(availabilityItemToModel(item));
    seen.add(key);
  }
  return visible.sort((a, b) => a.id.localeCompare(b.id));
}

function toFormState(model: ModelItem): ModelFormState {
  return {
    originalId: model.id,
    id: model.id,
    ownedBy: normalizeOwnerValue(model.owned_by),
    description: model.description,
    enabled: model.enabled,
    mode: model.pricing.mode,
    inputPrice: model.pricing.inputPricePerMillion
      ? model.pricing.inputPricePerMillion.toString()
      : "",
    outputPrice: model.pricing.outputPricePerMillion
      ? model.pricing.outputPricePerMillion.toString()
      : "",
    cachedPrice: model.pricing.cachedPricePerMillion
      ? model.pricing.cachedPricePerMillion.toString()
      : "",
    pricePerCall: model.pricing.pricePerCall ? model.pricing.pricePerCall.toString() : "",
  };
}

function buildModelPayload(form: ModelFormState) {
  const base = {
    id: form.id.trim(),
    owned_by: form.ownedBy.trim(),
    description: form.description.trim(),
    enabled: form.enabled,
  };

  if (form.mode === "call") {
    return {
      ...base,
      pricing: {
        mode: "call" as const,
        price_per_call: parsePriceInput(form.pricePerCall),
      },
    };
  }

  return {
    ...base,
    pricing: {
      mode: "token" as const,
      input_price_per_million: parsePriceInput(form.inputPrice),
      output_price_per_million: parsePriceInput(form.outputPrice),
      cached_price_per_million: parsePriceInput(form.cachedPrice),
    },
  };
}

function payloadToModel(payload: ReturnType<typeof buildModelPayload>, source: string): ModelItem {
  const pricing =
    payload.pricing.mode === "call"
      ? {
          ...emptyPricing,
          mode: "call" as const,
          pricePerCall: payload.pricing.price_per_call,
        }
      : {
          mode: "token" as const,
          inputPricePerMillion: payload.pricing.input_price_per_million,
          outputPricePerMillion: payload.pricing.output_price_per_million,
          cachedPricePerMillion: payload.pricing.cached_price_per_million,
          pricePerCall: 0,
        };

  return {
    id: payload.id,
    owned_by: payload.owned_by,
    description: payload.description,
    enabled: payload.enabled,
    source,
    pricing,
  };
}

function modelConfigCollectionPath(scope: ModelScope): string {
  return scope === "library" ? "/model-configs?scope=library" : "/model-configs";
}

function modelConfigItemPath(modelId: string, scope: ModelScope): string {
  const suffix = scope === "library" ? "?scope=library" : "";
  return `/model-configs/${encodeURIComponent(modelId)}${suffix}`;
}

async function saveModelConfig(form: ModelFormState, scope: ModelScope) {
  const payload = buildModelPayload(form);
  if (!payload.id) {
    throw new Error("Model ID is required");
  }

  if (form.originalId) {
    await apiClient.put(modelConfigItemPath(form.originalId, scope), payload);
  } else {
    await apiClient.post(modelConfigCollectionPath(scope), payload);
  }

  return payloadToModel(payload, scope === "library" ? "seed" : "user");
}

function hasPricing(model: ModelItem): boolean {
  if (model.pricing.mode === "call") return model.pricing.pricePerCall > 0;
  return (
    model.pricing.inputPricePerMillion > 0 ||
    model.pricing.outputPricePerMillion > 0 ||
    model.pricing.cachedPricePerMillion > 0
  );
}

function formatPrice(model: ModelItem, notPricedLabel: string): string {
  if (model.pricing.mode === "call") {
    return model.pricing.pricePerCall > 0
      ? `$${formatPriceAmount(model.pricing.pricePerCall)} / call`
      : notPricedLabel;
  }

  if (!hasPricing(model)) return notPricedLabel;
  return `$${formatPriceAmount(model.pricing.inputPricePerMillion)} / $${formatPriceAmount(model.pricing.outputPricePerMillion)} / $${formatPriceAmount(model.pricing.cachedPricePerMillion)}`;
}

function formatPriceAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0";
  const rounded = Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
    minimumFractionDigits: 0,
    useGrouping: false,
  }).format(rounded);
}

function normalizeOwnerValue(value: string): string {
  return value.trim().replace(/\s+/g, "-").toLowerCase();
}

function buildOwnerPresetDrafts(
  models: ModelItem[],
  presets: ModelOwnerPreset[],
): ModelOwnerPreset[] {
  const map = new Map<string, ModelOwnerPreset>();
  for (const preset of presets) {
    const value = normalizeOwnerValue(preset.value);
    if (!value) continue;
    map.set(value, { ...preset, value });
  }
  for (const model of models) {
    const value = normalizeOwnerValue(model.owned_by);
    if (!value || map.has(value)) continue;
    map.set(value, {
      value,
      label: model.owned_by || value,
      description: "",
      enabled: true,
      modelCount: 0,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
}

function toOwnerFormState(owner: ModelOwnerPreset): OwnerFormState {
  return {
    originalValue: owner.value,
    value: owner.value,
    label: owner.label,
    description: owner.description,
    enabled: owner.enabled,
  };
}

function normalizeOwnerPresetItems(presets: ModelOwnerPreset[]) {
  const items = presets
    .map((owner) => ({
      value: normalizeOwnerValue(owner.value),
      label: owner.label.trim(),
      description: owner.description.trim(),
      enabled: owner.enabled,
    }))
    .filter((owner) => owner.value && owner.label);

  return Array.from(new Map(items.map((item) => [item.value, item])).values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

function normalizeOpenRouterSyncState(payload: unknown): OpenRouterModelSyncState {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  return {
    enabled: record.enabled === true,
    intervalMinutes: Math.max(60, Math.round(asNumber(record.interval_minutes) || 1440)),
    lastSyncAt: String(record.last_sync_at ?? ""),
    lastSuccessAt: String(record.last_success_at ?? ""),
    lastError: String(record.last_error ?? ""),
    lastSeen: Math.round(asNumber(record.last_seen)),
    lastAdded: Math.round(asNumber(record.last_added)),
    lastUpdated: Math.round(asNumber(record.last_updated)),
    lastSkipped: Math.round(asNumber(record.last_skipped)),
    running: record.running === true,
  };
}

function normalizeOpenRouterSyncResult(payload: unknown): OpenRouterModelSyncResult | null {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (!("seen" in record) && !("added" in record) && !("skipped" in record)) return null;
  return {
    seen: Math.round(asNumber(record.seen)),
    added: Math.round(asNumber(record.added)),
    updated: Math.round(asNumber(record.updated)),
    skipped: Math.round(asNumber(record.skipped)),
  };
}

function syncIntervalHoursValue(intervalMinutes: number): string {
  return String(Math.max(1, Math.round(intervalMinutes / 60)));
}

function syncIntervalMinutesFromHours(value: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 1440;
  return Math.max(60, Math.round(parsed * 60));
}

function formatSyncTimestamp(value: string, emptyLabel: string): string {
  if (!value) return emptyLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

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
      const [data, presets, availability] = await Promise.all([
        fetchModelConfigs(modelScope),
        fetchOwnerPresets(),
        modelScope === "active" ? loadConfiguredModelAvailability() : Promise.resolve(null),
      ]);
      const visibleData = mergeConfiguredModelAvailability(data, availability);
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
        const withoutOriginal = prev.filter((model) => model.id !== (form.originalId ?? saved.id));
        return [...withoutOriginal, saved].sort((a, b) => a.id.localeCompare(b.id));
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

  const modelColumns = useMemo<VirtualTableColumn<ModelItem>[]>(
    () => [
      {
        key: "select",
        label: "",
        width: "w-12",
        headerClassName: "text-center",
        cellClassName: "text-center",
        headerRender: () => (
          <Checkbox
            aria-label={t("models_page.select_all_visible_models")}
            checked={allVisibleModelsSelected}
            indeterminate={someVisibleModelsSelected && !allVisibleModelsSelected}
            disabled={filteredModelIds.length === 0}
            onCheckedChange={toggleVisibleModelSelection}
          />
        ),
        render: (row) => (
          <Checkbox
            aria-label={t("models_page.select_model_aria", { model: row.id })}
            checked={selectedModelIds.has(row.id)}
            onCheckedChange={(checked) => toggleModelSelection(row.id, checked)}
          />
        ),
      },
      {
        key: "model",
        label: t("models_page.col_model"),
        width: "w-[22rem]",
        render: (row) => (
          <div className="flex min-w-0 items-center gap-2">
            <VendorIcon modelId={row.id} size={16} />
            <div className="min-w-0">
              <OverflowTooltip content={row.id} className="block min-w-0">
                <span className="block min-w-0 truncate font-medium">{row.id}</span>
              </OverflowTooltip>
              {row.description ? (
                <OverflowTooltip content={row.description} className="block min-w-0">
                  <span className="block min-w-0 truncate text-[11px] text-slate-500 dark:text-white/45">
                    {row.description}
                  </span>
                </OverflowTooltip>
              ) : null}
            </div>
          </div>
        ),
      },
      {
        key: "owner",
        label: t("models_page.col_owner"),
        width: "w-32",
        render: (row) => row.owned_by || "-",
      },
      {
        key: "mode",
        label: t("models_page.col_pricing_mode"),
        width: "w-36",
        render: (row) =>
          row.pricing.mode === "call" ? t("models_page.mode_call") : t("models_page.mode_token"),
      },
      {
        key: "price",
        label: t("models_page.col_price"),
        width: "w-52",
        cellClassName: "font-mono text-xs tabular-nums text-slate-700 dark:text-slate-200",
        render: (row) => formatPrice(row, t("models_page.not_priced")),
      },
      {
        key: "status",
        label: t("models_page.col_status"),
        width: "w-32",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (row) => {
          const priced = hasPricing(row);
          return (
            <span
              className={[
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-semibold",
                row.enabled && priced
                  ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300"
                  : "bg-slate-100 text-slate-500 dark:bg-neutral-800 dark:text-white/40",
              ].join(" ")}
            >
              {row.enabled && priced ? <Check size={10} /> : null}
              {row.enabled
                ? priced
                  ? t("models_page.priced")
                  : t("models_page.not_priced")
                : t("models_page.disabled")}
            </span>
          );
        },
      },
      {
        key: "actions",
        label: t("models_page.col_actions"),
        width: "w-24",
        render: (row) => (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="xs"
              onClick={() => openEditModel(row.id)}
              aria-label={t("models_page.edit_model_aria", { model: row.id })}
              title={t("models_page.edit_model_aria", { model: row.id })}
            >
              <Edit3 size={14} />
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setDeleteTarget(row)}
              aria-label={t("models_page.delete_model_aria", { model: row.id })}
              title={t("models_page.delete_model_aria", { model: row.id })}
            >
              <Trash2 size={14} />
            </Button>
          </div>
        ),
      },
    ],
    [
      allVisibleModelsSelected,
      filteredModelIds.length,
      openEditModel,
      selectedModelIds,
      someVisibleModelsSelected,
      t,
      toggleModelSelection,
      toggleVisibleModelSelection,
    ],
  );

  const selectionToolbar =
    selectedModelCount > 0 ? (
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
    <section className="flex flex-1 flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-3">
        <Card padding="compact" bodyClassName="mt-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
            <Cpu size={14} /> {t("models_page.available_models")}
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {totalStats.modelCount}
          </div>
        </Card>
        <Card padding="compact" bodyClassName="mt-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
            <Check size={14} /> {t("models_page.enabled_models")}
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            {totalStats.enabledCount}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-white/45">
            {t("models_page.priced_count", { count: totalStats.pricedCount })}
          </div>
        </Card>
        <Card padding="compact" bodyClassName="mt-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
            <Activity size={14} /> {t("models_page.quota_cost")}
          </div>
          <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
            ${totalCost.toFixed(4)}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 dark:text-white/45">
            {t("models_page.total_cost")}
          </div>
        </Card>
      </div>

      <div className="flex">
        <Tabs
          value={activeTab}
          onValueChange={(next) => setActiveTab(next as ModelPageTab)}
          size="sm"
        >
          <TabsList>
            <TabsTrigger value="active">{t("models_page.tab_active_models")}</TabsTrigger>
            <TabsTrigger value="library">{t("models_page.tab_model_library")}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {activeTab === "library" ? (
        <div
          data-testid="owner-library-layout"
          className="grid h-[calc(100dvh-300px)] min-h-[28rem] gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]"
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
                    "shrink-0 rounded-full px-2 py-0.5 text-[11px]",
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
                          <span className="block truncate text-[11px] text-slate-500 dark:text-white/45">
                            {owner.value}
                          </span>
                        </button>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 transition-transform duration-200 ease-out group-focus-within/owner:-translate-x-16 group-hover/owner:-translate-x-16 motion-reduce:transition-none dark:bg-white/[0.08] dark:text-white/45">
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
              className="flex h-full flex-col overflow-hidden"
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
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold",
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

              <VirtualTable<ModelItem>
                rows={filteredModels}
                columns={modelColumns}
                rowKey={(row) => row.id}
                loading={loading}
                rowHeight={52}
                caption={t("models_page.table_caption")}
                emptyText={
                  searchFilter ? t("models_page.no_results") : t("models_page.no_model_data")
                }
                minWidth="min-w-[1160px]"
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
          className="flex flex-1 flex-col overflow-hidden"
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
          <VirtualTable<ModelItem>
            rows={filteredModels}
            columns={modelColumns}
            rowKey={(row) => row.id}
            loading={loading}
            rowHeight={52}
            caption={t("models_page.table_caption")}
            emptyText={searchFilter ? t("models_page.no_results") : t("models_page.no_model_data")}
            minWidth="min-w-[1160px]"
            height="h-[calc(100vh-430px)]"
          />
        </Card>
      )}

      <Modal
        open={form !== null}
        onClose={() => {
          setForm(null);
          setModelIdSuggestionsOpen(false);
        }}
        title={form?.originalId ? t("models_page.edit_model") : t("models_page.add_model")}
        description={t("models_page.config_desc")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setForm(null)}>
              {t("models_page.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void handleSave()} disabled={saving}>
              {saving ? t("models_page.saving") : t("models_page.save")}
            </Button>
          </>
        }
      >
        {form ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="model-config-id"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                >
                  {t("models_page.model_id")}
                </label>
                <div className="relative">
                  <TextInput
                    id="model-config-id"
                    role={!form.originalId && activeTab === "library" ? "combobox" : undefined}
                    aria-label={t("models_page.model_id")}
                    aria-autocomplete={
                      !form.originalId && activeTab === "library" ? "list" : undefined
                    }
                    aria-controls={
                      showReusableModelCandidates ? "model-config-id-reuse-options" : undefined
                    }
                    aria-expanded={
                      !form.originalId && activeTab === "library"
                        ? showReusableModelCandidates
                        : undefined
                    }
                    value={form.id}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      updateForm({ id: nextId });
                      setModelIdSuggestionsOpen(Boolean(nextId.trim()));
                    }}
                    onFocus={() => setModelIdSuggestionsOpen(Boolean(form.id.trim()))}
                    onBlur={() => {
                      window.setTimeout(() => setModelIdSuggestionsOpen(false), 120);
                    }}
                    placeholder={
                      !form.originalId && activeTab === "library"
                        ? t("models_page.model_id_reuse_placeholder")
                        : "gpt-4.1"
                    }
                    autoComplete="off"
                  />
                  {showReusableModelCandidates ? (
                    <div
                      id="model-config-id-reuse-options"
                      role="listbox"
                      className="absolute left-0 right-0 top-full z-30 mt-2 max-h-64 overflow-y-auto rounded-2xl bg-white p-1 shadow-[0_8px_28px_rgb(0_0_0_/_0.16)] dark:bg-[#27272A] dark:shadow-[0_14px_36px_rgb(0_0_0_/_0.38)]"
                    >
                      {reusableModelCandidates.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          role="option"
                          aria-selected={form.id === model.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => applyReusableModel(model)}
                          className="flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-[#F4F4F5] dark:hover:bg-white/[0.06]"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-[#18181B] dark:text-white">
                              {model.id}
                            </span>
                            <span className="block truncate text-xs text-[#71717A] dark:text-[#A1A1AA]">
                              {model.description || model.owned_by}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-medium text-[#71717A] dark:text-[#A1A1AA]">
                            {formatPrice(model, t("models_page.not_priced"))}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                  {t("models_page.owner")}
                </label>
                <SearchableSelect
                  value={form.ownedBy}
                  onChange={(ownedBy) => updateForm({ ownedBy })}
                  onCreate={(ownedBy) => updateForm({ ownedBy: normalizeOwnerValue(ownedBy) })}
                  options={ownerOptions}
                  placeholder={t("models_page.owner_placeholder")}
                  searchPlaceholder={t("models_page.owner_search_placeholder")}
                  aria-label={t("models_page.owner")}
                  allowCreate
                  normalizeCreateValue={normalizeOwnerValue}
                  createLabel={(ownedBy) =>
                    t("models_page.owner_create_option", { owner: normalizeOwnerValue(ownedBy) })
                  }
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="model-config-description"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
              >
                {t("models_page.description_label")}
              </label>
              <textarea
                id="model-config-description"
                value={form.description}
                onChange={(e) => updateForm({ description: e.target.value })}
                rows={3}
                className="min-h-20 w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-300 focus:ring-2 focus:ring-slate-200/70 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white dark:focus:border-neutral-700 dark:focus:ring-white/10"
                placeholder={t("models_page.description_placeholder")}
              />
            </div>

            <ToggleSwitch
              checked={form.enabled}
              onCheckedChange={(enabled) => updateForm({ enabled })}
              label={t("models_page.enabled")}
            />

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                {t("models_page.pricing_mode")}
              </label>
              <Select
                value={form.mode}
                onChange={(mode) => updateForm({ mode: mode as PricingMode })}
                aria-label={t("models_page.pricing_mode")}
                options={[
                  { value: "token", label: t("models_page.mode_token") },
                  { value: "call", label: t("models_page.mode_call") },
                ]}
              />
            </div>

            {form.mode === "call" ? (
              <div>
                <label
                  htmlFor="model-config-price-per-call"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                >
                  {t("models_page.price_per_call")}
                </label>
                <TextInput
                  id="model-config-price-per-call"
                  type="number"
                  value={form.pricePerCall}
                  onChange={(e) => updateForm({ pricePerCall: e.target.value })}
                  placeholder="0.04"
                  step="0.01"
                  min={0}
                />
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label
                    htmlFor="model-config-input-price"
                    className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                  >
                    {t("models_page.input_token_price")}
                  </label>
                  <TextInput
                    id="model-config-input-price"
                    type="number"
                    value={form.inputPrice}
                    onChange={(e) => updateForm({ inputPrice: e.target.value })}
                    placeholder={t("models_page.input_price_placeholder")}
                    step="0.01"
                    min={0}
                  />
                </div>
                <div>
                  <label
                    htmlFor="model-config-output-price"
                    className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                  >
                    {t("models_page.output_token_price")}
                  </label>
                  <TextInput
                    id="model-config-output-price"
                    type="number"
                    value={form.outputPrice}
                    onChange={(e) => updateForm({ outputPrice: e.target.value })}
                    placeholder={t("models_page.output_price_placeholder")}
                    step="0.01"
                    min={0}
                  />
                </div>
                <div>
                  <label
                    htmlFor="model-config-cache-price"
                    className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                  >
                    {t("models_page.cache_token_price")}
                  </label>
                  <TextInput
                    id="model-config-cache-price"
                    type="number"
                    value={form.cachedPrice}
                    onChange={(e) => updateForm({ cachedPrice: e.target.value })}
                    placeholder={t("models_page.input_price_hint")}
                    step="0.01"
                    min={0}
                  />
                </div>
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={ownerForm !== null}
        onClose={() => setOwnerForm(null)}
        title={ownerForm?.originalValue ? t("models_page.edit_owner") : t("models_page.add_owner")}
        description={t("models_page.owner_form_desc")}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOwnerForm(null)}>
              {t("models_page.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => void saveOwnerForm()}
              disabled={savingOwnerPresets}
            >
              {savingOwnerPresets ? t("models_page.saving") : t("models_page.save")}
            </Button>
          </>
        }
      >
        {ownerForm ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="owner-preset-value"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                >
                  {t("models_page.owner_value")}
                </label>
                <TextInput
                  id="owner-preset-value"
                  value={ownerForm.value}
                  onChange={(e) => updateOwnerForm({ value: e.target.value })}
                  placeholder="openai"
                />
              </div>
              <div>
                <label
                  htmlFor="owner-preset-label"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
                >
                  {t("models_page.owner_label")}
                </label>
                <TextInput
                  id="owner-preset-label"
                  value={ownerForm.label}
                  onChange={(e) => updateOwnerForm({ label: e.target.value })}
                  placeholder="OpenAI"
                />
              </div>
            </div>
            <div>
              <label
                htmlFor="owner-preset-description"
                className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80"
              >
                {t("models_page.owner_description")}
              </label>
              <TextInput
                id="owner-preset-description"
                value={ownerForm.description}
                onChange={(e) => updateOwnerForm({ description: e.target.value })}
                placeholder={t("models_page.owner_description_placeholder")}
              />
            </div>
            <ToggleSwitch
              checked={ownerForm.enabled}
              onCheckedChange={(enabled) => updateOwnerForm({ enabled })}
              label={t("models_page.enabled")}
            />
          </div>
        ) : null}
      </Modal>

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
