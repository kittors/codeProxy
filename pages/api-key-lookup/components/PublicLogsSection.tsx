import { Filter } from "lucide-react";
import { Card } from "@code-proxy/ui";
import { Reveal } from "@code-proxy/ui";
import { DataTable, type DataTableColumn } from "@code-proxy/ui";
import { SearchableCheckboxMultiSelect } from "@code-proxy/ui";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import {
  RequestLogFacetFilters,
  RequestLogsPaginationBar,
  type MultiSelectFilterState,
  type RequestLogsRow,
  type StatusFilterValue,
} from "@features/request-log-viewer";

export function PublicLogsSection({
  t,
  keyOptions = [],
  statusOptions,
  modelOptions,
  selectedApiKeyIds = null,
  selectedModels,
  selectedStatuses,
  onApiKeyIdsChange = () => {},
  onModelsChange,
  onStatusesChange,
  onApiKeyIdsClear = () => {},
  onModelsClear,
  onStatusesClear,
  stats,
  lastUpdatedText,
  loading,
  logColumns,
  rows,
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  keyOptions?: SearchableCheckboxMultiSelectOption[];
  modelOptions: SearchableCheckboxMultiSelectOption[];
  statusOptions: SearchableCheckboxMultiSelectOption[];
  selectedApiKeyIds?: MultiSelectFilterState<string>;
  selectedModels: MultiSelectFilterState<string>;
  selectedStatuses: MultiSelectFilterState<StatusFilterValue>;
  onApiKeyIdsChange?: (value: string[]) => void;
  onModelsChange: (value: string[]) => void;
  onStatusesChange: (value: StatusFilterValue[]) => void;
  onApiKeyIdsClear?: () => void;
  onModelsClear: () => void;
  onStatusesClear: () => void;
  stats: {
    total: number;
    success_rate: number;
    total_tokens: number;
    total_cost: number;
  };
  lastUpdatedText: string;
  loading: boolean;
  logColumns: DataTableColumn<RequestLogsRow>[];
  rows: RequestLogsRow[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  // 请求日志页签就是页面本身（flat）：筛选、表格、分页直接落在页面上，与控制台的请求日志页
  // 同一种结构。以前整页包在一张卡里，筛选行与表格之间再画一道分隔线。
  return (
    <Reveal>
      <Card flat bodyClassName="mt-0">
        <div className="pb-3">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-2">
              {keyOptions.length > 0 ? (
                <div className="w-full min-[480px]:w-auto sm:w-[180px]">
                  <SearchableCheckboxMultiSelect
                    value={selectedApiKeyIds ?? []}
                    onChange={onApiKeyIdsChange}
                    options={keyOptions}
                    placeholder={t("request_logs.all_keys_placeholder")}
                    searchPlaceholder={t("request_logs.search_keys")}
                    selectFilteredLabel={t("request_logs.select_filtered")}
                    deselectFilteredLabel={t("request_logs.deselect_filtered")}
                    selectedCountLabel={(count: number) =>
                      t("request_logs.selected_count", { count })
                    }
                    noResultsLabel={t("request_logs.no_filter_results")}
                    aria-label={t("request_logs.filter_key")}
                    clearLabel={t("request_logs.clear_key_filter")}
                    onClear={onApiKeyIdsClear}
                    showClearButton
                    size="sm"
                    emptyValueMeansAllSelected
                    emptyValueRepresentsAllSelected={selectedApiKeyIds === null}
                    showFilteredToggleWithoutQuery={false}
                    applyMode="manual"
                    applyLabel={t("request_logs.apply_filters")}
                    cancelLabel={t("common.cancel")}
                    neutralAllSelection
                    allSelectionLabel={t("request_logs.unrestricted")}
                    selectionHint={t("request_logs.calls_sorted_hint")}
                  />
                </div>
              ) : null}
              <RequestLogFacetFilters
                modelOptions={modelOptions}
                channelOptions={[]}
                statusOptions={statusOptions}
                selectedModels={selectedModels}
                selectedChannels={null}
                selectedStatuses={selectedStatuses}
                onModelsChange={onModelsChange}
                onChannelsChange={() => {}}
                onStatusesChange={onStatusesChange}
                onModelsClear={onModelsClear}
                onChannelsClear={() => {}}
                onStatusesClear={onStatusesClear}
                hideChannel
              />
            </div>

            <div className="hidden sm:block sm:flex-1" />

            <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 text-xs text-ink-2 sm:flex sm:items-center sm:gap-1.5">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Filter size={12} aria-hidden="true" />
                <span className="font-mono tabular-nums">
                  {t("request_logs.records_count", { count: stats.total })}
                </span>
              </span>
              <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap sm:justify-start">
                {t("common.success_rate")}
                <span className="font-mono tabular-nums">{stats.success_rate.toFixed(1)}%</span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap">
                <span className="text-ink-4" aria-hidden="true">
                  ·
                </span>
                {t("apikey_lookup.token")}
                <span className="font-mono tabular-nums">
                  {stats.total_tokens.toLocaleString()}
                </span>
              </span>
              {lastUpdatedText ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span className="text-ink-4" aria-hidden="true">
                    ·
                  </span>
                  <span className="text-ink-3">
                    {t("request_logs.updated_at", { time: lastUpdatedText })}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative min-h-[360px] h-[calc(100dvh-300px)] overflow-hidden">
          <DataTable
            tableId="apikey-lookup-request-logs"
            rows={rows}
            columns={logColumns}
            rowKey={(row) => row.id}
            loading={loading}
            virtualize={false}
            minWidth="min-w-[1240px]"
            height="h-full"
            minHeight="min-h-full"
            caption={t("request_logs.table_caption")}
            emptyText={t("request_logs.no_data")}
            showAllLoadedMessage={false}
          />
          {loading ? (
            // 与控制台请求日志页同一套加载遮罩：页面底色的半透明层 + 浮起的胶囊，不描边。
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-canvas/70 backdrop-blur-sm">
              <div className="inline-flex items-center gap-2 rounded-full bg-elevated px-3.5 py-2 text-sm font-medium text-ink-2 shadow-pop">
                <span
                  className="h-4 w-4 rounded-full border-2 border-ink/15 border-t-ink motion-reduce:animate-none motion-safe:animate-spin"
                  aria-hidden="true"
                />
                <span role="status">{t("common.loading_ellipsis")}</span>
              </div>
            </div>
          ) : null}
        </div>

        <RequestLogsPaginationBar
          flush
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      </Card>
    </Reveal>
  );
}
