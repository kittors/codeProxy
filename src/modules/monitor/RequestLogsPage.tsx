import { useTranslation } from "react-i18next";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Filter, RefreshCw, ScrollText } from "lucide-react";
import { usageApi } from "@/lib/http/apis";
import type { UsageLogItem, UsageLogsResponse } from "@/lib/http/apis/usage";
import { useToast } from "@/modules/ui/ToastProvider";
import { Select } from "@/modules/ui/Select";
import { SearchableSelect } from "@/modules/ui/SearchableSelect";
import { VirtualTable } from "@/modules/ui/VirtualTable";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { ErrorDetailModal } from "@/modules/monitor/ErrorDetailModal";
import {
  buildRequestLogKeyOptions,
  buildRequestLogsColumns,
  DEFAULT_REQUEST_LOG_PAGE_SIZE,
  RequestLogsPaginationBar,
  RequestLogsTimeRangeSelector,
  toRequestLogsRow,
  type RequestLogsRow as LogRow,
  type TimeRange,
} from "@/modules/monitor/requestLogsShared";
type StatusFilter = "" | "success" | "failed";

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function RequestLogsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();

  // Content modal state
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentModalLogId, setContentModalLogId] = useState<number | null>(null);
  const [contentModalTab, setContentModalTab] = useState<"input" | "output">("input");

  const handleContentClick = useCallback((logId: number, tab: "input" | "output") => {
    setContentModalLogId(logId);
    setContentModalTab(tab);
    setContentModalOpen(true);
  }, []);

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
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

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
  }>({
    api_keys: [],
    api_key_names: {},
    models: [],
    channels: [],
  });
  const [stats, setStats] = useState<{
    total: number;
    success_rate: number;
    total_tokens: number;
  }>({ total: 0, success_rate: 0, total_tokens: 0 });

  // Filters
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [apiQuery, setApiQuery] = useState("");
  const [modelQuery, setModelQuery] = useState("");
  const [channelQuery, setChannelQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("");

  const fetchInFlightRef = useRef(false);

  // Fetch logs from backend (server-side pagination)
  const fetchLogs = useCallback(
    async (page: number, size: number) => {
      if (fetchInFlightRef.current) return;
      fetchInFlightRef.current = true;
      setLoading(true);

      try {
        const resp: UsageLogsResponse = await usageApi.getUsageLogs({
          page,
          size,
          days: timeRange,
          api_key: apiQuery || undefined,
          model: modelQuery || undefined,
          channel: channelQuery || undefined,
          status: statusFilter || undefined,
        });

        setRawItems(resp.items ?? []);
        setTotalCount(resp.total ?? 0);
        setCurrentPage(page);
        const filtersCandidate =
          resp.filters && typeof resp.filters === "object" ? (resp.filters as any) : null;
        setFilterOptions({
          api_keys: Array.isArray(filtersCandidate?.api_keys) ? filtersCandidate.api_keys : [],
          api_key_names:
            filtersCandidate?.api_key_names &&
            typeof filtersCandidate.api_key_names === "object" &&
            !Array.isArray(filtersCandidate.api_key_names)
              ? (filtersCandidate.api_key_names as Record<string, string>)
              : {},
          models: Array.isArray(filtersCandidate?.models) ? filtersCandidate.models : [],
          channels: Array.isArray(filtersCandidate?.channels) ? filtersCandidate.channels : [],
        });
        setStats(resp.stats ?? { total: 0, success_rate: 0, total_tokens: 0 });
        setLastUpdatedAt(Date.now());
      } catch (err) {
        const message = err instanceof Error ? err.message : t("request_logs.refresh_failed");
        notify({ type: "error", message });
      } finally {
        fetchInFlightRef.current = false;
        setLoading(false);
      }
    },
    [timeRange, apiQuery, modelQuery, channelQuery, statusFilter, notify, t],
  );

  // Derive display rows from raw items
  const rows = useMemo<LogRow[]>(
    () => (rawItems ?? []).map((item) => toRequestLogsRow(item)),
    [rawItems],
  );

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
  }, [timeRange, apiQuery, modelQuery, channelQuery, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Build options from backend filter data
  const keyOptions = useMemo(() => {
    return buildRequestLogKeyOptions(filterOptions.api_keys, filterOptions.api_key_names ?? {}, {
      allKeys: t("request_logs.all_keys"),
      systemCall: t("request_logs.system_call"),
    });
  }, [filterOptions.api_keys, filterOptions.api_key_names, t]);

  const modelOptions = useMemo(() => {
    return [
      { value: "", label: t("request_logs.all_models") },
      ...filterOptions.models.map((m) => ({ value: m, label: m })),
    ];
  }, [filterOptions.models, t]);

  const channelOptions = useMemo(() => {
    return [
      { value: "", label: t("request_logs.all_channels") },
      ...filterOptions.channels.map((ch) => ({ value: ch, label: ch })),
    ];
  }, [filterOptions.channels, t]);

  const lastUpdatedText = useMemo(() => {
    if (loading) return t("request_logs.refreshing");
    if (!lastUpdatedAt) return t("request_logs.not_refreshed");
    return t("request_logs.updated_at", {
      time: new Date(lastUpdatedAt).toLocaleTimeString(),
    });
  }, [lastUpdatedAt, loading, t]);
  return (
    <section className="flex flex-1 flex-col">
      <h1 className="sr-only">{t("request_logs.title")}</h1>

      {/* 单层卡片：标题 + 筛选 + 统计 + 表格 + 分页 */}
      <div className="flex flex-1 flex-col rounded-2xl border border-black/[0.06] bg-white shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-white/[0.06] dark:bg-neutral-950/70 dark:shadow-[0_1px_2px_rgb(0_0_0_/_0.22)]">
        {/* 标题栏 */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
            <ScrollText size={18} className="text-slate-900 dark:text-white" aria-hidden="true" />
            {t("request_logs.heading")}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <RequestLogsTimeRangeSelector value={timeRange} onChange={setTimeRange} />
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
                className={loading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* 筛选 + 统计 */}
        <div className="border-t border-slate-100 px-5 py-3 dark:border-neutral-800/60">
          <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
            <div className="grid grid-cols-1 gap-2 sm:flex sm:items-center sm:gap-2">
              <SearchableSelect
                value={apiQuery}
                onChange={setApiQuery}
                options={keyOptions}
                placeholder={t("request_logs.all_keys_placeholder")}
                searchPlaceholder={t("request_logs.search_keys")}
                aria-label={t("request_logs.filter_key")}
                className="w-full sm:w-auto"
              />
              <SearchableSelect
                value={modelQuery}
                onChange={setModelQuery}
                options={modelOptions}
                placeholder={t("request_logs.all_models_placeholder")}
                searchPlaceholder={t("request_logs.search_models")}
                aria-label={t("request_logs.filter_model")}
                className="w-full sm:w-auto"
              />
              <SearchableSelect
                value={channelQuery}
                onChange={setChannelQuery}
                options={channelOptions}
                placeholder={t("request_logs.all_channels_placeholder")}
                searchPlaceholder={t("request_logs.search_channels")}
                aria-label={t("request_logs.filter_channel")}
                className="w-full sm:w-auto"
              />
              <Select
                value={statusFilter}
                onChange={(v) => setStatusFilter(v as StatusFilter)}
                options={[
                  { value: "", label: t("request_logs.all_status") },
                  { value: "success", label: t("request_logs.status_success") },
                  { value: "failed", label: t("request_logs.status_failed") },
                ]}
                aria-label={t("request_logs.filter_status")}
                name="statusFilter"
                className="w-full sm:w-auto"
              />
            </div>

            <div className="hidden sm:block sm:flex-1" />

            <div className="grid grid-cols-2 items-center gap-x-3 gap-y-1.5 text-xs text-slate-600 dark:text-white/55 sm:flex sm:items-center sm:gap-1.5">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                <Filter size={12} aria-hidden="true" />
                {t("request_logs.records_count", {
                  count: stats.total.toLocaleString(),
                } as Record<string, string>)}
              </span>

              <span className="inline-flex items-center justify-end gap-1.5 whitespace-nowrap sm:justify-start">
                {t("common.success_rate")}
                <span className="font-mono tabular-nums">{stats.success_rate.toFixed(1)}%</span>
              </span>

              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {t("request_logs.col_total_token")}
                <span className="font-mono tabular-nums">
                  {stats.total_tokens.toLocaleString()}
                </span>
              </span>

              <span className="col-span-2 text-[11px] text-slate-400 dark:text-white/40 sm:col-span-1 sm:text-xs">
                {lastUpdatedText}
              </span>
            </div>
          </div>
        </div>

        {/* 表格区域 — 自适应视口高度，内部滚动 */}
        <div className="relative min-h-[360px] h-[calc(100dvh-300px)] overflow-hidden px-5">
          <VirtualTable
            rows={rows}
            columns={logColumns}
            rowKey={(row) => row.id}
            loading={loading}
            virtualize={false}
            minWidth="min-w-[1320px]"
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
      />
      <ErrorDetailModal
        open={errorModalOpen}
        logId={errorModalLogId}
        model={errorModalModel}
        onClose={() => setErrorModalOpen(false)}
      />
    </section>
  );
}
