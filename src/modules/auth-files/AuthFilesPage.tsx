import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  Download,
  Eye,
  Loader2,
  RefreshCw,
  Zap,
} from "lucide-react";
import { authFilesApi, quotaApi, usageApi } from "@/lib/http/apis";
import { formatLatency } from "@/modules/providers/hooks/useProviderLatency";
import type { AuthFileItem, OAuthModelAliasEntry } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";
import { HoverTooltip } from "@/modules/ui/Tooltip";
import { Select } from "@/modules/ui/Select";
import type { VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { ProviderStatusBar } from "@/modules/providers/ProviderStatusBar";
import { OAuthLoginDialog } from "@/modules/oauth/OAuthLoginDialog";
import { AuthFileDetailModal } from "@/modules/auth-files/components/AuthFileDetailModal";
import { AuthFilesExcludedTab } from "@/modules/auth-files/components/AuthFilesExcludedTab";
import { AuthFilesAliasTab } from "@/modules/auth-files/components/AuthFilesAliasTab";
import { AuthFilesFilesTab } from "@/modules/auth-files/components/AuthFilesFilesTab";
import { ImportModelsModal } from "@/modules/auth-files/components/ImportModelsModal";
import { GroupOverviewModal } from "@/modules/auth-files/components/GroupOverviewModal";
import { fetchQuota, resolveQuotaProvider, type QuotaProvider } from "@/modules/quota/quota-fetch";
import { useInterval } from "@/hooks/useInterval";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { clampPercent, type QuotaItem, type QuotaState } from "@/modules/quota/quota-helpers";
import {
  AUTH_FILES_FILES_VIEW_MODE_KEY,
  AUTH_FILES_PAGE_SIZE,
  AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
  AUTH_FILES_QUOTA_PREVIEW_KEY,
  MAX_AUTH_FILE_SIZE,
  TYPE_BADGE_CLASSES,
  authFilesSortCollator,
  buildAliasRows,
  buildLast7DayAxis,
  buildUsageIndex,
  downloadBlobAsFile,
  formatFileSize,
  formatModified,
  isRuntimeOnlyAuthFile,
  normalizeAuthIndexValue,
  normalizeProviderKey,
  normalizeQuotaAutoRefreshMs,
  pickQuotaPreviewItem,
  readAuthFileChannelName,
  readAuthFilesDataCache,
  readAuthFilesUiState,
  resolveAuthFileDisplayName,
  resolveAuthFilePlanType,
  resolveAuthFileSortKey,
  resolveAuthFileStats,
  resolveAuthFileStatusBar,
  resolveFileType,
  resolveProviderLabel,
  sanitizeAuthFilesForCache,
  writeAuthFilesDataCache,
  writeAuthFilesUiState,
  type AliasRow,
  type AuthFileModelItem,
  type AuthFilesGroupOverview,
  type AuthFilesGroupOverviewRow,
  type AuthFilesGroupTrendPoint,
  type ChannelEditorState,
  type FilesViewMode,
  type OAuthDialogTab,
  type PrefixProxyEditorState,
  type QuotaPreviewMode,
} from "@/modules/auth-files/helpers/authFilesPageUtils";

export function AuthFilesPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [searchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const initialDataCache = useMemo(() => readAuthFilesDataCache(), []);

  const [tab, setTab] = useState<"files" | "excluded" | "alias">("files");

  const [files, setFiles] = useState<AuthFileItem[]>(() => initialDataCache?.files ?? []);
  const [loading, setLoading] = useState(() => !((initialDataCache?.files?.length ?? 0) > 0));
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<null | { type: "deleteSelection"; names: string[] }>(null);

  const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
  const [oauthDialogDefaultTab, setOauthDialogDefaultTab] = useState<OAuthDialogTab>("codex");

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selectedFileNames, setSelectedFileNames] = useState<string[]>([]);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelsCacheRef = useRef<Map<string, AuthFileModelItem[]>>(new Map());

  const [usageLoading, setUsageLoading] = useState(false);
  const [usageData, setUsageData] = useState<import("@/lib/http/types").EntityStatsResponse | null>(
    null,
  );

  const { index: usageIndex } = useMemo(() => buildUsageIndex(usageData), [usageData]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailFile, setDetailFile] = useState<AuthFileItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailText, setDetailText] = useState("");
  const [detailTab, setDetailTab] = useState<"json" | "models" | "fields" | "channel">("json");

  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsFileType, setModelsFileType] = useState("");
  const [modelsList, setModelsList] = useState<AuthFileModelItem[]>([]);
  const [modelsError, setModelsError] = useState<string | null>(null);

  const [prefixProxyEditor, setPrefixProxyEditor] = useState<PrefixProxyEditorState>({
    open: false,
    fileName: "",
    loading: false,
    saving: false,
    error: null,
    json: null,
    prefix: "",
    proxyUrl: "",
  });
  const [channelEditor, setChannelEditor] = useState<ChannelEditorState>({
    open: false,
    fileName: "",
    label: "",
    saving: false,
    error: null,
  });

  const [excludedLoading, setExcludedLoading] = useState(false);
  const [excluded, setExcluded] = useState<Record<string, string[]>>({});
  const [excludedDraft, setExcludedDraft] = useState<Record<string, string>>({});
  const [excludedNewProvider, setExcludedNewProvider] = useState("");
  const [excludedUnsupported, setExcludedUnsupported] = useState(false);
  const [excludedLoadAttempted, setExcludedLoadAttempted] = useState(false);

  const [aliasLoading, setAliasLoading] = useState(false);
  const [aliasMap, setAliasMap] = useState<Record<string, OAuthModelAliasEntry[]>>({});
  const [aliasEditing, setAliasEditing] = useState<Record<string, AliasRow[]>>({});
  const [aliasNewChannel, setAliasNewChannel] = useState("");
  const [aliasUnsupported, setAliasUnsupported] = useState(false);
  const [aliasLoadAttempted, setAliasLoadAttempted] = useState(false);

  const [importOpen, setImportOpen] = useState(false);
  const [importChannel, setImportChannel] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importModels, setImportModels] = useState<AuthFileModelItem[]>([]);
  const [importSearch, setImportSearch] = useState("");
  const [importSelected, setImportSelected] = useState<Set<string>>(new Set());

  // Connectivity check state: fileName → { loading, latencyMs, error }
  const [connectivityState, setConnectivityState] = useState<
    Map<string, { loading: boolean; latencyMs: number | null; error: boolean }>
  >(new Map());

  const [quotaByFileName, setQuotaByFileName] = useState<Record<string, QuotaState>>({});
  const quotaInFlightRef = useRef<Set<string>>(new Set());
  const quotaAutoRefreshingRef = useRef<Set<string>>(new Set());
  const quotaByFileNameRef = useRef<Record<string, QuotaState>>(quotaByFileName);
  const quotaWarmupAttemptRef = useRef<Map<string, number>>(new Map());
  const filesRef = useRef<AuthFileItem[]>(files);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [quotaPreviewMode, setQuotaPreviewMode] = useLocalStorage<QuotaPreviewMode>(
    AUTH_FILES_QUOTA_PREVIEW_KEY,
    "5h",
  );
  const [quotaAutoRefreshMsRaw, setQuotaAutoRefreshMsRaw] = useLocalStorage<number>(
    AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
    10000,
  );
  const [filesViewMode, setFilesViewMode] = useLocalStorage<FilesViewMode>(
    AUTH_FILES_FILES_VIEW_MODE_KEY,
    "table",
  );
  const [groupOverviewOpen, setGroupOverviewOpen] = useState(false);
  const [groupOverviewTab, setGroupOverviewTab] = useState("all");
  const [groupOverviewLoading, setGroupOverviewLoading] = useState(false);
  const [groupTrendLoading, setGroupTrendLoading] = useState(false);
  const [groupTrendPoints, setGroupTrendPoints] = useState<AuthFilesGroupTrendPoint[]>([]);
  const groupTrendRequestRef = useRef(0);
  const quotaAutoRefreshMs = useMemo(
    () => normalizeQuotaAutoRefreshMs(quotaAutoRefreshMsRaw),
    [quotaAutoRefreshMsRaw],
  );

  useInterval(
    () => {
      setNowMs(Date.now());
    },
    tab === "files" ? Math.min(10_000, quotaAutoRefreshMs || 10_000) : null,
  );

  const translateQuotaText = useCallback(
    (text: string) => {
      if (!text) return text;
      if (text.startsWith("m_quota.")) return t(text);
      const known = new Set([
        "missing_auth_index",
        "no_model_quota",
        "request_failed",
        "missing_account_id",
        "parse_codex_failed",
        "missing_project_id",
        "parse_kiro_failed",
      ]);
      if (known.has(text)) return t(`m_quota.${text}`);
      return text;
    },
    [t],
  );

  const formatPlanTypeLabel = useCallback(
    (planType: string) => {
      const normalized = planType.trim().toLowerCase();
      if (!normalized) return "";
      if (normalized === "plus" || normalized === "team" || normalized === "free") {
        return t(`codex_quota.plan_${normalized}`);
      }
      return normalized.charAt(0).toUpperCase() + normalized.slice(1);
    },
    [t],
  );

  const patchAuthFileByName = useCallback((name: string, patch: Partial<AuthFileItem>) => {
    setFiles((prev) => prev.map((item) => (item.name === name ? { ...item, ...patch } : item)));
    setDetailFile((prev) => (prev?.name === name ? { ...prev, ...patch } : prev));
  }, []);

  const formatQuotaResetTextCompact = useCallback(
    (resetAtMs?: number) => {
      if (typeof resetAtMs !== "number" || !Number.isFinite(resetAtMs)) return null;

      const diffMs = resetAtMs - nowMs;
      if (diffMs <= 0) return t("m_quota.refresh_due");

      let seconds = Math.max(1, Math.ceil(diffMs / 1000));
      const days = Math.floor(seconds / 86400);
      seconds -= days * 86400;
      const hours = Math.floor(seconds / 3600);
      seconds -= hours * 3600;
      const minutes = Math.floor(seconds / 60);
      seconds -= minutes * 60;

      const parts: string[] = [];
      if (days) parts.push(`${days}天`);
      if (hours) parts.push(`${hours}小时`);
      if (minutes) parts.push(`${minutes}分`);
      parts.push(`${seconds}秒`);
      return parts.join("");
    },
    [nowMs, t],
  );

  const renderFilesViewModeTabs = useMemo(() => {
    const options: { value: FilesViewMode; label: string }[] = [
      { value: "table", label: t("common.view_mode_list") },
      { value: "cards", label: t("common.view_mode_cards") },
    ];
    return (
      <div
        role="tablist"
        aria-label={t("common.view_mode")}
        className="inline-flex items-center gap-1 rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
      >
        {options.map((opt) => {
          const active = filesViewMode === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFilesViewMode(opt.value)}
              className={
                active
                  ? "inline-flex items-center rounded-xl bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm dark:bg-white dark:text-neutral-950"
                  : "inline-flex items-center rounded-xl px-2.5 py-1 text-[11px] text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
              }
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    );
  }, [filesViewMode, setFilesViewMode, t]);

  const resolveQuotaCardSlots = useCallback(
    (provider: QuotaProvider, items: QuotaItem[]) => {
      if (provider !== "codex") {
        return items.slice(0, 3).map((item) => ({
          id: item.label,
          label: translateQuotaText(item.label),
          item,
        }));
      }

      const normalize = (value: string) =>
        value
          .trim()
          .toLowerCase()
          // Keep only alnum + CJK to make matching stable across punctuation (e.g. "审查:周")
          .replaceAll(/[^a-z0-9\u4e00-\u9fff]/g, "");

      const candidates = items.map((item) => ({
        item,
        key: normalize(String(item.label ?? "")),
      }));

      const findExact = (label: string) => items.find((item) => item.label === label) ?? null;
      const find = (re: RegExp) => candidates.find((c) => re.test(c.key))?.item ?? null;

      // Prefer stable label keys from quota fetch (e.g. codex returns "m_quota.code_weekly").
      // Fallback to fuzzy matching for other providers / legacy labels.
      const codeFiveHour =
        findExact("m_quota.code_5h") ?? find(/(mquotacode5h|code5h|5h|5小时|fivehour|5hour)/i);
      const codeWeek =
        findExact("m_quota.code_weekly") ?? find(/(mquotacodeweekly|codeweekly|weekly|week|周)/i);
      const reviewWeek =
        findExact("m_quota.review_weekly") ??
        find(/(mquotareviewweekly|reviewweekly|reviewweek|review_week|审查周|审查：周)/i);

      return [
        {
          id: "code_5h" as const,
          label: translateQuotaText("m_quota.code_5h"),
          item: codeFiveHour,
        },
        {
          id: "code_week" as const,
          label: translateQuotaText("m_quota.code_weekly"),
          item: codeWeek,
        },
        {
          id: "review_week" as const,
          label: translateQuotaText("m_quota.review_weekly"),
          item: reviewWeek,
        },
      ];
    },
    [translateQuotaText],
  );

  const quotaProgressCircle = useCallback((percent: number | null) => {
    const normalized = percent === null ? null : clampPercent(percent);
    const color =
      normalized === null
        ? "bg-slate-300/40 dark:bg-white/8"
        : normalized >= 60
          ? "bg-emerald-500"
          : normalized >= 20
            ? "bg-amber-500"
            : "bg-rose-500";

    const fill =
      color === "bg-emerald-500"
        ? "#10b981"
        : color === "bg-amber-500"
          ? "#f59e0b"
          : color === "bg-rose-500"
            ? "#f43f5e"
            : "#cbd5e1";

    const deg = normalized === null ? 0 : Math.max(0, Math.min(360, (normalized / 100) * 360));

    return (
      <span
        className="relative inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <span
          className="absolute inset-0 rounded-full dark:hidden"
          style={{
            background: `conic-gradient(${fill} ${deg}deg, rgba(148, 163, 184, 0.35) 0deg)`,
          }}
        />
        <span
          className="absolute inset-0 hidden rounded-full dark:block"
          style={{
            background: `conic-gradient(${fill} ${deg}deg, rgba(255, 255, 255, 0.14) 0deg)`,
          }}
        />
        <span className="absolute inset-[2px] rounded-full bg-white dark:bg-neutral-950" />
      </span>
    );
  }, []);

  const renderQuotaHoverContent = useCallback(
    (state: QuotaState) => {
      const items = Array.isArray(state.items) ? (state.items as QuotaItem[]) : [];
      const hasError = state.status === "error";

      return (
        <div className="space-y-1">
          {hasError ? (
            <p className="max-w-80 truncate text-[11px] font-semibold text-rose-700 dark:text-rose-200">
              {translateQuotaText(state.error ?? t("common.error"))}
            </p>
          ) : null}

          {items.length > 0 ? (
            <div className="grid w-[min(22rem,calc(100vw-2rem))] grid-cols-[auto_0.875rem_2.5rem_1fr] items-center gap-x-1 gap-y-1">
              {items.map((item) => {
                const percentText =
                  item.percent === null ? "--" : `${Math.round(clampPercent(item.percent))}%`;
                const resetText = formatQuotaResetTextCompact(item.resetAtMs);
                return (
                  <div key={item.label} className="contents">
                    <span className="min-w-0 truncate text-[10px] font-semibold text-slate-600 dark:text-white/70">
                      {translateQuotaText(item.label)}
                    </span>
                    <span className="flex items-center justify-center">
                      {quotaProgressCircle(item.percent)}
                    </span>
                    <span className="text-[10px] font-semibold tabular-nums text-slate-800 dark:text-white/85">
                      {percentText}
                    </span>
                    <span className="min-w-0 truncate whitespace-nowrap text-[10px] tabular-nums text-slate-500 dark:text-white/40">
                      {resetText ?? "--"}
                    </span>
                    {item.meta ? (
                      <span className="col-span-4 truncate text-[10px] text-slate-500 dark:text-white/55">
                        {item.meta}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      );
    },
    [formatQuotaResetTextCompact, quotaProgressCircle, t, translateQuotaText],
  );

  const renderQuotaBar = useCallback(
    (label: string, item: QuotaItem | null) => {
      const normalized =
        item?.percent === null || item?.percent == null ? null : clampPercent(item.percent);
      const percentText = normalized === null ? "--" : `${Math.round(normalized)}%`;
      const resetText = formatQuotaResetTextCompact(item?.resetAtMs) ?? "--";
      const fillClass =
        normalized === null
          ? "bg-slate-300/50 dark:bg-white/10"
          : normalized >= 60
            ? "bg-emerald-500"
            : normalized >= 20
              ? "bg-amber-500"
              : "bg-rose-500";

      return (
        <div key={label} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-[11px] font-semibold text-slate-700 dark:text-white/80">
              {label}
            </span>
            <span className="shrink-0 text-[11px] font-semibold tabular-nums text-slate-900 dark:text-white">
              {percentText}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-white/10">
            <div
              className={["h-full rounded-full", fillClass].join(" ")}
              style={{ width: `${normalized ?? 0}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="truncate text-[10px] tabular-nums text-slate-500 dark:text-white/45">
            {resetText}
          </div>
        </div>
      );
    },
    [formatQuotaResetTextCompact],
  );

  const loadModelsForDetail = useCallback(
    async (file: AuthFileItem, options?: { force?: boolean }) => {
      const force = Boolean(options?.force);
      setModelsFileType(resolveFileType(file));
      setModelsLoading(true);
      setModelsList([]);
      setModelsError(null);

      if (!force) {
        const cached = modelsCacheRef.current.get(file.name);
        if (cached) {
          setModelsList(cached);
          setModelsLoading(false);
          return;
        }
      }

      try {
        const list = await authFilesApi.getModelsForAuthFile(file.name);
        modelsCacheRef.current.set(file.name, list);
        setModelsList(list);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "";
        if (/404|not found/i.test(message)) {
          setModelsError("unsupported");
          return;
        }
        notify({ type: "error", message: message || t("auth_files.failed_get_models") });
      } finally {
        setModelsLoading(false);
      }
    },
    [notify, t],
  );

  const refreshQuota = useCallback(
    async (file: AuthFileItem, provider: QuotaProvider) => {
      const name = file.name;
      if (quotaInFlightRef.current.has(name)) return;
      quotaInFlightRef.current.add(name);

      setQuotaByFileName((prev) => ({
        ...prev,
        [name]: {
          status: "loading",
          items: prev[name]?.items ?? [],
          error: prev[name]?.error,
          updatedAt: prev[name]?.updatedAt,
        },
      }));

      try {
        const result = await fetchQuota(provider, file);
        const items = Array.isArray(result) ? result : result.items;
        const nextPlanType = Array.isArray(result) ? null : (result.planType ?? null);
        const rawAuthIndex = (file as any)["auth_index"] ?? file.authIndex;
        const authIndex = normalizeAuthIndexValue(rawAuthIndex);
        if (authIndex) {
          void quotaApi.reconcile(authIndex).catch(() => {});
        }
        if (nextPlanType) {
          patchAuthFileByName(name, {
            plan_type: nextPlanType,
            planType: nextPlanType,
          });
        }
        setQuotaByFileName((prev) => ({
          ...prev,
          [name]: { status: "success", items, updatedAt: Date.now() },
        }));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t("auth_files.unknown_error");
        setQuotaByFileName((prev) => ({
          ...prev,
          [name]: {
            status: "error",
            items: prev[name]?.items ?? [],
            error: message,
            updatedAt: Date.now(),
          },
        }));
      } finally {
        quotaInFlightRef.current.delete(name);
      }
    },
    [patchAuthFileByName, t],
  );

  const checkAuthFileConnectivity = useCallback(
    async (fileName: string) => {
      const current = connectivityState.get(fileName);
      if (current?.loading) return;

      setConnectivityState((prev) => {
        const next = new Map(prev);
        next.set(fileName, { loading: true, latencyMs: null, error: false });
        return next;
      });

      const start = performance.now();
      try {
        await authFilesApi.getModelsForAuthFile(fileName);
        const elapsed = performance.now() - start;
        setConnectivityState((prev) => {
          const next = new Map(prev);
          next.set(fileName, { loading: false, latencyMs: elapsed, error: false });
          return next;
        });
      } catch {
        const elapsed = performance.now() - start;
        setConnectivityState((prev) => {
          const next = new Map(prev);
          // If we got a quick response (even error), show latency
          if (elapsed < 20000) {
            next.set(fileName, { loading: false, latencyMs: elapsed, error: false });
          } else {
            next.set(fileName, { loading: false, latencyMs: null, error: true });
          }
          return next;
        });
      }
    },
    [connectivityState],
  );

  const loadAll = useCallback(async () => {
    const hasExisting = files.length > 0;
    if (hasExisting) setRefreshingAll(true);
    else setLoading(true);
    if (!hasExisting) setUsageLoading(true);
    try {
      const [filesRes, usageRes] = await Promise.all([
        authFilesApi.list(),
        usageApi.getEntityStats(30, "all").catch(() => null),
      ]);
      const list = Array.isArray(filesRes?.files) ? filesRes.files : [];
      setFiles(list);
      setUsageData(usageRes);
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.load_failed"),
      });
    } finally {
      if (hasExisting) setRefreshingAll(false);
      else setLoading(false);
      if (!hasExisting) setUsageLoading(false);
    }
  }, [files.length, notify, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    quotaByFileNameRef.current = quotaByFileName;
  }, [quotaByFileName]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let timer: number | null = null;
    timer = window.setTimeout(() => {
      writeAuthFilesDataCache({
        savedAtMs: Date.now(),
        files: sanitizeAuthFilesForCache(files),
      });
    }, 250);
    return () => {
      if (timer) window.clearTimeout(timer);
    };
  }, [files]);

  useEffect(() => {
    return () => {
      writeAuthFilesDataCache({
        savedAtMs: Date.now(),
        files: sanitizeAuthFilesForCache(filesRef.current),
      });
    };
  }, []);

  useEffect(() => {
    const state = readAuthFilesUiState();
    if (!state) return;
    if (state.tab) setTab(state.tab);
    if (typeof state.filter === "string") setFilter(state.filter);
    if (typeof state.search === "string") setSearch(state.search);
    if (typeof state.page === "number" && Number.isFinite(state.page))
      setPage(Math.max(1, Math.round(state.page)));
  }, []);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "files" || requestedTab === "excluded" || requestedTab === "alias") {
      setTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    writeAuthFilesUiState({ tab, filter, search, page });
  }, [filter, page, search, tab]);

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    files.forEach((file) => set.add(resolveFileType(file)));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [files]);

  const searchFilteredFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    return files.filter((file) => {
      if (!q) return true;
      const name = String(file.name || "").toLowerCase();
      const provider = String(file.provider || "").toLowerCase();
      const type = String(file.type || "").toLowerCase();
      return name.includes(q) || provider.includes(q) || type.includes(q);
    });
  }, [files, search]);

  const filterCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    searchFilteredFiles.forEach((file) => {
      const typeKey = normalizeProviderKey(resolveFileType(file));
      counts[typeKey] = (counts[typeKey] ?? 0) + 1;
    });
    return { total: searchFilteredFiles.length, counts };
  }, [searchFilteredFiles]);

  const filteredFiles = useMemo(() => {
    const normalizedFilter = normalizeProviderKey(filter);
    const scoped =
      !normalizedFilter || normalizedFilter === "all"
        ? searchFilteredFiles
        : searchFilteredFiles.filter(
          (file) => normalizeProviderKey(resolveFileType(file)) === normalizedFilter,
        );
    return [...scoped].sort((a, b) =>
      authFilesSortCollator.compare(resolveAuthFileSortKey(a), resolveAuthFileSortKey(b)),
    );
  }, [filter, searchFilteredFiles]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / AUTH_FILES_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * AUTH_FILES_PAGE_SIZE;
    return filteredFiles.slice(start, start + AUTH_FILES_PAGE_SIZE);
  }, [filteredFiles, safePage]);
  const selectableFilteredFiles = useMemo(
    () => filteredFiles.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [filteredFiles],
  );
  const selectablePageFiles = useMemo(
    () => pageItems.filter((file) => !isRuntimeOnlyAuthFile(file)),
    [pageItems],
  );
  const selectableFilteredNameSet = useMemo(
    () => new Set(selectableFilteredFiles.map((file) => file.name)),
    [selectableFilteredFiles],
  );
  const selectablePageNames = useMemo(
    () => selectablePageFiles.map((file) => file.name),
    [selectablePageFiles],
  );
  const selectedFileNameSet = useMemo(() => new Set(selectedFileNames), [selectedFileNames]);
  const selectedCount = selectedFileNames.length;
  const allPageSelected =
    selectablePageNames.length > 0 &&
    selectablePageNames.every((name) => selectedFileNameSet.has(name));
  const somePageSelected =
    !allPageSelected && selectablePageNames.some((name) => selectedFileNameSet.has(name));
  const allFilteredSelected =
    selectableFilteredFiles.length > 0 &&
    selectableFilteredFiles.every((file) => selectedFileNameSet.has(file.name));

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    setSelectedFileNames((prev) => prev.filter((name) => selectableFilteredNameSet.has(name)));
  }, [selectableFilteredNameSet]);

  const toggleFileSelection = useCallback((name: string, checked: boolean) => {
    setSelectedFileNames((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return Array.from(next);
    });
  }, []);

  const selectCurrentPage = useCallback(
    (checked: boolean) => {
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        selectablePageNames.forEach((name) => {
          if (checked) next.add(name);
          else next.delete(name);
        });
        return Array.from(next);
      });
    },
    [selectablePageNames],
  );

  const selectFilteredFiles = useCallback(
    (checked: boolean) => {
      setSelectedFileNames((prev) => {
        const next = new Set(prev);
        selectableFilteredFiles.forEach((file) => {
          if (checked) next.add(file.name);
          else next.delete(file.name);
        });
        return Array.from(next);
      });
    },
    [selectableFilteredFiles],
  );

  const collectQuotaFetchTargets = useCallback(
    (targetFiles: AuthFileItem[]) => {
      const staleMs = Math.max(15_000, quotaAutoRefreshMs || 30_000);
      const now = Date.now();

      return targetFiles
        .map((file) => {
          const provider = resolveQuotaProvider(file);
          return provider ? { file, provider } : null;
        })
        .filter(Boolean)
        .filter((candidate) => {
          const current = candidate as { file: AuthFileItem; provider: QuotaProvider };
          if (quotaInFlightRef.current.has(current.file.name)) return false;
          const state = quotaByFileNameRef.current[current.file.name];
          const items = Array.isArray(state?.items) ? state.items : [];
          const updatedAt = state?.updatedAt ?? 0;
          const isStale =
            typeof updatedAt === "number" && updatedAt > 0 ? now - updatedAt > staleMs : true;
          const needs = !state || state.status === "error" || items.length === 0 || isStale;
          if (!needs) return false;

          const lastAttempt = quotaWarmupAttemptRef.current.get(current.file.name) ?? 0;
          if (now - lastAttempt < 5_000) return false;
          return true;
        }) as { file: AuthFileItem; provider: QuotaProvider }[];
    },
    [quotaAutoRefreshMs],
  );

  const runQuotaRefreshBatch = useCallback(
    async (
      targets: { file: AuthFileItem; provider: QuotaProvider }[],
      options?: { markAsAutoRefreshing?: boolean },
    ) => {
      if (!targets.length) return;

      const markAsAutoRefreshing = Boolean(options?.markAsAutoRefreshing);
      const CONCURRENCY = 3;
      let idx = 0;

      const workers = Array.from({ length: Math.min(CONCURRENCY, targets.length) }).map(async () => {
        for (;;) {
          const current = targets[idx];
          idx += 1;
          if (!current) return;
          quotaWarmupAttemptRef.current.set(current.file.name, Date.now());
          if (markAsAutoRefreshing) {
            quotaAutoRefreshingRef.current.add(current.file.name);
          }
          try {
            await refreshQuota(current.file, current.provider);
          } finally {
            if (markAsAutoRefreshing) {
              quotaAutoRefreshingRef.current.delete(current.file.name);
            }
          }
        }
      });

      await Promise.allSettled(workers);
    },
    [refreshQuota],
  );

  useEffect(() => {
    if (tab !== "files") return;
    if (loading) return;

    const toFetch = collectQuotaFetchTargets(pageItems);
    if (!toFetch.length) return;

    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await runQuotaRefreshBatch(toFetch);
    })();

    return () => {
      cancelled = true;
    };
  }, [collectQuotaFetchTargets, loading, pageItems, runQuotaRefreshBatch, tab]);

  const quotaLastUpdatedAtMs = useMemo(() => {
    let latest = 0;
    pageItems.forEach((file) => {
      const updatedAt = quotaByFileName[file.name]?.updatedAt;
      if (typeof updatedAt === "number" && Number.isFinite(updatedAt)) {
        latest = Math.max(latest, updatedAt);
      }
    });
    return latest || null;
  }, [pageItems, quotaByFileName]);

  const quotaLastUpdatedText = useMemo(() => {
    if (!quotaLastUpdatedAtMs) return "--";
    const date = new Date(quotaLastUpdatedAtMs);
    return Number.isNaN(date.getTime()) ? "--" : date.toLocaleTimeString();
  }, [quotaLastUpdatedAtMs]);

  const refreshCurrentPageQuota = useCallback(async () => {
    if (tab !== "files") return;
    if (loading) return;
    if (quotaInFlightRef.current.size > 0) return;

    const candidates = collectQuotaFetchTargets(pageItems);
    if (!candidates.length) return;

    await runQuotaRefreshBatch(candidates, { markAsAutoRefreshing: true });
  }, [collectQuotaFetchTargets, loading, pageItems, runQuotaRefreshBatch, tab]);

  useInterval(
    () => {
      void refreshCurrentPageQuota();
    },
    tab === "files" && quotaAutoRefreshMs > 0 ? quotaAutoRefreshMs : null,
  );

  const formatAveragePercent = useCallback((value: number | null) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "--";
    return `${Math.round(clampPercent(value))}%`;
  }, []);

  const groupOverviewTabs = useMemo(() => ["all", ...providerOptions], [providerOptions]);

  const computeGroupOverview = useCallback(
    (targetFiles: AuthFileItem[]): AuthFilesGroupOverview => {
      let totalCalls = 0;
      const fiveHourValues: number[] = [];
      const weeklyValues: number[] = [];

      targetFiles.forEach((file) => {
        const stats = resolveAuthFileStats(file, usageIndex);
        totalCalls += stats.success + stats.failure;

        const provider = resolveQuotaProvider(file);
        if (!provider) return;

        const state = quotaByFileName[file.name];
        const items = Array.isArray(state?.items) ? state.items : [];
        if (items.length === 0) return;

        const slots = resolveQuotaCardSlots(provider, items);
        const fiveHour = slots.find((slot) => slot.id === "code_5h")?.item?.percent;
        const weekly = slots.find((slot) => slot.id === "code_week")?.item?.percent;

        if (typeof fiveHour === "number" && Number.isFinite(fiveHour)) {
          fiveHourValues.push(fiveHour);
        }
        if (typeof weekly === "number" && Number.isFinite(weekly)) {
          weeklyValues.push(weekly);
        }
      });

      const average = (values: number[]) =>
        values.length === 0
          ? null
          : values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

      return {
        totalCalls,
        averageFiveHour: average(fiveHourValues),
        averageWeekly: average(weeklyValues),
        quotaSampleCount: Math.max(fiveHourValues.length, weeklyValues.length),
      };
    },
    [quotaByFileName, resolveQuotaCardSlots, usageIndex],
  );

  const groupOverviewByTab = useMemo<Record<string, AuthFilesGroupOverview>>(() => {
    const map: Record<string, AuthFilesGroupOverview> = {
      all: computeGroupOverview(filteredFiles),
    };
    providerOptions.forEach((key) => {
      const filesForGroup = filteredFiles.filter(
        (file) => normalizeProviderKey(resolveFileType(file)) === key,
      );
      map[key] = computeGroupOverview(filesForGroup);
    });
    return map;
  }, [computeGroupOverview, filteredFiles, providerOptions]);

  const groupOverviewRowsByTab = useMemo<Record<string, AuthFilesGroupOverviewRow[]>>(() => {
    const buildRows = (targetFiles: AuthFileItem[]) =>
      targetFiles
        .map((file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          const provider = resolveQuotaProvider(file);
          const state = quotaByFileName[file.name];
          const items = Array.isArray(state?.items) ? state.items : [];
          const slots = provider ? resolveQuotaCardSlots(provider, items) : [];
          const fiveHour = slots.find((slot) => slot.id === "code_5h")?.item?.percent ?? null;
          const weekly = slots.find((slot) => slot.id === "code_week")?.item?.percent ?? null;
          return {
            name: resolveAuthFileDisplayName(file) || file.name,
            totalCalls: stats.success + stats.failure,
            averageFiveHour:
              typeof fiveHour === "number" && Number.isFinite(fiveHour) ? fiveHour : null,
            averageWeekly:
              typeof weekly === "number" && Number.isFinite(weekly) ? weekly : null,
            hasQuota: items.length > 0,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name, "zh-Hans-CN"));

    const map: Record<string, AuthFilesGroupOverviewRow[]> = {
      all: buildRows(filteredFiles),
    };
    providerOptions.forEach((key) => {
      const filesForGroup = filteredFiles.filter(
        (file) => normalizeProviderKey(resolveFileType(file)) === key,
      );
      map[key] = buildRows(filesForGroup);
    });
    return map;
  }, [filteredFiles, providerOptions, quotaByFileName, resolveQuotaCardSlots, usageIndex]);

  const activeGroupOverview = useMemo<AuthFilesGroupOverview>(() => {
    return groupOverviewByTab[groupOverviewTab] ?? groupOverviewByTab.all ?? computeGroupOverview([]);
  }, [computeGroupOverview, groupOverviewByTab, groupOverviewTab]);

  const activeGroupRows = useMemo<AuthFilesGroupOverviewRow[]>(() => {
    return groupOverviewRowsByTab[groupOverviewTab] ?? groupOverviewRowsByTab.all ?? [];
  }, [groupOverviewRowsByTab, groupOverviewTab]);

  const activeGroupTitle = useMemo(() => {
    if (groupOverviewTab === "all") return t("auth_files.group_overview_current_results");
    return t("auth_files.group_overview_group_label", {
      group: resolveProviderLabel(groupOverviewTab),
    });
  }, [groupOverviewTab, t]);

  const groupOverviewChartOption = useMemo<Record<string, unknown>>(() => {
    const labels = groupTrendPoints.map((point) => point.label);
    const calls = groupTrendPoints.map((point) => point.calls);
    const weekly = groupTrendPoints.map((point) => point.weeklyPercent);

    return {
      backgroundColor: "transparent",
      animationDuration: 420,
      animationDurationUpdate: 280,
      grid: { left: 48, right: 44, top: 36, bottom: 44, containLabel: false },
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "line" },
        renderMode: "html",
        appendToBody: true,
        confine: true,
        borderWidth: 0,
        backgroundColor: "rgba(15, 23, 42, 0.92)",
        textStyle: { color: "#fff" },
        extraCssText: "z-index: 10000;",
      },
      legend: {
        top: 0,
        left: 0,
        textStyle: { color: "#64748b", fontSize: 11 },
      },
      xAxis: {
        type: "category",
        data: labels,
        axisTick: { show: false },
        axisLabel: {
          interval: 0,
          color: "#64748b",
          fontSize: 11,
        },
        axisLine: { lineStyle: { color: "rgba(148,163,184,0.45)" } },
      },
      yAxis: [
        {
          type: "value",
          axisLabel: {
            color: "#64748b",
            fontSize: 11,
            margin: 10,
          },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.18)" } },
        },
        {
          type: "value",
          min: 0,
          max: 100,
          axisLabel: {
            color: "#64748b",
            fontSize: 11,
            margin: 10,
            formatter: (value: number) => `${Math.round(value)}%`,
          },
          splitLine: { show: false },
        },
      ],
      series: [
        {
          name: t("auth_files.group_overview_total_calls_label"),
          type: "bar",
          barMaxWidth: 26,
          itemStyle: { color: "rgba(59,130,246,0.88)", borderRadius: [4, 4, 0, 0] },
          data: calls,
        },
        {
          name: t("auth_files.group_overview_avg_week_label"),
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbol: "circle",
          symbolSize: 7,
          lineStyle: { width: 3, color: "#10b981" },
          itemStyle: { color: "#10b981" },
          connectNulls: false,
          data: weekly,
        },
      ],
    };
  }, [groupTrendPoints, t]);

  const refreshGroupOverview = useCallback(async (targetGroup = groupOverviewTab) => {
    if (tab !== "files") return;
    setGroupOverviewLoading(true);
    try {
      const scopedFiles =
        targetGroup === "all"
          ? filteredFiles
          : filteredFiles.filter((file) => normalizeProviderKey(resolveFileType(file)) === targetGroup);
      const targets = collectQuotaFetchTargets(scopedFiles);
      await runQuotaRefreshBatch(targets, { markAsAutoRefreshing: true });
    } finally {
      setGroupOverviewLoading(false);
    }
  }, [collectQuotaFetchTargets, filteredFiles, groupOverviewTab, runQuotaRefreshBatch, tab]);

  const refreshGroupTrend = useCallback(async (targetGroup = groupOverviewTab) => {
    const requestId = Date.now();
    groupTrendRequestRef.current = requestId;
    setGroupTrendLoading(true);

    try {
      const axis = buildLast7DayAxis();
      const callsByDay = new Map(axis.map((item) => [item.date, 0]));
      const today = axis[axis.length - 1]?.date;
      const resp = await usageApi.getAuthFileGroupTrend(targetGroup, 7);
      (resp.points || []).forEach((point) => {
        if (callsByDay.has(point.date)) {
          callsByDay.set(point.date, point.requests ?? 0);
        }
      });

      const weeklyPoint =
        (groupOverviewByTab[targetGroup] ?? groupOverviewByTab.all)?.averageWeekly ?? null;
      const points: AuthFilesGroupTrendPoint[] = axis.map((item) => ({
        date: item.date,
        label: item.label,
        calls: callsByDay.get(item.date) ?? 0,
        weeklyPercent: item.date === today ? weeklyPoint : null,
      }));

      if (groupTrendRequestRef.current === requestId) {
        setGroupTrendPoints(points);
      }
    } finally {
      if (groupTrendRequestRef.current === requestId) {
        setGroupTrendLoading(false);
      }
    }
  }, [filteredFiles, groupOverviewByTab, groupOverviewTab]);

  const openGroupOverview = useCallback(() => {
    const normalizedFilter = normalizeProviderKey(filter);
    const nextTab =
      normalizedFilter && normalizedFilter !== "all" && providerOptions.includes(normalizedFilter)
        ? normalizedFilter
        : "all";
    setGroupOverviewTab(nextTab);
    setGroupOverviewOpen(true);
    void refreshGroupOverview(nextTab);
    void refreshGroupTrend(nextTab);
  }, [filter, providerOptions, refreshGroupOverview, refreshGroupTrend]);

  useEffect(() => {
    if (!groupOverviewOpen) return;
    void refreshGroupTrend(groupOverviewTab);
  }, [groupOverviewOpen, groupOverviewTab, refreshGroupTrend]);

  const openDetail = useCallback(
    async (file: AuthFileItem) => {
      setDetailOpen(true);
      setDetailTab("json");
      setDetailFile(file);
      setDetailLoading(true);
      setDetailText("");
      try {
        const text = await authFilesApi.downloadText(file.name);
        setDetailText(text);
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.read_failed"),
        });
      } finally {
        setDetailLoading(false);
      }
    },
    [notify, t],
  );

  const downloadAuthFile = useCallback(
    async (file: AuthFileItem) => {
      const confirmed = window.confirm(
        t(
          "auth_files.download_sensitive_confirm",
          "This downloads the full auth file and may include sensitive credentials. Continue?",
        ),
      );
      if (!confirmed) return;

      try {
        const blob = await authFilesApi.downloadBlob(file.name);
        downloadBlobAsFile(blob, file.name);
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.download_failed"),
        });
      }
    },
    [notify, t],
  );

  const handleUpload = useCallback(
    async (input: FileList | File[] | null) => {
      const list = Array.isArray(input) ? input : input ? Array.from(input) : [];
      const files = list.filter(Boolean);
      if (files.length === 0) return;

      const tooLarge: File[] = [];
      const valid: File[] = [];

      files.forEach((file) => {
        if (file.size > MAX_AUTH_FILE_SIZE) {
          tooLarge.push(file);
          return;
        }
        valid.push(file);
      });

      if (tooLarge.length > 0 && valid.length === 0) {
        const first = tooLarge[0];
        notify({
          type: "error",
          message: t("auth_files.file_too_large_detail", {
            size: formatFileSize(first.size),
            name: first.name,
            maxSize: formatFileSize(MAX_AUTH_FILE_SIZE),
          }),
        });
        return;
      }

      setUploading(true);
      try {
        let success = 0;
        let failed = 0;

        for (const file of valid) {
          try {
            await authFilesApi.upload(file);
            success += 1;
          } catch {
            failed += 1;
          }
        }

        if (failed === 0 && tooLarge.length === 0) {
          notify({ type: "success", message: t("auth_files.upload_success", { count: success }) });
        } else {
          notify({
            type: failed > 0 ? "error" : "info",
            message: t("auth_files.upload_partial", { success, failed, skipped: tooLarge.length }),
          });
        }

        await loadAll();
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.upload_failed"),
        });
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [loadAll, notify, t],
  );

  const handleDeleteSelection = useCallback(
    async (names: string[]) => {
      const targets = Array.from(new Set(names.map((name) => name.trim()).filter(Boolean)));
      if (targets.length === 0) return;

      setDeletingAll(true);
      try {
        let success = 0;
        let failed = 0;
        const deletedNames: string[] = [];

        for (const name of targets) {
          try {
            await authFilesApi.deleteFile(name);
            success += 1;
            deletedNames.push(name);
          } catch {
            failed += 1;
          }
        }

        if (deletedNames.length > 0) {
          setFiles((prev) => prev.filter((file) => !deletedNames.includes(file.name)));
          setSelectedFileNames((prev) => prev.filter((name) => !deletedNames.includes(name)));
          setDetailFile((prev) => (prev && deletedNames.includes(prev.name) ? null : prev));
          setDetailOpen((prev) =>
            prev && detailFile && deletedNames.includes(detailFile.name) ? false : prev,
          );
        }

        if (failed === 0) {
          notify({
            type: "success",
            message: t("auth_files.batch_deleted_selected", { count: success }),
          });
        } else {
          notify({
            type: "error",
            message: t("auth_files.batch_delete_partial", { success, failed }),
          });
        }
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
        });
      } finally {
        setDeletingAll(false);
      }
    },
    [detailFile, notify, t],
  );

  const setFileEnabled = useCallback(
    async (file: AuthFileItem, enabled: boolean) => {
      const name = file.name;
      const prevDisabled = Boolean(file.disabled);
      const nextDisabled = !enabled;

      setStatusUpdating((prev) => ({ ...prev, [name]: true }));
      setFiles((prev) =>
        prev.map((it) => (it.name === name ? { ...it, disabled: nextDisabled } : it)),
      );

      try {
        const res = await authFilesApi.setStatus(name, nextDisabled);
        setFiles((prev) =>
          prev.map((it) => (it.name === name ? { ...it, disabled: res.disabled } : it)),
        );
        notify({
          type: "success",
          message: enabled ? t("auth_files.enabled") : t("auth_files.disabled"),
        });
      } catch (err: unknown) {
        setFiles((prev) =>
          prev.map((it) => (it.name === name ? { ...it, disabled: prevDisabled } : it)),
        );
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.status_update_failed"),
        });
      } finally {
        setStatusUpdating((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [notify, t],
  );

  const openPrefixProxyEditor = useCallback(
    async (file: AuthFileItem) => {
      setPrefixProxyEditor({
        open: true,
        fileName: file.name,
        loading: true,
        saving: false,
        error: null,
        json: null,
        prefix: "",
        proxyUrl: "",
      });

      try {
        const rawText = await authFilesApi.downloadText(file.name);
        const trimmed = rawText.trim();

        let parsed: unknown;
        try {
          parsed = JSON.parse(trimmed) as unknown;
        } catch {
          setPrefixProxyEditor((prev) => ({
            ...prev,
            loading: false,
            error: t("auth_files.not_valid_json"),
          }));
          return;
        }

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setPrefixProxyEditor((prev) => ({
            ...prev,
            loading: false,
            error: t("auth_files.not_json_object"),
          }));
          return;
        }

        const json = parsed as Record<string, unknown>;
        const prefix = typeof json.prefix === "string" ? json.prefix : "";
        const proxyUrl = typeof json.proxy_url === "string" ? json.proxy_url : "";

        setPrefixProxyEditor((prev) => ({
          ...prev,
          loading: false,
          json,
          prefix,
          proxyUrl,
          error: null,
        }));
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.read_failed"),
        });
        setPrefixProxyEditor((prev) => ({
          ...prev,
          loading: false,
          error: t("auth_files.read_failed"),
        }));
      }
    },
    [notify, t],
  );

  const openChannelEditor = useCallback((file: AuthFileItem) => {
    setChannelEditor({
      open: true,
      fileName: file.name,
      label: readAuthFileChannelName(file),
      saving: false,
      error: null,
    });
  }, []);

  const saveChannelEditor = useCallback(async () => {
    const fileName = channelEditor.fileName.trim();
    const label = channelEditor.label.trim();
    if (!fileName) return;
    if (!label) {
      setChannelEditor((prev) => ({ ...prev, error: t("auth_files.channel_name_required") }));
      return;
    }

    setChannelEditor((prev) => ({ ...prev, saving: true, error: null }));
    try {
      await authFilesApi.patchFields({ name: fileName, label });
      notify({ type: "success", message: t("auth_files.saved") });
      await loadAll();
      setChannelEditor((prev) => ({ ...prev, saving: false, error: null }));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth_files.save_failed");
      setChannelEditor((prev) => ({ ...prev, saving: false, error: message }));
      notify({ type: "error", message });
    }
  }, [channelEditor.fileName, channelEditor.label, loadAll, notify, t]);

  useEffect(() => {
    if (!detailOpen || !detailFile) return;
    if (detailTab === "models") {
      void loadModelsForDetail(detailFile);
      return;
    }
    if (detailTab === "fields") {
      if (prefixProxyEditor.fileName !== detailFile.name) {
        void openPrefixProxyEditor(detailFile);
      }
      return;
    }
    if (detailTab === "channel") {
      if (channelEditor.fileName !== detailFile.name) {
        openChannelEditor(detailFile);
      }
    }
  }, [
    channelEditor.fileName,
    detailFile,
    detailOpen,
    detailTab,
    loadModelsForDetail,
    openChannelEditor,
    openPrefixProxyEditor,
    prefixProxyEditor.fileName,
  ]);

  const prefixProxyDirty = useMemo(() => {
    if (!prefixProxyEditor.json) return false;
    const originalPrefix =
      typeof prefixProxyEditor.json.prefix === "string" ? prefixProxyEditor.json.prefix : "";
    const originalProxyUrl =
      typeof prefixProxyEditor.json.proxy_url === "string" ? prefixProxyEditor.json.proxy_url : "";
    return (
      originalPrefix !== prefixProxyEditor.prefix || originalProxyUrl !== prefixProxyEditor.proxyUrl
    );
  }, [prefixProxyEditor.json, prefixProxyEditor.prefix, prefixProxyEditor.proxyUrl]);

  const prefixProxyUpdatedText = useMemo(() => {
    if (!prefixProxyEditor.json) return "";
    const next = { ...prefixProxyEditor.json };

    const prefix = prefixProxyEditor.prefix.trim();
    if (prefix) next.prefix = prefix;
    else delete next.prefix;

    const proxyUrl = prefixProxyEditor.proxyUrl.trim();
    if (proxyUrl) next.proxy_url = proxyUrl;
    else delete next.proxy_url;

    return JSON.stringify(next, null, 2);
  }, [prefixProxyEditor.json, prefixProxyEditor.prefix, prefixProxyEditor.proxyUrl]);

  const savePrefixProxy = useCallback(async () => {
    if (!prefixProxyEditor.json) return;
    if (!prefixProxyDirty) return;

    const payload = prefixProxyUpdatedText;
    const fileSize = new Blob([payload]).size;
    if (fileSize > MAX_AUTH_FILE_SIZE) {
      notify({
        type: "error",
        message: t("auth_files.save_too_large", { size: formatFileSize(fileSize) }),
      });
      return;
    }

    const name = prefixProxyEditor.fileName;
    setPrefixProxyEditor((prev) => ({ ...prev, saving: true }));
    try {
      const file = new File([payload], name, { type: "application/json" });
      await authFilesApi.upload(file);
      notify({ type: "success", message: t("auth_files.saved") });
      await loadAll();
      try {
        const parsed = JSON.parse(payload) as Record<string, unknown>;
        setPrefixProxyEditor((prev) => ({
          ...prev,
          loading: false,
          saving: false,
          error: null,
          json: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : prev.json,
        }));
      } catch {
        setPrefixProxyEditor((prev) => ({ ...prev, saving: false, error: null }));
      }
      setDetailText((prev) => (name && detailFile?.name === name ? payload : prev));
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.save_failed"),
      });
      setPrefixProxyEditor((prev) => ({ ...prev, saving: false }));
    }
  }, [
    detailFile?.name,
    loadAll,
    notify,
    prefixProxyDirty,
    prefixProxyEditor.fileName,
    prefixProxyEditor.json,
    prefixProxyUpdatedText,
    t,
  ]);

  const refreshExcluded = useCallback(async () => {
    setExcludedLoadAttempted(true);
    setExcludedLoading(true);
    try {
      const map = await authFilesApi.getOauthExcludedModels();
      setExcludedUnsupported(false);
      setExcluded(map);
      setExcludedDraft(
        Object.fromEntries(
          Object.entries(map).map(([key, value]) => [
            key,
            Array.isArray(value) ? value.join("\n") : "",
          ]),
        ),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (/404|not found/i.test(message)) {
        setExcludedUnsupported(true);
        setExcluded({});
        setExcludedDraft({});
        return;
      }
      notify({ type: "error", message: message || t("auth_files.load_excluded_failed") });
    } finally {
      setExcludedLoading(false);
    }
  }, [notify, t]);

  const refreshAlias = useCallback(async () => {
    setAliasLoadAttempted(true);
    setAliasLoading(true);
    try {
      const map = await authFilesApi.getOauthModelAlias();
      setAliasUnsupported(false);
      setAliasMap(map);
      setAliasEditing(
        Object.fromEntries(Object.entries(map).map(([key, value]) => [key, buildAliasRows(value)])),
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (/404|not found/i.test(message)) {
        setAliasUnsupported(true);
        setAliasMap({});
        setAliasEditing({});
        return;
      }
      notify({ type: "error", message: message || t("auth_files.load_alias_failed") });
    } finally {
      setAliasLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    if (
      tab === "excluded" &&
      !excludedLoadAttempted &&
      !excludedLoading &&
      !excludedUnsupported &&
      Object.keys(excluded).length === 0
    ) {
      void refreshExcluded();
    }
    if (
      tab === "alias" &&
      !aliasLoadAttempted &&
      !aliasLoading &&
      !aliasUnsupported &&
      Object.keys(aliasMap).length === 0
    ) {
      void refreshAlias();
    }
  }, [
    aliasLoading,
    aliasMap,
    aliasUnsupported,
    aliasLoadAttempted,
    excluded,
    excludedLoading,
    excludedUnsupported,
    excludedLoadAttempted,
    refreshAlias,
    refreshExcluded,
    tab,
  ]);

  const saveExcludedProvider = useCallback(
    async (provider: string, text: string) => {
      if (excludedUnsupported) {
        notify({
          type: "error",
          message: t("auth_files.server_no_excluded_api"),
        });
        return;
      }
      const key = normalizeProviderKey(provider);
      const models = text
        .split(/[\n,]+/)
        .map((item) => item.trim())
        .filter(Boolean);
      try {
        await authFilesApi.saveOauthExcludedModels(key, models);
        notify({ type: "success", message: t("auth_files.saved") });
        startTransition(() => void refreshExcluded());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.save_failed"),
        });
      }
    },
    [excludedUnsupported, notify, refreshExcluded, startTransition],
  );

  const deleteExcludedProvider = useCallback(
    async (provider: string) => {
      if (excludedUnsupported) {
        notify({
          type: "error",
          message:
            "Server does not support OAuth excluded models API (/oauth-excluded-models). Please upgrade.",
        });
        return;
      }
      const key = normalizeProviderKey(provider);
      try {
        await authFilesApi.deleteOauthExcludedEntry(key);
        notify({ type: "success", message: t("auth_files.deleted") });
        startTransition(() => void refreshExcluded());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
        });
      }
    },
    [excludedUnsupported, notify, refreshExcluded, startTransition],
  );

  const addExcludedProvider = useCallback(() => {
    const key = normalizeProviderKey(excludedNewProvider);
    if (!key) {
      notify({ type: "info", message: t("auth_files.please_enter_provider") });
      return;
    }
    setExcluded((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
    setExcludedDraft((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: "" }));
    setExcludedNewProvider("");
  }, [excludedNewProvider, notify]);

  const addAliasChannel = useCallback(() => {
    const key = normalizeProviderKey(aliasNewChannel);
    if (!key) {
      notify({ type: "info", message: t("auth_files.please_enter_channel") });
      return;
    }
    setAliasMap((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
    setAliasEditing((prev) => (prev[key] ? prev : { ...prev, [key]: buildAliasRows([]) }));
    setAliasNewChannel("");
  }, [aliasNewChannel, notify]);

  const saveAliasChannel = useCallback(
    async (channel: string) => {
      if (aliasUnsupported) {
        notify({
          type: "error",
          message: t("auth_files.server_no_alias_api"),
        });
        return;
      }
      const key = normalizeProviderKey(channel);
      const rows = aliasEditing[key] ?? [];
      const next = rows
        .map((row) => ({
          name: row.name.trim(),
          alias: row.alias.trim(),
          ...(row.fork ? { fork: true } : {}),
        }))
        .filter((row) => row.name && row.alias);

      try {
        await authFilesApi.saveOauthModelAlias(key, next);
        notify({ type: "success", message: t("auth_files.saved") });
        startTransition(() => void refreshAlias());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.save_failed"),
        });
      }
    },
    [aliasEditing, aliasUnsupported, notify, refreshAlias, startTransition],
  );

  const deleteAliasChannel = useCallback(
    async (channel: string) => {
      if (aliasUnsupported) {
        notify({
          type: "error",
          message: t("auth_files.server_no_alias_api"),
        });
        return;
      }
      const key = normalizeProviderKey(channel);
      try {
        await authFilesApi.deleteOauthModelAlias(key);
        notify({ type: "success", message: t("auth_files.deleted") });
        startTransition(() => void refreshAlias());
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
        });
      }
    },
    [aliasUnsupported, notify, refreshAlias, startTransition],
  );

  const openImport = useCallback(
    async (channel: string) => {
      if (aliasUnsupported) return;
      const key = normalizeProviderKey(channel);
      if (!key) return;

      setImportOpen(true);
      setImportChannel(key);
      setImportLoading(true);
      setImportModels([]);
      setImportSearch("");
      setImportSelected(new Set());

      try {
        const models = await authFilesApi.getModelDefinitions(key);
        const list = Array.isArray(models) ? models : [];
        setImportModels(list);
        setImportSelected(new Set(list.map((m) => m.id)));
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.failed_get_models"),
        });
        setImportOpen(false);
      } finally {
        setImportLoading(false);
      }
    },
    [aliasUnsupported, notify],
  );

  const applyImport = useCallback(() => {
    const key = importChannel;
    if (!key) return;

    const selected = new Set(importSelected);
    const picked = importModels.filter((m) => selected.has(m.id));
    if (picked.length === 0) {
      notify({ type: "info", message: t("auth_files.no_models_selected") });
      return;
    }

    setAliasEditing((prev) => {
      const current = prev[key] ?? buildAliasRows([]);
      const seen = new Set(
        current.map(
          (r) => `${r.name.toLowerCase()}::${r.alias.toLowerCase()}::${r.fork ? "1" : "0"}`,
        ),
      );

      const merged = [...current];
      picked.forEach((model) => {
        const name = model.id;
        const alias = model.id;
        const dedupeKey = `${name.toLowerCase()}::${alias.toLowerCase()}::0`;
        if (seen.has(dedupeKey)) return;
        seen.add(dedupeKey);
        merged.push({ id: `row-${Date.now()}-${name}`, name, alias });
      });

      return { ...prev, [key]: merged };
    });

    setImportOpen(false);
    notify({ type: "success", message: t("auth_files.imported_default") });
  }, [importChannel, importModels, importSelected, notify]);

  const filterChips = useMemo(() => ["all", ...providerOptions], [providerOptions]);

  const fileColumns = useMemo<VirtualTableColumn<AuthFileItem>[]>(() => {
    return [
      {
        key: "select",
        label: "",
        width: "w-16",
        headerClassName: "text-center",
        cellClassName: "text-center",
        headerRender: () => (
          <div className="flex items-center justify-center">
            <input
              type="checkbox"
              aria-label={t("auth_files.select_current_page")}
              checked={allPageSelected}
              disabled={selectablePageNames.length === 0}
              ref={(node) => {
                if (node) node.indeterminate = somePageSelected;
              }}
              onChange={(e) => selectCurrentPage(e.currentTarget.checked)}
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
            />
          </div>
        ),
        render: (file) => {
          if (isRuntimeOnlyAuthFile(file)) {
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          }
          const checked = selectedFileNameSet.has(file.name);
          return (
            <div className="flex items-center justify-center">
              <input
                type="checkbox"
                aria-label={t("auth_files.select_file", {
                  name: resolveAuthFileDisplayName(file) || file.name,
                })}
                checked={checked}
                onChange={(e) => toggleFileSelection(file.name, e.currentTarget.checked)}
                className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
              />
            </div>
          );
        },
      },
      {
        key: "name",
        label: t("auth_files.col_name"),
        width: "w-96",
        render: (file) => {
          return (
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-slate-900 dark:text-white">
                {resolveAuthFileDisplayName(file) || "--"}
              </p>
            </div>
          );
        },
      },
      {
        key: "type",
        label: t("auth_files.col_type"),
        width: "w-44",
        render: (file) => {
          const typeKey = resolveFileType(file);
          const badgeClass = TYPE_BADGE_CLASSES[typeKey] ?? TYPE_BADGE_CLASSES.unknown;
          const planType = resolveAuthFilePlanType(file);
          const runtimeOnly = isRuntimeOnlyAuthFile(file);

          return (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${badgeClass}`}
                >
                  {typeKey}
                </span>
                {planType ? (
                  <span className="inline-flex rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
                    {t("codex_quota.plan_label")} {formatPlanTypeLabel(planType)}
                  </span>
                ) : null}
              </div>
              {runtimeOnly ? (
                <span className="inline-flex w-fit rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
                  {t("auth_files.virtual_auth_file")}
                </span>
              ) : null}
            </div>
          );
        },
      },
      {
        key: "size",
        label: t("auth_files.file_size"),
        width: "w-28",
        render: (file) => (
          <span className="text-xs tabular-nums text-slate-700 dark:text-white/70">
            {formatFileSize(file.size)}
          </span>
        ),
      },
      {
        key: "modified",
        label: t("auth_files.file_modified"),
        width: "w-48",
        render: (file) => (
          <span className="text-xs tabular-nums text-slate-700 dark:text-white/70">
            {formatModified(file)}
          </span>
        ),
      },
      {
        key: "connectivity",
        label: t("auth_files.col_connectivity"),
        width: "w-32",
        render: (file) => {
          const cs = connectivityState.get(file.name);
          return (
            <button
              type="button"
              disabled={cs?.loading}
              className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] tabular-nums text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-default disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/60 dark:hover:border-blue-600 dark:hover:bg-blue-950 dark:hover:text-blue-300"
              onClick={() => void checkAuthFileConnectivity(file.name)}
              title={t("auth_files.check_connectivity")}
              aria-label={t("auth_files.check_connectivity")}
            >
              {cs?.loading ? (
                <Loader2 size={10} className="animate-spin" />
              ) : cs?.error ? (
                <span className="font-bold text-rose-500">✕</span>
              ) : cs?.latencyMs != null ? (
                <span className="font-medium">{formatLatency(cs.latencyMs)}</span>
              ) : (
                <Zap size={10} />
              )}
            </button>
          );
        },
      },
      {
        key: "success",
        label: t("common.success"),
        width: "w-24",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          return (
            <span className="text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-200">
              {stats.success}
            </span>
          );
        },
      },
      {
        key: "failure",
        label: t("common.failure"),
        width: "w-24",
        headerClassName: "text-right",
        cellClassName: "text-right",
        render: (file) => {
          const stats = resolveAuthFileStats(file, usageIndex);
          return (
            <span className="text-xs font-semibold tabular-nums text-rose-700 dark:text-rose-200">
              {stats.failure}
            </span>
          );
        },
      },
      {
        key: "rate",
        label: t("common.success_rate"),
        width: "w-64",
        render: (file) => {
          const statusData = resolveAuthFileStatusBar(file, usageIndex);
          return <ProviderStatusBar data={statusData} compact />;
        },
      },
      {
        key: "quota",
        label: t("auth_files.col_quota"),
        width: "w-64",
        headerClassName: "text-center",
        headerRender: () => (
          <div className="flex items-center justify-center gap-2 normal-case">
            <span className="text-[11px] font-semibold text-slate-500 dark:text-white/60">
              {t("auth_files.col_quota")}
            </span>
            <Select
              value={quotaPreviewMode}
              onChange={(value) => setQuotaPreviewMode(value === "week" ? "week" : "5h")}
              options={[
                { value: "5h", label: t("auth_files.quota_preview_5h") },
                { value: "week", label: t("auth_files.quota_preview_week") },
              ]}
              aria-label={t("auth_files.col_quota")}
              className="w-[72px]"
              variant="chip"
            />
          </div>
        ),
        render: (file) => {
          const provider = resolveQuotaProvider(file);
          if (!provider) {
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          }

          const state = quotaByFileName[file.name] ?? { status: "idle", items: [] };
          const items = Array.isArray(state.items) ? (state.items as QuotaItem[]) : [];
          const hasError = state.status === "error";

          const renderQuotaLinePreview = (item: QuotaItem) => {
            const percentText =
              item.percent === null ? "--" : `${Math.round(clampPercent(item.percent))}%`;
            const resetText = formatQuotaResetTextCompact(item.resetAtMs) ?? "--";
            return (
              <div key={item.label} className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 truncate text-[10px] font-semibold text-slate-600 dark:text-white/70">
                  {translateQuotaText(item.label)}
                </span>
                {quotaProgressCircle(item.percent)}
                <span className="inline-flex shrink-0 items-center gap-1 text-[10px] font-semibold tabular-nums text-slate-800 dark:text-white/85">
                  {percentText}
                </span>
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[10px] tabular-nums text-slate-500 dark:text-white/40">
                  {resetText}
                </span>
              </div>
            );
          };

          return (
            <HoverTooltip
              disabled={!hasError && items.length === 0}
              className="w-full min-w-0"
              content={renderQuotaHoverContent(state)}
            >
              <div className="w-full min-w-0">
                {hasError && items.length === 0 ? (
                  <p className="truncate text-xs font-semibold text-rose-700 dark:text-rose-200">
                    {translateQuotaText(state.error ?? t("common.error"))}
                  </p>
                ) : items.length === 0 ? (
                  <span className="text-xs text-slate-400 dark:text-white/40">--</span>
                ) : (
                  renderQuotaLinePreview(pickQuotaPreviewItem(items, quotaPreviewMode) ?? items[0])
                )}
              </div>
            </HoverTooltip>
          );
        },
      },
      {
        key: "enabled",
        label: t("auth_files.enable"),
        width: "w-28",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (file) => {
          const runtimeOnly = isRuntimeOnlyAuthFile(file);
          if (runtimeOnly)
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          const disabled = Boolean(file.disabled);
          const switching = Boolean(statusUpdating[file.name]);
          return (
            <ToggleSwitch
              ariaLabel={t("auth_files.enable_disable")}
              checked={!disabled}
              onCheckedChange={(enabled) => void setFileEnabled(file, enabled)}
              disabled={switching}
            />
          );
        },
      },
      {
        key: "actions",
        label: t("common.action"),
        width: "w-56",
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (file) => {
          const runtimeOnly = isRuntimeOnlyAuthFile(file);

          if (runtimeOnly) {
            return (
              <span className="text-xs text-slate-500 dark:text-white/55">
                {t("auth_files.virtual_hint")}
              </span>
            );
          }

          const quotaProvider = resolveQuotaProvider(file);
          const quotaRefreshing = quotaProvider
            ? quotaByFileName[file.name]?.status === "loading"
            : false;
          const quotaAutoRefreshing = quotaAutoRefreshingRef.current.has(file.name);

          return (
            <div className="inline-flex flex-wrap items-center justify-center gap-1">
              {quotaProvider ? (
                <HoverTooltip content={t("common.refresh")}>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void refreshQuota(file, quotaProvider)}
                    title={t("common.refresh")}
                    aria-label={t("common.refresh")}
                    disabled={quotaRefreshing}
                  >
                    <RefreshCw
                      size={16}
                      className={quotaRefreshing && !quotaAutoRefreshing ? "animate-spin" : ""}
                    />
                  </Button>
                </HoverTooltip>
              ) : null}

              <HoverTooltip content={t("auth_files.view")}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void openDetail(file)}
                  title={t("auth_files.view")}
                  aria-label={t("auth_files.view")}
                >
                  <Eye size={16} />
                </Button>
              </HoverTooltip>

              <HoverTooltip content={t("auth_files.download")}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void downloadAuthFile(file)}
                  title={t("auth_files.download")}
                  aria-label={t("auth_files.download")}
                >
                  <Download size={16} />
                </Button>
              </HoverTooltip>
            </div>
          );
        },
      },
    ];
  }, [
    checkAuthFileConnectivity,
    connectivityState,
    downloadAuthFile,
    openDetail,
    quotaByFileName,
    quotaPreviewMode,
    setQuotaPreviewMode,
    refreshQuota,
    setFileEnabled,
    allPageSelected,
    selectCurrentPage,
    selectablePageNames.length,
    selectedFileNameSet,
    somePageSelected,
    statusUpdating,
    t,
    toggleFileSelection,
    translateQuotaText,
    formatQuotaResetTextCompact,
    quotaProgressCircle,
    usageIndex,
  ]);

  const importFilteredModels = useMemo(() => {
    const q = importSearch.trim().toLowerCase();
    if (!q) return importModels;
    return importModels.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        String(m.display_name || "")
          .toLowerCase()
          .includes(q),
    );
  }, [importModels, importSearch]);

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(next) => setTab(next as typeof tab)}>
        <TabsList>
          <TabsTrigger value="files">{t("auth_files_page.files_tab")}</TabsTrigger>
          <TabsTrigger value="excluded">{t("auth_files_page.excluded_tab")}</TabsTrigger>
          <TabsTrigger value="alias">{t("auth_files_page.alias_tab")}</TabsTrigger>
        </TabsList>

        <TabsContent value="files">
          <AuthFilesFilesTab
            fileInputRef={fileInputRef}
            handleUpload={handleUpload}
            filterChips={filterChips}
            filter={filter}
            setFilter={setFilter}
            filterCounts={filterCounts}
            search={search}
            setSearch={setSearch}
            quotaLastUpdatedText={quotaLastUpdatedText}
            loading={loading}
            filesLength={files.length}
            renderFilesViewModeTabs={renderFilesViewModeTabs}
            quotaAutoRefreshMs={quotaAutoRefreshMs}
            setQuotaAutoRefreshMsRaw={setQuotaAutoRefreshMsRaw}
            normalizeQuotaAutoRefreshMs={normalizeQuotaAutoRefreshMs}
            openGroupOverview={openGroupOverview}
            groupOverviewLoading={groupOverviewLoading}
            filteredFiles={filteredFiles}
            loadAll={loadAll}
            usageLoading={usageLoading}
            refreshingAll={refreshingAll}
            uploading={uploading}
            setOauthDialogDefaultTab={setOauthDialogDefaultTab}
            setOauthDialogOpen={setOauthDialogOpen}
            selectableFilteredFiles={selectableFilteredFiles}
            selectedCount={selectedCount}
            selectCurrentPage={selectCurrentPage}
            allPageSelected={allPageSelected}
            selectablePageNames={selectablePageNames}
            selectFilteredFiles={selectFilteredFiles}
            allFilteredSelected={allFilteredSelected}
            setSelectedFileNames={setSelectedFileNames}
            setConfirm={setConfirm}
            selectedFileNames={selectedFileNames}
            deletingAll={deletingAll}
            pageItems={pageItems}
            fileColumns={fileColumns}
            filesViewMode={filesViewMode}
            selectedFileNameSet={selectedFileNameSet}
            quotaByFileName={quotaByFileName}
            resolveQuotaProvider={resolveQuotaProvider}
            resolveQuotaCardSlots={resolveQuotaCardSlots}
            quotaAutoRefreshingRef={quotaAutoRefreshingRef}
            refreshQuota={refreshQuota}
            setFileEnabled={setFileEnabled}
            statusUpdating={statusUpdating}
            usageIndex={usageIndex}
            resolveAuthFileStats={resolveAuthFileStats}
            toggleFileSelection={toggleFileSelection}
            formatPlanTypeLabel={formatPlanTypeLabel}
            translateQuotaText={translateQuotaText}
            renderQuotaBar={renderQuotaBar}
            openDetail={openDetail}
            downloadAuthFile={downloadAuthFile}
            safePage={safePage}
            totalPages={totalPages}
            setPage={setPage}
            usageData={usageData}
          />
        </TabsContent>

        <TabsContent value="excluded">
          <AuthFilesExcludedTab
            excludedLoading={excludedLoading}
            isPending={isPending}
            refreshExcluded={refreshExcluded}
            excludedUnsupported={excludedUnsupported}
            excludedNewProvider={excludedNewProvider}
            setExcludedNewProvider={setExcludedNewProvider}
            addExcludedProvider={addExcludedProvider}
            excluded={excluded}
            excludedDraft={excludedDraft}
            setExcludedDraft={setExcludedDraft}
            saveExcludedProvider={saveExcludedProvider}
            deleteExcludedProvider={deleteExcludedProvider}
          />
        </TabsContent>

        <TabsContent value="alias">
          <AuthFilesAliasTab
            aliasLoading={aliasLoading}
            isPending={isPending}
            refreshAlias={refreshAlias}
            aliasUnsupported={aliasUnsupported}
            aliasNewChannel={aliasNewChannel}
            setAliasNewChannel={setAliasNewChannel}
            addAliasChannel={addAliasChannel}
            aliasEditing={aliasEditing}
            setAliasEditing={setAliasEditing}
            openImport={openImport}
            saveAliasChannel={saveAliasChannel}
            deleteAliasChannel={deleteAliasChannel}
          />
        </TabsContent>
      </Tabs>

      <AuthFileDetailModal
        open={detailOpen}
        detailFile={detailFile}
        detailLoading={detailLoading}
        detailText={detailText}
        detailTab={detailTab}
        setDetailOpen={setDetailOpen}
        setDetailTab={setDetailTab}
        loadModelsForDetail={loadModelsForDetail}
        modelsLoading={modelsLoading}
        modelsError={modelsError}
        modelsList={modelsList}
        modelsFileType={modelsFileType}
        excluded={excluded}
        prefixProxyEditor={prefixProxyEditor}
        setPrefixProxyEditor={setPrefixProxyEditor}
        prefixProxyDirty={prefixProxyDirty}
        prefixProxyUpdatedText={prefixProxyUpdatedText}
        savePrefixProxy={savePrefixProxy}
        channelEditor={channelEditor}
        setChannelEditor={setChannelEditor}
        saveChannelEditor={saveChannelEditor}
      />

      <ImportModelsModal
        open={importOpen}
        importChannel={importChannel}
        importLoading={importLoading}
        importModels={importModels}
        importFilteredModels={importFilteredModels}
        importSearch={importSearch}
        setImportSearch={setImportSearch}
        importSelected={importSelected}
        setImportSelected={setImportSelected}
        setImportOpen={setImportOpen}
        applyImport={applyImport}
      />

      <OAuthLoginDialog
        open={oauthDialogOpen}
        defaultTab={oauthDialogDefaultTab}
        onClose={() => setOauthDialogOpen(false)}
        onAuthorized={() => void loadAll()}
      />

      <GroupOverviewModal
        open={groupOverviewOpen}
        onClose={() => setGroupOverviewOpen(false)}
        groupOverviewTab={groupOverviewTab}
        setGroupOverviewTab={setGroupOverviewTab}
        groupOverviewTabs={groupOverviewTabs}
        resolveProviderLabel={resolveProviderLabel}
        groupOverviewLoading={groupOverviewLoading}
        groupTrendLoading={groupTrendLoading}
        refreshGroupOverview={refreshGroupOverview}
        refreshGroupTrend={refreshGroupTrend}
        activeGroupTitle={activeGroupTitle}
        activeGroupRows={activeGroupRows}
        activeGroupOverview={activeGroupOverview}
        formatAveragePercent={formatAveragePercent}
        groupOverviewChartOption={groupOverviewChartOption}
      />

      <ConfirmModal
        open={confirm !== null}
        title={t("auth_files.batch_delete_title")}
        description={t("auth_files.batch_delete_confirm", { count: confirm?.names.length ?? 0 })}
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        busy={deletingAll}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          if (!action) return;
          void handleDeleteSelection(action.names).finally(() => setConfirm(null));
        }}
      />
    </div>
  );
}
