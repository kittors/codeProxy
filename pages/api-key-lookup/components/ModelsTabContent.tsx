import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Layers, RefreshCw, Search } from "lucide-react";
import { Card } from "@code-proxy/ui";
import { ScrollArea } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import {
  buildModelVendorStats,
  CopyableModelTag,
  getModelVendorKey,
  ModelVendorStatBadge,
  type ModelVendorKey,
} from "@features/model-tags";

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
  const [selectedModelVendor, setSelectedModelVendor] = useState<"all" | ModelVendorKey>("all");

  const filteredModels = useMemo(() => {
    const needle = searchFilter.trim().toLowerCase();
    return models.filter((id) => {
      if (selectedModelVendor !== "all" && getModelVendorKey(id) !== selectedModelVendor) {
        return false;
      }
      return !needle || id.toLowerCase().includes(needle);
    });
  }, [models, searchFilter, selectedModelVendor]);

  const vendorStats = useMemo(() => {
    return buildModelVendorStats(models, t("common.other"));
  }, [models, t]);
  const isModelFilterActive = Boolean(searchFilter.trim()) || selectedModelVendor !== "all";

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-neutral-800">
        <div className="flex items-center gap-2.5">
          <Layers size={15} className="text-slate-500 dark:text-white/40" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t("apikey_lookup.available_models")}
          </h3>
          <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-bold tabular-nums text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-300">
            {filteredModels.length}
          </span>
          {isModelFilterActive && filteredModels.length !== models.length ? (
            <span className="text-2xs text-slate-400 dark:text-white/30">/ {models.length}</span>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <TextInput
            value={searchFilter}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={t("models_page.search")}
            className="!w-48"
            startAdornment={<Search size={14} className="text-slate-400 dark:text-white/35" />}
          />
        </div>
      </div>

      {vendorStats.length > 0 ? (
        <div
          className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-2.5 dark:border-neutral-800/60"
          aria-label={t("apikey_lookup.available_models")}
        >
          <button
            type="button"
            aria-label={`${t("common.all", { defaultValue: "All" })} ${models.length}`}
            aria-pressed={selectedModelVendor === "all"}
            onClick={() => setSelectedModelVendor("all")}
            className={[
              "inline-flex items-center gap-1.5 rounded-md border border-slate-200/70 bg-white px-2 py-0.5 text-2xs font-semibold text-slate-600 transition hover:shadow-sm dark:border-neutral-700/60 dark:bg-neutral-900 dark:text-white/70",
              selectedModelVendor === "all"
                ? "ring-2 ring-indigo-500/35 ring-offset-1 ring-offset-white dark:ring-indigo-300/40 dark:ring-offset-neutral-950"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <Layers size={12} aria-hidden="true" />
            {t("common.all", { defaultValue: "All" })}
            <span className="tabular-nums">{models.length}</span>
          </button>
          {vendorStats.map((stat) => (
            <ModelVendorStatBadge
              key={stat.key}
              vendorKey={stat.key}
              label={stat.label}
              count={stat.count}
              active={selectedModelVendor === stat.key}
              onClick={() => setSelectedModelVendor(stat.key)}
            />
          ))}
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-rose-100 bg-rose-50 px-5 py-2.5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
          {error}
        </div>
      ) : null}

      <ScrollArea
        className="[&_[data-scroll-area-scrollbar='y']]:right-1"
        viewportClassName="max-h-[480px]"
        contentClassName="px-5 py-4 pr-8"
        scrollbarVisibility="track-hover"
        scrollbarTrackInset={4}
        data-testid="apikey-lookup-models-scroll-area"
      >
        {loading && models.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-sm text-slate-500 dark:text-white/50">
            <RefreshCw size={14} className="mr-2 animate-spin" />
            {t("models_page.loading")}
          </div>
        ) : filteredModels.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {filteredModels.map((id) => (
              <CopyableModelTag
                key={id}
                id={id}
                title={t("apikey_lookup.copy_model")}
                copiedLabel={t("common.copied")}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-white/30">
            <Layers size={28} className="mb-2 opacity-40" />
            <p className="text-sm">
              {models.length === 0 ? t("common.no_model_data") : t("models_page.no_results")}
            </p>
          </div>
        )}
      </ScrollArea>
    </Card>
  );
}
