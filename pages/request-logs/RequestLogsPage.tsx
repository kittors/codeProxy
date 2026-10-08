import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, ScrollText, Trash2 } from "lucide-react";
import { configApi, usageApi } from "@code-proxy/api-client";
import type {
  ClearUsageLogsPayload,
  UsageChannelFilterOption,
  UsageLogItem,
  UsageLogsResponse,
} from "@code-proxy/api-client/endpoints/usage";
import {
  formatUsageMetricNumber,
  formatUsageMetricRate,
  formatUsageMetricTooltipNumber,
  isUsageMetricCompact,
} from "@code-proxy/domain";
import {
  DataTable,
  HoverTooltip,
  MaskToggleButton,
  useSensitiveDataMasking,
  useToast,
  iconHueClass,
} from "@code-proxy/ui";
import { ErrorDetailModal, LogContentModal } from "@features/log-content-viewer";
import { ModelTag } from "@features/model-tags";
import { ClearDatabaseLogsDialog, DEFAULT_CLEAR_OPTIONS } from "./ClearDatabaseLogsDialog";
import { RequestLogsFilters } from "./RequestLogsFilters";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import {
  buildRequestLogKeyOptions,
  buildRequestLogsColumns,
  ChannelIdentityLabel,
  DEFAULT_REQUEST_LOG_PAGE_SIZE,
  hasActiveFilterSelection,
  normalizeFilterSelection,
  RequestLogFilterCount,
  RequestLogUsageMetricValue,
  RequestLogsPaginationBar,
  RequestLogsTimeRangeSelector,
  sortRequestLogKeyOptionsByCount,
  toFilterParam,
  toRequestLogsRow,
  toStatusFilterValues,
  type MultiSelectFilterState,
  type StatusFilterValue,
  type RequestLogsRow as LogRow,
  type TimeRange,
} from "@features/request-log-viewer";

const DEFAULT_LOG_STATS = {
  total: 0,
  success_rate: 0,
  total_tokens: 0,
  total_cost: 0,
  cache_rate: 0,
};

const isRequestCancelled = (err: unknown, signal?: AbortSignal) =>
  signal?.aborted || (err instanceof Error && err.message === "Request was cancelled");

