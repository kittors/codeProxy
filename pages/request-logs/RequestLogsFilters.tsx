import { useTranslation } from "react-i18next";
import { useMemo } from "react";
import { RotateCcw } from "lucide-react";
import { SearchableCheckboxMultiSelect } from "@code-proxy/ui";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import { cn } from "@code-proxy/ui";

type StatusFilterValue = "success" | "failed";
type MultiSelectFilterState<T extends string = string> = T[] | null;

interface RequestLogsFiltersProps {
  keyOptions: SearchableCheckboxMultiSelectOption[];
  modelOptions: SearchableCheckboxMultiSelectOption[];
  channelOptions: SearchableCheckboxMultiSelectOption[];
  statusOptions: SearchableCheckboxMultiSelectOption[];
  selectedApiKeys: MultiSelectFilterState<string>;
  selectedModels: MultiSelectFilterState<string>;
  selectedChannels: MultiSelectFilterState<string>;
  selectedStatuses: MultiSelectFilterState<StatusFilterValue>;
  onApiKeysChange: (value: string[]) => void;
  onModelsChange: (value: string[]) => void;
  onChannelsChange: (value: string[]) => void;
  onStatusesChange: (value: StatusFilterValue[]) => void;
  onResetFilters: () => void;
  hasActiveFilters: boolean;
}

export function RequestLogsFilters({
  keyOptions,
  modelOptions,
  channelOptions,
  statusOptions,
  selectedApiKeys,
  selectedModels,
  selectedChannels,
  selectedStatuses,
  onApiKeysChange,
  onModelsChange,
  onChannelsChange,
  onStatusesChange,
  onResetFilters,
  hasActiveFilters,
}: RequestLogsFiltersProps) {
  const { t } = useTranslation();

  const statusChangeAdapter = useMemo(
    () => (value: string[]) => onStatusesChange(value as StatusFilterValue[]),
    [onStatusesChange],
  );

  return (
    <div className="border-t border-slate-100 px-5 py-3 dark:border-neutral-800/60">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-full min-[480px]:w-auto sm:w-[180px]">
          <SearchableCheckboxMultiSelect
            value={selectedApiKeys ?? []}
            onChange={onApiKeysChange}
            options={keyOptions}
            placeholder={t("request_logs.all_keys_placeholder")}
            searchPlaceholder={t("request_logs.search_keys")}
            selectFilteredLabel={t("request_logs.select_filtered")}
            deselectFilteredLabel={t("request_logs.deselect_filtered")}
            selectedCountLabel={(count: number) => t("request_logs.selected_count", { count })}
            noResultsLabel={t("request_logs.no_filter_results")}
            aria-label={t("request_logs.filter_key")}
            clearLabel={t("request_logs.clear_key_filter")}
            showClearButton
            size="sm"
            emptyValueMeansAllSelected
            emptyValueRepresentsAllSelected={selectedApiKeys === null}
            showFilteredToggleWithoutQuery={false}
            applyMode="manual"
            applyLabel={t("request_logs.apply_filters")}
            cancelLabel={t("common.cancel")}
            selectAllLabel={t("request_logs.select_all")}
            deselectAllLabel={t("request_logs.deselect_all")}
            emptySelectionLabel={t("request_logs.none_selected")}
          />
        </div>
        <div className="w-full min-[480px]:w-auto sm:w-[200px]">
          <SearchableCheckboxMultiSelect
            value={selectedModels ?? []}
            onChange={onModelsChange}
            options={modelOptions}
            placeholder={t("request_logs.all_models_placeholder")}
            searchPlaceholder={t("request_logs.search_models")}
            selectFilteredLabel={t("request_logs.select_filtered")}
            deselectFilteredLabel={t("request_logs.deselect_filtered")}
            selectedCountLabel={(count: number) => t("request_logs.selected_count", { count })}
            noResultsLabel={t("request_logs.no_filter_results")}
            aria-label={t("request_logs.filter_model")}
            clearLabel={t("request_logs.clear_model_filter")}
            showClearButton
            size="sm"
            emptyValueMeansAllSelected
            emptyValueRepresentsAllSelected={selectedModels === null}
            showFilteredToggleWithoutQuery={false}
            applyMode="manual"
            applyLabel={t("request_logs.apply_filters")}
            cancelLabel={t("common.cancel")}
            selectAllLabel={t("request_logs.select_all")}
            deselectAllLabel={t("request_logs.deselect_all")}
            emptySelectionLabel={t("request_logs.none_selected")}
          />
        </div>
        <div className="w-full min-[480px]:w-auto sm:w-[180px]">
          <SearchableCheckboxMultiSelect
            value={selectedChannels ?? []}
            onChange={onChannelsChange}
            options={channelOptions}
            placeholder={t("request_logs.all_channels_placeholder")}
            searchPlaceholder={t("request_logs.search_channels")}
            selectFilteredLabel={t("request_logs.select_filtered")}
            deselectFilteredLabel={t("request_logs.deselect_filtered")}
            selectedCountLabel={(count: number) => t("request_logs.selected_count", { count })}
            noResultsLabel={t("request_logs.no_filter_results")}
            aria-label={t("request_logs.filter_channel")}
            clearLabel={t("request_logs.clear_channel_filter")}
            showClearButton
            size="sm"
            emptyValueMeansAllSelected
            emptyValueRepresentsAllSelected={selectedChannels === null}
            showFilteredToggleWithoutQuery={false}
            applyMode="manual"
            applyLabel={t("request_logs.apply_filters")}
            cancelLabel={t("common.cancel")}
            selectAllLabel={t("request_logs.select_all")}
            deselectAllLabel={t("request_logs.deselect_all")}
            emptySelectionLabel={t("request_logs.none_selected")}
          />
        </div>
        <div className="w-full min-[480px]:w-auto sm:w-[150px]">
          <SearchableCheckboxMultiSelect
            value={selectedStatuses ?? []}
            onChange={statusChangeAdapter}
            options={statusOptions}
            placeholder={t("request_logs.all_status")}
            searchPlaceholder=""
            selectFilteredLabel={t("request_logs.select_filtered")}
            deselectFilteredLabel={t("request_logs.deselect_filtered")}
            selectedCountLabel={(count: number) => `${count}`}
            noResultsLabel={t("request_logs.no_filter_results")}
            aria-label={t("request_logs.filter_status")}
            clearLabel={t("request_logs.clear_status_filter")}
            showClearButton
            size="sm"
            emptyValueMeansAllSelected
            emptyValueRepresentsAllSelected={selectedStatuses === null}
            showFilteredToggleWithoutQuery={false}
            applyMode="manual"
            applyLabel={t("request_logs.apply_filters")}
            cancelLabel={t("common.cancel")}
            selectAllLabel={t("request_logs.select_all")}
            deselectAllLabel={t("request_logs.deselect_all")}
            emptySelectionLabel={t("request_logs.none_selected")}
          />
        </div>

        {/* Reset filters button */}
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={onResetFilters}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium",
              "text-slate-500 hover:text-slate-700 hover:bg-slate-100",
              "dark:text-white/50 dark:hover:text-white/80 dark:hover:bg-white/10",
              "transition-colors",
            )}
          >
            <RotateCcw size={12} aria-hidden="true" />
            {t("request_logs.reset_filters")}
          </button>
        ) : null}
      </div>
    </div>
  );
}
