import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Key } from "lucide-react";
import { useTheme } from "@/modules/ui/ThemeProvider";
import { ThemeToggleButton } from "@/modules/ui/ThemeProvider";
import { LanguageSelector } from "@/modules/ui/LanguageSelector";
import { Reveal } from "@/modules/ui/Reveal";
import type { TimeRange } from "@/modules/monitor/monitor-constants";
import { LogContentModal } from "@/modules/monitor/LogContentModal";
import { MANAGEMENT_API_PREFIX } from "@/lib/constants";
import { detectApiBaseFromLocation } from "@/lib/connection";
import { fetchAvailableModels, fetchPublicChartData, fetchPublicLogs } from "@/modules/apikey-lookup/api";
import { LookupEmptyState } from "@/modules/apikey-lookup/components/LookupEmptyState";
import { LookupResultsToolbar } from "@/modules/apikey-lookup/components/LookupResultsToolbar";
import { LookupSearchSection } from "@/modules/apikey-lookup/components/LookupSearchSection";
import { ModelsTabContent } from "@/modules/apikey-lookup/components/ModelsTabContent";
import { buildLogColumns, PublicLogsSection } from "@/modules/apikey-lookup/components/PublicLogsSection";
import { UsageTabSection } from "@/modules/apikey-lookup/components/UsageTabSection";
import { useApiKeyLookupCharts } from "@/modules/apikey-lookup/hooks/useApiKeyLookupCharts";
import type { ChartDataResponse, LogRow, PublicLogItem } from "@/modules/apikey-lookup/types";

const DEFAULT_PAGE_SIZE = 50;

// ── Helpers ─────────────────────────────────────────────────────────────────

const formatLatencyMs = (value: number): string => {
  if (!Number.isFinite(value) || value < 0) return "--";
  if (value < 1) return "<1ms";
  if (value < 1000) return `${Math.round(value)}ms`;
  const seconds = value / 1000;
  const fixed = seconds.toFixed(seconds < 10 ? 2 : 1);
  const trimmed = fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed;
  return `${trimmed}s`;
};

function toLogRow(item: PublicLogItem): LogRow {
  return {
    id: String(item.id),
    timestamp: item.timestamp,
    timestampMs: new Date(item.timestamp).getTime(),
    model: item.model,
    failed: item.failed,
    latencyText: formatLatencyMs(item.latency_ms),
    inputTokens: item.input_tokens,
    cachedTokens: item.cached_tokens,
    outputTokens: item.output_tokens,
    totalTokens: item.total_tokens,
    cost: item.cost ?? 0,
    hasContent: item.has_content,
  };
}

// ── Page Component ──────────────────────────────────────────────────────────