function RequestLogsRecordsCount({ count }: { count: number }) {
  const { t } = useTranslation();
  const compact = isUsageMetricCompact(count);

  return (
    <HoverTooltip
      content={formatUsageMetricTooltipNumber(count)}
      disabled={!compact}
      placement="top"
      className={compact ? "cursor-help" : undefined}
    >
      <span>
        {t("request_logs.records_count", {
          count: formatUsageMetricNumber(count),
        } as Record<string, string>)}
      </span>
    </HoverTooltip>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function RequestLogsPage() {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const [masked, setMasked] = useSensitiveDataMasking();

  // Content modal state
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentModalLogId, setContentModalLogId] = useState<number | null>(null);
  const [contentModalModel, setContentModalModel] = useState("");
  const [contentModalTab, setContentModalTab] = useState<"input" | "output">("input");
  const [requestBodyStorageEnabled, setRequestBodyStorageEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void configApi
      .getRequestLogBodyStorage()
      .then((enabled) => {
        if (!cancelled) setRequestBodyStorageEnabled(enabled);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const handleContentClick = useCallback(
    (logId: number, tab: "input" | "output", model: string) => {
      setContentModalLogId(logId);
      setContentModalModel(model);
      setContentModalTab(tab);
      setContentModalOpen(true);
    },
    [],
  );

  // Error modal state
  const [errorModalOpen, setErrorModalOpen] = useState(false);
  const [errorModalLogId, setErrorModalLogId] = useState<number | null>(null);
  const [errorModalModel, setErrorModalModel] = useState("");

  const handleErrorClick = useCallback((logId: number, model: string) => {
    setErrorModalLogId(logId);
    setErrorModalModel(model);
    setErrorModalOpen(true);
  }, []);

  // Build columns with content click handler
  const logColumns = useMemo(
    () => buildRequestLogsColumns(t, handleContentClick, handleErrorClick, { masked }),
    [t, handleContentClick, handleErrorClick, masked],
  );

  // Data state (page-based, no accumulation)
  const [rawItems, setRawItems] = useState<UsageLogItem[]>([]);
  const [loading, setLoading] = useState(false);

  // Pagination state
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_REQUEST_LOG_PAGE_SIZE);

  // Backend-provided metadata
  const [filterOptions, setFilterOptions] = useState<{
    api_keys: string[];
    api_key_names: Record<string, string>;
    api_key_counts: Record<string, number>;
    models: string[];
    channels: string[];
    channel_options: UsageChannelFilterOption[];
    statuses: string[];
  }>({
    api_keys: [],
    api_key_names: {},
    api_key_counts: {},
    models: [],
    channels: [],
    channel_options: [],
    statuses: ["success", "failed"],
  });
  const [stats, setStats] = useState<{
    total: number;
    success_rate: number;
    total_tokens: number;
    total_cost: number;
    cache_rate: number;
  }>(DEFAULT_LOG_STATS);

  // Multi-value filters
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [selectedApiKeys, setSelectedApiKeys] = useState<MultiSelectFilterState<string>>(null);
  const [selectedModels, setSelectedModels] = useState<MultiSelectFilterState<string>>(null);
  const [selectedChannels, setSelectedChannels] = useState<MultiSelectFilterState<string>>(null);
  const [selectedStatuses, setSelectedStatuses] =
    useState<MultiSelectFilterState<StatusFilterValue>>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [clearOptions, setClearOptions] = useState<ClearUsageLogsPayload>(DEFAULT_CLEAR_OPTIONS);

  const requestSeqRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  // Derive display rows from raw items
  const rows = useMemo<LogRow[]>(
    () => (rawItems ?? []).map((item) => toRequestLogsRow(item)),
    [rawItems],
  );

  // Build multi-select options from backend filter data (exclude the "" "all" option)
  const keyOptions = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    const opts = buildRequestLogKeyOptions(
      filterOptions.api_keys,
      filterOptions.api_key_names ?? {},
      {
        allKeys: t("request_logs.all_users"),
        systemCall: t("request_logs.system_call"),
      },
      filterOptions.api_key_counts,
    );
    return sortRequestLogKeyOptionsByCount(opts, i18n.resolvedLanguage)
      .filter((option) => option.value !== "")
      .map((option) => ({
        value: option.value,
        label: option.label,
        searchText: option.searchText,
        trailing: <RequestLogFilterCount count={option.count} />,
      }));
  }, [
    filterOptions.api_key_counts,
    filterOptions.api_key_names,
    filterOptions.api_keys,
    i18n.resolvedLanguage,
    t,
  ]);

  const modelOptions = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    return filterOptions.models.map((m) => ({
      value: m,
      label: <ModelTag id={m} size="sm" />,
      searchText: m,
    }));
  }, [filterOptions.models]);

  const channelOptions = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    const source: UsageChannelFilterOption[] =
      filterOptions.channel_options.length > 0
        ? filterOptions.channel_options
        : filterOptions.channels.map((ch) => ({
            value: ch,
            label: ch,
          }));
    const apiLabel = t("request_logs.auth_type_api");
    const oauthLabel = t("request_logs.auth_type_oauth");
    return source.map((option) => {
      const provider = String(option.provider ?? "").trim();
      const authType = String(option.auth_type ?? "").trim();
      return {
        value: option.value,
        label: (
          <ChannelIdentityLabel
            name={option.label}
            provider={option.provider}
            authType={option.auth_type}
            apiLabel={apiLabel}
            oauthLabel={oauthLabel}
            className="w-full"
            nameClassName="text-sm font-normal text-inherit"
          />
        ),
        searchText: [option.label, provider, authType, option.value].filter(Boolean).join(" "),
        title: option.label,
      };
    });
  }, [filterOptions.channel_options, filterOptions.channels, t]);

  const statusOptions = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    return (filterOptions.statuses ?? ["success", "failed"]).map((status) => ({
      value: status,
      label:
        status === "success"
          ? t("request_logs.status_success")
          : status === "failed"
            ? t("request_logs.status_failed")
            : status,
      searchText: status,
    }));
  }, [filterOptions.statuses, t]);

  const apiKeyFilterValues = useMemo(() => keyOptions.map((option) => option.value), [keyOptions]);
  const modelFilterValues = useMemo(
    () => modelOptions.map((option) => option.value),
    [modelOptions],
  );
  const channelFilterValues = useMemo(
    () => channelOptions.map((option) => option.value),
    [channelOptions],
  );
  const statusFilterValues = useMemo<StatusFilterValue[]>(
    () => toStatusFilterValues(statusOptions.map((option) => option.value)),
    [statusOptions],
  );

  const apiKeyFilterParam = useMemo(() => toFilterParam(selectedApiKeys), [selectedApiKeys]);
  const modelFilterParam = useMemo(() => toFilterParam(selectedModels), [selectedModels]);
  const channelFilterParam = useMemo(() => toFilterParam(selectedChannels), [selectedChannels]);
  const statusFilterParam = useMemo(() => toFilterParam(selectedStatuses), [selectedStatuses]);

  const hasActiveFilters =
    hasActiveFilterSelection(selectedApiKeys, apiKeyFilterValues) ||
    hasActiveFilterSelection(selectedModels, modelFilterValues) ||
    hasActiveFilterSelection(selectedChannels, channelFilterValues) ||
    hasActiveFilterSelection(selectedStatuses, statusFilterValues);

  const handleApiKeysChange = useCallback(
    (value: string[]) => {
      setSelectedApiKeys(normalizeFilterSelection(value, apiKeyFilterValues));
    },
    [apiKeyFilterValues],
  );

  const handleModelsChange = useCallback(
    (value: string[]) => {
      setSelectedModels(normalizeFilterSelection(value, modelFilterValues));
    },
    [modelFilterValues],
  );

  const handleChannelsChange = useCallback(
    (value: string[]) => {
      setSelectedChannels(normalizeFilterSelection(value, channelFilterValues));
    },
    [channelFilterValues],
  );

  const handleStatusesChange = useCallback(
    (value: StatusFilterValue[]) => {
      setSelectedStatuses(normalizeFilterSelection(value, statusFilterValues));
    },
    [statusFilterValues],
  );

  const resetFilters = useCallback(() => {
    setSelectedApiKeys(null);
    setSelectedModels(null);
    setSelectedChannels(null);
    setSelectedStatuses(null);
  }, []);

  const clearApiKeyFilter = useCallback(() => {
    setSelectedApiKeys(null);
  }, []);

  const clearModelFilter = useCallback(() => {
    setSelectedModels(null);
  }, []);

  const clearChannelFilter = useCallback(() => {
    setSelectedChannels(null);
  }, []);

  const clearStatusFilter = useCallback(() => {
    setSelectedStatuses(null);
  }, []);

  // Fetch logs from backend (server-side pagination)
  const fetchLogs = useCallback(
    async (page: number, size: number) => {
      requestAbortRef.current?.abort();
      const controller = new AbortController();
      requestAbortRef.current = controller;
      const seq = ++requestSeqRef.current;
      setLoading(true);

      try {
        const resp: UsageLogsResponse = await usageApi.getUsageLogs(
          {
            page,
            size,
            days: timeRange,
            api_keys: apiKeyFilterParam.values,
            models: modelFilterParam.values,
            channels: channelFilterParam.values,
            statuses: statusFilterParam.values,
            api_keys_empty: apiKeyFilterParam.matchesNone,
            models_empty: modelFilterParam.matchesNone,
            channels_empty: channelFilterParam.matchesNone,
            statuses_empty: statusFilterParam.matchesNone,
          },
          { signal: controller.signal },
        );

        if (seq !== requestSeqRef.current || controller.signal.aborted) return;

        setRawItems(resp.items ?? []);
        setTotalCount(resp.total ?? 0);
        setCurrentPage(page);
        setFilterOptions({
          api_keys: resp.filters?.api_keys ?? [],
          api_key_names: resp.filters?.api_key_names ?? {},
          api_key_counts: resp.filters?.api_key_counts ?? {},
          models: resp.filters?.models ?? [],
          channels: resp.filters?.channels ?? [],
          channel_options: resp.filters?.channel_options ?? [],
          statuses: resp.filters?.statuses ?? ["success", "failed"],
        });
        setStats({
          ...DEFAULT_LOG_STATS,
          ...resp.stats,
        });
      } catch (err) {
        if (seq !== requestSeqRef.current || isRequestCancelled(err, controller.signal)) return;
        const message = err instanceof Error ? err.message : t("request_logs.refresh_failed");
        notify({ type: "error", message });
      } finally {
        if (requestAbortRef.current === controller) requestAbortRef.current = null;
        if (seq === requestSeqRef.current && !controller.signal.aborted) setLoading(false);
      }
    },
    [
      apiKeyFilterParam,
      channelFilterParam,
      modelFilterParam,
      notify,
      statusFilterParam,
      t,
      timeRange,
    ],
  );

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
      requestAbortRef.current?.abort();
    };
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handlePageChange = useCallback(
    (page: number) => {
      const clamped = Math.max(1, Math.min(page, totalPages));
      fetchLogs(clamped, pageSize);
    },
    [fetchLogs, pageSize, totalPages],
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      fetchLogs(1, newSize);
    },
    [fetchLogs],
  );

  // Fetch page 1 when filters change
  useEffect(() => {
    fetchLogs(1, pageSize);
  }, [timeRange, selectedApiKeys, selectedModels, selectedChannels, selectedStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenClearDialog = useCallback(() => {
    setClearOptions(DEFAULT_CLEAR_OPTIONS);
    setConfirmClearOpen(true);
  }, []);

  const handleClearDatabaseLogs = useCallback(async () => {
    setClearingLogs(true);
    try {
      const result = await usageApi.clearUsageLogs(clearOptions);
      await fetchLogs(1, pageSize);
      const successMessage = clearOptions.clear_request_records
        ? t("request_logs.clear_database_logs_success_records", {
            count: result.deleted_logs,
          })
        : t("request_logs.clear_database_logs_success_content");
      notify({
        type: "success",
        message: successMessage,
      });
      setConfirmClearOpen(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("request_logs.clear_database_logs_failed");
      notify({ type: "error", message });
    } finally {
      setClearingLogs(false);
    }
  }, [clearOptions, fetchLogs, notify, pageSize, t]);

  return (
    <section data-page-fill="always" className="flex flex-1 flex-col">
      <h1 className="sr-only">{t("request_logs.title")}</h1>

      {/*
        不再包一层卡片：外壳的内容区就是这一页的面板，标题、筛选、表格、分页直接落在上面。
        以前这里是「内容区 → 大卡片 → 表头灰条」三层，和其它页面叠出了太多层级。
      */}
      {/* min-h-0：flex item 默认 min-height:auto，会被表格内容撑开，把「内部滚动」变成整页变长 */}
      <div className="flex min-h-0 flex-1 flex-col">
        {/* 标题栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
              <ScrollText
                size={18}
                className={`text-ink-3 ${iconHueClass(ScrollText)}`}
                aria-hidden="true"
              />
              {t("request_logs.heading")}
            </h2>
            <div className="hidden min-[640px]:flex items-center gap-2 text-xs text-ink-3">
              <span className="text-ink-4">|</span>
              <RequestLogsRecordsCount count={stats.total} />
              <span className="text-ink-4">|</span>
              <span>
                {t("common.success_rate")}{" "}
                <span className="font-mono tabular-nums text-ink">
                  {stats.success_rate.toFixed(1)}%
                </span>
              </span>
              <span className="text-ink-4">|</span>
              <span>
                {t("request_logs.col_total_token")}{" "}
                <span className="font-mono tabular-nums text-ink">
                  <RequestLogUsageMetricValue value={stats.total_tokens} compact />
                </span>
              </span>
              <span className="text-ink-4">|</span>
              <span>
                {t("request_logs.col_cost")}{" "}
                <span className="font-mono tabular-nums text-ink">
                  <RequestLogUsageMetricValue value={stats.total_cost} variant="currency" compact />
                </span>
              </span>
              <span className="text-ink-4">|</span>
              <span>
                {t("request_logs.cache_rate")}{" "}
                <span className="font-mono tabular-nums text-ink">
                  {formatUsageMetricRate(stats.cache_rate)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RequestLogsTimeRangeSelector value={timeRange} onChange={setTimeRange} />
            <MaskToggleButton
              masked={masked}
              onToggle={() => setMasked((prev) => !prev)}
              className="h-9 w-9"
            />
            <button
              type="button"
              onClick={handleOpenClearDialog}
              disabled={loading || clearingLogs}
              aria-label={t("request_logs.clear_database_logs")}
              title={t("request_logs.clear_database_logs")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-rose-600 transition-colors hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-rose-400"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => fetchLogs(1, pageSize)}
              disabled={loading}
              aria-busy={loading}
              aria-label={t("request_logs.refresh")}
              title={t("request_logs.refresh")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface text-ink shadow-control transition-[background-color,box-shadow] hover:bg-surface-hover hover:shadow-control-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              <RefreshCw
                size={14}
                className={loading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* 筛选 */}
        <RequestLogsFilters
          keyOptions={keyOptions}
          modelOptions={modelOptions}
          channelOptions={channelOptions}
          statusOptions={statusOptions}
          selectedApiKeys={selectedApiKeys}
          selectedModels={selectedModels}
          selectedChannels={selectedChannels}
          selectedStatuses={selectedStatuses}
          onApiKeysChange={handleApiKeysChange}
          onModelsChange={handleModelsChange}
          onChannelsChange={handleChannelsChange}
          onStatusesChange={handleStatusesChange}
          onApiKeysClear={clearApiKeyFilter}
          onModelsClear={clearModelFilter}
          onChannelsClear={clearChannelFilter}
          onStatusesClear={clearStatusFilter}
          onResetFilters={resetFilters}
          hasActiveFilters={hasActiveFilters}
        />

        {/*
          表格区域 — 吃掉卡片里剩下的高度，内部滚动。
          用 flex-1 而不是 h-[calc(100dvh-300px)]：那个 300 是标题栏 + 筛选区 + 分页条的
          手工累加，筛选区换行、字号或密度一变就对不上，表格要么矮一截、下面空一块滚不动，
          要么高出去把分页顶掉。
          min-h-0 覆盖 flex item 默认的 min-height:auto（否则表格会被内容撑开，整页变长而不是
          内部滚动）。这里不能写 min-h-[360px] 之类的保底：卡片本身是 min-h-0、高度被窗口钉死，
          窗口一矮，保底高度只会把表格和分页条挤出卡片边框之外，而不是让页面滚动。
        */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <DataTable
            tableId="request-logs"
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
            emptyDescription={t("request_logs.no_data_desc")}
            emptyIcon={<ScrollText size={20} strokeWidth={1.5} aria-hidden />}
            showAllLoadedMessage={false}
          />

          {/* Loading overlay */}
          {loading ? (
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

        {/* 分页控件 — flex-shrink-0 固定在底部 */}
        <RequestLogsPaginationBar
          flush
          currentPage={currentPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={pageSize}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
        />
      </div>

      <LogContentModal
        open={contentModalOpen}
        logId={contentModalLogId}
        displayModel={contentModalModel}
        initialTab={contentModalTab}
        onClose={() => setContentModalOpen(false)}
        showRequestDetails
        showBodyContent={requestBodyStorageEnabled}
      />
      <ErrorDetailModal
        open={errorModalOpen}
        logId={errorModalLogId}
        model={errorModalModel}
        onClose={() => setErrorModalOpen(false)}
      />
      <ClearDatabaseLogsDialog
        open={confirmClearOpen}
        options={clearOptions}
        busy={clearingLogs}
        onOptionsChange={setClearOptions}
        onConfirm={() => void handleClearDatabaseLogs()}
        onClose={() => {
          if (!clearingLogs) setConfirmClearOpen(false);
        }}
      />
    </section>
  );
}
