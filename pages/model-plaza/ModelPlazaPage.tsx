import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Layers, RefreshCw, Search, Store } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import {
  Button,
  Card,
  EmptyState,
  Tabs,
  TabsList,
  TabsTrigger,
  TextInput,
  iconHueClass,
  useToast,
} from "@code-proxy/ui";
import {
  addAvailabilityModel,
  emptyModelPricing,
  formatModelPriceAmount,
  hasModelPricing,
  loadConfiguredModelAvailability,
  loadModelPathAvailability,
  modelConfigLookupIds,
  type ModelAvailabilityItem,
  type ModelAvailabilitySource,
  type ModelPricing,
} from "@features/model-availability";
import {
  buildModelVendorStats,
  getModelVendorKey,
  ModelOwnerTag,
  ModelVendorTile,
  type ModelVendorKey,
} from "@features/model-tags";
import { ModelCapabilityBadges } from "../models/components/ModelCapabilityBadges";

type PlazaModel = {
  id: string;
  description: string;
  ownedBy: string;
  sources?: ModelAvailabilitySource[];
  pricing: ModelPricing;
  inputModalities: string[];
  outputModalities: string[];
  supportsVision: boolean;
};

type VendorFilter = "all" | ModelVendorKey;

type SourceSummary = {
  label: string;
  actualModelId: string;
  mapped: boolean;
};

const formatSourceLabel = (source: ModelAvailabilitySource): string => {
  const label = source.label.trim();
  const provider = source.provider?.trim();
  if (!label || !provider) return label;

  const parts = label.split(" · ").map((part) => part.trim());
  if (parts.length === 2 && parts[0].toLowerCase() === provider.toLowerCase()) {
    return `${parts[1]} · ${parts[0]}`;
  }
  return label;
};

