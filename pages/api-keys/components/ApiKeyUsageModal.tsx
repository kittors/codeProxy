import { useTranslation } from "react-i18next";
import { RefreshCw, ScrollText } from "lucide-react";
import { useMemo } from "react";
import {
  Button,
  Modal,
  SearchableSelect,
  useGridPreferences,
  type DataGridColumn,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import {
  REQUEST_LOG_GRID_IDS,
  RequestLogGrid,
  RequestLogsTimeRangeSelector,
  RequestLogUsageMetricValue,
  type RequestLogsRow,
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
  usageLogColumns: DataGridColumn<RequestLogsRow>[];
  usageRows: RequestLogsRow[];
  usageCurrentPage: number;
  setUsagePageSize: (size: number) => void;
}) {
  const { t } = useTranslation();
  const metricLabel = "text-2xs text-ink-3";
  const metricValue = "mt-0.5 font-mono text-base font-semibold tabular-nums text-ink";
  const summaryCard = "rounded-2xl bg-subtle px-4 py-3";
  const defaultHidden = useMemo(
    () => usageLogColumns.filter((column) => column.defaultHidden).map((column) => column.id),
    [usageLogColumns],
  );
  const prefs = useGridPreferences(REQUEST_LOG_GRID_IDS.keyUsage, { hidden: defaultHidden });
  // 弹窗自己的四个筛选不在列上：「无匹配」空状态把它们写成条件，「清除筛选」一并重置。
  const optionText = (options: SearchableSelectOption[], value: string) => {
    const option = options.find((item) => item.value === value);
    return typeof option?.label === "string" ? option.label : (option?.searchText ?? value);
  };
  const activeFilterLabels = [
    usageKeyQuery ? `Key：${optionText(usageKeyOptions, usageKeyQuery)}` : "",
    usageChannelQuery
      ? `${t("request_logs.col_channel")}：${optionText(usageChannelOptions, usageChannelQuery)}`
      : "",
    usageModelQuery ? `${t("request_logs.col_model")}：${usageModelQuery}` : "",
    usageStatusFilter
      ? `${t("request_logs.col_status")}：${optionText(usageStatusOptions, usageStatusFilter)}`
      : "",
  ].filter(Boolean);

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

        {/* 表格铺满弹窗剩余高度：加载、空、行少行多同一个框，分页固定在框底。
            弹窗本身就是面板，表格不再套一层卡片外框。 */}
        <div className="flex min-h-0 flex-1 flex-col pt-1">
          <RequestLogGrid
            id={REQUEST_LOG_GRID_IDS.keyUsage}
            label={t("api_keys_page.usage_table_caption")}
            frame={false}
            columns={usageLogColumns}
            rows={usageRows}
            loading={usageLoading}
            filters={{}}
            extraFilterLabels={activeFilterLabels}
            onClearFilters={() => {
              setUsageKeyQuery("");
              setUsageChannelQuery("");
              setUsageModelQuery("");
              setUsageStatusFilter("");
            }}
            prefs={prefs}
            masked={false}
            page={usageCurrentPage}
            pageSize={usagePageSize}
            total={usageTotalCount}
            pending={usageLoading && usageRows.length === 0 && usageTotalCount === 0}
            onPageChange={(page) => void fetchUsageLogs(page, usagePageSize)}
            onPageSizeChange={(size) => {
              setUsagePageSize(size);
              void fetchUsageLogs(1, size);
            }}
            resetScrollKey={`${usageCurrentPage}|${usagePageSize}|${activeFilterLabels.join("|")}|${usageTimeRange}`}
            noDataTitle={t("api_keys_page.no_usage_records")}
          />
        </div>
      </div>
    </Modal>
  );
}
