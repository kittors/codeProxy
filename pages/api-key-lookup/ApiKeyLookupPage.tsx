import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Check,
  ChevronRight,
  Eye,
  EyeOff,
  Key,
  KeyRound,
  LogOut,
  UserPlus,
  Users,
  UserRound,
} from "lucide-react";
import {
  extractApiErrorCode,
  isApiClientError,
  portalApi,
  type EndUser,
  type EndUserAPIKey,
  type SavedPortalAccount,
} from "@code-proxy/api-client";
import { resolveLoginErrorMessage } from "../login/loginErrors";
import { useTheme } from "@code-proxy/ui";
import { ThemeToggleButton } from "@code-proxy/ui";
import { LanguageSelector } from "@code-proxy/ui";
import { Reveal } from "@code-proxy/ui";
import { Button } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { PageBackground } from "@code-proxy/ui";
import { SecretRevealModal } from "@code-proxy/ui";
import { DropdownMenu } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import type { SearchableCheckboxMultiSelectOption } from "@code-proxy/ui";
import type { TimeRange } from "@features/monitor-widgets/monitor-constants";
import { LogContentModal } from "@features/log-content-viewer";
import { ModelTag } from "@features/model-tags";
import {
  fetchAvailableModels,
  fetchPublicChartData,
  fetchPublicLogContent,
  fetchPublicLogs,
  fetchPublicUsageSummary,
  type PublicModelItem,
} from "./api";
import { LookupEmptyState } from "./components/LookupEmptyState";
import { LookupResultsToolbar, type ApiKeyLookupTab } from "./components/LookupResultsToolbar";
import { ManageKeysTabContent } from "./components/ManageKeysTabContent";
import { ModelsTabContent } from "./components/ModelsTabContent";
import { PublicLogsSection } from "./components/PublicLogsSection";
import { QuickImportTabContent } from "./components/QuickImportTabContent";
import { UsageTabSection } from "./components/UsageTabSection";
import { useApiKeyLookupCharts } from "./hooks/useApiKeyLookupCharts";
import type { ChartDataResponse, PublicLogItem, PublicUsageLimits } from "./types";
import {
  buildRequestLogsColumns,
  formatOptionalRequestLogLatencyMs,
  formatRequestLogLatencyMs,
  normalizeChannelAuthType,
  normalizeFilterSelection,
  toFilterParam,
  toStatusFilterValues,
  maskRequestLogApiKey,
  type MultiSelectFilterState,
  type RequestLogsRow,
  type StatusFilterValue,
} from "@features/request-log-viewer";
import {
  clearTenantBucketMap,
  getActiveCacheTenantId,
  readTenantBucketMapEntry,
  updateTenantBucketMapEntry,
} from "@code-proxy/domain";

const DEFAULT_PAGE_SIZE = 50;
/** Tenant-scoped chart cache (v2). Legacy v1 migrates into the default tenant only. */
const LOOKUP_CHART_CACHE_STORAGE_KEY = "apiKeyLookup.chartCache.v2";
const LOOKUP_CHART_CACHE_STORAGE_KEY_V1 = "apiKeyLookup.chartCache.v1";
const LOOKUP_MODELS_CACHE_STORAGE_KEY = "apiKeyLookup.modelsCache.v3";
const LOOKUP_MODELS_CACHE_STORAGE_KEY_V2 = "apiKeyLookup.modelsCache.v2";
const LOOKUP_MODELS_CACHE_STORAGE_KEY_V1 = "apiKeyLookup.modelsCache.v1";

type UsageLookupSubject =
  | { mode: "portal"; apiKey: ""; cacheKey: string }
  | { mode: "legacy"; apiKey: string; cacheKey: string };

// ── Helpers ─────────────────────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isChartDataResponse(value: unknown): value is ChartDataResponse {
  if (!isRecord(value)) return false;
  return (
    Array.isArray(value.daily_series) &&
    Array.isArray(value.model_distribution) &&
    isRecord(value.stats)
  );
}

const readStoredChartCache = (cacheKey: string): ChartDataResponse | null => {
  return readTenantBucketMapEntry({
    key: LOOKUP_CHART_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    legacyKey: LOOKUP_CHART_CACHE_STORAGE_KEY_V1,
    isEntry: isChartDataResponse,
  });
};

const writeStoredChartCache = (cacheKey: string, data: ChartDataResponse): void => {
  updateTenantBucketMapEntry({
    key: LOOKUP_CHART_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    entryValue: data,
    maxEntries: 8,
    legacyKey: LOOKUP_CHART_CACHE_STORAGE_KEY_V1,
    legacyKeysToRemove: [LOOKUP_CHART_CACHE_STORAGE_KEY_V1],
  });
};

const clearStoredChartCache = (): void => {
  clearTenantBucketMap({
    key: LOOKUP_CHART_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
  });
  try {
    window.sessionStorage.removeItem(LOOKUP_CHART_CACHE_STORAGE_KEY_V1);
  } catch {
    // ignore storage failures
  }
};

const isPublicModelItem = (value: unknown): value is PublicModelItem => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as PublicModelItem;
  return (
    typeof item.id === "string" &&
    typeof item.description === "string" &&
    typeof item.ownedBy === "string" &&
    Boolean(item.pricing) &&
    typeof item.pricing === "object" &&
    Array.isArray(item.inputModalities) &&
    Array.isArray(item.outputModalities) &&
    typeof item.supportsVision === "boolean"
  );
};

const isPublicModelArray = (value: unknown): value is PublicModelItem[] =>
  Array.isArray(value) && value.every(isPublicModelItem);

const samePublicModelArray = (left: PublicModelItem[], right: PublicModelItem[]): boolean => {
  if (left.length !== right.length) return false;
  return left.every((item, index) => {
    const other = right[index];
    return (
      item.id === other.id &&
      item.description === other.description &&
      item.ownedBy === other.ownedBy &&
      item.supportsVision === other.supportsVision &&
      item.pricing.mode === other.pricing.mode &&
      item.pricing.inputPricePerMillion === other.pricing.inputPricePerMillion &&
      item.pricing.outputPricePerMillion === other.pricing.outputPricePerMillion &&
      item.pricing.cachedPricePerMillion === other.pricing.cachedPricePerMillion &&
      item.pricing.cacheReadPricePerMillion === other.pricing.cacheReadPricePerMillion &&
      item.pricing.cacheWritePricePerMillion === other.pricing.cacheWritePricePerMillion &&
      item.pricing.pricePerCall === other.pricing.pricePerCall
    );
  });
};

