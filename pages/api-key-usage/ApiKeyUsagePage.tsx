import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, ChevronRight, Key, KeyRound, LogOut, Wallet } from "@code-proxy/ui/icons";
import {
  apiKeyBillingApi,
  isApiClientError,
  type APIKeyBillingOverview,
} from "@code-proxy/api-client";
import { Button, DropdownMenu, LanguageSelector, PageBackground, PageLoader, Reveal, ThemeToggleButton, cn, surface } from "@code-proxy/ui";
import type { TimeRange } from "@features/monitor-widgets/monitor-constants";
import { fetchPublicLogs, fetchPublicUsageSummary } from "../api-key-lookup/api";
import {
  LookupResultsToolbar,
  type ApiKeyLookupTab,
} from "../api-key-lookup/components/LookupResultsToolbar";
import { PublicLogsSection } from "../api-key-lookup/components/PublicLogsSection";
import { toLogRow } from "../api-key-lookup/toLogRow";
import { usePublicLogFilters } from "../api-key-lookup/hooks/usePublicLogFilters";
import { QuickImportTabContent } from "../api-key-lookup/components/QuickImportTabContent";
import type { PublicLogItem, PublicQuotaScope, PublicUsageLimits } from "../api-key-lookup/types";
import { ApiKeyUsageKeyModal } from "./ApiKeyUsageKeyModal";

const KeyBillingPanel = lazy(() =>
  import("@features/portal-billing").then((m) => ({ default: m.KeyBillingPanel })),
);

const DEFAULT_PAGE_SIZE = 50;
// ponytail: plain localStorage key; no multi-account until users ask
const LAST_API_KEY_STORAGE_KEY = "apiKeyUsage.lastApiKey.v1";

