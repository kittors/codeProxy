import { useTranslation } from "react-i18next";
import { Loader2, RefreshCw, ScrollText } from "lucide-react";
import {
  Button,
  DataTable,
  Modal,
  SearchableSelect,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import {
  RequestLogsPaginationBar,
  RequestLogsTimeRangeSelector,
  RequestLogUsageMetricValue,
  type RequestLogsRow,
  type RequestLogsTableColumn,
  type TimeRange,
} from "@features/request-log-viewer";
import type { ApiKeyUsageSummary } from "../types";

type StatusFilter = "" | "success" | "failed";

export function ApiKeyUsageModal({
  open,
  onClose,
  usageViewName,
  maskedKey,
  usageTotalCount,
  usageSummary,
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
  usageSummary: ApiKeyUsageSummary;
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
  const metricLabel = "text-2xs text-ink-3";
  const metricValue = "mt-0.5 font-mono text-base font-semibold tabular-nums text-ink";
  const summaryCard = "rounded-2xl bg-subtle px-4 py-3";

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
      icon={<ScrollText />}
      // 日志表格最少 1320px 宽（时间、Key、模型、渠道、Token、耗时、费用、状态……），
      // 标准档位最宽 1152px 会把后几列挤到横向滚动里，所以保留接近整屏的宽度。
      maxWidth="max-w-[min(96vw,1600px)]"
      bodyHeightClassName="h-[80vh]"
      // 只有筛选与分页，没有要保存的内容：点遮罩直接关闭。
      dirty={false}
    >
      <div className="flex h-full flex-col">
        {/* 筛选条：时间范围和四个筛选并排，右侧是更新时间与刷新。各段之间靠留白分开，不画分隔线。 */}
        <div className="flex flex-wrap items-center gap-2 pb-3">
          <RequestLogsTimeRangeSelector value={usageTimeRange} onChange={setUsageTimeRange} />
          <div className="grid w-full gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center">
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
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-ink-3">{usageLastUpdatedText}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchUsageLogs(1, usagePageSize)}
              disabled={usageLoading}
              aria-busy={usageLoading}
              aria-label={t("request_logs.refresh")}
              title={t("request_logs.refresh")}
            >
              <RefreshCw
                size={14}
                className={
                  usageLoading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""
                }
              />
            </Button>
          </div>
        </div>

        <div
          data-testid="api-key-usage-summary"
          className="grid gap-2 py-3 md:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]"
        >
          <section aria-label={t("api_keys_page.usage_summary_tokens")} className={summaryCard}>
            <div className="text-xs font-medium text-ink-2">
              {t("api_keys_page.usage_summary_tokens")}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-3">
              {(
                [
                  ["col_input", usageSummary.inputTokens, "usage_summary_current_page"],
                  ["col_output", usageSummary.outputTokens, "usage_summary_current_page"],
                  ["col_total_token", usageSummary.totalTokens, "usage_summary_filtered"],
                ] as const
              ).map(([labelKey, value, scopeKey]) => (
                <div key={labelKey} className="min-w-0">
                  <div className={metricLabel}>{t(`api_keys_page.${labelKey}`)}</div>
                  <RequestLogUsageMetricValue value={value} compact className={metricValue} />
                  <div className={`mt-0.5 ${metricLabel}`}>{t(`api_keys_page.${scopeKey}`)}</div>
                </div>
              ))}
            </div>
          </section>

          <section aria-label={t("api_keys_page.usage_summary_requests")} className={summaryCard}>
            <div className="text-xs font-medium text-ink-2">
              {t("api_keys_page.usage_summary_requests")}
            </div>
            <RequestLogUsageMetricValue
              value={usageSummary.requestCount}
              compact
              className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink"
            />
            <div className={`mt-0.5 ${metricLabel}`}>{t("api_keys_page.usage_summary_filtered")}</div>
          </section>

          <section
            aria-label={t("api_keys_page.usage_summary_success_rate")}
            className={summaryCard}
          >
            <div className="text-xs font-medium text-ink-2">
              {t("api_keys_page.usage_summary_success_rate")}
            </div>
            <div className="mt-2 font-mono text-xl font-semibold tabular-nums text-ink colorful:text-emerald-700 colorful:dark:text-emerald-300">
              {usageSummary.successRate.toFixed(1)}%
            </div>
            <div className={`mt-0.5 ${metricLabel}`}>{t("api_keys_page.usage_summary_filtered")}</div>
          </section>
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
          {/* 没有数据时表格自己画骨架行；已有数据再刷新时，盖一层淡色遮罩说明正在更新。 */}
          {usageLoading && usageRows.length > 0 ? (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-elevated/60">
              <div className="inline-flex items-center gap-2 rounded-full bg-elevated px-3 py-1.5 text-sm font-medium text-ink-2 shadow-pop">
                <Loader2
                  size={14}
                  className="motion-reduce:animate-none motion-safe:animate-spin"
                  aria-hidden="true"
                />
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