const readStoredModelsCache = (cacheKey: string): PublicModelItem[] | null => {
  return readTenantBucketMapEntry({
    key: LOOKUP_MODELS_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    isEntry: isPublicModelArray,
  });
};

const writeStoredModelsCache = (cacheKey: string, models: PublicModelItem[]): void => {
  updateTenantBucketMapEntry({
    key: LOOKUP_MODELS_CACHE_STORAGE_KEY,
    kind: "session",
    tenantId: getActiveCacheTenantId(),
    entryKey: cacheKey,
    entryValue: models,
    maxEntries: 8,
    legacyKeysToRemove: [LOOKUP_MODELS_CACHE_STORAGE_KEY_V2, LOOKUP_MODELS_CACHE_STORAGE_KEY_V1],
  });
};

const extractServerErrorMessage = (raw: unknown): string => {
  if (raw instanceof Error) return extractServerErrorMessage(raw.message);
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return "";
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      const errorValue =
        typeof record.error === "string"
          ? record.error
          : typeof record.message === "string"
            ? record.message
            : "";
      if (errorValue.trim()) return errorValue.trim();
    }
  } catch {
    // ignore JSON parse errors
  }
  return text;
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

  if (normalized.includes("request failed")) return message;
  return message;
};

const readLegacyLookupKeyFromUrl = (): string => {
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

  // 向上滚动内容时顶栏自然收起，给 sticky tabs 让出视口；回到顶部附近再展开。
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  useEffect(() => {
    const HIDE_AFTER = 28;
    const SHOW_BELOW = 12;
    let frame = 0;
    const syncHeader = () => {
      frame = 0;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setHeaderCollapsed((prev) => {
        if (y > HIDE_AFTER) return true;
        if (y < SHOW_BELOW) return false;
        return prev;
      });
    };
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(syncHeader);
    };
    syncHeader();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  const initialLookupKey = useMemo(() => readLegacyLookupKeyFromUrl(), []);
  const [, setApiKeyInput] = useState(initialLookupKey);
  const [queriedKey, setQueriedKey] = useState(initialLookupKey);
  const [operationalKeyId, setOperationalKeyId] = useState("");
  const [apiKeyName, setApiKeyName] = useState("");
  const [portalUser, setPortalUser] = useState<EndUser | null>(null);
  const [portalKeys, setPortalKeys] = useState<EndUserAPIKey[]>([]);
  const [savedPortalAccounts, setSavedPortalAccounts] = useState<SavedPortalAccount[]>(() =>
    portalApi.listSavedAccounts(),
  );
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [pwdForm, setPwdForm] = useState({ current: "", next: "" });
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [secretOnce, setSecretOnce] = useState<string | null>(null);
  const [createKeyOpen, setCreateKeyOpen] = useState(false);
  const [createKeyName, setCreateKeyName] = useState("");
  const [createKeyError, setCreateKeyError] = useState<string | null>(null);
  const [deleteKeyTarget, setDeleteKeyTarget] = useState<EndUserAPIKey | null>(null);
  const [portalKeysBusy, setPortalKeysBusy] = useState(false);
  const [portalKeysLoading, setPortalKeysLoading] = useState(false);
  const usageSubject = useMemo<UsageLookupSubject | null>(() => {
    if (portalUser) {
      return { mode: "portal", apiKey: "", cacheKey: `account:${portalUser.id}` };
    }
    const apiKey = queriedKey.trim();
    return apiKey ? { mode: "legacy", apiKey, cacheKey: apiKey } : null;
  }, [portalUser, queriedKey]);
  const usageReady = usageSubject !== null;
  // ponytail: landing first; open login only via CTA / header
  const [loginModalOpen, setLoginModalOpen] = useState(false);

  // ── Content modal state ──
  const [contentModalOpen, setContentModalOpen] = useState(false);
  const [contentModalLogId, setContentModalLogId] = useState<number | null>(null);
  const [contentModalTab, setContentModalTab] = useState<"input" | "output">("input");

  const handleContentClick = useCallback((logId: number, tab: "input" | "output") => {
    setContentModalLogId(logId);
    setContentModalTab(tab);
    setContentModalOpen(true);
  }, []);

  const logColumns = useMemo(
    () =>
      buildRequestLogsColumns((key) => t(key), handleContentClick, undefined, {
        identityColumn: "key",
        hideChannel: true,
      }),
    [t, handleContentClick],
  );
  // ── Tab state ──
  const [activeTab, setActiveTab] = useState<ApiKeyLookupTab>("usage");
  const [quickImportReloadToken, setQuickImportReloadToken] = useState(0);

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
  const [quotaLimits, setQuotaLimits] = useState<PublicUsageLimits | null>(null);
  const chartCacheRef = useRef<Record<string, ChartDataResponse>>({});
  const chartAbortControllerRef = useRef<AbortController | null>(null);
  const chartFetchIdRef = useRef(0);
  const summaryAbortControllerRef = useRef<AbortController | null>(null);
  const summaryFetchIdRef = useRef(0);

  // ── Models state ──
  const [availableModels, setAvailableModels] = useState<PublicModelItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [modelsSearchFilter, setModelsSearchFilter] = useState("");
  const modelsCacheRef = useRef<Record<string, PublicModelItem[]>>({});

  // ── Filters ──
  const [timeRange, setTimeRange] = useState<TimeRange>(7);
  const [selectedModels, setSelectedModels] = useState<MultiSelectFilterState<string>>(null);
  const [selectedStatuses, setSelectedStatuses] =
    useState<MultiSelectFilterState<StatusFilterValue>>(null);

  // ── Backend stats + filter options ──
  const [stats, setStats] = useState<{
    total: number;
    success_rate: number;
    total_tokens: number;
    total_cost: number;
  }>({ total: 0, success_rate: 0, total_tokens: 0, total_cost: 0 });
  const [filterOptions, setFilterOptions] = useState<{
    models: string[];
    statuses: string[];
  }>({ models: [], statuses: ["success", "failed"] });

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

  const abortControllerRef = useRef<AbortController | null>(null);
  const fetchIdRef = useRef(0);
  const paginationInFlightRef = useRef(false);
  const restoredLookupFetchedRef = useRef(false);
  const suppressAccountMenuFocusRestoreRef = useRef(false);

  // ================================================================
  //  Logs fetching (with infinite scroll support)
  // ================================================================

  const fetchLogs = useCallback(
    async (subject: UsageLookupSubject, page: number, size?: number) => {
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
          apiKey: subject.apiKey,
          portalAccount: subject.mode === "portal",
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
        setApiKeyName(resp.api_key_name?.trim() ?? "");
        setLoginModalOpen(false);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (myFetchId !== fetchIdRef.current) return;

        const message = localizeLookupError(t, err, "apikey_lookup.query_failed");
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
    [modelFilterParam, pageSize, statusFilterParam, t, timeRange],
  );

  // ================================================================
  //  Chart data fetching (with caching)
  // ================================================================

  const fetchQuotaLimits = useCallback(async (subject: UsageLookupSubject) => {
    summaryAbortControllerRef.current?.abort();
    const controller = new AbortController();
    summaryAbortControllerRef.current = controller;
    const myFetchId = ++summaryFetchIdRef.current;
    try {
      const summary = await fetchPublicUsageSummary({
        apiKey: subject.apiKey,
        portalAccount: subject.mode === "portal",
        signal: controller.signal,
      });
      if (myFetchId !== summaryFetchIdRef.current || controller.signal.aborted) return;
      setQuotaLimits(summary.limits ?? null);
    } catch {
      if (myFetchId !== summaryFetchIdRef.current || controller.signal.aborted) return;
      setQuotaLimits(null);
    } finally {
      if (summaryAbortControllerRef.current === controller) {
        summaryAbortControllerRef.current = null;
      }
    }
  }, []);

  const fetchChartDataFn = useCallback(
    async (subject: UsageLookupSubject, days: number, options?: { force?: boolean }) => {
      const cacheKey = `${subject.cacheKey}|${days}`;
      const cached = options?.force
        ? null
        : chartCacheRef.current[cacheKey] || readStoredChartCache(cacheKey);
      if (cached) {
        chartCacheRef.current[cacheKey] = cached;
        const cachedName = cached.api_key_name?.trim() ?? "";
        if (cachedName) setApiKeyName(cachedName);
        setChartData(cached);
        setLoginModalOpen(false);
      }

      chartAbortControllerRef.current?.abort();
      const controller = new AbortController();
      chartAbortControllerRef.current = controller;
      const myFetchId = ++chartFetchIdRef.current;

      setChartLoading(true);
      setError(null);
      void fetchQuotaLimits(subject);
      try {
        const data = await fetchPublicChartData({
          apiKey: subject.apiKey,
          portalAccount: subject.mode === "portal",
          days,
          signal: controller.signal,
        });
        if (myFetchId !== chartFetchIdRef.current || controller.signal.aborted) return;

        chartCacheRef.current[cacheKey] = data;
        writeStoredChartCache(cacheKey, data);
        const nextName = data.api_key_name?.trim() ?? "";
        if (nextName) setApiKeyName(nextName);
        setChartData(data);
        setLoginModalOpen(false);
      } catch (err) {
        if (controller.signal.aborted || myFetchId !== chartFetchIdRef.current) return;
        if (!cached) {
          setError(localizeLookupError(t, err, "apikey_lookup.query_failed"));
        }
      } finally {
        if (chartAbortControllerRef.current === controller) {
          chartAbortControllerRef.current = null;
        }
        if (myFetchId === chartFetchIdRef.current && !controller.signal.aborted) {
          setChartLoading(false);
        }
      }
    },
    [fetchQuotaLimits, t],
  );

  // ================================================================
  //  Derived rows for VirtualTable
  // ================================================================

  const rows = useMemo<RequestLogsRow[]>(() => rawItems.map((item) => toLogRow(item)), [rawItems]);

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const handlePageChange = useCallback(
    (page: number) => {
      if (!usageSubject) return;
      const clamped = Math.max(1, Math.min(page, totalPages));
      fetchLogs(usageSubject, clamped);
    },
    [fetchLogs, totalPages, usageSubject],
  );

  const handlePageSizeChange = useCallback(
    (newSize: number) => {
      setPageSize(newSize);
      if (usageSubject) fetchLogs(usageSubject, 1, newSize);
    },
    [fetchLogs, usageSubject],
  );

  // ================================================================
  //  Effects
  // ================================================================

  // Refetch page 1 when filters change for the current account / legacy key subject.
  useEffect(() => {
    if (usageSubject && activeTab === "logs") {
      fetchLogs(usageSubject, 1);
    }
  }, [timeRange, selectedModels, selectedStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Models fetching ──
  const fetchModelsFn = useCallback(
    async (key: string, options?: { force?: boolean }) => {
      const trimmedKey = key.trim();
      if (!trimmedKey) return;

      const cached = options?.force
        ? null
        : modelsCacheRef.current[trimmedKey] || readStoredModelsCache(trimmedKey);
      if (cached) {
        modelsCacheRef.current[trimmedKey] = cached;
        setAvailableModels((prev) => (samePublicModelArray(prev, cached) ? prev : cached));
      }

      setModelsLoading(true);
      setModelsError(null);
      try {
        const models = await fetchAvailableModels(trimmedKey);
        modelsCacheRef.current[trimmedKey] = models;
        writeStoredModelsCache(trimmedKey, models);
        setAvailableModels((prev) => (samePublicModelArray(prev, models) ? prev : models));
      } catch (err: unknown) {
        if (!cached) {
          setModelsError(localizeLookupError(t, err, "apikey_lookup.load_models_failed"));
        }
      } finally {
        setModelsLoading(false);
      }
    },
    [t],
  );

  // Account usage is bound to portal authentication; models / quick import still use an operational key.
  useEffect(() => {
    if (initialLookupKey && !portalUser && !restoredLookupFetchedRef.current) return;
    if (activeTab === "usage" && usageSubject) {
      void fetchChartDataFn(usageSubject, timeRange);
    } else if (activeTab === "models" && queriedKey) {
      void fetchModelsFn(queriedKey);
    } else if (activeTab === "logs" && usageSubject) {
      fetchLogs(usageSubject, 1);
    }
  }, [activeTab, usageSubject?.cacheKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (initialLookupKey && !portalUser && !restoredLookupFetchedRef.current) return;
    if (activeTab === "usage" && usageSubject) {
      void fetchChartDataFn(usageSubject, timeRange);
    }
  }, [timeRange]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!initialLookupKey || portalUser || restoredLookupFetchedRef.current) return;

    restoredLookupFetchedRef.current = true;
    chartCacheRef.current = {};
    void fetchChartDataFn(
      { mode: "legacy", apiKey: initialLookupKey, cacheKey: initialLookupKey },
      timeRange,
    );
  }, [fetchChartDataFn, initialLookupKey, portalUser, timeRange]);

  const handleApiKeyInputChange = useCallback((value: string) => {
    setApiKeyInput(value);
    setError(null);
    if (value.trim()) return;

    abortControllerRef.current?.abort();
    fetchIdRef.current += 1;
    paginationInFlightRef.current = false;
    chartAbortControllerRef.current?.abort();
    chartFetchIdRef.current += 1;
    chartCacheRef.current = {};
    clearStoredChartCache();

    setError(null);
    setChartLoading(false);
    setModelsError(null);
    setModelsSearchFilter("");
    modelsCacheRef.current = {};
    setAvailableModels([]);
    setChartData(null);
    setQuotaLimits(null);

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

    setQueriedKey("");
    setOperationalKeyId("");
    setApiKeyName("");
  }, []);

  const activateOwnedKey = useCallback(async (keyId: string) => {
    const secret = await portalApi.keySecret(keyId);
    const plain = secret.key?.trim();
    if (!plain) return;
    setOperationalKeyId(keyId);
    setApiKeyInput(plain);
    setQueriedKey(plain);
    setLoginModalOpen(false);
  }, []);

  // Avoid landing flash while a stored portal session is still hydrating.
  const [portalSessionPending, setPortalSessionPending] = useState(
    () => Boolean(portalApi.loadSession()?.accessToken),
  );

  useEffect(() => {
    const snap = portalApi.loadSession();
    if (!snap?.accessToken) {
      setPortalSessionPending(false);
      return;
    }
    let cancelled = false;
    void portalApi
      .me()
      .then(async (res) => {
        if (cancelled) return;
        setPortalUser(res.user);
        setSavedPortalAccounts(portalApi.listSavedAccounts());
        if (res.user.must_change_password) {
          setChangePasswordOpen(true);
          setPortalKeys([]);
          return;
        }
        try {
          const keys = await portalApi.listKeys();
          if (cancelled) return;
          const items = keys.items ?? [];
          setPortalKeys(items);
          const firstUsable = items.find((key) => !key.disabled);
          if (firstUsable) await activateOwnedKey(firstUsable.id);
        } catch {
          if (!cancelled) setPortalKeys([]);
        }
      })
      .catch(() => {
        if (cancelled) return;
        portalApi.clearSession();
        setSavedPortalAccounts(portalApi.listSavedAccounts());
      })
      .finally(() => {
        if (!cancelled) setPortalSessionPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const hydratePortalSession = useCallback(async () => {
    const res = await portalApi.me();
    setPortalUser(res.user);
    setSavedPortalAccounts(portalApi.listSavedAccounts());
    if (res.user.must_change_password) {
      setChangePasswordOpen(true);
      setPortalKeys([]);
      return;
    }
    try {
      const keys = await portalApi.listKeys();
      const items = keys.items ?? [];
      setPortalKeys(items);
      const firstUsable = items.find((key) => !key.disabled);
      if (firstUsable) await activateOwnedKey(firstUsable.id);
    } catch {
      setPortalKeys([]);
    }
  }, [activateOwnedKey]);

  const handlePortalLogin = useCallback(async () => {
    setLoginBusy(true);
    setLoginError(null);
    try {
      const result = await portalApi.login(loginUsername.trim(), loginPassword, true);
      setPortalUser(result.user);
      setSavedPortalAccounts(portalApi.listSavedAccounts());
      setLoginModalOpen(false);
      setLoginPassword("");
      if (result.must_change_password || result.user.must_change_password) {
        setChangePasswordOpen(true);
        setPortalKeys([]);
      } else {
        const keys = await portalApi.listKeys();
        const items = keys.items ?? [];
        setPortalKeys(items);
        const firstUsable = items.find((key) => !key.disabled);
        if (firstUsable) await activateOwnedKey(firstUsable.id);
      }
    } catch (err) {
      setLoginError(
        resolveLoginErrorMessage({
          t,
          code: isApiClientError(err) ? extractApiErrorCode(err.payload) : "",
          status: isApiClientError(err) ? err.status : 0,
          isTimeout: isApiClientError(err) ? err.isTimeout : false,
          fallbackMessage: err instanceof Error ? err.message : "",
        }),
      );
    } finally {
      setLoginBusy(false);
    }
  }, [activateOwnedKey, loginPassword, loginUsername, t]);

  const handleLogout = useCallback(() => {
    void portalApi.logout();
    setPortalUser(null);
    setPortalKeys([]);
    setOperationalKeyId("");
    handleApiKeyInputChange("");
    setLoginModalOpen(false);
    setSavedPortalAccounts(portalApi.listSavedAccounts());
  }, [handleApiKeyInputChange]);

  const handleAddAccount = useCallback(() => {
    // Keep current session/UI visible; only open login for the next account.
    // Re-persist active session so it stays in the multi-account vault.
    const snap = portalApi.loadSession();
    if (snap?.user?.id) portalApi.client.setSession(snap);
    setLoginUsername("");
    setLoginPassword("");
    setLoginError(null);
    setLoginModalOpen(true);
    setSavedPortalAccounts(portalApi.listSavedAccounts());
  }, []);

  const handleSwitchAccount = useCallback(
    async (accountKey: string) => {
      const target = portalApi.switchAccount(accountKey);
      if (!target) return;

      // Abort in-flight lookups for the previous account, but keep multi-account
      // chart cache so warm accounts can paint immediately (SWR).
      abortControllerRef.current?.abort();
      fetchIdRef.current += 1;
      paginationInFlightRef.current = false;
      chartAbortControllerRef.current?.abort();
      chartFetchIdRef.current += 1;
      summaryAbortControllerRef.current?.abort();
      summaryFetchIdRef.current += 1;

      setPortalSessionPending(true);
      setOperationalKeyId("");
      setApiKeyInput("");
      setQueriedKey("");
      setApiKeyName("");
      setPortalKeys([]);
      setError(null);
      setModelsError(null);
      setModelsSearchFilter("");
      modelsCacheRef.current = {};
      setAvailableModels([]);
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
      setQuotaLimits(null);

      // Prefill usage from this account's cache; cold accounts still skeleton.
      const nextChartKey = `account:${target.user.id}|${timeRange}`;
      const cached =
        chartCacheRef.current[nextChartKey] || readStoredChartCache(nextChartKey);
      if (cached) {
        chartCacheRef.current[nextChartKey] = cached;
        setChartData(cached);
        const cachedName = cached.api_key_name?.trim() ?? "";
        if (cachedName) setApiKeyName(cachedName);
      } else {
        setChartData(null);
      }
      setChartLoading(false);

      // Align usageSubject immediately so the effect can revalidate under the new id.
      setPortalUser({
        id: target.user.id,
        tenant_id: "",
        username: target.user.username,
        display_name: target.user.display_name,
        status: "active",
        must_change_password: false,
        created_at: "",
        updated_at: "",
        version: 0,
      });

      try {
        await hydratePortalSession();
      } catch {
        portalApi.removeSavedAccount(accountKey);
        portalApi.clearSession();
        setPortalUser(null);
        setChartData(null);
        setLoginModalOpen(true);
      } finally {
        setPortalSessionPending(false);
        setSavedPortalAccounts(portalApi.listSavedAccounts());
      }
    },
    [hydratePortalSession, timeRange],
  );

  const refreshPortalKeys = useCallback(async () => {
    setPortalKeysLoading(true);
    try {
      const keys = await portalApi.listKeys();
      setPortalKeys(keys.items ?? []);
    } catch {
      setPortalKeys([]);
    } finally {
      setPortalKeysLoading(false);
    }
  }, []);

  const handleRefresh = useCallback(() => {
    if (activeTab === "keys") {
      void refreshPortalKeys();
      return;
    }
    if (activeTab === "usage" && usageSubject) {
      void fetchChartDataFn(usageSubject, timeRange, { force: true });
    } else if (activeTab === "models" && queriedKey) {
      void fetchModelsFn(queriedKey, { force: true });
    } else if (activeTab === "quickImport" && queriedKey) {
      setQuickImportReloadToken((value) => value + 1);
    } else if (activeTab === "logs" && usageSubject) {
      fetchLogs(usageSubject, 1);
    }
  }, [
    queriedKey,
    activeTab,
    timeRange,
    fetchLogs,
    fetchChartDataFn,
    fetchModelsFn,
    refreshPortalKeys,
    usageSubject,
  ]);

  // Strip legacy sensitive query params from the URL on mount.
  useEffect(() => {
    try {
      window.sessionStorage.removeItem("apiKeyLookup.lastApiKey.v1");
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
  }, [initialLookupKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    chartStats,
    modelMetric,
    setModelMetric,
    heatmapSeries,
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

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdatedAt) return "";
    const d = new Date(lastUpdatedAt);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }, [lastUpdatedAt]);

  const displayName =
    portalUser?.display_name ||
    portalUser?.username ||
    apiKeyName ||
    (queriedKey ? t("apikey_lookup.unnamed_key") : "");
  const extraKeyCount = Math.max(0, portalKeys.length - 1);
  const switchablePortalAccounts = useMemo(() => {
    if (!portalUser) return savedPortalAccounts;
    const currentKey =
      savedPortalAccounts.find((row) => row.user.id === portalUser.id)?.accountKey ?? "";
    const currentEntry =
      savedPortalAccounts.find((row) => row.user.id === portalUser.id) ??
      ({
        accountKey: currentKey || `current:${portalUser.id}`,
        apiBase: "",
        accessToken: "",
        refreshToken: "",
        remember: true,
        expiresAt: 0,
        lastUsedAt: Date.now(),
        user: {
          id: portalUser.id,
          username: portalUser.username,
          display_name: portalUser.display_name || portalUser.username,
        },
      } satisfies SavedPortalAccount);
    const others = savedPortalAccounts.filter((row) => row.user.id !== portalUser.id);
    return [currentEntry, ...others];
  }, [portalUser, savedPortalAccounts]);

  // Landing CTA opens login; always allow dismiss (backdrop / Esc / X).
  // Keep results UI when the add-account login modal is open over an active session.
  const closeLoginModal = useCallback(() => {
    setLoginModalOpen(false);
  }, []);

  // ================================================================
  //  Render
  // ================================================================

  const showLanding = !queriedKey && !portalUser && !portalSessionPending && !error;

  return (
    <PageBackground variant={showLanding ? "login" : "app"}>
      <div
        className={[
          "relative min-h-dvh pt-14",
          showLanding
            ? ""
            : "bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-neutral-950 dark:via-neutral-900 dark:to-neutral-950",
        ].join(" ")}
      >
        {/* Header：滚动后上滑淡出，给 sticky tabs 让位 */}
        <header
          data-testid="apikey-lookup-header"
          data-collapsed={headerCollapsed ? "true" : "false"}
          aria-hidden={headerCollapsed || undefined}
          className={[
            "fixed inset-x-0 top-0 z-30 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl dark:border-neutral-800/60 dark:bg-neutral-950/70",
            "motion-safe:transition-[transform,opacity,border-color] motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
            headerCollapsed
              ? "pointer-events-none -translate-y-full border-transparent opacity-0"
              : "translate-y-0 opacity-100",
          ].join(" ")}
        >
          <div className="mx-auto flex h-14 max-w-screen-xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-2.5">
              <div
                className={[
                  "flex h-8 w-8 items-center justify-center rounded-xl",
                  showLanding
                    ? "border border-slate-200 bg-white/70 text-slate-600 dark:border-white/10 dark:bg-white/[0.05] dark:text-white/65"
                    : "bg-slate-900 shadow-sm dark:bg-white",
                ].join(" ")}
              >
                {showLanding ? (
                  <KeyRound size={16} />
                ) : (
                  <Key size={16} className="text-white dark:text-neutral-950" />
                )}
              </div>
              <span className="text-base font-bold tracking-tight text-slate-900 dark:text-white">
                {showLanding ? "Code Proxy" : t("apikey_lookup.title")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {queriedKey || portalUser ? (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <button
                      type="button"
                      aria-label={displayName}
                      data-testid="apikey-lookup-account-menu"
                      className="inline-flex max-w-[34vw] items-center gap-1.5 rounded-xl px-1 py-1 text-sm font-medium text-slate-700 transition hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10 sm:max-w-56"
                    >
                      <Key size={14} className="shrink-0" />
                      <span className="min-w-0 truncate">{displayName}</span>
                      {extraKeyCount > 0 ? (
                        <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-2xs font-medium text-slate-600 dark:bg-white/10 dark:text-white/70">
                          +{extraKeyCount}
                        </span>
                      ) : null}
                      <ChevronRight
                        size={14}
                        className="shrink-0 rotate-90 text-slate-400 dark:text-white/40"
                      />
                    </button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={8}
                      className="min-w-48"
                      data-testid="apikey-lookup-account-menu-content"
                      onCloseAutoFocus={(event) => {
                        if (!suppressAccountMenuFocusRestoreRef.current) return;
                        suppressAccountMenuFocusRestoreRef.current = false;
                        event.preventDefault();
                      }}
                    >
                      {portalUser && switchablePortalAccounts.length > 1 ? (
                        <DropdownMenu.Sub>
                          <DropdownMenu.SubTrigger data-testid="apikey-lookup-switch-account-trigger">
                            <Users size={15} />
                            <span className="min-w-0 flex-1">
                              {t("apikey_lookup.switch_account", { defaultValue: "切换账号" })}
                            </span>
                            <ChevronRight size={14} className="ml-auto shrink-0 text-slate-400" />
                          </DropdownMenu.SubTrigger>
                          <DropdownMenu.Portal>
                            <DropdownMenu.SubContent
                              sideOffset={6}
                              className="min-w-44"
                              data-testid="apikey-lookup-switch-account-menu"
                            >
                              {switchablePortalAccounts.map((account) => {
                                const isCurrent = account.user.id === portalUser.id;
                                return (
                                  <DropdownMenu.Item
                                    key={account.accountKey}
                                    disabled={isCurrent}
                                    className={isCurrent ? "data-[disabled]:opacity-100" : undefined}
                                    data-testid={
                                      isCurrent
                                        ? "apikey-lookup-current-account"
                                        : `apikey-lookup-switch-${account.user.id}`
                                    }
                                    onClick={(event) => {
                                      // A pointer-selected account changes the page context; do not let
                                      // Radix restore focus to the now-updated trigger and leave its
                                      // browser focus ring visible. Keyboard selection keeps the default
                                      // focus restoration so the menu remains accessible.
                                      suppressAccountMenuFocusRestoreRef.current = event.detail > 0;
                                    }}
                                    onSelect={() => {
                                      if (!isCurrent) void handleSwitchAccount(account.accountKey);
                                    }}
                                  >
                                    <Users size={15} className="shrink-0" />
                                    <span className="min-w-0 flex-1 truncate">
                                      {account.user.display_name || account.user.username}
                                    </span>
                                    {isCurrent ? (
                                      <Check
                                        size={15}
                                        className="ml-auto shrink-0 text-emerald-600 dark:text-emerald-400"
                                      />
                                    ) : null}
                                  </DropdownMenu.Item>
                                );
                              })}
                            </DropdownMenu.SubContent>
                          </DropdownMenu.Portal>
                        </DropdownMenu.Sub>
                      ) : null}
                      {portalUser ? (
                        <DropdownMenu.Item onSelect={() => setChangePasswordOpen(true)}>
                          <KeyRound size={15} />
                          {t("apikey_lookup.change_password", { defaultValue: "修改密码" })}
                        </DropdownMenu.Item>
                      ) : null}
                      {portalUser ? (
                        <DropdownMenu.Item onSelect={handleAddAccount}>
                          <UserPlus size={15} />
                          {t("apikey_lookup.add_account", { defaultValue: "添加账号" })}
                        </DropdownMenu.Item>
                      ) : null}
                      <DropdownMenu.Separator />
                      <DropdownMenu.Item
                        onSelect={handleLogout}
                        className="text-rose-600 focus:text-rose-700 dark:text-rose-300"
                      >
                        <LogOut size={15} />
                        {t("common.logout")}
                      </DropdownMenu.Item>
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              ) : (
                <Button
                  size="sm"
                  variant={showLanding ? "primary" : "ghost"}
                  onClick={() => setLoginModalOpen(true)}
                  className={showLanding ? "rounded-full px-4" : undefined}
                >
                  {t("common.login", { defaultValue: "登录" })}
                </Button>
              )}
              <LanguageSelector className="inline-flex items-center rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10" />
              <ThemeToggleButton className="rounded-xl p-2 text-slate-600 transition hover:bg-slate-100 dark:text-white/70 dark:hover:bg-white/10" />
            </div>
          </div>
        </header>

        <main
          className={showLanding ? "w-full" : "mx-auto max-w-screen-xl space-y-5 px-4 py-6 sm:px-6"}
        >
          {/* Error */}
          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* Results: portal keys tab can show without an activated key */}
          {(queriedKey || portalUser) && !error && (
            <>
              <LookupResultsToolbar
                t={t}
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                timeRange={timeRange}
                setTimeRange={setTimeRange}
                handleRefresh={handleRefresh}
                loading={loading || portalKeysLoading}
                chartLoading={chartLoading}
                modelsLoading={modelsLoading}
                showKeysTab={Boolean(portalUser)}
                keysHeader={
                  portalUser
                    ? {
                        loading: portalKeysLoading,
                        busy: portalKeysBusy,
                        onRefresh: () => void refreshPortalKeys(),
                        onCreate: () => {
                          setCreateKeyName("");
                          setCreateKeyError(null);
                          setCreateKeyOpen(true);
                        },
                      }
                    : undefined
                }
              />

              {activeTab === "usage" && usageReady ? (
                <UsageTabSection
                  t={t}
                  timeRange={timeRange}
                  chartStats={chartStats}
                  chartLoading={chartLoading}
                  quotaLimits={quotaLimits}
                  modelMetric={modelMetric}
                  setModelMetric={setModelMetric}
                  heatmapSeries={heatmapSeries}
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

              {activeTab === "keys" && portalUser ? (
                <Reveal>
                  <ManageKeysTabContent
                    t={t}
                    keys={portalKeys}
                    busy={portalKeysBusy}
                    onRotate={(key) => {
                      setPortalKeysBusy(true);
                      void portalApi
                        .rotateKey(key.id)
                        .then(async (res) => {
                          if (res.plaintext_key) {
                            setSecretOnce(res.plaintext_key);
                            setOperationalKeyId(key.id);
                            setApiKeyInput(res.plaintext_key);
                            setQueriedKey(res.plaintext_key);
                          }
                          await refreshPortalKeys();
                        })
                        .finally(() => setPortalKeysBusy(false));
                    }}
                    onDelete={(key) => {
                      if (portalKeys.length <= 1) return;
                      setDeleteKeyTarget(key);
                    }}
                  />
                </Reveal>
              ) : null}

              {activeTab === "logs" && usageReady ? (
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

              {activeTab === "models" && queriedKey ? (
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

              {activeTab === "quickImport" && queriedKey ? (
                <Reveal>
                  <QuickImportTabContent apiKey={queriedKey} reloadToken={quickImportReloadToken} />
                </Reveal>
              ) : null}

              {(activeTab === "models" || activeTab === "quickImport") &&
              !queriedKey &&
              portalUser ? (
                <div className="rounded-2xl border border-dashed border-slate-200 px-6 py-12 text-center text-sm text-slate-500 dark:border-neutral-800 dark:text-white/55">
                  {t("apikey_lookup.operational_key_required", {
                    defaultValue:
                      "请先创建一把可用 Key；模型列表和快速导入需要凭证，用量与日志仍按账号聚合。",
                  })}
                </div>
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
              usageSubject
                ? async (
                    id: number,
                    part: "input" | "output",
                    options?: { signal?: AbortSignal },
                  ) => {
                    return fetchPublicLogContent({
                      id,
                      apiKey: usageSubject.apiKey,
                      portalAccount: usageSubject.mode === "portal",
                      part,
                      signal: options?.signal,
                    });
                  }
                : undefined
            }
          />

          {showLanding ? <LookupEmptyState t={t} onLogin={() => setLoginModalOpen(true)} /> : null}
        </main>

        <Modal
          open={loginModalOpen}
          title={t("apikey_lookup.login_title", { defaultValue: "账号登录" })}
          hideHeader
          maxWidth="max-w-md"
          panelClassName="rounded-3xl border-white/70 bg-white/95 shadow-xl shadow-slate-300/25 backdrop-blur-xl dark:border-white/10 dark:bg-neutral-950/90 dark:shadow-black/25"
          bodyClassName="!px-7 !py-8 sm:!px-9 sm:!py-9"
          bodyHeightClassName="max-h-none"
          bodyOverflowClassName="overflow-visible"
          onClose={closeLoginModal}
        >
          <div className="space-y-6">
            <h2 className="pr-8 text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
              {t("apikey_lookup.login_title", { defaultValue: "登录" })}
            </h2>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                void handlePortalLogin();
              }}
            >
              <label className="block space-y-2">
                <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                  {t("apikey_lookup.username", { defaultValue: "账号" })}
                </span>
                <TextInput
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  autoComplete="username"
                  autoFocus
                  className="rounded-full px-5"
                  placeholder={t("apikey_lookup.username_placeholder", {
                    defaultValue: "请输入账号",
                  })}
                  startAdornment={<UserRound size={17} />}
                />
              </label>
              <label className="block space-y-2">
                <span className="text-xs font-medium text-slate-600 dark:text-white/60">
                  {t("apikey_lookup.password", { defaultValue: "密码" })}
                </span>
                <TextInput
                  type={showLoginPassword ? "text" : "password"}
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  autoComplete="current-password"
                  className="rounded-full px-5"
                  placeholder={t("apikey_lookup.password_placeholder", {
                    defaultValue: "请输入密码",
                  })}
                  startAdornment={<KeyRound size={17} />}
                  endAdornment={
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword((value) => !value)}
                      className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10"
                      aria-label={
                        showLoginPassword
                          ? t("login.hide_key", { defaultValue: "隐藏密码" })
                          : t("login.show_key", { defaultValue: "显示密码" })
                      }
                    >
                      {showLoginPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  }
                />
              </label>
              {loginError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-500/25 dark:bg-rose-500/10 dark:text-rose-300">
                  {loginError}
                </div>
              ) : null}
              <Button
                type="submit"
                variant="primary"
                disabled={loginBusy || !loginUsername.trim() || !loginPassword}
                className="h-11 w-full rounded-full"
              >
                {loginBusy
                  ? t("common.loading", { defaultValue: "登录中…" })
                  : t("common.login", { defaultValue: "登录" })}
              </Button>
            </form>
          </div>
        </Modal>

        <Modal
          open={changePasswordOpen}
          title={t("apikey_lookup.change_password", { defaultValue: "修改密码" })}
          maxWidth="max-w-md"
          onClose={() => {
            // Force password change: only allow close after success clears the flag.
            if (portalUser?.must_change_password) return;
            setChangePasswordOpen(false);
          }}
          footer={
            <>
              {!portalUser?.must_change_password ? (
                <Button
                  variant="secondary"
                  onClick={() => setChangePasswordOpen(false)}
                  disabled={portalKeysBusy}
                >
                  {t("common.cancel", { defaultValue: "取消" })}
                </Button>
              ) : null}
              <Button
                variant="primary"
                disabled={!pwdForm.current || pwdForm.next.length < 8 || portalKeysBusy}
                onClick={() => {
                  setPwdError(null);
                  setPortalKeysBusy(true);
                  void portalApi
                    .changePassword(pwdForm.current, pwdForm.next)
                    .then(async () => {
                      setPortalUser((u) => (u ? { ...u, must_change_password: false } : u));
                      try {
                        const items = (await portalApi.listKeys()).items ?? [];
                        setPortalKeys(items);
                        const firstUsable = items.find((key) => !key.disabled);
                        if (firstUsable) await activateOwnedKey(firstUsable.id);
                        setPwdForm({ current: "", next: "" });
                        setPwdError(null);
                        setChangePasswordOpen(false);
                      } catch (err) {
                        setPortalKeys([]);
                        setPwdError(
                          resolveLoginErrorMessage({
                            t,
                            code: isApiClientError(err) ? extractApiErrorCode(err.payload) : "",
                            status: isApiClientError(err) ? err.status : 0,
                            isTimeout: isApiClientError(err) ? err.isTimeout : false,
                            fallbackMessage: err instanceof Error ? err.message : "",
                          }),
                        );
                      }
                    })
                    .catch((err) =>
                      setPwdError(
                        resolveLoginErrorMessage({
                          t,
                          code: isApiClientError(err) ? extractApiErrorCode(err.payload) : "",
                          status: isApiClientError(err) ? err.status : 0,
                          isTimeout: isApiClientError(err) ? err.isTimeout : false,
                          fallbackMessage: err instanceof Error ? err.message : "",
                        }),
                      ),
                    )
                    .finally(() => setPortalKeysBusy(false));
                }}
              >
                {t("common.save", { defaultValue: "保存" })}
              </Button>
            </>
          }
        >
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-white/75">
                {t("apikey_lookup.current_password", { defaultValue: "当前密码" })}
              </span>
              <TextInput
                type="password"
                value={pwdForm.current}
                onChange={(e) => setPwdForm((f) => ({ ...f, current: e.target.value }))}
                autoComplete="current-password"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-white/75">
                {t("apikey_lookup.new_password", { defaultValue: "新密码" })}
              </span>
              <TextInput
                type="password"
                value={pwdForm.next}
                onChange={(e) => setPwdForm((f) => ({ ...f, next: e.target.value }))}
                autoComplete="new-password"
                placeholder={t("apikey_lookup.new_password_hint", {
                  defaultValue: "至少 8 位",
                })}
              />
            </label>
            {pwdError ? (
              <p className="text-sm text-rose-600 dark:text-rose-300">{pwdError}</p>
            ) : null}
          </form>
        </Modal>

        <Modal
          open={Boolean(deleteKeyTarget)}
          title={t("apikey_lookup.confirm_delete_title")}
          description={t("apikey_lookup.confirm_delete_desc")}
          maxWidth="max-w-md"
          onClose={() => {
            if (portalKeysBusy) return;
            setDeleteKeyTarget(null);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={portalKeysBusy}
                onClick={() => setDeleteKeyTarget(null)}
              >
                {t("common.cancel", { defaultValue: "取消" })}
              </Button>
              <Button
                variant="danger"
                disabled={portalKeysBusy || !deleteKeyTarget}
                onClick={() => {
                  const key = deleteKeyTarget;
                  if (!key || portalKeys.length <= 1) return;
                  setPortalKeysBusy(true);
                  void portalApi
                    .deleteKey(key.id)
                    .then(async () => {
                      setDeleteKeyTarget(null);
                      const items = (await portalApi.listKeys()).items ?? [];
                      setPortalKeys(items);
                      if (operationalKeyId === key.id) {
                        const next = items.find((item) => !item.disabled);
                        if (next) await activateOwnedKey(next.id);
                        else handleApiKeyInputChange("");
                      }
                    })
                    .finally(() => setPortalKeysBusy(false));
                }}
              >
                {portalKeysBusy ? t("apikey_lookup.deleting") : t("apikey_lookup.confirm_delete")}
              </Button>
            </>
          }
        >
          {deleteKeyTarget ? (
            <div className="rounded-xl bg-red-50 p-3 dark:bg-red-900/20">
              <div className="text-sm font-medium text-red-800 dark:text-red-300">
                {deleteKeyTarget.name || deleteKeyTarget.id.slice(0, 8)}
              </div>
              <code className="text-xs text-red-600 dark:text-red-400">
                {deleteKeyTarget.key_masked}
              </code>
            </div>
          ) : null}
        </Modal>

        <Modal
          open={createKeyOpen}
          title={t("apikey_lookup.create_key", { defaultValue: "新建 Key" })}
          description={t("apikey_lookup.create_key_desc", {
            defaultValue: "为新 Key 填写名称，便于在请求日志中区分来源。",
          })}
          maxWidth="max-w-md"
          onClose={() => {
            if (portalKeysBusy) return;
            setCreateKeyOpen(false);
            setCreateKeyError(null);
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={portalKeysBusy}
                onClick={() => {
                  setCreateKeyOpen(false);
                  setCreateKeyError(null);
                }}
              >
                {t("common.cancel", { defaultValue: "取消" })}
              </Button>
              <Button
                type="submit"
                form="portal-create-key-form"
                variant="primary"
                disabled={portalKeysBusy || !createKeyName.trim()}
              >
                {t("apikey_lookup.create_key", { defaultValue: "新建 Key" })}
              </Button>
            </>
          }
        >
          <form
            id="portal-create-key-form"
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const name = createKeyName.trim();
              if (!name) {
                setCreateKeyError(
                  t("apikey_lookup.key_name_required", { defaultValue: "请输入 Key 名称" }),
                );
                return;
              }
              const nameTaken = portalKeys.some(
                (key) => (key.name || "").trim().toLowerCase() === name.toLowerCase(),
              );
              if (nameTaken) {
                setCreateKeyError(
                  t("apikey_lookup.key_name_duplicate", {
                    defaultValue: "Key 名称已存在，请换一个。",
                  }),
                );
                return;
              }
              setCreateKeyError(null);
              setPortalKeysBusy(true);
              void portalApi
                .createKey(name)
                .then(async (res) => {
                  if (res.plaintext_key) {
                    setSecretOnce(res.plaintext_key);
                    setOperationalKeyId(res.api_key.id);
                    setApiKeyInput(res.plaintext_key);
                    setQueriedKey(res.plaintext_key);
                  }
                  setCreateKeyOpen(false);
                  setCreateKeyName("");
                  await refreshPortalKeys();
                })
                .catch((err) => {
                  const code = isApiClientError(err) ? extractApiErrorCode(err.payload) : "";
                  if (code === "duplicate_key_name") {
                    setCreateKeyError(
                      t("apikey_lookup.key_name_duplicate", {
                        defaultValue: "Key 名称已存在，请换一个。",
                      }),
                    );
                    return;
                  }
                  setCreateKeyError(err instanceof Error ? err.message : "failed");
                })
                .finally(() => setPortalKeysBusy(false));
            }}
          >
            <label className="block space-y-1.5">
              <span className="text-sm font-medium text-slate-700 dark:text-white/75">
                {t("apikey_lookup.key_name", { defaultValue: "Key 名称" })}
              </span>
              <TextInput
                value={createKeyName}
                onChange={(e) => {
                  setCreateKeyName(e.target.value);
                  if (createKeyError) setCreateKeyError(null);
                }}
                autoFocus
                placeholder={t("apikey_lookup.key_name_placeholder", {
                  defaultValue: "例如：Claude Desktop / 生产环境",
                })}
              />
            </label>
            {createKeyError ? (
              <p className="text-sm text-rose-600 dark:text-rose-300">{createKeyError}</p>
            ) : null}
          </form>
        </Modal>

        <SecretRevealModal
          open={Boolean(secretOnce)}
          title={t("apikey_lookup.copy_secret", { defaultValue: "请立即复制" })}
          secret={secretOnce ?? ""}
          warning={t("apikey_lookup.secret_once_warning", {
            defaultValue: "离开后无法再查看明文 Key，请立即复制保存。",
          })}
          onClose={() => setSecretOnce(null)}
        />
      </div>
    </PageBackground>
  );
}
