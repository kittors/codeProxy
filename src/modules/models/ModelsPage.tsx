import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Check, Cpu, Edit3, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
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

const PRESET_OWNERS = [
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Google" },
  { value: "gemini", label: "Gemini" },
  { value: "vertex", label: "Vertex AI" },
  { value: "deepseek", label: "DeepSeek" },
  { value: "qwen", label: "Qwen" },
  { value: "kimi", label: "Kimi" },
  { value: "minimax", label: "MiniMax" },
  { value: "grok", label: "Grok" },
  { value: "glm", label: "GLM" },
  { value: "codex", label: "Codex" },
  { value: "iflow", label: "iFlow" },
  { value: "kiro", label: "Kiro" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "azure-openai", label: "Azure OpenAI" },
] as const;

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

export function ModelsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [models, setModels] = useState<ModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [totalCost, setTotalCost] = useState(0);
  const [form, setForm] = useState<ModelFormState | null>(null);
  const [saving, setSaving] = useState(false);

  const loadModels = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchModelConfigs();
      setModels(data);
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

  const ownerOptions = useMemo<SearchableSelectOption[]>(() => {
    const optionMap = new Map<string, SearchableSelectOption>();
    for (const owner of PRESET_OWNERS) {
      optionMap.set(owner.value, {
        value: owner.value,
        label: owner.label,
        searchText: `${owner.value} ${owner.label}`,
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
  }, [form?.ownedBy, models]);

  const openEditModel = useCallback(
    (modelId: string) => {
      const model = models.find((entry) => entry.id === modelId);
      if (model) setForm(toFormState(model));
    },
    [models],
  );

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
        width: "w-20",
        render: (row) => (
          <Button
            variant="ghost"
            size="xs"
            onClick={() => openEditModel(row.id)}
            aria-label={t("models_page.edit_model_aria", { model: row.id })}
            title={t("models_page.edit_model_aria", { model: row.id })}
          >
            <Edit3 size={14} />
          </Button>
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
              onClick={() => setForm(emptyForm)}
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
    </section>
  );
}
