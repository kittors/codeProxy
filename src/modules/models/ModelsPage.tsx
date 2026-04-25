import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Check,
  Cpu,
  Edit3,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
} from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { SearchableSelect, type SearchableSelectOption } from "@/modules/ui/SearchableSelect";
import { Select } from "@/modules/ui/Select";
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
import iconVertex from "@/assets/icons/vertex.svg";

type PricingMode = "token" | "call";

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

async function fetchModelConfigs(): Promise<ModelItem[]> {
  try {
    return normalizeModelConfigResponse(await apiClient.get("/model-configs"));
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

function payloadToModel(payload: ReturnType<typeof buildModelPayload>): ModelItem {
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
    pricing,
  };
}

async function saveModelConfig(form: ModelFormState) {
  const payload = buildModelPayload(form);
  if (!payload.id) {
    throw new Error("Model ID is required");
  }

  if (form.originalId) {
    await apiClient.put(`/model-configs/${encodeURIComponent(form.originalId)}`, payload);
  } else {
    await apiClient.post("/model-configs", payload);
  }

  return payloadToModel(payload);
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
      ? `$${model.pricing.pricePerCall} / call`
      : notPricedLabel;
  }

  if (!hasPricing(model)) return notPricedLabel;
  return `$${model.pricing.inputPricePerMillion} / $${model.pricing.outputPricePerMillion} / $${model.pricing.cachedPricePerMillion}`;
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

export function ModelsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [totalCost, setTotalCost] = useState(0);
  const [form, setForm] = useState<ModelFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [ownerPresets, setOwnerPresets] = useState<ModelOwnerPreset[]>([]);
  const [ownerPresetOpen, setOwnerPresetOpen] = useState(false);
  const [ownerPresetDraft, setOwnerPresetDraft] = useState<ModelOwnerPreset[]>([]);
  const [selectedOwner, setSelectedOwner] = useState("");
  const [savingOwnerPresets, setSavingOwnerPresets] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ModelItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const [data, presets] = await Promise.all([fetchModelConfigs(), fetchOwnerPresets()]);
      setModels(data);
      setOwnerPresets(presets);
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
  }, [notify, t]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const filteredModels = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase();
    if (!needle) return models;
    return models.filter((model) => {
      const haystack = `${model.id} ${model.owned_by} ${model.description}`.toLowerCase();
      return haystack.includes(needle);
    });
  }, [models, searchFilter]);

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

  const openEditModel = useCallback(
    (modelId: string) => {
      const model = models.find((entry) => entry.id === modelId);
      if (model) setForm(toFormState(model));
    },
    [models],
  );

  const openAddModel = useCallback((ownedBy = "") => {
    setForm({ ...emptyForm, ownedBy });
  }, []);

  const openOwnerPresetModal = useCallback(() => {
    const draft = buildOwnerPresetDrafts(models, ownerPresets);
    setOwnerPresetDraft(draft);
    setSelectedOwner((current) =>
      current && draft.some((owner) => owner.value === current) ? current : draft[0]?.value || "",
    );
    setOwnerPresetOpen(true);
  }, [models, ownerPresets]);

  const updateForm = useCallback((patch: Partial<ModelFormState>) => {
    setForm((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const handleSave = useCallback(async () => {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await saveModelConfig(form);
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
  }, [form, notify, t]);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/model-configs/${encodeURIComponent(deleteTarget.id)}`);
      setModels((prev) => prev.filter((model) => model.id !== deleteTarget.id));
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

  const selectedOwnerDraft = useMemo(
    () => ownerPresetDraft.find((owner) => owner.value === selectedOwner) ?? null,
    [ownerPresetDraft, selectedOwner],
  );

  const selectedOwnerModels = useMemo(
    () => models.filter((model) => normalizeOwnerValue(model.owned_by) === selectedOwner),
    [models, selectedOwner],
  );

  const updateSelectedOwnerDraft = useCallback(
    (patch: Partial<ModelOwnerPreset>) => {
      if (!selectedOwnerDraft) return;
      setOwnerPresetDraft((prev) =>
        prev.map((owner) => {
          if (owner.value !== selectedOwnerDraft.value) return owner;
          const next = { ...owner, ...patch };
          if (patch.value !== undefined) {
            const nextValue = normalizeOwnerValue(patch.value);
            next.value = nextValue;
            setSelectedOwner(nextValue);
          }
          return next;
        }),
      );
    },
    [selectedOwnerDraft],
  );

  const addOwnerPresetDraft = useCallback(() => {
    const next: ModelOwnerPreset = {
      value: "",
      label: "",
      description: "",
      enabled: true,
      modelCount: 0,
    };
    setOwnerPresetDraft((prev) => [next, ...prev]);
    setSelectedOwner("");
  }, []);

  const removeSelectedOwnerDraft = useCallback(() => {
    if (!selectedOwnerDraft) return;
    setOwnerPresetDraft((prev) => {
      const next = prev.filter((owner) => owner.value !== selectedOwnerDraft.value);
      setSelectedOwner(next[0]?.value || "");
      return next;
    });
  }, [selectedOwnerDraft]);

  const saveOwnerPresets = useCallback(async () => {
    const items = ownerPresetDraft
      .map((owner) => ({
        value: normalizeOwnerValue(owner.value),
        label: owner.label.trim(),
        description: owner.description.trim(),
        enabled: owner.enabled,
      }))
      .filter((owner) => owner.value && owner.label);

    const deduped = Array.from(new Map(items.map((item) => [item.value, item])).values()).sort(
      (a, b) => a.label.localeCompare(b.label),
    );

    setSavingOwnerPresets(true);
    try {
      await apiClient.put("/model-owner-presets", { items: deduped });
      setOwnerPresets(deduped);
      setOwnerPresetDraft(deduped);
      setOwnerPresetOpen(false);
      notify({ type: "success", message: t("models_page.owner_presets_saved") });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("models_page.owner_presets_save_failed"),
      });
    } finally {
      setSavingOwnerPresets(false);
    }
  }, [notify, ownerPresetDraft, t]);

  const modelColumns = useMemo<VirtualTableColumn<ModelItem>[]>(
    () => [
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
    [openEditModel, t],
  );

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

      <Card
        title={t("models_page.model_configs")}
        description={t("models_page.model_configs_desc")}
        className="flex flex-1 flex-col overflow-hidden"
        bodyClassName="relative flex min-h-0 flex-1 flex-col"
        actions={
          <div className="flex items-center gap-2">
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
              onClick={() => openOwnerPresetModal()}
              aria-label={t("models_page.manage_owner_presets")}
              title={t("models_page.manage_owner_presets")}
            >
              <Settings2 size={14} />
            </Button>
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
          minWidth="min-w-[1100px]"
          height="h-[calc(100vh-390px)]"
        />
        {loading ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-2xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/55">
            <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/75">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-900 dark:border-white/20 dark:border-t-white/80" />
              {t("models_page.loading")}
            </div>
          </div>
        ) : null}
      </Card>

      <Modal
        open={ownerPresetOpen}
        onClose={() => setOwnerPresetOpen(false)}
        title={t("models_page.owner_presets_title")}
        description={t("models_page.owner_presets_desc")}
        maxWidth="max-w-5xl"
        bodyHeightClassName="max-h-[72vh]"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOwnerPresetOpen(false)}>
              {t("models_page.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => void saveOwnerPresets()}
              disabled={savingOwnerPresets}
            >
              {savingOwnerPresets ? t("models_page.saving") : t("models_page.save")}
            </Button>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50/70 p-2 dark:border-neutral-800 dark:bg-white/[0.03]">
            <div className="mb-2 flex items-center justify-between gap-2 px-1">
              <div className="text-xs font-semibold uppercase text-slate-500 dark:text-white/45">
                {t("models_page.owner_presets")}
              </div>
              <Button size="xs" variant="secondary" onClick={addOwnerPresetDraft}>
                <Plus size={13} />
                {t("models_page.add_owner")}
              </Button>
            </div>
            <div className="max-h-[52vh] space-y-1 overflow-y-auto pr-1">
              {ownerPresetDraft.map((owner, index) => {
                const value = owner.value || "";
                const count = ownerModelCounts.get(value) ?? owner.modelCount ?? 0;
                const selected =
                  value === selectedOwner &&
                  index === ownerPresetDraft.findIndex((item) => item.value === selectedOwner);
                return (
                  <button
                    key={`${value}-${index}`}
                    type="button"
                    onClick={() => setSelectedOwner(value)}
                    className={[
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm transition",
                      selected
                        ? "bg-white text-slate-950 shadow-sm ring-1 ring-slate-200 dark:bg-neutral-900 dark:text-white dark:ring-neutral-700"
                        : "text-slate-700 hover:bg-white/70 dark:text-white/70 dark:hover:bg-white/[0.06]",
                    ].join(" ")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {owner.label || owner.value || t("models_page.new_owner")}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-white/40">
                        {value || t("models_page.owner_value_pending")}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-white/[0.08] dark:text-white/45">
                      {t("models_page.owner_model_count", { count })}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            {selectedOwnerDraft ? (
              <>
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
                      value={selectedOwnerDraft.value}
                      onChange={(e) => updateSelectedOwnerDraft({ value: e.target.value })}
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
                      value={selectedOwnerDraft.label}
                      onChange={(e) => updateSelectedOwnerDraft({ label: e.target.value })}
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
                    value={selectedOwnerDraft.description}
                    onChange={(e) => updateSelectedOwnerDraft({ description: e.target.value })}
                    placeholder={t("models_page.owner_description_placeholder")}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <ToggleSwitch
                    checked={selectedOwnerDraft.enabled}
                    onCheckedChange={(enabled) => updateSelectedOwnerDraft({ enabled })}
                    label={t("models_page.enabled")}
                  />
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={removeSelectedOwnerDraft}
                    disabled={selectedOwnerModels.length > 0}
                    title={
                      selectedOwnerModels.length > 0
                        ? t("models_page.owner_remove_disabled")
                        : t("models_page.remove_owner")
                    }
                  >
                    <Trash2 size={14} />
                    {t("models_page.remove_owner")}
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 dark:border-neutral-800">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2 dark:border-neutral-800">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">
                      {t("models_page.owner_models")}
                    </div>
                    <Button
                      size="xs"
                      variant="secondary"
                      onClick={() => {
                        setOwnerPresetOpen(false);
                        openAddModel(selectedOwnerDraft.value);
                      }}
                    >
                      <Plus size={13} />
                      {t("models_page.add_model")}
                    </Button>
                  </div>
                  <div className="divide-y divide-slate-100 dark:divide-neutral-800">
                    {selectedOwnerModels.length === 0 ? (
                      <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-white/45">
                        {t("models_page.no_owner_models")}
                      </div>
                    ) : (
                      selectedOwnerModels.map((model) => (
                        <div
                          key={model.id}
                          className="flex min-w-0 items-center justify-between gap-3 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-900 dark:text-white">
                              {model.id}
                            </div>
                            <div className="truncate text-xs text-slate-500 dark:text-white/45">
                              {formatPrice(model, t("models_page.not_priced"))}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => {
                                setOwnerPresetOpen(false);
                                openEditModel(model.id);
                              }}
                              aria-label={t("models_page.edit_model_aria", { model: model.id })}
                            >
                              <Edit3 size={14} />
                            </Button>
                            <Button
                              size="xs"
                              variant="ghost"
                              onClick={() => setDeleteTarget(model)}
                              aria-label={t("models_page.delete_model_aria", { model: model.id })}
                            >
                              <Trash2 size={14} />
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="flex h-full min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-200 text-sm text-slate-500 dark:border-neutral-800 dark:text-white/45">
                {t("models_page.no_owner_presets")}
              </div>
            )}
          </div>
        </div>
      </Modal>

      <Modal
        open={form !== null}
        onClose={() => setForm(null)}
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
                <TextInput
                  id="model-config-id"
                  value={form.id}
                  onChange={(e) => updateForm({ id: e.target.value })}
                  placeholder="gpt-4.1"
                />
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

      <ConfirmModal
        open={deleteTarget !== null}
        title={t("models_page.delete_model_title")}
        description={t("models_page.delete_model_desc", { model: deleteTarget?.id ?? "" })}
        confirmText={t("models_page.delete")}
        busy={deleting}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
      />
    </section>
  );
}
