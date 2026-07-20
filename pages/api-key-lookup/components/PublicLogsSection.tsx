import { Filter } from "lucide-react";
import { Card } from "@code-proxy/ui";
import { Reveal } from "@code-proxy/ui";
import { DataTable, type DataTableColumn } from "@code-proxy/ui";
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
  statusOptions,
  modelOptions,
  selectedModels,
  selectedStatuses,
  onModelsChange,
  onStatusesChange,
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
  modelOptions: SearchableCheckboxMultiSelectOption[];
  statusOptions: SearchableCheckboxMultiSelectOption[];
  selectedModels: MultiSelectFilterState<string>;
  selectedStatuses: MultiSelectFilterState<StatusFilterValue>;
  onModelsChange: (value: string[]) => void;
  onStatusesChange: (value: StatusFilterValue[]) => void;
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
  return (
    <Reveal>
      <Card padding="none" className="overflow-hidden" bodyClassName="mt-0">
        <div className="border-b border-slate-100 px-3 py-3 sm:px-5 dark:border-neutral-800/60">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-2">
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

            <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-white/55 sm:flex sm:items-center sm:gap-1.5">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Filter size={12} aria-hidden="true" />
                <span className="font-mono tabular-nums">
                  {t("request_logs.records_count", { count: stats.total })}
                </span>
              </span>
              <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap sm:justify-start">
                {t("common.success_rate")}
                <span className="font-mono tabular-nums">
                  {stats.success_rate.toFixed(1)}%
                </span>
              </span>
              <span className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap">
                <span
                  className="text-slate-300 dark:text-white/10"
                  aria-hidden="true"
                >
                  ·
                </span>
                {t("apikey_lookup.token")}
                <span className="font-mono tabular-nums">
                  {stats.total_tokens.toLocaleString()}
                </span>
              </span>
              {lastUpdatedText ? (
                <span className="hidden sm:inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className="text-slate-300 dark:text-white/10"
                    aria-hidden="true"
                  >
                    ·
                  </span>
                  <span className="text-slate-400 dark:text-white/40">
                    {t("request_logs.updated_at", { time: lastUpdatedText })}
                  </span>
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="relative min-h-[360px] h-[calc(100dvh-300px)] overflow-hidden px-3 sm:px-5">
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
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-2xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/55">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/75">
                <span
                  className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/80"
                  aria-hidden="true"
                />
                <span role="status">{t("common.loading_ellipsis")}</span>
              </div>
            </div>
          ) : null}
        </div>

        <RequestLogsPaginationBar
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
