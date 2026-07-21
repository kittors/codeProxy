import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { DataTable, Modal, SearchableSelect, type SearchableSelectOption } from "@code-proxy/ui";
import {
  RequestLogsPaginationBar,
  RequestLogsTimeRangeSelector,
  type RequestLogsRow,
  type RequestLogsTableColumn,
  type TimeRange,
} from "@features/request-log-viewer";

type StatusFilter = "" | "success" | "failed";

export function ApiKeyUsageModal({
  open,
  onClose,
  usageViewName,
  maskedKey,
  usageTotalCount,
  usageTimeRange,
  setUsageTimeRange,
  fetchUsageLogs,
  usagePageSize,
  usageLoading,
  usageLastUpdatedText,
  usageKeyQuery,
  setUsageKeyQuery,
  usageKeyOptions,
  usageChannelQuery,
  setUsageChannelQuery,
  usageChannelOptions,
  usageModelQuery,
  setUsageModelQuery,
  usageModelOptions,
  usageStatusFilter,
  setUsageStatusFilter,
  usageStatusOptions,
  usageLogColumns,
  usageRows,
  usageCurrentPage,
  usageTotalPages,
  setUsagePageSize,
}: {
  open: boolean;
  onClose: () => void;
  usageViewName: string;
  maskedKey: string;
  usageTotalCount: number;
  usageTimeRange: TimeRange;
  setUsageTimeRange: (value: TimeRange) => void;
  fetchUsageLogs: (page: number, size: number) => Promise<void>;
  usagePageSize: number;
  usageLoading: boolean;
  usageLastUpdatedText: string;
  usageKeyQuery: string;
  setUsageKeyQuery: (value: string) => void;
  usageKeyOptions: SearchableSelectOption[];
  usageChannelQuery: string;
  setUsageChannelQuery: (value: string) => void;
  usageChannelOptions: SearchableSelectOption[];
  usageModelQuery: string;
  setUsageModelQuery: (value: string) => void;
  usageModelOptions: SearchableSelectOption[];
  usageStatusFilter: StatusFilter;
  setUsageStatusFilter: (value: StatusFilter) => void;
  usageStatusOptions: SearchableSelectOption[];
  usageLogColumns: RequestLogsTableColumn<RequestLogsRow>[];
  usageRows: RequestLogsRow[];
  usageCurrentPage: number;
  usageTotalPages: number;
  setUsagePageSize: (size: number) => void;
}) {
  const { t } = useTranslation();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("api_keys_page.usage_title", { name: usageViewName })}
      description={
        open
          ? t("api_keys_page.usage_desc", {
              key: maskedKey,
              count: usageTotalCount,
            })
          : ""
      }
      maxWidth="max-w-[min(96vw,1600px)]"
      bodyHeightClassName="h-[80vh]"
    >
      <div className="flex h-full flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-1 pb-3 dark:border-neutral-800/60">
          <div className="flex flex-wrap items-center gap-2">
            <RequestLogsTimeRangeSelector value={usageTimeRange} onChange={setUsageTimeRange} />
            <button
              type="button"
              onClick={() => void fetchUsageLogs(1, usagePageSize)}
              disabled={usageLoading}
              aria-busy={usageLoading}
              aria-label={t("request_logs.refresh")}
              title={t("request_logs.refresh")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200 dark:focus-visible:ring-white/15"
            >
              <RefreshCw
                size={14}
                className={
                  usageLoading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""
                }
              />
            </button>
          </div>
          <span className="text-xs text-slate-400 dark:text-white/40">{usageLastUpdatedText}</span>
        </div>

        <div className="grid gap-2 border-b border-slate-100 py-3 dark:border-neutral-800/60 sm:flex sm:flex-wrap sm:items-center">
          <SearchableSelect
            value={usageKeyQuery}
            onChange={setUsageKeyQuery}
            options={usageKeyOptions}
            placeholder={t("request_logs.all_keys_placeholder")}
            searchPlaceholder={t("request_logs.search_keys")}
            aria-label={t("request_logs.filter_key")}
            className="w-full sm:w-[220px]"
            size="sm"
            dropdownMinWidth={300}
          />
          <SearchableSelect
            value={usageChannelQuery}
            onChange={setUsageChannelQuery}
            options={usageChannelOptions}
            placeholder={t("request_logs.all_channels_placeholder")}
            searchPlaceholder={t("request_logs.search_channels")}
            aria-label={t("request_logs.filter_channel")}
            className="w-full sm:w-auto"
            size="sm"
          />
          <SearchableSelect
            value={usageModelQuery}
            onChange={setUsageModelQuery}
            options={usageModelOptions}
            placeholder={t("request_logs.all_models_placeholder")}
            searchPlaceholder={t("request_logs.search_models")}
            aria-label={t("request_logs.filter_model")}
            className="w-full sm:w-auto"
            size="sm"
          />
          <SearchableSelect
            value={usageStatusFilter}
            onChange={(value) => setUsageStatusFilter(value as StatusFilter)}
            options={usageStatusOptions}
            placeholder={t("request_logs.all_status")}
            searchPlaceholder={t("request_logs.all_status")}
            aria-label={t("request_logs.filter_status")}
            className="w-full sm:w-auto"
            size="sm"
          />
        </div>

        <div className="relative min-h-[320px] flex-1 overflow-hidden pt-3">
          <DataTable
            tableId="api-key-usage-logs"
            rows={usageRows}
            columns={usageLogColumns}
            rowKey={(row) => row.id}
            loading={usageLoading}
            virtualize={false}
            minWidth="min-w-[1320px]"
            height="h-full"
            minHeight="min-h-full"
            caption={t("api_keys_page.usage_table_caption")}
            emptyText={t("api_keys_page.no_usage_records")}
            showAllLoadedMessage={false}
          />
          {usageLoading ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-b-2xl bg-white/70 backdrop-blur-sm dark:bg-neutral-950/55">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/85 px-3 py-2 text-sm font-medium text-slate-700 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-white/75">
                <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-900 motion-reduce:animate-none motion-safe:animate-spin dark:border-white/20 dark:border-t-white/80" />
                <span role="status">{t("common.loading_ellipsis")}</span>
              </div>
            </div>
          ) : null}
        </div>

        <RequestLogsPaginationBar
          currentPage={usageCurrentPage}
          totalPages={usageTotalPages}
          totalCount={usageTotalCount}
          pageSize={usagePageSize}
          onPageChange={(page) => void fetchUsageLogs(page, usagePageSize)}
          onPageSizeChange={(size) => {
            setUsagePageSize(size);
            void fetchUsageLogs(1, size);
          }}
        />
      </div>
    </Modal>
  );
}
