import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, Key, KeyRound, LogOut, Search } from "lucide-react";
import { isApiClientError } from "@code-proxy/api-client";
import { Button } from "@code-proxy/ui";
import { DropdownMenu } from "@code-proxy/ui";
import { LanguageSelector } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { PageBackground } from "@code-proxy/ui";
import { Reveal } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { ThemeToggleButton } from "@code-proxy/ui";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import type { TimeRange } from "@features/monitor-widgets/monitor-constants";
import { ModelTag } from "@features/model-tags";
import { fetchPublicLogs, fetchPublicUsageSummary } from "../api-key-lookup/api";
import {
  LookupResultsToolbar,
  type ApiKeyLookupTab,
} from "../api-key-lookup/components/LookupResultsToolbar";
import { PublicLogsSection } from "../api-key-lookup/components/PublicLogsSection";
import { QuickImportTabContent } from "../api-key-lookup/components/QuickImportTabContent";
import type { PublicLogItem, PublicQuotaScope, PublicUsageLimits } from "../api-key-lookup/types";
import {
  buildRequestLogsColumns,
  formatOptionalRequestLogLatencyMs,
  formatRequestLogLatencyMs,
  maskRequestLogApiKey,
  normalizeChannelAuthType,
  normalizeFilterSelection,
  toFilterParam,
  toStatusFilterValues,
  type MultiSelectFilterState,
  type RequestLogsRow,
  type StatusFilterValue,
} from "@features/request-log-viewer";

const DEFAULT_PAGE_SIZE = 50;
// ponytail: plain localStorage key; no multi-account until users ask
const LAST_API_KEY_STORAGE_KEY = "apiKeyUsage.lastApiKey.v1";

type UsageTab = "logs" | "quickImport";

type StoredUsageKey = {
  apiKey: string;
  name?: string;
};

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

const readStoredUsageKey = (): StoredUsageKey | null => {
  try {
    const raw = window.localStorage.getItem(LAST_API_KEY_STORAGE_KEY);
    if (!raw) return null;
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as Partial<StoredUsageKey>;
      const apiKey = String(parsed.apiKey ?? "").trim();
      if (!apiKey) return null;
      const name = String(parsed.name ?? "").trim();
      return name ? { apiKey, name } : { apiKey };
    }
    const apiKey = raw.trim();
    return apiKey ? { apiKey } : null;
  } catch {
    return null;
  }
};

