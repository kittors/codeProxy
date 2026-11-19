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
import { cacheRatePercent, readCacheRate } from "@code-proxy/domain";
import {
  Button,
  MaskToggleButton,
  iconHueClass,
  useGridPreferences,
  useSensitiveDataMasking,
  useToast,
  type GridFilters,
} from "@code-proxy/ui";
import { ErrorDetailModal, LogContentModal } from "@features/log-content-viewer";
import {
  REQUEST_LOG_GRID_IDS,
  DEFAULT_REQUEST_LOG_PAGE_SIZE,
  EMPTY_REQUEST_LOG_KEY_FACET,
  RequestLogFilterBar,
  RequestLogGrid,
  RequestLogSummary,
  RequestLogsTimeRangeSelector,
  buildChannelFacetOptions,
  buildClientFacetOptions,
  buildKeyFacetOptions,
  buildModelFacetOptions,
  buildRequestLogGridColumns,
  buildStatusFacetOptions,
  guardFilterVisible,
  guardKindsOfFilter,
  itemsCarryClientFields,
  readRequestLogKeyFacet,
  requestLogQueryFromFilters,
  toRequestLogsRow,
  type GuardFilterValue,
  type RequestLogClientsSupport,
  type RequestLogFacet,
  type RequestLogKeyFacet,
  type RequestLogsRow,
  type TimeRange,
} from "@features/request-log-viewer";
import { ClearDatabaseLogsDialog, DEFAULT_CLEAR_OPTIONS } from "./ClearDatabaseLogsDialog";

const DEFAULT_LOG_STATS: UsageLogsResponse["stats"] = {
  total: 0,
  success_rate: 0,
  total_tokens: 0,
  total_cost: 0,
  cache_rate: 0,
};

const isRequestCancelled = (err: unknown, signal?: AbortSignal) =>
  signal?.aborted || (err instanceof Error && err.message === "Request was cancelled");

type FilterOptions = {
  models: string[];
  channels: string[];
  channel_options: UsageChannelFilterOption[];
  statuses: string[];
  client_names: string[];
  client_name_counts: Record<string, number>;
};

const EMPTY_FILTER_OPTIONS: FilterOptions = {
  models: [],
  channels: [],
  channel_options: [],
  statuses: ["success", "failed"],
  client_names: [],
  client_name_counts: {},
};

/**
 * 请求日志（计划 104）：标题与汇总、独立的筛选区、铺满剩余高度的 DataGrid（表头吸顶、时间与状态
 * 冻结、行展开看完整详情、分页固定在框底）。服务端分页、按时间倒序；筛选状态只有一份 GridFilters，
 * 分面按钮、表头筛选、芯片都改它，发请求时换成查询参数。
 */
