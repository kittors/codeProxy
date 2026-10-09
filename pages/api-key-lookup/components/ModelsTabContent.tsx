import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, Layers, RefreshCw, Search, Store } from "lucide-react";
import { VendorIcon } from "@code-proxy/assets";
import {
  Card,
  EmptyState,
  Tabs,
  TabsList,
  TabsTrigger,
  TextInput,
  iconHueClass,
  useToast,
} from "@code-proxy/ui";
import { formatModelPriceAmount, hasModelPricing } from "@features/model-availability";
import {
  buildModelVendorStats,
  getModelVendorKey,
  ModelOwnerTag,
  ModelVendorTile,
  type ModelVendorKey,
} from "@features/model-tags";
import { ModelCapabilityBadges } from "../../models/components/ModelCapabilityBadges";
import type { PublicModelItem } from "../api";

type VendorFilter = "all" | ModelVendorKey;

/** 一项价格：标签 + 等宽数值。没有定价的项数值淡一档，不再各套一个描边小框。 */
function PriceChip({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
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

/*
 * 价格区是卡片底部的一块无描边淡底：贴着卡片的两个下角，所以圆角取 rounded-inner，
 * 与卡片圆角同一个圆心（Card compact：24 − 12 = 12）。
 */
const PRICE_GRID = "rounded-inner bg-subtle px-2.5 py-2";

function formatPriceCell(amount: number, notPriced: string): string {
  if (!Number.isFinite(amount) || amount <= 0) return notPriced;
  return `$${formatModelPriceAmount(amount)}`;
}

function ModelPlazaCard({ model, onCopied }: { model: PublicModelItem; onCopied: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const priced = hasModelPricing(model.pricing);
  const notPriced = t("model_plaza.not_priced");

  const handleCopy = () => {
    void navigator.clipboard.writeText(model.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    onCopied();
  };

  const priceGrid =
    model.pricing.mode === "call" ? (
      <div className={`grid grid-cols-1 gap-1.5 ${PRICE_GRID}`}>
        <PriceChip
          label={t("model_plaza.price_per_call")}
          value={formatPriceCell(model.pricing.pricePerCall, notPriced)}
          muted={model.pricing.pricePerCall <= 0}
        />
      </div>
    ) : (
      <div className={`grid grid-cols-3 gap-3 ${PRICE_GRID}`}>
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
            model.pricing.cacheReadPricePerMillion <= 0 && model.pricing.cachedPricePerMillion <= 0
          }
        />
      </div>
    );

  return (
    <div data-testid="apikey-lookup-model-card" className="h-full min-h-[220px] min-w-0">
      <Card
        padding="compact"
        bodyClassName="mt-0 flex h-full min-h-[196px] min-w-0 flex-col"
        className="group h-full min-w-0 overflow-hidden transition-shadow hover:shadow-lift"
      >
        <div className="flex items-start gap-3">
          <ModelVendorTile modelId={model.id} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3
                  className="truncate font-mono text-sm font-semibold text-ink"
                  title={model.id}
                >
                  {model.id}
                </h3>
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
            {model.description?.trim() ? model.description : t("model_plaza.no_description")}
          </p>
        </div>

        <div className="mt-auto pt-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-2xs font-medium text-ink-3">{t("model_plaza.pricing")}</span>
            {!priced ? (
              <span className="text-2xs text-ink-3">{t("model_plaza.not_priced")}</span>
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

export function ModelsTabContent({
  models,
  loading,
  error,
  searchFilter,
  onSearchChange,
}: {
  models: PublicModelItem[];
  loading: boolean;
  error: string | null;
  searchFilter: string;
  onSearchChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [selectedVendor, setSelectedVendor] = useState<VendorFilter>("all");

  const modelIds = useMemo(() => models.map((model) => model.id), [models]);

  const vendorStats = useMemo(
    () => buildModelVendorStats(modelIds, t("common.other")),
    [modelIds, t],
  );

  const filteredModels = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase();
    return models.filter((model) => {
      if (selectedVendor !== "all" && getModelVendorKey(model.id) !== selectedVendor) {
        return false;
      }
      if (!needle) return true;
      return (
        model.id.toLowerCase().includes(needle) ||
        model.description.toLowerCase().includes(needle) ||
        model.ownedBy.toLowerCase().includes(needle)
      );
    });
  }, [models, searchFilter, selectedVendor]);

  const handleCopied = useCallback(() => {
    notify({ type: "success", message: t("model_plaza.copied"), duration: 1200 });
  }, [notify, t]);

  const isFilterActive = Boolean(searchFilter.trim()) || selectedVendor !== "all";

  return (
    <div className="flex min-w-0 flex-col" data-testid="apikey-lookup-models-scroll-area">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-selected">
            <Store size={16} className={`text-ink-3 ${iconHueClass(Store)}`} />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-ink">
              {t("model_plaza.title")}
            </h3>
            <p className="hidden text-xs text-ink-3 sm:block">
              {t("model_plaza.subtitle")}
            </p>
          </div>
          <span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-xs font-bold tabular-nums text-ink dark:bg-white/[0.07]">
            {filteredModels.length}
          </span>
          {isFilterActive && filteredModels.length !== models.length ? (
            <span className="text-2xs text-ink-3">/ {models.length}</span>
          ) : null}
        </div>
      </div>

      {vendorStats.length > 0 && !loading ? (
        <div
          data-testid="apikey-lookup-model-tabs-sticky"
          className="sticky top-20 z-10 -mx-1 flex flex-col gap-2 bg-canvas/95 px-1 py-2.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between"
        >
          <Tabs
            value={selectedVendor}
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
          <TextInput
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("model_plaza.search")}
            className="!w-full sm:!w-56 sm:shrink-0"
            startAdornment={<Search size={14} className="text-ink-3" />}
          />
        </div>
      ) : (
        <TextInput
          value={searchFilter}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("model_plaza.search")}
          className="!w-full sm:!w-56"
          startAdornment={<Search size={14} className="text-ink-3" />}
        />
      )}

      <div className="mt-4 flex min-w-0 flex-col gap-4">
        {error ? (
          <div className="rounded-xl bg-rose-500/10 px-4 py-2.5 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
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
            data-testid="apikey-lookup-model-grid"
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
              models.length === 0 ? t("model_plaza.no_models_desc") : t("model_plaza.no_match_desc")
            }
          />
        )}
      </div>
    </div>
  );
}
