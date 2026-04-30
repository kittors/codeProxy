import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Modal } from "@/modules/ui/Modal";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";
import { Select } from "@/modules/ui/Select";
import { TableCellOverflowTooltip } from "@/modules/ui/TableCellOverflowTooltip";
import {
  RequestLogsPaginationBar,
  RequestLogsTimeRangeSelector,
  type RequestLogsRow,
  type RequestLogsTableColumn,
  type TimeRange,
} from "@/modules/monitor/requestLogsShared";

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
  usageChannelGroupQuery,
  setUsageChannelGroupQuery,
  setUsageChannelQuery,
  usageChannelGroupOptions,
  usageChannelQuery,
  setUsageChannelQueryDirect,
  usageChannelOptions,
  usageModelQuery,
  setUsageModelQuery,
  usageModelOptions,
  usageStatusFilter,
  setUsageStatusFilter,
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
  usageChannelGroupQuery: string;
  setUsageChannelGroupQuery: (value: string) => void;
  setUsageChannelQuery: (value: string) => void;
  usageChannelGroupOptions: Array<{ value: string; label: string }>;
  usageChannelQuery: string;
  setUsageChannelQueryDirect: (value: string) => void;
  usageChannelOptions: Array<{ value: string; label: string }>;
  usageModelQuery: string;
  setUsageModelQuery: (value: string) => void;
  usageModelOptions: Array<{ value: string; label: string }>;
  usageStatusFilter: StatusFilter;
  setUsageStatusFilter: (value: StatusFilter) => void;
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
                className={usageLoading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""}
              />
            </button>
          </div>
          <span className="text-xs text-slate-400 dark:text-white/40">{usageLastUpdatedText}</span>
        </div>

        <div className="grid gap-2 border-b border-slate-100 py-3 dark:border-neutral-800/60 sm:flex sm:flex-wrap sm:items-center">
          <SearchableSelect
            value={usageChannelGroupQuery}
            onChange={(value) => {
              setUsageChannelGroupQuery(value);
              setUsageChannelQuery("");
            }}
            options={usageChannelGroupOptions}
            placeholder={t("api_keys_page.all_channel_groups")}
            searchPlaceholder={t("api_keys_page.search_channel_groups")}
            aria-label={t("api_keys_page.filter_channel_group")}
            className="w-full sm:w-auto"
          />
          <SearchableSelect
            value={usageChannelQuery}
            onChange={setUsageChannelQueryDirect}
            options={usageChannelOptions}
            placeholder={t("request_logs.all_channels_placeholder")}
            searchPlaceholder={t("request_logs.search_channels")}
            aria-label={t("request_logs.filter_channel")}
            className="w-full sm:w-auto"
          />
          <SearchableSelect
            value={usageModelQuery}
            onChange={setUsageModelQuery}
            options={usageModelOptions}
            placeholder={t("request_logs.all_models_placeholder")}
            searchPlaceholder={t("request_logs.search_models")}
            aria-label={t("request_logs.filter_model")}
            className="w-full sm:w-auto"
          />
          <Select
            value={usageStatusFilter}
            onChange={(value) => setUsageStatusFilter(value as StatusFilter)}
            options={[
              { value: "", label: t("request_logs.all_status") },
              { value: "success", label: t("request_logs.status_success") },
              { value: "failed", label: t("request_logs.status_failed") },
            ]}
            aria-label={t("request_logs.filter_status")}
            className="w-full sm:w-auto"
          />
        </div>

        <div className="relative min-h-[320px] flex-1 overflow-hidden pt-3">
          <div className="h-full overflow-auto">
            <table className="w-full min-w-[1320px] table-fixed border-separate border-spacing-0 text-sm">
              <caption className="sr-only">{t("api_keys_page.usage_table_caption")}</caption>
              <thead className="sticky top-0 z-10">
                <tr className="text-left text-xs font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-white/55">
                  {usageLogColumns.map((col, index) => {
                    const isFirst = index === 0;
                    const isLast = index === usageLogColumns.length - 1;
                    const roundCls = [
                      isFirst ? "first:rounded-l-xl" : "",
                      isLast ? "last:rounded-r-xl" : "",
                    ]
                      .filter(Boolean)
                      .join(" ");
                    return (
                      <th
                        key={col.key}
                        className={`whitespace-nowrap bg-slate-100 px-4 py-3 dark:bg-neutral-800 ${col.width ?? ""} ${col.headerClassName ?? ""} ${roundCls}`}
                      >
                        {col.label}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="text-slate-900 dark:text-white">
                {!usageLoading && usageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={usageLogColumns.length}
                      className="px-4 py-12 text-center text-sm text-slate-600 dark:text-white/70"
                    >
                      {t("api_keys_page.no_usage_records")}
                    </td>
                  </tr>
                ) : (
                  usageRows.map((row, rowIndex) => (
                    <tr
                      key={row.id}
                      className="text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/[0.04]"
                      style={{ height: 44 }}
                    >
                      {usageLogColumns.map((col, colIndex) => {
                        const isFirst = colIndex === 0;
                        const isLast = colIndex === usageLogColumns.length - 1;
                        const roundCls = [
                          isFirst ? "first:rounded-l-lg" : "",
                          isLast ? "last:rounded-r-lg" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                        return (
                          <td
                            key={col.key}
                            className={`px-4 py-2.5 align-middle ${col.cellClassName ?? ""} ${roundCls}`}
                          >
                            <TableCellOverflowTooltip className={col.cellClassName}>
                              {col.render(row, rowIndex)}
                            </TableCellOverflowTooltip>
                          </td>
                        );
                      })}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

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