export function ApiKeyLookupPage() {
  const { t } = useTranslation();
  const {
    state: { mode },
  } = useTheme();
  const isDark = mode === "dark";

  const [compact, setCompact] = useState(() => window.innerWidth < 700);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 699px)");
    const handler = (e: MediaQueryListEvent) => setCompact(e.matches);
    setCompact(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const [apiKeyInput, setApiKeyInput] = useState("");
  const [queriedKey, setQueriedKey] = useState("");

  // ── Content modal state ──
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentModalLogId, setContentModalLogId] = useState<number | null>(null);
  const [contentModalTab, setContentModalTab] = useState<"input" | "output">("input");

  const handleContentClick = useCallback((logId: number, tab: "input" | "output") => {
    setContentModalLogId(logId);
    setContentModalTab(tab);
    setContentModalOpen(true);
  }, []);

  const logColumns = useMemo(() => buildLogColumns(t, handleContentClick), [t, handleContentClick]);
  const statusOptions = useMemo(
    () => [
      { value: "", label: t("apikey_lookup.all_status"), searchText: "all status" },
      { value: "success", label: t("request_logs.status_success"), searchText: "success" },
      { value: "failed", label: t("request_logs.status_failed"), searchText: "failed" },
    ],
    [t],
  );

  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<"usage" | "logs" | "models">("usage");

  // ── Logs state (server-side pagination) ──
  const [rawItems, setRawItems] = useState<PublicLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  // ── Chart state ──
  const [chartData, setChartData] = useState<ChartDataResponse | null>(null);
  const [chartLoading, setChartLoading] = useState(false);
  const chartCacheRef = useRef<Record<string, ChartDataResponse>>({});

  // ── Models state ──
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsSearchFilter, setModelsSearchFilter] = useState("");

  // ── Filters ──
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [modelQuery, setModelQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  // ── Backend stats + filter options ──
  const [stats, setStats] = useState<{
    total: number;
    success_rate: number;
    total_tokens: number;
    total_cost: number;
  }>({ total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
  const [modelOptions, setModelOptions] = useState<string[]>([]);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const paginationInFlightRef = useRef(false);

  // ================================================================
  //  Logs fetching (with infinite scroll support)
  // ================================================================

  const fetchLogs = useCallback(
    async (key: string, page: number, size?: number) => {
      if (!key.trim()) return;

      if (paginationInFlightRef.current) return;
      paginationInFlightRef.current = true;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const myFetchId = ++fetchIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const resp = await fetchPublicLogs({
          apiKey: key.trim(),
          page,
          size: size ?? pageSize,
          days: timeRange,
          model: modelQuery || undefined,
          status: statusFilter || undefined,
          signal: controller.signal,
        });

        if (myFetchId !== fetchIdRef.current) return;

        setRawItems(resp.items ?? []);
        setTotalCount(resp.total ?? 0);
        setCurrentPage(page);
        setStats(resp.stats ?? { total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
        setModelOptions(resp.filters?.models ?? []);
        setLastUpdatedAt(Date.now());
        setQueriedKey(key.trim());
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (myFetchId !== fetchIdRef.current) return;

        const message = err instanceof Error ? err.message : t("apikey_lookup.query_failed");
        setError(message);
        setRawItems([]);
        setTotalCount(0);
        setStats({ total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
      } finally {
        paginationInFlightRef.current = false;
        if (myFetchId === fetchIdRef.current) {
          setLoading(false);
        }
      }
    },
    [t, timeRange, modelQuery, statusFilter, pageSize],
  );

  // ================================================================
  //  Chart data fetching (with caching)
  // ================================================================

  const fetchChartDataFn = useCallback(async (key: string, days: number) => {
    const cacheKey = `${key}|${days}`;
    if (chartCacheRef.current[cacheKey]) {
      setChartData(chartCacheRef.current[cacheKey]);
      return;
    }
    setChartLoading(true);
    try {
      const data = await fetchPublicChartData({ apiKey: key.trim(), days });
      chartCacheRef.current[cacheKey] = data;
      setChartData(data);
    } catch {
      setChartData(null);
    } finally {
      setChartLoading(false);
    }
  }, []);

  // ================================================================
  //  Derived rows for VirtualTable
  // ================================================================

  const rows = useMemo<LogRow[]>(() => rawItems.map((item) => toLogRow(item)), [rawItems]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handlePageChange = useCallback(
    (page: number) => {
      if (!queriedKey) return;
      const clamped = Math.max(1, Math.min(page, totalPages));
      fetchLogs(queriedKey, clamped);
    },
    [fetchLogs, queriedKey, totalPages],
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      if (queriedKey) fetchLogs(queriedKey, 1, newSize);
    },
    [fetchLogs, queriedKey],
  );

  // ================================================================
  //  Effects
  // ================================================================

  // Refetch page 1 when filters change (only if we have a queried key)
  useEffect(() => {
    if (queriedKey) {
      if (activeTab === "logs") {
        fetchLogs(queriedKey, 1);
      }
    }
  }, [timeRange, modelQuery, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Models fetching ──
  const fetchModelsFn = useCallback(
    async (key: string) => {
      setModelsLoading(true);
      setModelsError(null);
      try {
        const ids = await fetchAvailableModels(key);
        setAvailableModels(ids);
      } catch (err: unknown) {
        setModelsError(err instanceof Error ? err.message : t("apikey_lookup.load_models_failed"));
      } finally {
        setModelsLoading(false);
      }
    },
    [t],
  );

  // When tab changes, fetch the appropriate data
  useEffect(() => {
    if (!queriedKey) return;
    if (activeTab === "usage") {
      void fetchChartDataFn(queriedKey, timeRange);
    } else if (activeTab === "models") {
      void fetchModelsFn(queriedKey);
    } else {
      // Always refetch when switching to logs tab to ensure
      // data matches the current timeRange & filters
      fetchLogs(queriedKey, 1);
    }
  }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  // When time range changes, refetch current tab
  useEffect(() => {
    if (!queriedKey) return;
    chartCacheRef.current = {};
    if (activeTab === "usage") {
      void fetchChartDataFn(queriedKey, timeRange);
    }
  }, [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      const val = apiKeyInput.trim();
      if (val) {
        setModelQuery("");
        setStatusFilter("");
        setRawItems([]);
        setCurrentPage(1);
        chartCacheRef.current = {};
        if (activeTab === "usage") {
          void fetchChartDataFn(val, timeRange);
          fetchLogs(val, 1);
        } else if (activeTab === "models") {
          void fetchModelsFn(val);
        } else {
          fetchLogs(val, 1);
          void fetchChartDataFn(val, timeRange);
        }
      }
    },
    [apiKeyInput, activeTab, timeRange, fetchLogs, fetchChartDataFn, fetchModelsFn],
  );

  const handleRefresh = useCallback(() => {
    if (queriedKey) {
      if (activeTab === "usage") {
        chartCacheRef.current = {};
        void fetchChartDataFn(queriedKey, timeRange);
      } else if (activeTab === "models") {
        void fetchModelsFn(queriedKey);
      } else {
        fetchLogs(queriedKey, 1);
      }
    }
  }, [queriedKey, activeTab, timeRange, fetchLogs, fetchChartDataFn, fetchModelsFn]);

  // Strip legacy sensitive query params from the URL on mount.
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      let changed = false;
      if (url.searchParams.has("api_key")) {
        url.searchParams.delete("api_key");
        changed = true;
      }
      if (url.searchParams.has("key")) {
        url.searchParams.delete("key");
        changed = true;
      }
      if (changed) {
        window.history.replaceState({}, "", url.toString());
      }
    } catch {
      // ignore
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    chartStats,
    modelMetric,
    setModelMetric,
    dailyLegendSelected,
    dailySeries,
    dailyTrendOption,
    toggleDailyLegend,
    dailyLegendAvailability,
    modelDistributionData,
    modelDistributionOption,
    modelDistributionLegend,
  } = useApiKeyLookupCharts({
    chartData,
    compact,
    isDark,
    t,
  });

  // ── Model filter options for SearchableSelect ──
  const modelFilterOptions = useMemo(
    () => [
      { value: "", label: t("apikey_lookup.all_models"), searchText: "all models" },
      ...modelOptions.map((m) => ({ value: m, label: m, searchText: m })),
    ],
    [modelOptions, t],
  );

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdatedAt) return "";
    const d = new Date(lastUpdatedAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, [lastUpdatedAt]);

  // ================================================================
  //  Render
  // ================================================================

  return (
    <div className="relative min-h-dvh bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-950/70">
        <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 shadow-sm dark:bg-white">
              <Key size={16} className="text-white dark:text-neutral-950" />
            </div>
            <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
              {t("apikey_lookup.title")}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector className="inline-flex items-center rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10" />
            <ThemeToggleButton className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10" />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-screen-xl space-y-5 px-4 py-6 sm:px-6">
        <LookupSearchSection
          t={t}
          apiKeyInput={apiKeyInput}
          setApiKeyInput={setApiKeyInput}
          handleSubmit={handleSubmit}
          loading={loading}
        />

        {/* Error */}
        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
            {error}
          </div>
        )}

        {/* Results */}
        {queriedKey && !error && (
          <>
            <LookupResultsToolbar
              t={t}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              timeRange={timeRange}
              setTimeRange={setTimeRange}
              handleRefresh={handleRefresh}
              loading={loading}
              chartLoading={chartLoading}
              modelsLoading={modelsLoading}
            />

            {activeTab === "usage" ? (
              <UsageTabSection
                t={t}
                timeRange={timeRange}
                chartStats={chartStats}
                chartLoading={chartLoading}
                modelMetric={modelMetric}
                setModelMetric={setModelMetric}
                modelDistributionData={modelDistributionData}
                modelDistributionOption={modelDistributionOption as Record<string, unknown>}
                modelDistributionLegend={modelDistributionLegend}
                dailySeries={dailySeries}
                dailyTrendOption={dailyTrendOption as Record<string, unknown>}
                dailyLegendAvailability={dailyLegendAvailability}
                dailyLegendSelected={dailyLegendSelected}
                toggleDailyLegend={toggleDailyLegend}
              />
            ) : null}

            {activeTab === "logs" ? (
              <PublicLogsSection
                t={t}
                statusFilter={statusFilter}
                setStatusFilter={setStatusFilter}
                statusOptions={statusOptions}
                modelOptions={modelOptions}
                modelQuery={modelQuery}
                setModelQuery={setModelQuery}
                modelFilterOptions={modelFilterOptions}
                stats={stats}
                lastUpdatedText={lastUpdatedText}
                loading={loading}
                logColumns={logColumns}
                rows={rows}
                currentPage={currentPage}
                totalPages={totalPages}
                totalCount={totalCount}
                pageSize={pageSize}
                onPageChange={handlePageChange}
                onPageSizeChange={handlePageSizeChange}
              />
            ) : null}

            {activeTab === "models" ? (
              <Reveal>
                <ModelsTabContent
                  models={availableModels}
                  loading={modelsLoading}
                  error={modelsError}
                  searchFilter={modelsSearchFilter}
                  onSearchChange={setModelsSearchFilter}
                />
              </Reveal>
            ) : null}
          </>
        )}

        {/* Log Content Modal */}
        <LogContentModal
          open={contentModalOpen}
          logId={contentModalLogId}
          initialTab={contentModalTab}
          onClose={() => setContentModalOpen(false)}
          fetchPartFn={
            queriedKey
              ? async (
                  id: number,
                  part: "input" | "output",
                  options?: { signal?: AbortSignal },
                ) => {
                  const base = detectApiBaseFromLocation();
                  const url = `${base}${MANAGEMENT_API_PREFIX}/public/usage/logs/${id}/content`;
                  const resp = await fetch(url, {
                    method: "POST",
                    signal: options?.signal,
                    headers: {
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      api_key: queriedKey,
                      part,
                      format: "json",
                    }),
                  });
                  if (!resp.ok) {
                    const text = await resp.text().catch(() => "");
                    throw new Error(text || `Request failed (${resp.status})`);
                  }
                  return resp.json();
                }
              : undefined
          }
        />

        {!queriedKey && !error ? <LookupEmptyState t={t} /> : null}
      </main>
    </div>
  );
}
