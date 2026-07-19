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
  useToast,
} from "@code-proxy/ui";
import {
  buildModelVendorStats,
  getModelVendorKey,
  type ModelVendorKey,
} from "@features/model-tags";

type VendorFilter = "all" | ModelVendorKey;

function ModelIdCard({ id, onCopied }: { id: string; onCopied: () => void }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const vendorGlyph = id.trim().charAt(0).toUpperCase() || "M";

  const handleCopy = () => {
    void navigator.clipboard.writeText(id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
    onCopied();
  };

  return (
    <div data-testid="apikey-lookup-model-card" className="h-full min-h-[120px]">
      <Card
        padding="compact"
        bodyClassName="mt-0 flex h-full min-h-[96px] flex-col"
        className="group h-full transition hover:border-indigo-200/70 hover:shadow-[2px_2px_10px_rgb(0_0_0_/_0.06)] dark:hover:border-indigo-500/25 dark:hover:shadow-[2px_2px_10px_rgb(0_0_0_/_0.28)]"
      >
        <div className="flex items-start gap-3">
          <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 dark:border-neutral-700/70 dark:bg-neutral-900/70">
            <span className="pointer-events-none absolute text-sm font-bold text-slate-300 dark:text-white/25">
              {vendorGlyph}
            </span>
            <span className="relative z-10 flex items-center justify-center [&:empty]:hidden">
              <VendorIcon modelId={id} size={22} />
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <h3
                  className="truncate font-mono text-sm font-semibold text-slate-900 dark:text-white"
                  title={id}
                >
                  {id}
                </h3>
                <p className="mt-0.5 truncate text-2xs text-slate-400 dark:text-white/35">
                  {t("model_plaza.no_owner")}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-slate-400 opacity-100 transition hover:bg-slate-100 hover:text-slate-700 sm:opacity-0 sm:group-hover:opacity-100 dark:hover:bg-neutral-800 dark:hover:text-white"
                title={t("model_plaza.copy_id")}
                aria-label={t("model_plaza.copy_id")}
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
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
  models: string[];
  loading: boolean;
  error: string | null;
  searchFilter: string;
  onSearchChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [selectedVendor, setSelectedVendor] = useState<VendorFilter>("all");

  const vendorStats = useMemo(
    () => buildModelVendorStats(models, t("common.other")),
    [models, t],
  );

  const filteredModels = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase();
    return models.filter((id) => {
      if (selectedVendor !== "all" && getModelVendorKey(id) !== selectedVendor) {
        return false;
      }
      return !needle || id.toLowerCase().includes(needle);
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
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
            <Store size={16} className="text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              {t("model_plaza.title")}
            </h3>
            <p className="hidden text-xs text-slate-500 dark:text-white/45 sm:block">
              {t("model_plaza.subtitle")}
            </p>
          </div>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
            {filteredModels.length}
          </span>
          {isFilterActive && filteredModels.length !== models.length ? (
            <span className="text-2xs text-slate-400 dark:text-white/30">/ {models.length}</span>
          ) : null}
        </div>
        <TextInput
          value={searchFilter}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t("model_plaza.search")}
          className="!w-40 sm:!w-56"
          startAdornment={<Search size={14} className="text-slate-400 dark:text-white/35" />}
        />
      </div>

      {vendorStats.length > 0 && !loading ? (
        <div className="sticky top-0 z-20 py-2.5">
          <Tabs
            value={selectedVendor}
            onValueChange={(next) => setSelectedVendor(next as VendorFilter)}
            size="sm"
          >
            <TabsList aria-label={t("model_plaza.vendor_tabs")} className="max-w-full">
              <TabsTrigger value="all">
                <Layers size={12} aria-hidden="true" />
                {t("common.all", { defaultValue: "All" })}
                <span className="tabular-nums text-slate-400 dark:text-white/40">{models.length}</span>
              </TabsTrigger>
              {vendorStats.map((stat) => (
                <TabsTrigger key={stat.key} value={stat.key}>
                  <VendorIcon modelId={stat.key} size={12} />
                  {stat.label}
                  <span className="tabular-nums text-slate-400 dark:text-white/40">{stat.count}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      ) : null}

      <div className="mt-4 flex min-w-0 flex-col gap-4">
        {error ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-2.5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
            {error}
          </div>
        ) : null}

        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-sm text-slate-500 dark:text-white/50">
            <RefreshCw size={14} className="mr-2 animate-spin" />
            {t("model_plaza.loading")}
          </div>
        ) : filteredModels.length > 0 ? (
          <div
            className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
            data-testid="apikey-lookup-model-grid"
          >
            {filteredModels.map((id) => (
              <ModelIdCard key={id} id={id} onCopied={handleCopied} />
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