const writeStoredUsageKey = (value: StoredUsageKey | null): void => {
  try {
    if (!value?.apiKey.trim()) {
      window.localStorage.removeItem(LAST_API_KEY_STORAGE_KEY);
      return;
    }
    window.localStorage.setItem(
      LAST_API_KEY_STORAGE_KEY,
      JSON.stringify({
        apiKey: value.apiKey.trim(),
        ...(value.name?.trim() ? { name: value.name.trim() } : {}),
      }),
    );
  } catch {
    // ignore storage failures
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
  const { t } = useTranslation();

  const bootstrap = useMemo(() => {
    const fromUrl = readLookupKeyFromUrl();
    if (fromUrl) return { apiKey: fromUrl } satisfies StoredUsageKey;
    return readStoredUsageKey();
  }, []);

  const [apiKeyInput, setApiKeyInput] = useState(bootstrap?.apiKey ?? "");
  const [queriedKey, setQueriedKey] = useState(bootstrap?.apiKey ?? "");
  const [apiKeyName, setApiKeyName] = useState(bootstrap?.name ?? "");
  const [keyModalOpen, setKeyModalOpen] = useState(!bootstrap?.apiKey);
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
    models: string[];
    statuses: string[];
  }>({
    models: [],
    statuses: ["success", "failed"],
  });
  const [selectedModels, setSelectedModels] = useState<MultiSelectFilterState<string>>(null);
  const [selectedStatuses, setSelectedStatuses] =
    useState<MultiSelectFilterState<StatusFilterValue>>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const paginationInFlightRef = useRef(false);
  const restoredLookupFetchedRef = useRef(false);

  const [quotaLimits, setQuotaLimits] = useState<PublicUsageLimits | null>(null);
  const [quotaScopes, setQuotaScopes] = useState<PublicQuotaScope[]>([]);
  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const summaryFetchIdRef = useRef(0);

  const logColumns = useMemo(
    () =>
      buildRequestLogsColumns((key) => t(key), undefined, undefined, {
        identityColumn: "none",
        hideChannel: true,
      }),
    [t],
  );

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

  const modelFilterValues = useMemo(
    () => modelOptions.map((option) => option.value),
    [modelOptions],
  );
  const statusFilterValues = useMemo<StatusFilterValue[]>(
    () => toStatusFilterValues(statusOptions.map((option) => option.value)),
    [statusOptions],
  );
  const modelFilterParam = useMemo(
    () => toFilterParam(selectedModels, modelFilterValues),
    [modelFilterValues, selectedModels],
  );
  const statusFilterParam = useMemo(
    () => toFilterParam(selectedStatuses, statusFilterValues),
    [selectedStatuses, statusFilterValues],
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
  const clearModelFilter = useCallback(() => setSelectedModels(null), []);
  const clearStatusFilter = useCallback(() => setSelectedStatuses(null), []);

  const resetResults = useCallback(() => {
    abortControllerRef.current?.abort();
    summaryAbortControllerRef.current?.abort();
    fetchIdRef.current += 1;
    summaryFetchIdRef.current += 1;
    paginationInFlightRef.current = false;
    setLoading(false);
    setError(null);
    setRawItems([]);
    setTotalCount(0);
    setCurrentPage(1);
    setLastUpdatedAt(null);
    setStats({ total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
    setFilterOptions({
      models: [],
      statuses: ["success", "failed"],
    });
    setSelectedModels(null);
    setSelectedStatuses(null);
    setApiKeyName("");
    setQuotaLimits(null);
    setQuotaScopes([]);
  }, []);

  const fetchQuotaLimits = useCallback(async (apiKey: string) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    summaryAbortControllerRef.current?.abort();
    const controller = new AbortController();
    summaryAbortControllerRef.current = controller;
    const myFetchId = ++summaryFetchIdRef.current;
    try {
      const summary = await fetchPublicUsageSummary({
        apiKey: trimmed,
        signal: controller.signal,
      });
      if (myFetchId !== summaryFetchIdRef.current || controller.signal.aborted) return;
      setQuotaLimits(summary.limits ?? null);
      setQuotaScopes(summary["quota-scopes"] ?? []);
    } catch {
      if (myFetchId !== summaryFetchIdRef.current || controller.signal.aborted) return;
      setQuotaLimits(null);
      setQuotaScopes([]);
    } finally {
      if (summaryAbortControllerRef.current === controller) {
        summaryAbortControllerRef.current = null;
      }
    }
  }, []);

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
          models: modelFilterParam.values,
          statuses: statusFilterParam.values,
          modelsEmpty: modelFilterParam.matchesNone,
          statusesEmpty: statusFilterParam.matchesNone,
          signal: controller.signal,
        });
        if (myFetchId !== fetchIdRef.current) return;

        const nextName = resp.api_key_name?.trim() ?? "";
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
          models: resp.filters?.models ?? [],
          statuses: resp.filters?.statuses ?? ["success", "failed"],
        });
        setLastUpdatedAt(Date.now());
        setApiKeyName(nextName);
        writeStoredUsageKey({ apiKey: trimmed, ...(nextName ? { name: nextName } : {}) });
        setKeyModalOpen(false);
        void fetchQuotaLimits(trimmed);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (myFetchId !== fetchIdRef.current) return;
        setError(localizeLookupError(t, err, "apikey_lookup.query_failed"));
        setRawItems([]);
        setTotalCount(0);
        setStats({ total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
        setQuotaLimits(null);
        setQuotaScopes([]);
      } finally {
        paginationInFlightRef.current = false;
        if (myFetchId === fetchIdRef.current) setLoading(false);
      }
    },
    [fetchQuotaLimits, modelFilterParam, pageSize, statusFilterParam, t, timeRange],
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
      // Drop previous key label immediately so a stale localStorage/account name cannot flash.
      setApiKeyName("");
      setActiveTab("logs");
      setSelectedModels(null);
      setSelectedStatuses(null);
      setQuickImportReloadToken((value) => value + 1);
      writeStoredUsageKey({ apiKey: next });
      fetchLogs(next, 1);
    },
    [apiKeyInput, fetchLogs],
  );

  const handleLogout = useCallback(() => {
    writeStoredUsageKey(null);
    setQueriedKey("");
    setApiKeyInput("");
    resetResults();
    setKeyModalOpen(true);
  }, [resetResults]);

  const handleRefresh = useCallback(() => {
    if (!queriedKey) return;
    if (activeTab === "quickImport") {
      setQuickImportReloadToken((value) => value + 1);
      return;
    }
    void fetchQuotaLimits(queriedKey);
    fetchLogs(queriedKey, 1);
  }, [activeTab, fetchLogs, fetchQuotaLimits, queriedKey]);

  useEffect(() => {
    if (queriedKey && activeTab === "logs") {
      void fetchQuotaLimits(queriedKey);
      fetchLogs(queriedKey, 1);
    }
  }, [timeRange, selectedModels, selectedStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bootstrap?.apiKey || restoredLookupFetchedRef.current) return;
    restoredLookupFetchedRef.current = true;
    void fetchQuotaLimits(bootstrap.apiKey);
    fetchLogs(bootstrap.apiKey, 1);
  }, [bootstrap, fetchLogs, fetchQuotaLimits]);

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
  }, []);

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdatedAt) return "";
    const d = new Date(lastUpdatedAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, [lastUpdatedAt]);

  const displayName = apiKeyName || (queriedKey ? t("apikey_lookup.unnamed_key") : "");
  const headerControlClass =
    "inline-flex items-center rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10";

  return (
    <PageBackground variant="app">
      <div className="relative min-h-dvh bg-gradient-to-br from-slate-50 via-white to-slate-100 pt-14 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950">
        <header
          data-testid="apikey-usage-header"
          className="fixed inset-x-0 top-0 z-30 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-950/70"
        >
          <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-900 shadow-sm dark:bg-white">
                <Key size={16} className="text-white dark:text-neutral-950" />
              </div>
              <span className="truncate text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {t("apikey_usage.title")}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {queriedKey ? (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      aria-label={displayName}
                      data-testid="apikey-usage-key-menu"
                      className="inline-flex max-w-[34vw] items-center gap-1.5 rounded-xl px-1 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10 sm:max-w-56"
                    >
                      <KeyRound size={14} className="shrink-0" />
                      <span className="min-w-0 truncate">{displayName}</span>
                      <ChevronRight
                        size={14}
                        className="shrink-0 rotate-90 text-slate-400 dark:text-white/40"
                      />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content align="end" sideOffset={8} className="min-w-44">
                      <DropdownMenu.Item
                        data-testid="apikey-usage-switch-key"
                        onSelect={() => {
                          setApiKeyInput(queriedKey);
                          setKeyModalOpen(true);
                        }}
                      >
                        <KeyRound size={14} />
                        {t("apikey_usage.switch_key")}
                      </DropdownMenu.Item>
                      <DropdownMenu.Item data-testid="apikey-usage-logout" onSelect={handleLogout}>
                        <LogOut size={14} />
                        {t("apikey_usage.logout")}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  data-testid="apikey-usage-open-modal"
                  onClick={() => setKeyModalOpen(true)}
                >
                  {t("apikey_lookup.query")}
                </Button>
              )}
              <LanguageSelector className={headerControlClass} />
              <ThemeToggleButton className={headerControlClass} />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-screen-xl space-y-4 px-4 py-6 sm:px-6">
          {error && queriedKey ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {queriedKey ? (
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
                quotaLimits={quotaLimits}
                quotaScopes={quotaScopes}
                tabs={["logs", "quickImport"]}
              />

              {activeTab === "logs" ? (
                <PublicLogsSection
                  t={t}
                  modelOptions={modelOptions}
                  statusOptions={statusOptions}
                  selectedModels={selectedModels}
                  selectedStatuses={selectedStatuses}
                  onModelsChange={handleModelsChange}
                  onStatusesChange={handleStatusesChange}
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
          ) : (
            <div
              data-testid="apikey-usage-empty"
              className="rounded-3xl border border-dashed border-slate-200 px-6 py-16 text-center dark:border-neutral-800"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60">
                <KeyRound size={22} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white">
                {t("apikey_usage.empty_title")}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-slate-500 dark:text-white/55">
                {t("apikey_usage.empty_desc")}
              </p>
              <div className="mt-6">
                <Button variant="primary" onClick={() => setKeyModalOpen(true)}>
                  {t("apikey_lookup.query")}
                </Button>
              </div>
            </div>
          )}
        </main>

        <Modal
          open={keyModalOpen}
          title={t("apikey_usage.modal_title")}
          hideHeader
          maxWidth="max-w-md"
          panelClassName="rounded-3xl border-white/70 bg-white/95 shadow-xl shadow-slate-300/25 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/90 dark:shadow-black/25"
          bodyClassName="!px-7 !py-8 sm:!px-9 sm:!py-9"
          bodyHeightClassName="max-h-none"
          bodyOverflowClassName="overflow-visible"
          onClose={() => {
            // Keep the modal when no key is active so users always have an entry point.
            if (queriedKey) setKeyModalOpen(false);
          }}
        >
          <div className="space-y-6">
            <div className="space-y-2 pr-8">
              <h2 className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
                {t("apikey_usage.modal_title")}
              </h2>
              <p className="text-sm text-slate-500 dark:text-white/55">
                {t("apikey_usage.modal_desc")}
              </p>
            </div>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <label className="block space-y-2">
                <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                  {t("apikey_lookup.api_key_label")}
                </span>
                <TextInput
                  type="password"
                  id="apikey-usage-input"
                  value={apiKeyInput}
                  onChange={(e) => {
                    setApiKeyInput(e.target.value);
                    setError(null);
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  autoFocus
                  className="rounded-full px-5"
                  placeholder={t("apikey_lookup.placeholder")}
                  startAdornment={<Search size={16} />}
                />
              </label>
              {error && !queriedKey ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
                  {error}
                </div>
              ) : null}
              <Button
                variant="primary"
                type="submit"
                data-testid="apikey-usage-submit"
                disabled={!apiKeyInput.trim() || loading}
                className="w-full"
              >
                {loading ? (
                  <span
                    className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none motion-safe:animate-spin dark:border-neutral-950/30 dark:border-t-neutral-950"
                    aria-hidden="true"
                  />
                ) : null}
                {t("apikey_lookup.query")}
              </Button>
            </form>
          </div>
        </Modal>
      </div>
    </PageBackground>
  );
}