export function RequestLogsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [masked, setMasked] = useSensitiveDataMasking();

  const [content, setContent] = useState<{
    open: boolean;
    logId: number | null;
    model: string;
    tab: "input" | "output";
  }>({ open: false, logId: null, model: "", tab: "input" });
  const [errorModal, setErrorModal] = useState<{ open: boolean; logId: number | null; model: string }>(
    { open: false, logId: null, model: "" },
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

  const openContent = useCallback((row: RequestLogsRow, tab: "input" | "output") => {
    setContent({ open: true, logId: Number(row.id), model: row.displayModel || row.model, tab });
  }, []);
  const openError = useCallback((row: RequestLogsRow) => {
    setErrorModal({ open: true, logId: Number(row.id), model: row.displayModel || row.model });
  }, []);

  const [rawItems, setRawItems] = useState<UsageLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_REQUEST_LOG_PAGE_SIZE);
  const [filterOptions, setFilterOptions] = useState<FilterOptions>(EMPTY_FILTER_OPTIONS);
  // The key facet, and the vocabulary (key ids or the older secrets) the last response offered it
  // in. The ref lets a request be built in that vocabulary without making every response re-create
  // fetchLogs.
  const [keyFacet, setKeyFacet] = useState<RequestLogKeyFacet>(EMPTY_REQUEST_LOG_KEY_FACET);
  const keyFacetRef = useRef<RequestLogKeyFacet>(EMPTY_REQUEST_LOG_KEY_FACET);
  const [stats, setStats] = useState<UsageLogsResponse["stats"]>(DEFAULT_LOG_STATS);
  const [hasResponse, setHasResponse] = useState(false);
  // Whether the logs endpoint carries the caller fields: null until a response came back.
  const [clientsFromLogs, setClientsFromLogs] = useState<boolean | null>(null);

  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [filters, setFilters] = useState<GridFilters>({});
  // Loop protection: the choice, and what the last response said about it (whether the backend
  // has it, which kinds the other filters leave).
  const [guardFilter, setGuardFilter] = useState<GuardFilterValue>("all");
  const [guardFacet, setGuardFacet] = useState<{ supported: boolean; kinds: string[] }>({
    supported: false,
    kinds: [],
  });
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const [clearingLogs, setClearingLogs] = useState(false);
  const [clearOptions, setClearOptions] = useState<ClearUsageLogsPayload>(DEFAULT_CLEAR_OPTIONS);

  const requestSeqRef = useRef(0);
  const requestAbortRef = useRef<AbortController | null>(null);

  // Agent 列：日志接口的 capabilities 声明了 request-log-clients（或行上带了这几个字段）就是支持。
  // 第一页回来前还不知道，列先占位（列顺序在首次挂载时定下，晚到的列会被排到最后），确认是旧后端才去掉。
  const clients: RequestLogClientsSupport =
    clientsFromLogs === true ? "supported" : clientsFromLogs === false ? "unsupported" : "pending";

  const rows = useMemo<RequestLogsRow[]>(() => rawItems.map((item) => toRequestLogsRow(item)), [rawItems]);

  const facetOptions = useMemo(
    () => ({
      identity: buildKeyFacetOptions(keyFacet, t),
      model: buildModelFacetOptions(filterOptions.models),
      channel: buildChannelFacetOptions(
        filterOptions.channel_options.length > 0
          ? filterOptions.channel_options
          : filterOptions.channels.map((value) => ({ value, label: value })),
      ),
      agent: buildClientFacetOptions(filterOptions.client_names, filterOptions.client_name_counts, t),
      status: buildStatusFacetOptions(filterOptions.statuses, t),
    }),
    [filterOptions, keyFacet, t],
  );

  const columns = useMemo(
    () =>
      buildRequestLogGridColumns(t, {
        identity: "user",
        masked,
        clients,
        now: loadedAt,
        facets: facetOptions,
        onOpenContent: openContent,
        onOpenError: openError,
      }),
    [clients, facetOptions, loadedAt, masked, openContent, openError, t],
  );
  const defaultHidden = useMemo(
    () => columns.filter((column) => column.defaultHidden).map((column) => column.id),
    [columns],
  );
  const prefs = useGridPreferences(REQUEST_LOG_GRID_IDS.page, { hidden: defaultHidden });

  const facets = useMemo<RequestLogFacet[]>(
    () => [
      { columnId: "identity", label: t("request_logs.col_user_key"), options: facetOptions.identity },
      { columnId: "model", label: t("request_logs.col_model"), options: facetOptions.model },
      { columnId: "channel", label: t("request_logs.col_channel"), options: facetOptions.channel },
      ...(clients === "supported"
        ? [{ columnId: "agent" as const, label: t("request_logs.col_agent"), options: facetOptions.agent }]
        : []),
    ],
    [clients, facetOptions, t],
  );

  const clearFilters = useCallback(() => {
    setFilters({});
    setGuardFilter("all");
  }, []);

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
            ...requestLogQueryFromFilters(filters, keyFacetRef.current, clients === "supported"),
            guard_kinds: guardKindsOfFilter(guardFilter),
          },
          { signal: controller.signal },
        );

        if (seq !== requestSeqRef.current || controller.signal.aborted) return;

        setRawItems(resp.items ?? []);
        setTotalCount(resp.total ?? 0);
        setCurrentPage(page);
        setLoadError(null);
        setLoadedAt(Date.now());
        setHasResponse(true);
        const facet = readRequestLogKeyFacet(resp);
        if (facet.byId !== keyFacetRef.current.byId && filters.identity) {
          // The backend changed vocabulary under an open page (upgraded, or rolled back): the
          // selection names keys the new facet does not know.
          setFilters((prev) => {
            const next = { ...prev };
            delete next.identity;
            return next;
          });
        }
        keyFacetRef.current = facet;
        setKeyFacet(facet);
        const clientsSupported =
          resp.capabilities?.requestLogClients === true || itemsCarryClientFields(resp.items ?? []);
        setClientsFromLogs(clientsSupported);
        if (!clientsSupported && filters.agent) {
          setFilters((prev) => {
            const next = { ...prev };
            delete next.agent;
            return next;
          });
        }
        // The API client fills every capability, but a response that declares nothing is, by
        // definition, from a backend that predates loop protection.
        const guardSupported = resp.capabilities?.loopGuard === true;
        setGuardFacet({ supported: guardSupported, kinds: resp.filters?.guard_kinds ?? [] });
        // A backend that lost loop protection under an open page (rolled back) would answer every
        // request to a filter it ignores, which would read as "nothing was stopped".
        if (!guardSupported) setGuardFilter("all");
        setFilterOptions({
          models: resp.filters?.models ?? [],
          channels: resp.filters?.channels ?? [],
          channel_options: resp.filters?.channel_options ?? [],
          statuses: resp.filters?.statuses ?? ["success", "failed"],
          client_names: resp.filters?.client_names ?? [],
          client_name_counts: resp.filters?.client_name_counts ?? {},
        });
        setStats({ ...DEFAULT_LOG_STATS, ...resp.stats });
      } catch (err) {
        if (seq !== requestSeqRef.current || isRequestCancelled(err, controller.signal)) return;
        setLoadError(err instanceof Error ? err.message : t("request_logs.refresh_failed"));
      } finally {
        if (requestAbortRef.current === controller) requestAbortRef.current = null;
        if (seq === requestSeqRef.current && !controller.signal.aborted) setLoading(false);
      }
    },
    [clients, filters, guardFilter, t, timeRange],
  );

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
      requestAbortRef.current?.abort();
    };
  }, []);

  // Fetch page 1 when the range or a filter changes.
  useEffect(() => {
    void fetchLogs(1, pageSize);
  }, [timeRange, filters, guardFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClearDatabaseLogs = useCallback(async () => {
    setClearingLogs(true);
    try {
      const result = await usageApi.clearUsageLogs(clearOptions);
      await fetchLogs(1, pageSize);
      notify({
        type: "success",
        message: clearOptions.clear_request_records
          ? t("request_logs.clear_database_logs_success_records", { count: result.deleted_logs })
          : t("request_logs.clear_database_logs_success_content"),
      });
      setConfirmClearOpen(false);
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("request_logs.clear_database_logs_failed"),
      });
    } finally {
      setClearingLogs(false);
    }
  }, [clearOptions, fetchLogs, notify, pageSize, t]);

  const statsPending = !hasResponse;
  const cacheView = readCacheRate(stats);
  const guardVisible = guardFilterVisible(guardFacet.supported, guardFacet.kinds, guardFilter);

  return (
    <section data-page-fill="always" className="flex min-h-0 flex-1 flex-col gap-3">
      <h1 className="sr-only">{t("request_logs.title")}</h1>
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-ink">
            <ScrollText
              size={18}
              className={`text-ink-3 ${iconHueClass(ScrollText)}`}
              aria-hidden="true"
            />
            {t("request_logs.heading")}
          </h2>
          <div className="-m-1 flex flex-wrap items-center gap-2 p-1">
            <RequestLogsTimeRangeSelector value={timeRange} onChange={setTimeRange} />
            <MaskToggleButton
              masked={masked}
              onToggle={() => setMasked((prev) => !prev)}
              className="h-9 w-9"
            />
            <Button
              variant="secondary-danger"
              onClick={() => {
                setClearOptions(DEFAULT_CLEAR_OPTIONS);
                setConfirmClearOpen(true);
              }}
              disabled={loading || clearingLogs}
              aria-label={t("request_logs.clear_database_logs")}
              title={t("request_logs.clear_database_logs")}
              className="h-9 w-9"
            >
              <Trash2 size={14} aria-hidden="true" />
            </Button>
            <Button
              // 刷新回到第一页：日志按时间倒序，新请求都在第一页。
              onClick={() => void fetchLogs(1, pageSize)}
              disabled={loading}
              aria-busy={loading}
              aria-label={t("request_logs.refresh")}
              title={t("request_logs.refresh")}
              // 加载中刷新按钮禁用但图标在转，别淡到看不清。
              className="h-9 w-9 disabled:opacity-70"
            >
              <RefreshCw
                size={14}
                className={loading ? "motion-reduce:animate-none motion-safe:animate-spin" : ""}
                aria-hidden="true"
              />
            </Button>
          </div>
        </div>
        <RequestLogSummary
          pending={statsPending}
          stats={{
            total: stats.total,
            successRate: stats.success_rate,
            totalTokens: stats.total_tokens,
            totalCost: stats.total_cost,
            cache: {
              percent: cacheRatePercent(cacheView, stats.total > 0),
              label: t(
                cacheView.kind === "hit_rate" ? "request_logs.cache_hit_rate" : "request_logs.cache_rate",
              ),
              hint: t(
                cacheView.kind === "hit_rate"
                  ? "request_logs.summary_cache_hit_hint"
                  : "request_logs.summary_cache_share_hint",
              ),
            },
          }}
        />
      </header>

      <RequestLogFilterBar
        columns={columns}
        filters={filters}
        onFiltersChange={setFilters}
        facets={facets}
        prefs={prefs}
        guard={
          guardVisible
            ? { value: guardFilter, kinds: guardFacet.kinds, onChange: setGuardFilter }
            : undefined
        }
      />

      {/*
        表格区域 — flex-1 占满标题、筛选之外剩下的高度，表格 fill 铺满它：加载、空、行少、行多都是
        同一个框，分页和横向滚动条不随行数移动，数据回来时也不跳。不写 min-h 保底：页面高度被窗口
        钉死，窗口一矮，保底高度只会把表格和分页挤出页面之外。
      */}
      <div className="flex min-h-0 flex-1 flex-col">
        <RequestLogGrid
          id={REQUEST_LOG_GRID_IDS.page}
          label={t("request_logs.table_caption")}
          columns={columns}
          rows={rows}
          loading={loading}
          error={loadError}
          onRetry={() => void fetchLogs(currentPage, pageSize)}
          filters={filters}
          onFiltersChange={setFilters}
          extraFilterLabels={
            guardFilter !== "all"
              ? [`${t("request_logs.guard_filter_label")}：${t(`request_logs.guard_filter_${guardFilter}`)}`]
              : []
          }
          onClearFilters={clearFilters}
          prefs={prefs}
          masked={masked}
          onOpenContent={openContent}
          onOpenError={openError}
          page={currentPage}
          pageSize={pageSize}
          total={totalCount}
          pending={statsPending}
          onPageChange={(page) => void fetchLogs(page, pageSize)}
          onPageSizeChange={(size) => {
            setPageSize(size);
            void fetchLogs(1, size);
          }}
          resetScrollKey={`${currentPage}|${pageSize}|${timeRange}|${JSON.stringify(filters)}|${guardFilter}`}
        />
      </div>

      <LogContentModal
        open={content.open}
        logId={content.logId}
        displayModel={content.model}
        initialTab={content.tab}
        onClose={() => setContent((prev) => ({ ...prev, open: false }))}
        showRequestDetails
        showBodyContent={requestBodyStorageEnabled}
      />
      <ErrorDetailModal
        open={errorModal.open}
        logId={errorModal.logId}
        model={errorModal.model}
        onClose={() => setErrorModal((prev) => ({ ...prev, open: false }))}
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
