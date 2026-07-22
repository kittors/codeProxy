import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Key, KeyRound } from "lucide-react";
import { isApiClientError } from "@code-proxy/api-client";
import { ThemeToggleButton } from "@code-proxy/ui";
import { LanguageSelector } from "@code-proxy/ui";
import { Reveal } from "@code-proxy/ui";
import { PageBackground } from "@code-proxy/ui";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import type { TimeRange } from "@features/monitor-widgets/monitor-constants";
import { ModelTag } from "@features/model-tags";
import { fetchPublicLogs } from "../api-key-lookup/api";
import {
  LookupResultsToolbar,
  type ApiKeyLookupTab,
} from "../api-key-lookup/components/LookupResultsToolbar";
import { LookupSearchSection } from "../api-key-lookup/components/LookupSearchSection";
import { PublicLogsSection } from "../api-key-lookup/components/PublicLogsSection";
import { QuickImportTabContent } from "../api-key-lookup/components/QuickImportTabContent";
import type { PublicLogItem } from "../api-key-lookup/types";
import {
  buildRequestLogsColumns,
  formatOptionalRequestLogLatencyMs,
  formatRequestLogLatencyMs,
  maskRequestLogApiKey,
  normalizeChannelAuthType,
  normalizeFilterSelection,
  RequestLogFilterCount,
  sortRequestLogKeyOptionsByCount,
  toFilterParam,
  toStatusFilterValues,
  type MultiSelectFilterState,
  type RequestLogsRow,
  type StatusFilterValue,
} from "@features/request-log-viewer";

const DEFAULT_PAGE_SIZE = 50;

type UsageTab = "logs" | "quickImport";

const extractServerErrorMessage = (raw: unknown): string => {
  if (isApiClientError(raw)) {
    const data = raw.data;
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const record = data as Record<string, unknown>;
      const errorValue =
        typeof record.error === "string"
          ? record.error
          : typeof record.message === "string"
            ? record.message
            : "";
      if (errorValue.trim()) return errorValue.trim();
    }
    return raw.message;
  }
  if (raw instanceof Error) return raw.message;
  if (typeof raw === "string") return raw;
  return "";
};

const localizeLookupError = (
  t: (key: string, options?: Record<string, unknown>) => string,
  raw: unknown,
  fallbackKey: string,
): string => {
  const message = extractServerErrorMessage(raw);
  const normalized = message.toLowerCase();
  if (!message) return t(fallbackKey);
  if (
    normalized.includes("invalid api key") ||
    normalized.includes("invalid apikey") ||
    normalized.includes("invalid token") ||
    normalized.includes("unauthorized")
  ) {
    return t("apikey_lookup.error_invalid_api_key");
  }
  if (normalized.includes("missing management key")) {
    return t("apikey_lookup.error_missing_management_key");
  }
  return message;
};

const readLookupKeyFromUrl = (): string => {
  try {
    const url = new URL(window.location.href);
    return (url.searchParams.get("api_key") || url.searchParams.get("key") || "").trim();
  } catch {
    return "";
  }
};

function toLogRow(item: PublicLogItem): RequestLogsRow {
  const channelAuthType = normalizeChannelAuthType(item.auth_type);
  return {
    id: String(item.id),
    timestamp: item.timestamp,
    timestampMs: new Date(item.timestamp).getTime(),
    apiKey: item.api_key || "",
    apiKeyId: item.api_key_id || "",
    apiKeyName: item.api_key_name || "",
    apiKeyOwnName: item.api_key_own_name || "",
    endUserDisplayName: item.end_user_display_name || item.api_key_name || "",
    isSystemCall: false,
    channelName: item.channel_name || "",
    channelProvider: String(item.provider ?? "").trim() || undefined,
    channelAuthType: channelAuthType || undefined,
    maskedApiKey: item.api_key_masked || maskRequestLogApiKey(item.api_key || ""),
    model: item.model,
    upstreamModel: item.upstream_model || "",
    visionFallbackModel: item.vision_fallback_model || "",
    failed: item.failed,
    streaming: item.streaming === true,
    latencyText: formatRequestLogLatencyMs(item.latency_ms),
    firstTokenText: formatOptionalRequestLogLatencyMs(item.first_token_ms ?? 0),
    inputTokens: item.input_tokens,
    cachedTokens: item.cached_tokens,
    outputTokens: item.output_tokens,
    totalTokens: item.total_tokens,
    cost: item.cost ?? 0,
    hasContent: item.has_content,
  };
}