const summarizeSources = (
  sources: ModelAvailabilitySource[] | undefined,
  modelId: string,
): SourceSummary[] => {
  const seen = new Set<string>();
  const entries: SourceSummary[] = [];
  for (const source of sources ?? []) {
    const label = formatSourceLabel(source);
    if (!label) continue;
    const actualModelId = source.upstreamModelId?.trim() || source.modelId?.trim() || modelId;
    const key = `${label}\x00${actualModelId}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({
      label,
      actualModelId,
      mapped: Boolean(actualModelId && actualModelId !== modelId),
    });
  }
  return entries;
};

function PriceChip({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  // 价格不再是一格一格的描边小卡片（卡中卡），只是价格条里的一列：标签 + 数值。
  return (
    <div className="min-w-0">
      <div className="text-2xs font-medium text-ink-3">{label}</div>
      <div
        className={[
          "mt-0.5 truncate font-mono text-xs font-semibold tabular-nums",
          muted ? "text-ink-3" : "text-ink",
        ].join(" ")}
      >
        {value}
      </div>
    </div>
  );
}

function formatPriceCell(amount: number, notPriced: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return notPriced;
  return `$${formatModelPriceAmount(amount)}`;
}

function ModelPlazaCard({
  model,
  onCopied,
}: {
  model: PlazaModel;
  onCopied: () => void;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const sourceEntries = useMemo(
    () => summarizeSources(model.sources, model.id),
    [model.id, model.sources],
  );
  const priced = hasModelPricing(model.pricing);
  const notPriced = t("model_plaza.not_priced");
  const sourceSummary = sourceEntries
    .map((entry) =>
      entry.mapped ? `${entry.label} → ${entry.actualModelId}` : entry.label,
    )
    .join(" · ");

  const handleCopy = () => {
    void navigator.clipboard.writeText(model.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    onCopied();
  };

  // 价格条贴着卡片底边，用同心内圆角（rounded-inner = 卡片圆角 − 内边距）的一块淡底。
  const priceGrid =
    model.pricing.mode === "call" ? (
      <div className="grid grid-cols-1 gap-2 rounded-inner bg-subtle px-2.5 py-2">
        <PriceChip
          label={t("model_plaza.price_per_call")}
          value={formatPriceCell(model.pricing.pricePerCall, notPriced)}
          muted={model.pricing.pricePerCall <= 0}
        />
      </div>
    ) : (
      <div className="grid grid-cols-3 gap-2 rounded-inner bg-subtle px-2.5 py-2">
        <PriceChip
          label={t("model_plaza.input_price")}
          value={formatPriceCell(model.pricing.inputPricePerMillion, notPriced)}
          muted={model.pricing.inputPricePerMillion <= 0}
        />
        <PriceChip
          label={t("model_plaza.output_price")}
          value={formatPriceCell(model.pricing.outputPricePerMillion, notPriced)}
          muted={model.pricing.outputPricePerMillion <= 0}
        />
        <PriceChip
          label={t("model_plaza.cache_price")}
          value={formatPriceCell(
            model.pricing.cacheReadPricePerMillion > 0
              ? model.pricing.cacheReadPricePerMillion
              : model.pricing.cachedPricePerMillion,
            notPriced,
          )}
          muted={
            model.pricing.cacheReadPricePerMillion <= 0 &&
            model.pricing.cachedPricePerMillion <= 0
          }
        />
      </div>
    );


  return (
    <div data-testid="model-plaza-card" className="h-full min-h-[220px]">
      <Card
        padding="compact"
        bodyClassName="mt-0 flex h-full min-h-[196px] flex-col"
        className="group h-full transition-shadow hover:shadow-lift"
      >
        <div className="flex items-start gap-3">
          <ModelVendorTile modelId={model.id} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h3
                    className="truncate font-mono text-sm font-semibold text-ink"
                    title={model.id}
                  >
                    {model.id}
                  </h3>
                </div>
                {model.ownedBy ? (
                  <ModelOwnerTag owner={model.ownedBy} className="mt-1" />
                ) : (
                  <p className="mt-0.5 truncate text-2xs text-ink-3">
                    {t("model_plaza.no_owner")}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-ink-3 opacity-100 transition hover:bg-hover hover:text-ink sm:opacity-0 sm:group-hover:opacity-100"
                title={t("model_plaza.copy_id")}
                aria-label={t("model_plaza.copy_id")}
              >
                {copied ? (
                  <Check size={14} className="text-emerald-500" />
                ) : (
                  <Copy size={14} className={`text-ink-3 ${iconHueClass(Copy)}`} />
                )}
              </button>
            </div>
            <div className="mt-1.5">
              <ModelCapabilityBadges
                model={{
                  id: model.id,
                  inputModalities: model.inputModalities,
                  outputModalities: model.outputModalities,
                  supportsVision: model.supportsVision,
                }}
                size="sm"
                showUnknown={false}
              />
            </div>
          </div>
        </div>

        <div className="mt-3 min-h-10 min-w-0 flex-1" data-testid="model-description-space">
          <p
            className="line-clamp-2 break-words text-xs leading-5 text-ink-3"
            data-testid="model-description-clamp"
          >
            {model.description?.trim()
              ? model.description
              : t("model_plaza.no_description")}
          </p>
        </div>

        <div className="mt-2 min-h-4">
          {sourceSummary ? (
            <p
              className="truncate text-2xs text-ink-3"
              title={sourceSummary}
              data-testid="model-plaza-source"
            >
              {sourceSummary}
            </p>
          ) : (
            <p className="truncate text-2xs text-transparent" aria-hidden="true">
              —
            </p>
          )}
        </div>

        <div className="mt-auto pt-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-2xs font-medium text-ink-3">
              {t("model_plaza.pricing")}
            </span>
            {!priced ? (
              <span className="text-2xs text-ink-3">
                {t("model_plaza.not_priced")}
              </span>
            ) : model.pricing.mode === "token" ? (
              <span className="text-2xs text-ink-3">
                {t("model_plaza.per_million")}
              </span>
            ) : null}
          </div>
          {priceGrid}
        </div>
      </Card>
    </div>
  );
}

function mergePlazaModels(
  configuredItems: ModelAvailabilityItem[],
  pathModelIds: string[],
  useMappedOwnerModels: boolean,
  configuredScoped: boolean,
): PlazaModel[] {
  const configuredById = new Map<string, ModelAvailabilityItem>();
  for (const item of configuredItems) addAvailabilityModel(configuredById, item);
  // When configured-availability is scoped (tenant channel-group allow-list),
  // it is the source of truth. Path-only IDs used to re-introduce models that
  // AllowedModels already removed (e.g. xAI live discovery via path-availability).
  // Mapped-owner mode likewise trusts the configured list only.
  // Unscoped tenants keep path ∪ configured enrichment.
  const nextIds =
    useMappedOwnerModels || configuredScoped
      ? configuredItems.map((item) => item.id)
      : [...pathModelIds, ...configuredItems.map((item) => item.id)];

  return Array.from(new Set(nextIds))
    .sort((a, b) => a.localeCompare(b))
    .map((id) => {
      const exactConfigured = configuredById.get(id.toLowerCase());
      let configured = exactConfigured;
      for (const candidate of modelConfigLookupIds(id)) {
        configured = configuredById.get(candidate);
        if (configured) break;
      }
      const inputModalities = configured?.inputModalities ?? [];
      const outputModalities = configured?.outputModalities ?? [];
      return {
        id,
        description: configured?.description?.trim() ?? "",
        ownedBy: exactConfigured?.owned_by?.trim() ?? "",
        sources: exactConfigured?.sources,
        pricing: configured?.pricing ?? emptyModelPricing(),
        inputModalities,
        outputModalities,
        supportsVision:
          configured?.supportsVision ??
          inputModalities.some((m) => m.toLowerCase() === "image"),
      };
    });
}

export function ModelPlazaPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<PlazaModel[]>([]);
  const [filter, setFilter] = useState("");
  const [selectedVendor, setSelectedVendor] = useState<VendorFilter>("all");

  const loadModels = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configuredAvailability, pathAvailability] = await Promise.all([
        loadConfiguredModelAvailability().catch(() => null),
        loadModelPathAvailability().catch(() => null),
      ]);

      const useMappedOwnerModels = configuredAvailability?.usesMappedOwners === true;
      const configuredScoped = configuredAvailability?.scoped === true;
      const rootV1ModelIds =
        pathAvailability?.items
          .filter((item) =>
            item.paths.some(
              (path) =>
                path.scope === "root" && path.method === "GET" && path.path === "/v1/models",
            ),
          )
          .map((item) => item.id) ?? [];

      setModels(
        mergePlazaModels(
          configuredAvailability?.items ?? [],
          rootV1ModelIds,
          useMappedOwnerModels,
          configuredScoped,
        ),
      );
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t("model_plaza.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadModels();
  }, [loadModels]);

  const vendorStats = useMemo(
    () => buildModelVendorStats(
      models.map((model) => model.id),
      t("common.other"),
    ),
    [models, t],
  );

  const filteredModels = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return models.filter((model) => {
      if (selectedVendor !== "all" && getModelVendorKey(model.id) !== selectedVendor) {
        return false;
      }
      if (!needle) return true;
      const sourceText = summarizeSources(model.sources, model.id)
        .map((entry) => `${entry.label} ${entry.actualModelId}`)
        .join(" ")
        .toLowerCase();
      return (
        model.id.toLowerCase().includes(needle) ||
        model.description.toLowerCase().includes(needle) ||
        model.ownedBy.toLowerCase().includes(needle) ||
        sourceText.includes(needle)
      );
    });
  }, [filter, models, selectedVendor]);

  const handleCopied = useCallback(() => {
    notify({ type: "success", message: t("model_plaza.copied"), duration: 1200 });
  }, [notify, t]);

  const tabValue = selectedVendor;

  return (
    // 不要在根节点加 overflow-x-hidden：会把 overflow-y 计算成 auto，
    // 从而切断相对 AppShell 滚动容器的 sticky 吸顶。
    <div className="flex min-w-0 flex-col">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {/* 标题前是线性图标，不垫图标块（同请求日志页）；图标着色为多彩时按图标取色。 */}
          <Store size={18} className={`shrink-0 text-ink-3 ${iconHueClass(Store)}`} aria-hidden="true" />
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-ink">{t("model_plaza.title")}</h2>
            <p className="hidden text-xs text-ink-3 sm:block">
              {t("model_plaza.subtitle")}
            </p>
          </div>
          <span className="rounded-full bg-hover px-2 py-0.5 text-xs font-bold tabular-nums text-ink">
            {filteredModels.length}
          </span>
          {filter || selectedVendor !== "all" ? (
            <span className="text-2xs text-ink-3">/ {models.length}</span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <TextInput
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t("model_plaza.search")}
            className="!w-40 sm:!w-56"
            startAdornment={<Search size={14} className="text-ink-3" />}
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void loadModels()}
            disabled={loading}
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            {t("model_plaza.refresh")}
          </Button>
        </div>
      </div>

      {vendorStats.length > 0 && !loading ? (
        <div
          data-testid="model-plaza-tabs-sticky"
          className="sticky top-0 z-20 py-2.5"
        >
          <Tabs
            value={tabValue}
            onValueChange={(next) => setSelectedVendor(next as VendorFilter)}
            size="sm"
          >
            <TabsList aria-label={t("model_plaza.vendor_tabs")} className="max-w-full">
              <TabsTrigger value="all">
                <Layers size={12} aria-hidden="true" />
                {t("common.all", { defaultValue: "All" })}
                <span className="tabular-nums text-ink-3">{models.length}</span>
              </TabsTrigger>
              {vendorStats.map((stat) => (
                <TabsTrigger key={stat.key} value={stat.key}>
                  <VendorIcon modelId={stat.key} size={12} />
                  {stat.label}
                  <span className="tabular-nums text-ink-3">{stat.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      <div className="mt-4 flex min-w-0 flex-col gap-4">
        {error ? (
          <div className="rounded-xl bg-rose-500/[0.08] px-4 py-2.5 text-sm text-rose-700 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-ink-3">
            <RefreshCw size={14} className="mr-2 animate-spin" />
            {t("model_plaza.loading")}
          </div>
        ) : filteredModels.length > 0 ? (
          <div
            className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            data-testid="model-plaza-grid"
          >
            {filteredModels.map((model) => (
              <ModelPlazaCard key={model.id} model={model} onCopied={handleCopied} />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Store size={28} className="opacity-50" />}
            title={models.length === 0 ? t("model_plaza.no_models") : t("model_plaza.no_match")}
            description={
              models.length === 0
                ? t("model_plaza.no_models_desc")
                : t("model_plaza.no_match_desc")
            }
          />
        )}
      </div>
    </div>
  );
}
