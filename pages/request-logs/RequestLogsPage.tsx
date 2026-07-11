import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, ScrollText, Trash2 } from "lucide-react";
import { configApi, usageApi } from "@code-proxy/api-client";
import type {
  ClearUsageLogsPayload,
  UsageChannelFilterOption,
  UsageLogItem,
  UsageLogsResponse,
} from "@code-proxy/api-client/endpoints/usage";
import { VendorIcon } from "@code-proxy/assets";
import {
  formatUsageMetricNumber,
  formatUsageMetricRate,
  formatUsageMetricTooltipNumber,
  isUsageMetricCompact,
} from "@code-proxy/domain";
import { Button } from "@code-proxy/ui";
import { Checkbox } from "@code-proxy/ui";
import { HoverTooltip } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { DataTable } from "@code-proxy/ui";
import {
  ErrorDetailModal,
  LogContentModal,
} from "@features/log-content-viewer";
import { ModelTag } from "@features/model-tags";
import { RequestLogsFilters } from "./RequestLogsFilters";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import {
  buildRequestLogKeyOptions,
  buildRequestLogsColumns,
  DEFAULT_REQUEST_LOG_PAGE_SIZE,
  hasActiveFilterSelection,
  normalizeFilterSelection,
  RequestLogUsageMetricValue,
  RequestLogsPaginationBar,
  RequestLogsTimeRangeSelector,
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
const DEFAULT_CLEAR_OPTIONS: ClearUsageLogsPayload = {
  clear_body_content: true,
  clear_detail_content: true,
  clear_request_records: false,
};

const isRequestCancelled = (err: unknown, signal?: AbortSignal) =>
  signal?.aborted ||
  (err instanceof Error && err.message === "Request was cancelled");

function authTypeBadgeClass(authType?: string): string {
  if (authType === "api") {
    return "bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200";
  }
  if (authType === "oauth") {
    return "bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200";
  }
  return "bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/65";
}

function ChannelFilterOptionLabel({
  option,
  apiLabel,
  oauthLabel,
}: {
  option: UsageChannelFilterOption;
  apiLabel: string;
  oauthLabel: string;
}) {
  const authType = String(option.auth_type ?? "").toLowerCase();
  const badgeLabel =
    authType === "api" ? apiLabel : authType === "oauth" ? oauthLabel : "";
  const provider = String(option.provider ?? "").trim();

  return (
    <span className="flex min-w-0 items-center gap-2">
      {provider ? (
        <span className="inline-flex shrink-0 items-center" aria-hidden="true">
          <VendorIcon modelId={provider} size={14} />
        </span>
      ) : null}
      <span className="min-w-0 truncate">{option.label}</span>
      {badgeLabel ? (
        <span
          className={[
            "inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-2xs font-semibold leading-none",
            authTypeBadgeClass(authType),
          ].join(" ")}
        >
          {badgeLabel}
        </span>
      ) : null}
    </span>
  );
}

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
  const { t } = useTranslation();
  const { notify } = useToast();

  // Content modal state
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentModalLogId, setContentModalLogId] = useState<number | null>(
    null,
  );
  const [contentModalTab, setContentModalTab] = useState<"input" | "output">(
    "input",
  );
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
    (logId: number, tab: "input" | "output") => {
      setContentModalLogId(logId);
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
    () => buildRequestLogsColumns(t, handleContentClick, handleErrorClick),
    [t, handleContentClick, handleErrorClick],
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
    models: string[];
    channels: string[];
    channel_options: UsageChannelFilterOption[];
    statuses: string[];
  }>({
    api_keys: [],
    api_key_names: {},
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
  const [selectedApiKeys, setSelectedApiKeys] =
    useState<MultiSelectFilterState<string>>(null);
  const [selectedModels, setSelectedModels] =
    useState<MultiSelectFilterState<string>>(null);
  const [selectedChannels, setSelectedChannels] =
    useState<MultiSelectFilterState<string>>(null);
  const [selectedStatuses, setSelectedStatuses] =
    useState<MultiSelectFilterState<StatusFilterValue>>(null);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [clearOptions, setClearOptions] = useState<ClearUsageLogsPayload>(
    DEFAULT_CLEAR_OPTIONS,
  );

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
        allKeys: t("request_logs.all_keys"),
        systemCall: t("request_logs.system_call"),
      },
    );
    return opts.filter((option) => option.value !== "");
  }, [filterOptions.api_keys, filterOptions.api_key_names, t]);

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
          <ChannelFilterOptionLabel
            option={option}
            apiLabel={apiLabel}
            oauthLabel={oauthLabel}
          />
        ),
        searchText: [option.label, provider, authType, option.value]
          .filter(Boolean)
          .join(" "),
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

  const apiKeyFilterValues = useMemo(
    () => keyOptions.map((option) => option.value),
    [keyOptions],
  );
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

  const apiKeyFilterParam = useMemo(
    () => toFilterParam(selectedApiKeys, apiKeyFilterValues),
    [apiKeyFilterValues, selectedApiKeys],
  );
  const modelFilterParam = useMemo(
    () => toFilterParam(selectedModels, modelFilterValues),
    [modelFilterValues, selectedModels],
  );
  const channelFilterParam = useMemo(
    () => toFilterParam(selectedChannels, channelFilterValues),
    [channelFilterValues, selectedChannels],
  );
  const statusFilterParam = useMemo(
    () => toFilterParam(selectedStatuses, statusFilterValues),
    [selectedStatuses, statusFilterValues],
  );

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
        if (
          seq !== requestSeqRef.current ||
          isRequestCancelled(err, controller.signal)
        )
          return;
        const message =
          err instanceof Error ? err.message : t("request_logs.refresh_failed");
        notify({ type: "error", message });
      } finally {
        if (requestAbortRef.current === controller)
          requestAbortRef.current = null;
        if (seq === requestSeqRef.current && !controller.signal.aborted)
          setLoading(false);
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
  }, [
    timeRange,
    selectedApiKeys,
    selectedModels,
    selectedChannels,
    selectedStatuses,
  ]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleOpenClearDialog = useCallback(() => {
    setClearOptions(DEFAULT_CLEAR_OPTIONS);
    setConfirmClearOpen(true);
  }, []);

  const handleClearBodyContentChange = useCallback((checked: boolean) => {
    setClearOptions((prev) => {
      if (prev.clear_request_records) return prev;
      return { ...prev, clear_body_content: checked };
    });
  }, []);

  const handleClearDetailContentChange = useCallback((checked: boolean) => {
    setClearOptions((prev) => {
      if (prev.clear_request_records) return prev;
      return { ...prev, clear_detail_content: checked };
    });
  }, []);

  const handleClearRequestRecordsChange = useCallback((checked: boolean) => {
    setClearOptions((prev) =>
      checked
        ? {
            ...prev,
            clear_body_content: true,
            clear_detail_content: true,
            clear_request_records: true,
          }
        : {
            ...prev,
            clear_request_records: false,
          },
    );
  }, []);

  const canSubmitCleanup =
    clearOptions.clear_body_content ||
    clearOptions.clear_detail_content ||
    clearOptions.clear_request_records;

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
        err instanceof Error
          ? err.message
          : t("request_logs.clear_database_logs_failed");
      notify({ type: "error", message });
    } finally {
      setClearingLogs(false);
    }
  }, [clearOptions, fetchLogs, notify, pageSize, t]);

  return (
    <section className="flex flex-1 flex-col">
      <h1 className="sr-only">{t("request_logs.title")}</h1>

      {/* 单层卡片：标题 + 筛选 + 统计 + 表格 + 分页 */}
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        {/* 标题栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
              <ScrollText
                size={18}
                className="text-slate-900 dark:text-white"
                aria-hidden="true"
              />
              {t("request_logs.heading")}
            </h2>
            <div className="hidden min-[640px]:flex items-center gap-2 text-xs text-slate-500 dark:text-white/50">
              <span className="text-slate-300 dark:text-white/15">|</span>
              <RequestLogsRecordsCount count={stats.total} />
              <span className="text-slate-300 dark:text-white/15">|</span>
              <span>
                {t("common.success_rate")}{" "}
                <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                  {stats.success_rate.toFixed(1)}%
                </span>
              </span>
              <span className="text-slate-300 dark:text-white/15">|</span>
              <span>
                {t("request_logs.col_total_token")}{" "}
                <span className="font-mono tabular-nums text-slate-900 dark:text-white">
                  <RequestLogUsageMetricValue
                    value={stats.total_tokens}
                    compact
                  />
                </span>
              </span>
              <span className="text-slate-300 dark:text-white/15">|</span>
              <span>
                {t("request_logs.col_cost")}{" "}
                <span className="font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                  <RequestLogUsageMetricValue
                    value={stats.total_cost}
                    variant="currency"
                    compact
                  />
                </span>
              </span>
              <span className="text-slate-300 dark:text-white/15">|</span>
              <span>
                {t("request_logs.cache_rate")}{" "}
                <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                  {formatUsageMetricRate(stats.cache_rate)}
                </span>
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RequestLogsTimeRangeSelector
              value={timeRange}
              onChange={setTimeRange}
            />
            <button
              type="button"
              onClick={handleOpenClearDialog}
              disabled={loading || clearingLogs}
              aria-label={t("request_logs.clear_database_logs")}
              title={t("request_logs.clear_database_logs")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-rose-50 text-rose-600 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-rose-500/15 dark:text-rose-300 dark:hover:bg-rose-500/25"
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
              className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-900 text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-white dark:text-neutral-950 dark:hover:bg-slate-200 dark:focus-visible:ring-white/15"
            >
              <RefreshCw
                size={14}
                className={
                  loading
                    ? "motion-reduce:animate-none motion-safe:animate-spin"
                    : ""
                }
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

        {/* 表格区域 — 自适应视口高度，内部滚动 */}
        <div className="relative min-h-[360px] h-[calc(100dvh-300px)] overflow-hidden px-5">
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
            showAllLoadedMessage={false}
          />

          {/* Loading overlay */}
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

        {/* 分页控件 — flex-shrink-0 固定在底部 */}
        <RequestLogsPaginationBar
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
      <Modal
        open={confirmClearOpen}
        title={t("request_logs.clear_database_logs")}
        maxWidth="max-w-xl"
        onClose={() => {
          if (!clearingLogs) setConfirmClearOpen(false);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirmClearOpen(false)}
              disabled={clearingLogs}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="danger"
              onClick={() => void handleClearDatabaseLogs()}
              disabled={clearingLogs || !canSubmitCleanup}
              aria-busy={clearingLogs}
            >
              {clearingLogs ? (
                <LoaderCircle
                  size={14}
                  className="motion-reduce:animate-none motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {t("request_logs.clear_database_logs_confirm_button")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-neutral-800 dark:bg-neutral-900/80 dark:text-white/65">
            {t("request_logs.clear_database_logs_keep_records_hint")}
          </div>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-neutral-800">
            <Checkbox
              checked={clearOptions.clear_body_content}
              onCheckedChange={handleClearBodyContentChange}
              disabled={clearingLogs || clearOptions.clear_request_records}
              aria-label={t("request_logs.clear_option_body")}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900 dark:text-white">
                {t("request_logs.clear_option_body")}
              </span>
              <span className="mt-1 block text-sm text-slate-500 dark:text-white/55">
                {t("request_logs.clear_option_body_desc")}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-slate-200 px-4 py-3 dark:border-neutral-800">
            <Checkbox
              checked={clearOptions.clear_detail_content}
              onCheckedChange={handleClearDetailContentChange}
              disabled={clearingLogs || clearOptions.clear_request_records}
              aria-label={t("request_logs.clear_option_details")}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-slate-900 dark:text-white">
                {t("request_logs.clear_option_details")}
              </span>
              <span className="mt-1 block text-sm text-slate-500 dark:text-white/55">
                {t("request_logs.clear_option_details_desc")}
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 dark:border-rose-500/20 dark:bg-rose-500/10">
            <Checkbox
              checked={clearOptions.clear_request_records}
              onCheckedChange={handleClearRequestRecordsChange}
              disabled={clearingLogs}
              aria-label={t("request_logs.clear_option_records")}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-rose-700 dark:text-rose-300">
                {t("request_logs.clear_option_records")}
              </span>
              <span className="mt-1 block text-sm text-rose-600/90 dark:text-rose-200/70">
                {t("request_logs.clear_option_records_desc")}
              </span>
            </span>
          </label>
        </div>
      </Modal>
    </section>
  );
}