export function ApiKeyUsagePage() {
  const { t, i18n } = useTranslation();

  const initialKey = useMemo(() => readLookupKeyFromUrl(), []);
  const [apiKeyInput, setApiKeyInput] = useState(initialKey);
  const [queriedKey, setQueriedKey] = useState(initialKey);
  const [apiKeyName, setApiKeyName] = useState("");
  const [activeTab, setActiveTab] = useState<UsageTab>("logs");
  const [quickImportReloadToken, setQuickImportReloadToken] = useState(0);
  const [timeRange, setTimeRange] = useState<TimeRange>(7);

  const [rawItems, setRawItems] = useState<PublicLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    success_rate: 0,
    total_tokens: 0,
    total_cost: 0,
  });
  const [filterOptions, setFilterOptions] = useState<{
    api_key_ids: string[];
    api_key_id_names: Record<string, string>;
    api_key_id_counts: Record<string, number>;
    models: string[];
    statuses: string[];
  }>({
    api_key_ids: [],
    api_key_id_names: {},
    api_key_id_counts: {},
    models: [],
    statuses: ["success", "failed"],
  });
  const [selectedApiKeyIds, setSelectedApiKeyIds] = useState<MultiSelectFilterState<string>>(null);
  const [selectedModels, setSelectedModels] = useState<MultiSelectFilterState<string>>(null);
  const [selectedStatuses, setSelectedStatuses] =
    useState<MultiSelectFilterState<StatusFilterValue>>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const paginationInFlightRef = useRef(false);
  const restoredLookupFetchedRef = useRef(false);

  const logColumns = useMemo(
    () =>
      buildRequestLogsColumns((key) => t(key), undefined, undefined, {
        identityColumn: "key",
        hideChannel: true,
      }),
    [t],
  );

  const keyOptions = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    const options = (filterOptions.api_key_ids ?? []).map((id) => {
      const name = filterOptions.api_key_id_names?.[id] || id;
      return {
        value: id,
        label: name,
        searchText: name,
        count: filterOptions.api_key_id_counts?.[id] ?? 0,
      };
    });
    return sortRequestLogKeyOptionsByCount(options, i18n.resolvedLanguage).map((option) => ({
      value: option.value,
      label: option.label,
      searchText: option.searchText,
      trailing: <RequestLogFilterCount count={option.count} />,
    }));
  }, [
    filterOptions.api_key_id_counts,
    filterOptions.api_key_id_names,
    filterOptions.api_key_ids,
    i18n.resolvedLanguage,
  ]);

  const modelOptions = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    return filterOptions.models.map((model) => ({
      value: model,
      label: <ModelTag id={model} size="sm" />,
      searchText: model,
    }));
  }, [filterOptions.models]);

  const statusOptions = useMemo<SearchableCheckboxMultiSelectOption[]>(() => {
    const statuses =
      filterOptions.statuses.length > 0 ? filterOptions.statuses : ["success", "failed"];
    return statuses.map((status) => ({
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

  const apiKeyIdFilterValues = useMemo(
    () => keyOptions.map((option) => option.value),
    [keyOptions],
  );
  const modelFilterValues = useMemo(
    () => modelOptions.map((option) => option.value),
    [modelOptions],
  );
  const statusFilterValues = useMemo<StatusFilterValue[]>(
    () => toStatusFilterValues(statusOptions.map((option) => option.value)),
    [statusOptions],
  );
  const apiKeyIdFilterParam = useMemo(
    () => toFilterParam(selectedApiKeyIds, apiKeyIdFilterValues),
    [apiKeyIdFilterValues, selectedApiKeyIds],
  );
  const modelFilterParam = useMemo(
    () => toFilterParam(selectedModels, modelFilterValues),
    [modelFilterValues, selectedModels],
  );
  const statusFilterParam = useMemo(
    () => toFilterParam(selectedStatuses, statusFilterValues),
    [selectedStatuses, statusFilterValues],
  );

  const handleApiKeyIdsChange = useCallback(
    (value: string[]) => {
      setSelectedApiKeyIds(normalizeFilterSelection(value, apiKeyIdFilterValues));
    },
    [apiKeyIdFilterValues],
  );
  const handleModelsChange = useCallback(
    (value: string[]) => {
      setSelectedModels(normalizeFilterSelection(value, modelFilterValues));
    },
    [modelFilterValues],
  );
  const handleStatusesChange = useCallback(
    (value: StatusFilterValue[]) => {
      setSelectedStatuses(normalizeFilterSelection(value, statusFilterValues));
    },
    [statusFilterValues],
  );
  const clearApiKeyIdFilter = useCallback(() => setSelectedApiKeyIds(null), []);
  const clearModelFilter = useCallback(() => setSelectedModels(null), []);
  const clearStatusFilter = useCallback(() => setSelectedStatuses(null), []);

  const fetchLogs = useCallback(
    async (apiKey: string, page: number, size?: number) => {
      const trimmed = apiKey.trim();
      if (!trimmed || paginationInFlightRef.current) return;
      paginationInFlightRef.current = true;

      abortControllerRef.current?.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;
      const myFetchId = ++fetchIdRef.current;

      setLoading(true);
      setError(null);

      try {
        const resp = await fetchPublicLogs({
          apiKey: trimmed,
          page,
          size: size ?? pageSize,
          days: timeRange,
          apiKeyIds: apiKeyIdFilterParam.values,
          models: modelFilterParam.values,
          statuses: statusFilterParam.values,
          apiKeyIdsEmpty: apiKeyIdFilterParam.matchesNone,
          modelsEmpty: modelFilterParam.matchesNone,
          statusesEmpty: statusFilterParam.matchesNone,
          signal: controller.signal,
        });
        if (myFetchId !== fetchIdRef.current) return;

        setRawItems(resp.items ?? []);
        setTotalCount(resp.total ?? 0);
        setCurrentPage(page);
        setStats(
          resp.stats ?? {
            total: 0,
            success_rate: 0,
            total_tokens: 0,
            total_cost: 0,
          },
        );
        setFilterOptions({
          api_key_ids: resp.filters?.api_key_ids ?? [],
          api_key_id_names: resp.filters?.api_key_id_names ?? {},
          api_key_id_counts: resp.filters?.api_key_id_counts ?? {},
          models: resp.filters?.models ?? [],
          statuses: resp.filters?.statuses ?? ["success", "failed"],
        });
        setLastUpdatedAt(Date.now());
        setApiKeyName(resp.api_key_name?.trim() ?? "");
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (myFetchId !== fetchIdRef.current) return;
        setError(localizeLookupError(t, err, "apikey_lookup.query_failed"));
        setRawItems([]);
        setTotalCount(0);
        setStats({ total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
      } finally {
        paginationInFlightRef.current = false;
        if (myFetchId === fetchIdRef.current) setLoading(false);
      }
    },
    [apiKeyIdFilterParam, modelFilterParam, pageSize, statusFilterParam, t, timeRange],
  );

  const rows = useMemo(() => rawItems.map((item) => toLogRow(item)), [rawItems]);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handlePageChange = useCallback(
    (page: number) => {
      if (!queriedKey) return;
      fetchLogs(queriedKey, Math.max(1, Math.min(page, totalPages)));
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

  const handleSubmit = useCallback(
    (event?: React.FormEvent) => {
      event?.preventDefault();
      const next = apiKeyInput.trim();
      if (!next) return;
      setQueriedKey(next);
      setActiveTab("logs");
      setSelectedApiKeyIds(null);
      setSelectedModels(null);
      setSelectedStatuses(null);
      setQuickImportReloadToken((value) => value + 1);
      fetchLogs(next, 1);
    },
    [apiKeyInput, fetchLogs],
  );

  const handleRefresh = useCallback(() => {
    if (!queriedKey) return;
    if (activeTab === "quickImport") {
      setQuickImportReloadToken((value) => value + 1);
      return;
    }
    fetchLogs(queriedKey, 1);
  }, [activeTab, fetchLogs, queriedKey]);

  useEffect(() => {
    if (queriedKey && activeTab === "logs") fetchLogs(queriedKey, 1);
  }, [timeRange, selectedApiKeyIds, selectedModels, selectedStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialKey || restoredLookupFetchedRef.current) return;
    restoredLookupFetchedRef.current = true;
    fetchLogs(initialKey, 1);
  }, [fetchLogs, initialKey]);

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
      if (changed) window.history.replaceState({}, "", url.toString());
    } catch {
      // ignore
    }
  }, [initialKey]);

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdatedAt) return "";
    const d = new Date(lastUpdatedAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, [lastUpdatedAt]);

  const displayName = apiKeyName || (queriedKey ? t("apikey_lookup.unnamed_key") : "");

  return (
    <PageBackground variant="app">
      <div className="relative min-h-dvh bg-gradient-to-br from-slate-50 via-white to-slate-100 pt-14 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
        <header
          data-testid="apikey-usage-header"
          className="fixed inset-x-0 top-0 z-30 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-950/70"
        >
          <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-900 shadow-sm dark:bg-white">
                <Key size={16} className="text-white dark:text-neutral-950" />
              </div>
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {t("apikey_usage.title")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {queriedKey ? (
                <div className="inline-flex max-w-[34vw] items-center gap-1.5 rounded-xl px-1 py-1 text-sm font-medium text-slate-700 dark:text-white/80 sm:max-w-56">
                  <KeyRound size={14} className="shrink-0" />
                  <span className="min-w-0 truncate">{displayName}</span>
                </div>
              ) : null}
              <LanguageSelector />
              <ThemeToggleButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-screen-xl space-y-4 px-4 py-6 sm:px-6">
          <LookupSearchSection
            t={t}
            apiKeyInput={apiKeyInput}
            setApiKeyInput={(value) => {
              setApiKeyInput(value);
              setError(null);
            }}
            handleSubmit={handleSubmit}
            loading={loading}
          />

          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {queriedKey && !error ? (
            <>
              <LookupResultsToolbar
                t={t}
                activeTab={activeTab as ApiKeyLookupTab}
                setActiveTab={(value) => {
                  if (value === "logs" || value === "quickImport") setActiveTab(value);
                }}
                timeRange={timeRange}
                setTimeRange={setTimeRange}
                handleRefresh={handleRefresh}
                loading={loading}
                chartLoading={false}
                modelsLoading={false}
                tabs={["logs", "quickImport"]}
              />

              {activeTab === "logs" ? (
                <PublicLogsSection
                  t={t}
                  keyOptions={keyOptions}
                  modelOptions={modelOptions}
                  statusOptions={statusOptions}
                  selectedApiKeyIds={selectedApiKeyIds}
                  selectedModels={selectedModels}
                  selectedStatuses={selectedStatuses}
                  onApiKeyIdsChange={handleApiKeyIdsChange}
                  onModelsChange={handleModelsChange}
                  onStatusesChange={handleStatusesChange}
                  onApiKeyIdsClear={clearApiKeyIdFilter}
                  onModelsClear={clearModelFilter}
                  onStatusesClear={clearStatusFilter}
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

              {activeTab === "quickImport" ? (
                <Reveal>
                  <QuickImportTabContent apiKey={queriedKey} reloadToken={quickImportReloadToken} />
                </Reveal>
              ) : null}
            </>
          ) : null}
        </main>
      </div>
    </PageBackground>
  );
}