type UsageTab = "logs" | "billing" | "quickImport";

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
  const logFilters = usePublicLogFilters();

  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const paginationInFlightRef = useRef(false);
  const restoredLookupFetchedRef = useRef(false);

  const [quotaLimits, setQuotaLimits] = useState<PublicUsageLimits | null>(null);
  const [quotaScopes, setQuotaScopes] = useState<PublicQuotaScope[]>([]);
  const [billingOverview, setBillingOverview] = useState<APIKeyBillingOverview | null>(null);
  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const summaryFetchIdRef = useRef(0);
  const billingFetchIdRef = useRef(0);

  const resetResults = useCallback(() => {
    abortControllerRef.current?.abort();
    summaryAbortControllerRef.current?.abort();
    fetchIdRef.current += 1;
    summaryFetchIdRef.current += 1;
    billingFetchIdRef.current += 1;
    paginationInFlightRef.current = false;
    setLoading(false);
    setError(null);
    setRawItems([]);
    setTotalCount(0);
    setCurrentPage(1);
    setLastUpdatedAt(null);
    setStats({ total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
    logFilters.reset();
    setApiKeyName("");
    setQuotaLimits(null);
    setQuotaScopes([]);
    setBillingOverview(null);
  }, [logFilters.reset]);

  const fetchBillingOverview = useCallback(async (apiKey: string) => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    const myId = ++billingFetchIdRef.current;
    try {
      const ov = await apiKeyBillingApi.overview(trimmed);
      if (myId !== billingFetchIdRef.current) return;
      setBillingOverview(ov);
    } catch {
      // Older backends without key-scoped billing return 404; degrade silently.
      if (myId !== billingFetchIdRef.current) return;
      setBillingOverview(null);
    }
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
          models: logFilters.query.models,
          statuses: logFilters.query.statuses,
          clientNames: logFilters.query.clientNames,
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
        logFilters.readResponse(resp);
        setLastUpdatedAt(Date.now());
        setApiKeyName(nextName);
        writeStoredUsageKey({ apiKey: trimmed, ...(nextName ? { name: nextName } : {}) });
        setKeyModalOpen(false);
        void fetchQuotaLimits(trimmed);
        void fetchBillingOverview(trimmed);
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
    [fetchBillingOverview, fetchQuotaLimits, logFilters.query, logFilters.readResponse, pageSize, t, timeRange],
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
      logFilters.reset();
      setQuickImportReloadToken((value) => value + 1);
      writeStoredUsageKey({ apiKey: next });
      fetchLogs(next, 1);
    },
    [apiKeyInput, fetchLogs, logFilters.reset],
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
  }, [timeRange, logFilters.filters]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bootstrap?.apiKey || restoredLookupFetchedRef.current) return;
    restoredLookupFetchedRef.current = true;
    void fetchQuotaLimits(bootstrap.apiKey);
    void fetchBillingOverview(bootstrap.apiKey);
    fetchLogs(bootstrap.apiKey, 1);
  }, [bootstrap, fetchBillingOverview, fetchLogs, fetchQuotaLimits]);

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

  const showBillingTab = Boolean(
    billingOverview && (billingOverview.enabled || billingOverview.has_billing_info),
  );
  const expiryMeta = useMemo(() => {
    const iso = billingOverview?.target?.expires_at;
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (Number.isNaN(ms)) return null;
    const diff = ms - Date.now();
    const expired = diff <= 0;
    const days = Math.max(1, Math.ceil(diff / (24 * 3600 * 1000)));
    return {
      expired,
      soon: !expired && diff <= 3 * 24 * 3600 * 1000,
      days,
      formatted: new Date(ms).toLocaleString(),
    };
  }, [billingOverview]);

  const displayName = apiKeyName || (queriedKey ? t("apikey_lookup.unnamed_key") : "");

  return (
    <PageBackground variant="app">
      <div className="relative min-h-dvh pt-14">
        {/* 顶栏是页面底色的半透明毛玻璃，不画底边线：内容滚到下面时靠模糊和页面拉开。 */}
        <header
          data-testid="apikey-usage-header"
          className="fixed inset-x-0 top-0 z-30 bg-sn-workspace/80 backdrop-blur-xl"
        >
          <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between gap-3 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-sn-label">
                <Key size={16} className="text-sn-workspace" />
              </div>
              <span className="truncate text-base font-bold tracking-tight text-sn-label">
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
                      className="inline-flex max-w-[34vw] items-center gap-1.5 rounded-xl px-1 py-1 text-sm font-medium text-sn-label2 transition hover:bg-sn-hover hover:text-sn-label sm:max-w-56"
                    >
                      <KeyRound size={14} className="shrink-0" />
                      <span className="min-w-0 truncate">{displayName}</span>
                      <ChevronRight size={14} className="shrink-0 rotate-90 text-sn-label3" />
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
              <LanguageSelector size="sm" />
              <ThemeToggleButton size="sm" />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-screen-xl space-y-4 px-4 py-6 sm:px-6">
          {error && queriedKey ? (
            <div className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-700 dark:bg-rose-400/15 dark:text-rose-300">
              {error}
            </div>
          ) : null}

          {queriedKey ? (
            <>
              <LookupResultsToolbar
                t={t}
                activeTab={activeTab as ApiKeyLookupTab}
                setActiveTab={(value) => {
                  if (value === "logs" || value === "billing" || value === "quickImport") {
                    setActiveTab(value);
                  }
                }}
                timeRange={timeRange}
                setTimeRange={setTimeRange}
                handleRefresh={handleRefresh}
                loading={loading}
                chartLoading={false}
                modelsLoading={false}
                quotaLimits={quotaLimits}
                quotaScopes={quotaScopes}
                showBillingTab={showBillingTab}
                tabs={showBillingTab ? ["logs", "billing", "quickImport"] : ["logs", "quickImport"]}
              />

              {activeTab !== "billing" && (expiryMeta || billingOverview?.enabled) ? (
                <div
                  data-testid="apikey-usage-billing-banner"
                  className={cn(
                    surface({ tone: "card", radius: "2xl" }),
                    "flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs",
                    expiryMeta?.expired
                      ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      : expiryMeta?.soon
                        ? "bg-amber-500/10 text-amber-800 dark:text-amber-300"
                        : "text-sn-label2",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {expiryMeta ? (
                      <>
                        <CalendarClock size={15} className="shrink-0" />
                        <span>
                          {expiryMeta.expired
                            ? t("billing.expiry_banner_expired", { date: expiryMeta.formatted })
                            : t("billing.expiry_banner_active", {
                                date: expiryMeta.formatted,
                                days: expiryMeta.days,
                              })}
                        </span>
                      </>
                    ) : (
                      <>
                        <Wallet size={15} className="shrink-0 text-sn-accent-ink" />
                        <span>
                          {t("billing.key_banner_plans_available", {
                            count: billingOverview?.target.plans.length ?? 0,
                          })}
                        </span>
                      </>
                    )}
                  </div>
                  {showBillingTab ? (
                    <Button
                      size="sm"
                      variant={expiryMeta?.expired ? "primary" : "secondary"}
                      onClick={() => setActiveTab("billing")}
                    >
                      <Wallet size={14} />
                      {t("billing.view_plans_and_renew")}
                    </Button>
                  ) : null}
                </div>
              ) : null}

              {activeTab === "logs" ? (
                <PublicLogsSection
                  logFilters={logFilters}
                  identity="none"
                  stats={stats}
                  lastUpdatedAt={lastUpdatedAt}
                  loading={loading}
                  rows={rows}
                  currentPage={currentPage}
                  totalCount={totalCount}
                  pageSize={pageSize}
                  onPageChange={handlePageChange}
                  onPageSizeChange={handlePageSizeChange}
                />
              ) : null}

              {activeTab === "billing" && showBillingTab ? (
                <Reveal>
                  <Suspense
                    fallback={
                      <div className="flex items-center justify-center py-16">
                        <PageLoader variant="inline" text={t("common.loading")} />
                      </div>
                    }
                  >
                    <KeyBillingPanel
                      apiKey={queriedKey}
                      initialOverview={billingOverview}
                      onOverviewUpdated={setBillingOverview}
                      onOrderFulfilled={() => {
                        void fetchBillingOverview(queriedKey);
                        void fetchQuotaLimits(queriedKey);
                      }}
                    />
                  </Suspense>
                </Reveal>
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
              className="rounded-xl bg-sn-subtle px-6 py-16 text-center"
            >
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-sn-label/[0.05] text-sn-label2 dark:bg-white/[0.07]">
                <KeyRound size={22} />
              </div>
              <h2 className="mt-4 text-lg font-semibold text-sn-label">
                {t("apikey_usage.empty_title")}
              </h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-sn-label3">
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

        <ApiKeyUsageKeyModal
          t={t}
          open={keyModalOpen}
          value={apiKeyInput}
          error={error && !queriedKey ? error : null}
          loading={loading}
          onChange={(value) => {
            setApiKeyInput(value);
            setError(null);
          }}
          onSubmit={handleSubmit}
          // 没有已查询的 Key 时也允许关闭：顶栏和空状态里都有「查询」按钮能再打开，
          // 以前这里忽略关闭，右上角的关闭按钮点了没有任何反应。
          onClose={() => setKeyModalOpen(false)}
        />
      </div>
    </PageBackground>
  );
}
