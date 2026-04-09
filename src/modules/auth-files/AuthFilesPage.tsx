import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import {
  CircleHelp,
  Download,
  Eye,
  FileJson,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { authFilesApi, quotaApi, usageApi } from "@/lib/http/apis";
import { formatLatency } from "@/modules/providers/hooks/useProviderLatency";
import type { AuthFileItem, OAuthModelAliasEntry } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";
import { HoverTooltip } from "@/modules/ui/Tooltip";
import { Select } from "@/modules/ui/Select";
import { VirtualTable, type VirtualTableColumn } from "@/modules/ui/VirtualTable";
import { ProviderStatusBar } from "@/modules/providers/ProviderStatusBar";
import { OAuthLoginDialog } from "@/modules/oauth/OAuthLoginDialog";
import { normalizeUsageSourceId, type KeyStatBucket } from "@/modules/providers/provider-usage";
import { fetchQuota, resolveQuotaProvider, type QuotaProvider } from "@/modules/quota/quota-fetch";
import { useInterval } from "@/hooks/useInterval";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { clampPercent, type QuotaItem, type QuotaState } from "@/modules/quota/quota-helpers";

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };
type OAuthDialogTab =
  | "codex"
  | "anthropic"
  | "antigravity"
  | "gemini-cli"
  | "kimi"
  | "qwen"
  | "iflow"
  | "vertex";

const AUTH_FILES_PAGE_SIZE = 9;
const MAX_AUTH_FILE_SIZE = 50 * 1024;

const AUTH_FILES_UI_STATE_KEY = "authFilesPage.uiState.v3";
const AUTH_FILES_QUOTA_PREVIEW_KEY = "authFilesPage.quotaPreview.v1";
const AUTH_FILES_QUOTA_AUTO_REFRESH_KEY = "authFilesPage.quotaAutoRefreshMs.v1";

type QuotaPreviewMode = "5h" | "week";
type QuotaAutoRefreshMs = 0 | 5000 | 10000 | 30000 | 60000;

type AuthFilesUiState = {
  tab?: "files" | "excluded" | "alias";
  filter?: string;
  search?: string;
  page?: number;
};

const readAuthFilesUiState = (): AuthFilesUiState | null => {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(AUTH_FILES_UI_STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthFilesUiState;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
};

const writeAuthFilesUiState = (state: AuthFilesUiState) => {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(AUTH_FILES_UI_STATE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
};

const formatFileSize = (bytes?: number): string => {
  const value = typeof bytes === "number" && Number.isFinite(bytes) ? bytes : 0;
  if (value <= 0) return "--";
  if (value < 1024) return `${value} B`;
  const kb = value / 1024;
  if (kb < 1024) return `${kb.toFixed(1).replace(/\.0$/, "")} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1).replace(/\.0$/, "")} MB`;
};

const formatModified = (file: AuthFileItem): string => {
  const raw = (file.modtime ?? file.modified) as unknown;
  if (!raw) return "--";
  const asNumber = Number(raw);
  const date =
    Number.isFinite(asNumber) && !Number.isNaN(asNumber)
      ? new Date(asNumber < 1e12 ? asNumber * 1000 : asNumber)
      : new Date(String(raw));
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
};

const normalizeProviderKey = (value: string): string => value.trim().toLowerCase();

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const matchesModelPattern = (modelId: string, pattern: string): boolean => {
  const rawModel = String(modelId ?? "").trim();
  const rawPattern = String(pattern ?? "").trim();
  if (!rawModel || !rawPattern) return false;

  if (!rawPattern.includes("*")) {
    return rawModel.toLowerCase() === rawPattern.toLowerCase();
  }

  const escaped = escapeRegExp(rawPattern).replace(/\\\*/g, ".*");
  try {
    const regex = new RegExp(`^${escaped}$`, "i");
    return regex.test(rawModel);
  } catch {
    return false;
  }
};

const TYPE_BADGE_CLASSES: Record<string, string> = {
  qwen: "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200",
  kimi: "bg-amber-50 text-amber-800 dark:bg-amber-500/15 dark:text-amber-200",
  gemini: "bg-blue-50 text-blue-800 dark:bg-blue-500/15 dark:text-blue-200",
  "gemini-cli": "bg-indigo-50 text-indigo-800 dark:bg-indigo-500/15 dark:text-indigo-200",
  aistudio: "bg-slate-50 text-slate-800 dark:bg-white/10 dark:text-slate-200",
  claude: "bg-rose-50 text-rose-800 dark:bg-rose-500/15 dark:text-rose-200",
  codex: "bg-orange-50 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200",
  antigravity: "bg-teal-50 text-teal-800 dark:bg-teal-500/15 dark:text-teal-200",
  iflow: "bg-violet-50 text-violet-800 dark:bg-violet-500/15 dark:text-violet-200",
  vertex: "bg-cyan-50 text-cyan-800 dark:bg-cyan-500/15 dark:text-cyan-200",
  empty: "bg-slate-50 text-slate-600 dark:bg-white/10 dark:text-white/70",
  unknown: "bg-slate-50 text-slate-600 dark:bg-white/10 dark:text-white/70",
};

const resolveFileType = (file: AuthFileItem): string => {
  const type = typeof file.type === "string" ? file.type : "";
  const provider = typeof file.provider === "string" ? file.provider : "";
  const fromName = String(file.name || "").split(".")[0] ?? "";
  const candidate = normalizeProviderKey(type || provider || fromName);
  return candidate || "unknown";
};

const readAuthFileChannelName = (file: AuthFileItem): string => {
  const candidates = [file.label, file.email, file.provider, file.type];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
  }
  return "";
};

const isRuntimeOnlyAuthFile = (file: AuthFileItem): boolean => {
  const raw = (file.runtime_only ?? file.runtimeOnly) as unknown;
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "string") return raw.trim().toLowerCase() === "true";
  return false;
};

const normalizeAuthIndexValue = (value: unknown): string | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  return null;
};

const downloadTextAsFile = (content: string, filename: string) => {
  const blob = new Blob([content], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 800);
};

const normalizeQuotaLabel = (label: string): string =>
  String(label ?? "")
    .trim()
    .toLowerCase();

const pickQuotaPreviewItem = (items: QuotaItem[], mode: QuotaPreviewMode): QuotaItem | null => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const patterns =
    mode === "week"
      ? ["weekly", "week", "周", "7天", "seven_day", "seven day"]
      : ["_5h", "5h", "5小时", "five_hour", "five hour"];

  const match = items.find((item) => {
    const key = normalizeQuotaLabel(item.label);
    return patterns.some((p) => key.includes(normalizeQuotaLabel(p)));
  });

  return match ?? items[0] ?? null;
};

const normalizeQuotaAutoRefreshMs = (value: unknown): QuotaAutoRefreshMs => {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return 10000;
  const rounded = Math.max(0, Math.round(parsed));
  if (rounded === 0) return 0;
  if (rounded === 5000) return 5000;
  if (rounded === 10000) return 10000;
  if (rounded === 30000) return 30000;
  if (rounded === 60000) return 60000;
  return 10000;
};

type UsageIndex = {
  statsBySource: Record<string, KeyStatBucket>;
  statsByAuthIndex: Record<string, KeyStatBucket>;
};

const buildUsageIndex = (
  usage: import("@/lib/http/types").EntityStatsResponse | null,
): { index: UsageIndex } => {
  const statsBySource: Record<string, KeyStatBucket> = {};
  const statsByAuthIndex: Record<string, KeyStatBucket> = {};

  if (usage?.source) {
    usage.source.forEach((pt) => {
      const src = normalizeUsageSourceId(pt.entity_name, (v) => v);
      if (src) {
        statsBySource[src] = { success: pt.requests - pt.failed, failure: pt.failed };
      }
    });
  }

  if (usage?.auth_index) {
    usage.auth_index.forEach((pt) => {
      const idx = normalizeAuthIndexValue(pt.entity_name);
      if (idx) {
        statsByAuthIndex[idx] = { success: pt.requests - pt.failed, failure: pt.failed };
      }
    });
  }

  return { index: { statsBySource, statsByAuthIndex } };
};

const buildAuthFileSourceCandidates = (file: AuthFileItem): string[] => {
  const rawName = String(file.name || "").trim();
  if (!rawName) return [];
  const withoutExt = rawName.replace(/\.[^/.]+$/, "");
  const list = [
    normalizeUsageSourceId(rawName, (v) => v),
    normalizeUsageSourceId(withoutExt, (v) => v),
  ].filter(Boolean) as string[];
  return Array.from(new Set(list));
};

const resolveAuthFileStats = (file: AuthFileItem, index: UsageIndex): KeyStatBucket => {
  const authIndexKey = normalizeAuthIndexValue(
    file.auth_index ?? file.authIndex ?? file.authIndex ?? file.auth_index,
  );
  if (authIndexKey && index.statsByAuthIndex[authIndexKey]) {
    return index.statsByAuthIndex[authIndexKey];
  }

  const candidates = buildAuthFileSourceCandidates(file);
  let bucket: KeyStatBucket = { success: 0, failure: 0 };
  candidates.forEach((key) => {
    const entry = index.statsBySource[key];
    if (!entry) return;
    bucket = { success: bucket.success + entry.success, failure: bucket.failure + entry.failure };
  });
  return bucket;
};

const resolveAuthFileStatusBar = (
  file: AuthFileItem,
  index: UsageIndex,
): import("@/utils/usage").StatusBarData => {
  const stats = resolveAuthFileStats(file, index);
  if (stats.success === 0 && stats.failure === 0) {
    return { blocks: [], blockDetails: [], successRate: 100, totalSuccess: 0, totalFailure: 0 };
  }

  const total = stats.success + stats.failure;
  const BLOCK_COUNT = 20;
  const blocks: import("@/utils/usage").StatusBlockState[] = [];
  const blockDetails: import("@/utils/usage").StatusBlockDetail[] = [];

  let tempFail = stats.failure;
  let tempSuccess = stats.success;

  for (let i = 0; i < BLOCK_COUNT; i++) {
    const failPart = Math.floor(tempFail / (BLOCK_COUNT - i));
    const successPart = Math.floor(tempSuccess / (BLOCK_COUNT - i));
    tempFail -= failPart;
    tempSuccess -= successPart;

    if (failPart === 0 && successPart === 0) {
      blocks.push("idle");
    } else if (failPart === 0) {
      blocks.push("success");
    } else if (successPart === 0) {
      blocks.push("failure");
    } else {
      blocks.push("mixed");
    }

    blockDetails.push({
      success: successPart,
      failure: failPart,
      rate: successPart + failPart > 0 ? successPart / (successPart + failPart) : -1,
      startTime: 0,
      endTime: 0,
    });
  }

  return {
    blocks,
    blockDetails,
    successRate: (stats.success / total) * 100,
    totalSuccess: stats.success,
    totalFailure: stats.failure,
  };
};

type PrefixProxyEditorState = {
  open: boolean;
  fileName: string;
  loading: boolean;
  saving: boolean;
  error: string | null;
  json: Record<string, unknown> | null;
  prefix: string;
  proxyUrl: string;
};

type ChannelEditorState = {
  open: boolean;
  fileName: string;
  label: string;
  saving: boolean;
  error: string | null;
};

type AliasRow = OAuthModelAliasEntry & { id: string };

const buildAliasRows = (entries: OAuthModelAliasEntry[] | undefined): AliasRow[] => {
  if (!entries?.length) {
    return [{ id: `row-${Date.now()}`, name: "", alias: "" }];
  }
  return entries.map((entry) => ({
    id: `row-${entry.name}-${entry.alias}-${entry.fork ? "1" : "0"}`,
    ...entry,
  }));
};

export function AuthFilesPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [searchParams] = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [tab, setTab] = useState<"files" | "excluded" | "alias">("files");

  const [files, setFiles] = useState<AuthFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingAll, setDeletingAll] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<
    null | { type: "deleteAll" } | { type: "deleteFile"; name: string }
  >(null);

  const [oauthDialogOpen, setOauthDialogOpen] = useState(false);
  const [oauthDialogDefaultTab, setOauthDialogDefaultTab] = useState<OAuthDialogTab>("codex");

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
  const quotaAutoRefreshedRef = useRef<Set<string>>(new Set());
  const quotaInFlightRef = useRef<Set<string>>(new Set());
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [quotaPreviewMode, setQuotaPreviewMode] = useLocalStorage<QuotaPreviewMode>(
    AUTH_FILES_QUOTA_PREVIEW_KEY,
    "5h",
  );
  const [quotaAutoRefreshMsRaw, setQuotaAutoRefreshMsRaw] = useLocalStorage<number>(
    AUTH_FILES_QUOTA_AUTO_REFRESH_KEY,
    10000,
  );
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
          updatedAt: prev[name]?.updatedAt,
        },
      }));

      try {
        const items = await fetchQuota(provider, file);
        const rawAuthIndex = (file as any)["auth_index"] ?? file.authIndex;
        const authIndex = normalizeAuthIndexValue(rawAuthIndex);
        if (authIndex) {
          void quotaApi.reconcile(authIndex).catch(() => {});
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
    [t],
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
    setLoading(true);
    setUsageLoading(true);
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
      setLoading(false);
      setUsageLoading(false);
    }
  }, [notify, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

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
    if (!normalizedFilter || normalizedFilter === "all") return searchFilteredFiles;
    return searchFilteredFiles.filter(
      (file) => normalizeProviderKey(resolveFileType(file)) === normalizedFilter,
    );
  }, [filter, searchFilteredFiles]);

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / AUTH_FILES_PAGE_SIZE));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * AUTH_FILES_PAGE_SIZE;
    return filteredFiles.slice(start, start + AUTH_FILES_PAGE_SIZE);
  }, [filteredFiles, safePage]);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  useEffect(() => {
    if (tab !== "files") return;
    if (loading) return;

    const candidates = pageItems
      .map((file) => {
        const provider = resolveQuotaProvider(file);
        return provider ? { file, provider } : null;
      })
      .filter(Boolean) as { file: AuthFileItem; provider: QuotaProvider }[];

    const toFetch = candidates.filter(({ file }) => !quotaAutoRefreshedRef.current.has(file.name));
    if (!toFetch.length) return;

    toFetch.forEach(({ file }) => quotaAutoRefreshedRef.current.add(file.name));

    let cancelled = false;
    const CONCURRENCY = 3;
    let idx = 0;

    const workers = Array.from({ length: Math.min(CONCURRENCY, toFetch.length) }).map(async () => {
      while (!cancelled) {
        const current = toFetch[idx];
        idx += 1;
        if (!current) return;
        await refreshQuota(current.file, current.provider);
      }
    });

    void Promise.allSettled(workers);

    return () => {
      cancelled = true;
    };
  }, [loading, pageItems, refreshQuota, tab]);

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

    const candidates = pageItems
      .map((file) => {
        const provider = resolveQuotaProvider(file);
        return provider ? { file, provider } : null;
      })
      .filter(Boolean) as { file: AuthFileItem; provider: QuotaProvider }[];
    if (!candidates.length) return;

    const CONCURRENCY = 3;
    let idx = 0;
    const workers = Array.from({
      length: Math.min(CONCURRENCY, candidates.length),
    }).map(async () => {
      for (;;) {
        const current = candidates[idx];
        idx += 1;
        if (!current) return;
        await refreshQuota(current.file, current.provider);
      }
    });

    await Promise.allSettled(workers);
  }, [loading, pageItems, refreshQuota, tab]);

  useInterval(
    () => {
      void refreshCurrentPageQuota();
    },
    tab === "files" && quotaAutoRefreshMs > 0 ? quotaAutoRefreshMs : null,
  );

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
      try {
        const text = await authFilesApi.downloadText(file.name);
        downloadTextAsFile(text, file.name);
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

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await authFilesApi.deleteFile(name);
        setFiles((prev) => prev.filter((file) => file.name !== name));
        notify({ type: "success", message: t("auth_files.deleted") });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
        });
      }
    },
    [notify, t],
  );

  const handleDeleteAll = useCallback(async () => {
    setDeletingAll(true);
    try {
      const normalizedFilter = normalizeProviderKey(filter);
      if (!normalizedFilter || normalizedFilter === "all") {
        await authFilesApi.deleteAll();
        setFiles([]);
        notify({ type: "success", message: t("auth_files.delete_all_success") });
        return;
      }

      const q = search.trim().toLowerCase();
      const matchesSearch = (file: AuthFileItem) => {
        if (!q) return true;
        const name = String(file.name || "").toLowerCase();
        const provider = String(file.provider || "").toLowerCase();
        const type = String(file.type || "").toLowerCase();
        return name.includes(q) || provider.includes(q) || type.includes(q);
      };

      const matchesFilter = (file: AuthFileItem) =>
        normalizeProviderKey(resolveFileType(file)) === normalizedFilter;

      const deletable = files.filter(
        (file) => matchesSearch(file) && matchesFilter(file) && !isRuntimeOnlyAuthFile(file),
      );
      if (deletable.length === 0) {
        notify({ type: "info", message: t("auth_files.delete_filtered_none", { type: filter }) });
        return;
      }

      let success = 0;
      let failed = 0;
      const deletedNames: string[] = [];

      for (const file of deletable) {
        try {
          await authFilesApi.deleteFile(file.name);
          success += 1;
          deletedNames.push(file.name);
        } catch {
          failed += 1;
        }
      }

      if (deletedNames.length > 0) {
        setFiles((prev) => prev.filter((file) => !deletedNames.includes(file.name)));
      }

      if (failed === 0) {
        notify({
          type: "success",
          message: t("auth_files.batch_deleted", { count: success, filter }),
        });
      } else {
        notify({
          type: "error",
          message: t("auth_files.delete_filtered_partial", { type: filter, success, failed }),
        });
      }
      setFilter("all");
      setPage(1);
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.delete_failed"),
      });
    } finally {
      setDeletingAll(false);
    }
  }, [filter, files, notify, search, t]);

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
        key: "name",
        label: t("auth_files.col_name"),
        width: "w-96",
        render: (file) => {
          const isOauthFile =
            String(file.account_type || "")
              .trim()
              .toLowerCase() === "oauth";
          const channelName = readAuthFileChannelName(file);
          const displayTitle = isOauthFile && channelName ? channelName : file.name;
          const showFileNameSecondary =
            isOauthFile && channelName && channelName.trim() !== String(file.name || "").trim();

          return (
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-slate-900 dark:text-white">
                {displayTitle}
              </p>
              {showFileNameSecondary ? (
                <p className="mt-1 truncate font-mono text-[11px] text-slate-500 dark:text-white/45">
                  {file.name}
                </p>
              ) : null}
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
          const runtimeOnly = isRuntimeOnlyAuthFile(file);

          return (
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${badgeClass}`}
                >
                  {typeKey}
                </span>
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
        key: "channel",
        label: t("auth_files.channel_name"),
        width: "w-52",
        render: (file) => {
          const isOauthFile =
            String(file.account_type || "")
              .trim()
              .toLowerCase() === "oauth";
          const channelName = readAuthFileChannelName(file);
          if (!isOauthFile)
            return <span className="text-xs text-slate-400 dark:text-white/40">--</span>;
          return (
            <span className="truncate text-xs font-medium text-slate-900 dark:text-white/80">
              {channelName || "--"}
            </span>
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
          const isLoading = state.status === "loading";
          const hasError = state.status === "error";

          const progressCircle = (percent: number | null) => {
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

            const deg =
              normalized === null ? 0 : Math.max(0, Math.min(360, (normalized / 100) * 360));

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
          };

          const renderQuotaLineFull = (item: QuotaItem) => {
            const percentText =
              item.percent === null ? "--" : `${Math.round(clampPercent(item.percent))}%`;
            const resetText = formatQuotaResetTextCompact(item.resetAtMs);
            return (
              <div key={item.label} className="space-y-0.5">
                <div className="flex min-w-0 items-center gap-1">
                  <span className="shrink-0 truncate text-[10px] font-semibold text-slate-600 dark:text-white/70">
                    {translateQuotaText(item.label)}
                  </span>
                  {progressCircle(item.percent)}
                  <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-800 dark:text-white/85">
                    {percentText}
                  </span>
                  {resetText ? (
                    <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[10px] tabular-nums text-slate-500 dark:text-white/40">
                      {resetText}
                    </span>
                  ) : (
                    <span className="min-w-0 flex-1" />
                  )}
                </div>
                {item.meta ? (
                  <p className="pl-0 text-[10px] text-slate-500 dark:text-white/55">{item.meta}</p>
                ) : null}
              </div>
            );
          };

          const renderQuotaLinePreview = (item: QuotaItem) => {
            const percentText =
              item.percent === null ? "--" : `${Math.round(clampPercent(item.percent))}%`;
            const resetText = formatQuotaResetTextCompact(item.resetAtMs) ?? "--";
            return (
              <div key={item.label} className="flex min-w-0 items-center gap-1">
                <span className="shrink-0 truncate text-[10px] font-semibold text-slate-600 dark:text-white/70">
                  {translateQuotaText(item.label)}
                </span>
                {progressCircle(item.percent)}
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
              content={
                <div className="space-y-1">
                  {hasError ? (
                    <p className="max-w-80 truncate text-[11px] font-semibold text-rose-700 dark:text-rose-200">
                      {translateQuotaText(state.error ?? t("common.error"))}
                    </p>
                  ) : null}
                  {items.length > 0 ? (
                    <div className="space-y-1">
                      {items.map((item) => renderQuotaLineFull(item))}
                    </div>
                  ) : null}
                </div>
              }
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
        width: "w-72",
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

          const iconBtnCls = "h-9 w-9 px-0";
          return (
            <div className="inline-flex flex-wrap items-center justify-center gap-1">
              {quotaProvider ? (
                <HoverTooltip content={t("common.refresh")}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={iconBtnCls}
                    onClick={() => void refreshQuota(file, quotaProvider)}
                    title={t("common.refresh")}
                    aria-label={t("common.refresh")}
                    disabled={quotaRefreshing}
                  >
                    <RefreshCw size={16} className={quotaRefreshing ? "animate-spin" : ""} />
                  </Button>
                </HoverTooltip>
              ) : null}

              <HoverTooltip content={t("auth_files.view")}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={iconBtnCls}
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
                  className={iconBtnCls}
                  onClick={() => void downloadAuthFile(file)}
                  title={t("auth_files.download")}
                  aria-label={t("auth_files.download")}
                >
                  <Download size={16} />
                </Button>
              </HoverTooltip>

              <HoverTooltip content={t("common.delete")}>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`${iconBtnCls} text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-300 dark:hover:bg-rose-500/10 dark:hover:text-rose-200`}
                  onClick={() => setConfirm({ type: "deleteFile", name: file.name })}
                  title={t("common.delete")}
                  aria-label={t("common.delete")}
                >
                  <Trash2 size={16} />
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
    statusUpdating,
    t,
    translateQuotaText,
    formatQuotaResetTextCompact,
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
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
            {t("auth_files_page.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
            {t("auth_files_page.description")}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === "files" ? (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json,.json"
                multiple
                className="hidden"
                onChange={(e) => void handleUpload(e.currentTarget.files)}
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void loadAll()}
                disabled={loading || usageLoading}
              >
                <RefreshCw size={14} className={loading || usageLoading ? "animate-spin" : ""} />
                {t("auth_files.refresh")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload size={14} />
                {t("auth_files.upload")}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  const normalized = normalizeProviderKey(filter);
                  const tab =
                    normalized === "codex" ||
                    normalized === "anthropic" ||
                    normalized === "antigravity" ||
                    normalized === "gemini-cli" ||
                    normalized === "kimi" ||
                    normalized === "qwen"
                      ? (normalized as OAuthDialogTab)
                      : "codex";
                  setOauthDialogDefaultTab(tab);
                  setOauthDialogOpen(true);
                }}
              >
                <Plus size={14} />
                {t("auth_files_page.add_oauth")}
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => setConfirm({ type: "deleteAll" })}
                disabled={deletingAll || loading || uploading}
              >
                <Trash2 size={14} />
                {filter === "all"
                  ? t("auth_files.delete_all")
                  : t("auth_files.delete_type", { type: filter })}
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-slate-500">
          {t("common.loading_ellipsis")}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={(next) => setTab(next as typeof tab)}>
          <TabsList>
            <TabsTrigger value="files">{t("auth_files_page.files_tab")}</TabsTrigger>
            <TabsTrigger value="excluded">{t("auth_files_page.excluded_tab")}</TabsTrigger>
            <TabsTrigger value="alias">{t("auth_files_page.alias_tab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="files" className="mt-4">
            <div className="space-y-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:gap-4">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <p className="text-[11px] font-semibold text-slate-600 dark:text-white/65">
                      {t("auth_files.type_filter")}
                    </p>
                    <HoverTooltip content={t("auth_files.count_hint")} placement="top">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 dark:text-white/45"
                        aria-label={t("auth_files.count_info")}
                      >
                        <CircleHelp size={14} />
                      </span>
                    </HoverTooltip>
                  </div>
                  <div className="inline-flex max-w-full gap-1 overflow-x-auto whitespace-nowrap rounded-2xl border border-slate-200 bg-white p-1 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                    {filterChips.map((key) => {
                      const active = filter === key;
                      const normalizedKey = normalizeProviderKey(key);
                      const count =
                        key === "all"
                          ? filterCounts.total
                          : (filterCounts.counts[normalizedKey] ?? 0);
                      const label = key === "all" ? t("auth_files.all") : key;
                      const countClass = active
                        ? "bg-white/20 text-white dark:bg-neutral-950/10 dark:text-neutral-950"
                        : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-white/70";
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => setFilter(key)}
                          className={
                            active
                              ? "inline-flex shrink-0 items-center rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950"
                              : "inline-flex shrink-0 items-center rounded-xl px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-white/10 dark:hover:text-white"
                          }
                        >
                          {label}
                          <span
                            className={[
                              "ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums",
                              countClass,
                            ].join(" ")}
                          >
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex min-w-[240px] flex-1 flex-col gap-1">
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-white/65">
                    {t("auth_files.search")}
                  </p>
                  <TextInput
                    value={search}
                    onChange={(e) => setSearch(e.currentTarget.value)}
                    placeholder={t("auth_files_page.filename_hint")}
                    endAdornment={<Search size={16} className="text-slate-400" />}
                  />
                </div>
              </div>

              {pageItems.length === 0 ? (
                <EmptyState
                  title={t("auth_files_page.no_files")}
                  description={t("auth_files_page.no_files_desc")}
                />
              ) : (
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/70 shadow-sm backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/40">
                  <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-white/45">
                      <span className="font-medium">{t("auth_files.quota_updated_at")}</span>
                      <span className="font-mono tabular-nums">{quotaLastUpdatedText}</span>
                    </div>

                    <div className="inline-flex items-center gap-2">
                      <span className="text-xs font-medium text-slate-500 dark:text-white/45">
                        {t("auth_files.quota_auto_refresh")}
                      </span>
                      <Select
                        value={String(quotaAutoRefreshMs)}
                        onChange={(value) =>
                          setQuotaAutoRefreshMsRaw(normalizeQuotaAutoRefreshMs(value))
                        }
                        options={[
                          { value: "0", label: t("auth_files.quota_refresh_off") },
                          { value: "5000", label: "5s" },
                          { value: "10000", label: "10s" },
                          { value: "30000", label: "30s" },
                          { value: "60000", label: "60s" },
                        ]}
                        aria-label={t("auth_files.quota_auto_refresh")}
                        variant="chip"
                        className="w-[88px]"
                      />
                    </div>
                  </div>

                  <div className="px-5 pb-4">
                    <VirtualTable<AuthFileItem>
                      rows={pageItems}
                      columns={fileColumns}
                      rowKey={(row) => row.name}
                      loading={false}
                      virtualize={false}
                      rowHeight={84}
                      caption={t("auth_files.table_caption")}
                      emptyText={t("auth_files_page.no_files_desc")}
                      minWidth="min-w-[1800px]"
                      height="h-[calc(100dvh-468px)]"
                      rowClassName={(row) => {
                        const runtimeOnly = isRuntimeOnlyAuthFile(row);
                        const disabled = Boolean(row.disabled);
                        return [
                          runtimeOnly
                            ? "bg-slate-50/80 dark:bg-neutral-950/55 hover:bg-slate-100/80 dark:hover:bg-neutral-900/60"
                            : "",
                          disabled ? "opacity-85" : "",
                        ]
                          .filter(Boolean)
                          .join(" ");
                      }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-600 dark:text-white/65 tabular-nums">
                  {t("auth_files.total_page", {
                    total: filteredFiles.length,
                    page: safePage,
                    pages: totalPages,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={safePage <= 1}
                  >
                    {t("auth_files.prev")}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safePage >= totalPages}
                  >
                    {t("auth_files.next")}
                  </Button>
                </div>
              </div>

              {usageData ? null : (
                <p className="text-xs text-slate-500 dark:text-white/55">
                  {t("auth_files.usage_stats_warning")}
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="excluded" className="mt-4 space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t("auth_files_page.excluded_title")}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                  {t("auth_files_page.excluded_desc")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void refreshExcluded()}
                  disabled={excludedLoading || isPending}
                >
                  <RefreshCw size={14} className={excludedLoading ? "animate-spin" : ""} />
                  {t("auth_files.refresh")}
                </Button>
              </div>
            </div>

            {excludedLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-500">
                {t("common.loading_ellipsis")}
              </div>
            ) : (
              <div className="space-y-4">
                {excludedUnsupported ? (
                  <div className="mb-4">
                    <EmptyState
                      title={t("auth_files_page.api_not_supported")}
                      description={t("auth_files.no_excluded_api")}
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <TextInput
                    value={excludedNewProvider}
                    onChange={(e) => setExcludedNewProvider(e.currentTarget.value)}
                    placeholder={t("auth_files.add_provider_placeholder")}
                    endAdornment={<FileJson size={16} className="text-slate-400" />}
                    disabled={excludedUnsupported}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={addExcludedProvider}
                    disabled={isPending || excludedUnsupported}
                  >
                    <Plus size={14} />
                    {t("auth_files.add")}
                  </Button>
                </div>

                <div className="mt-4 space-y-3">
                  {Object.keys(excluded).length === 0 ? (
                    <EmptyState
                      title={t("auth_files_page.no_config")}
                      description={t("auth_files_page.no_excluded_desc")}
                    />
                  ) : (
                    Object.entries(excluded)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([provider, models]) => {
                        const text =
                          excludedDraft[provider] ??
                          (Array.isArray(models) ? models.join("\n") : "");
                        const count = (excludedDraft[provider] ?? text)
                          .split(/[\n,]+/)
                          .map((s) => s.trim())
                          .filter(Boolean).length;

                        return (
                          <div
                            key={provider}
                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-mono text-xs text-slate-900 dark:text-white">
                                  {provider}
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                                  {t("auth_files.count_items", { count })}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() =>
                                    void saveExcludedProvider(
                                      provider,
                                      excludedDraft[provider] ?? text,
                                    )
                                  }
                                  disabled={isPending || excludedUnsupported}
                                >
                                  {t("auth_files.save")}
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => void deleteExcludedProvider(provider)}
                                  disabled={isPending || excludedUnsupported}
                                >
                                  {t("common.delete")}
                                </Button>
                              </div>
                            </div>
                            <textarea
                              value={excludedDraft[provider] ?? text}
                              onChange={(e) => {
                                const nextText = e.currentTarget.value;
                                setExcludedDraft((prev) => ({ ...prev, [provider]: nextText }));
                              }}
                              placeholder={t("auth_files.one_model_per_line")}
                              aria-label={`${provider} ${t("auth_files_page.excluded_tab")}`}
                              disabled={excludedUnsupported}
                              className="mt-3 min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
                            />
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="alias" className="mt-4 space-y-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t("auth_files_page.alias_title")}
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-neutral-400">
                  {t("auth_files.model_alias_desc")}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void refreshAlias()}
                  disabled={aliasLoading || isPending}
                >
                  <RefreshCw size={14} className={aliasLoading ? "animate-spin" : ""} />
                  {t("auth_files.refresh")}
                </Button>
              </div>
            </div>

            {aliasLoading ? (
              <div className="flex h-32 items-center justify-center text-sm text-slate-500">
                {t("common.loading_ellipsis")}
              </div>
            ) : (
              <div className="space-y-4">
                {aliasUnsupported ? (
                  <div className="mb-4">
                    <EmptyState
                      title={t("auth_files.api_not_supported")}
                      description={t("auth_files.no_alias_api")}
                    />
                  </div>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <TextInput
                    value={aliasNewChannel}
                    onChange={(e) => setAliasNewChannel(e.currentTarget.value)}
                    placeholder={t("auth_files.add_channel_placeholder")}
                    disabled={aliasUnsupported}
                  />
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={addAliasChannel}
                    disabled={isPending || aliasUnsupported}
                  >
                    <Plus size={14} />
                    {t("auth_files.add")}
                  </Button>
                </div>

                <div className="mt-4 space-y-3">
                  {Object.keys(aliasEditing).length === 0 ? (
                    <EmptyState
                      title={t("auth_files.no_config")}
                      description={t("auth_files_page.alias_no_config")}
                    />
                  ) : (
                    Object.keys(aliasEditing)
                      .sort((a, b) => a.localeCompare(b))
                      .map((channel) => {
                        const rows = aliasEditing[channel] ?? buildAliasRows([]);
                        const mappingCount = rows.filter(
                          (r) => r.name.trim() && r.alias.trim(),
                        ).length;

                        return (
                          <div
                            key={channel}
                            className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/70"
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-mono text-xs text-slate-900 dark:text-white">
                                  {channel}
                                </p>
                                <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                                  {t("auth_files.valid_mappings", { count: mappingCount })}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void openImport(channel)}
                                  disabled={aliasUnsupported}
                                >
                                  <ShieldCheck size={14} />
                                  {t("auth_files.import_models")}
                                </Button>
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => void saveAliasChannel(channel)}
                                  disabled={isPending || aliasUnsupported}
                                >
                                  {t("auth_files.save")}
                                </Button>
                                <Button
                                  variant="danger"
                                  size="sm"
                                  onClick={() => void deleteAliasChannel(channel)}
                                  disabled={isPending || aliasUnsupported}
                                >
                                  {t("common.delete")}
                                </Button>
                              </div>
                            </div>

                            <div className="mt-3 space-y-2">
                              {rows.map((row, idx) => (
                                <div key={row.id} className="grid gap-2 lg:grid-cols-12">
                                  <div className="lg:col-span-5">
                                    <TextInput
                                      value={row.name}
                                      onChange={(e) => {
                                        const value = e.currentTarget.value;
                                        setAliasEditing((prev) => ({
                                          ...prev,
                                          [channel]: (prev[channel] ?? []).map((it, i) =>
                                            i === idx ? { ...it, name: value } : it,
                                          ),
                                        }));
                                      }}
                                      placeholder={t("auth_files.name_placeholder", "name")}
                                    />
                                  </div>
                                  <div className="lg:col-span-5">
                                    <TextInput
                                      value={row.alias}
                                      onChange={(e) => {
                                        const value = e.currentTarget.value;
                                        setAliasEditing((prev) => ({
                                          ...prev,
                                          [channel]: (prev[channel] ?? []).map((it, i) =>
                                            i === idx ? { ...it, alias: value } : it,
                                          ),
                                        }));
                                      }}
                                      placeholder={t("auth_files.alias_placeholder", "alias")}
                                    />
                                  </div>
                                  <div className="lg:col-span-1 flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                                    <span className="text-xs text-slate-600 dark:text-white/65">
                                      {t("auth_files.fork")}
                                    </span>
                                    <input
                                      type="checkbox"
                                      checked={Boolean(row.fork)}
                                      onChange={(e) => {
                                        const checked = e.currentTarget.checked;
                                        setAliasEditing((prev) => ({
                                          ...prev,
                                          [channel]: (prev[channel] ?? []).map((it, i) =>
                                            i === idx ? { ...it, fork: checked } : it,
                                          ),
                                        }));
                                      }}
                                      className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
                                    />
                                  </div>
                                  <div className="lg:col-span-1 flex items-center justify-end">
                                    <Button
                                      variant="danger"
                                      size="sm"
                                      onClick={() => {
                                        setAliasEditing((prev) => ({
                                          ...prev,
                                          [channel]: (prev[channel] ?? []).filter(
                                            (_, i) => i !== idx,
                                          ),
                                        }));
                                      }}
                                      aria-label={t("common.delete_row", "Delete Row")}
                                      title={t("common.delete")}
                                    >
                                      <X size={14} />
                                    </Button>
                                  </div>
                                </div>
                              ))}

                              <div className="flex items-center gap-2">
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => {
                                    setAliasEditing((prev) => ({
                                      ...prev,
                                      [channel]: [
                                        ...(prev[channel] ?? []),
                                        { id: `row-${Date.now()}`, name: "", alias: "" },
                                      ],
                                    }));
                                  }}
                                >
                                  <Plus size={14} />
                                  {t("auth_files.add_row")}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}

      <Modal
        open={detailOpen}
        title={
          detailFile
            ? t("auth_files.view_file_title", { name: detailFile.name })
            : t("auth_files.view_auth_file")
        }
        maxWidth="max-w-5xl"
        bodyHeightClassName="h-[70vh]"
        onClose={() => {
          setDetailOpen(false);
          setDetailTab("json");
        }}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            {detailTab === "models" && detailFile ? (
              <Button
                variant="secondary"
                onClick={() => void loadModelsForDetail(detailFile, { force: true })}
                disabled={modelsLoading}
              >
                <RefreshCw size={14} className={modelsLoading ? "animate-spin" : ""} />
                {t("auth_files.detail_models_refresh")}
              </Button>
            ) : null}

            {detailTab === "json" ? (
              <Button
                variant="secondary"
                onClick={() => {
                  if (detailFile) {
                    downloadTextAsFile(detailText, detailFile.name);
                  }
                }}
                disabled={!detailFile || detailLoading}
              >
                <Download size={14} />
                {t("auth_files.download")}
              </Button>
            ) : null}

            {detailTab === "fields" ? (
              <Button
                variant="primary"
                onClick={() => void savePrefixProxy()}
                disabled={
                  prefixProxyEditor.loading ||
                  prefixProxyEditor.saving ||
                  !prefixProxyEditor.json ||
                  !prefixProxyDirty
                }
              >
                <ShieldCheck size={14} />
                {t("auth_files.save")}
              </Button>
            ) : null}

            {detailTab === "channel" ? (
              <Button
                variant="primary"
                onClick={() => void saveChannelEditor()}
                disabled={channelEditor.saving}
              >
                <ShieldCheck size={14} />
                {t("auth_files.save")}
              </Button>
            ) : null}

            <Button
              variant="secondary"
              onClick={() => {
                setDetailOpen(false);
                setDetailTab("json");
              }}
            >
              {t("auth_files.close")}
            </Button>
          </div>
        }
      >
        {!detailFile ? (
          <EmptyState title={t("auth_files.view_auth_file")} description="--" />
        ) : (
          <Tabs value={detailTab} onValueChange={(next) => setDetailTab(next as typeof detailTab)}>
            <div className="space-y-4">
              <TabsList>
                <TabsTrigger value="json">{t("auth_files.detail_tab_json")}</TabsTrigger>
                <TabsTrigger value="models">{t("auth_files.detail_tab_models")}</TabsTrigger>
                <TabsTrigger value="fields">{t("auth_files.detail_tab_fields")}</TabsTrigger>
                {String(detailFile.account_type || "")
                  .trim()
                  .toLowerCase() === "oauth" ? (
                  <TabsTrigger value="channel">{t("auth_files.detail_tab_channel")}</TabsTrigger>
                ) : null}
              </TabsList>

              <TabsContent value="json" className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auth_files.detail_tab_json")}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
                    {t("auth_files.detail_tab_json_desc")}
                  </p>
                </div>

                {detailLoading ? (
                  <div className="text-sm text-slate-600 dark:text-white/65">
                    {t("common.loading_ellipsis")}
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
                    {detailText || "--"}
                  </pre>
                )}
              </TabsContent>

              <TabsContent value="models" className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auth_files.detail_tab_models")}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
                    {t("auth_files.detail_tab_models_desc")}
                  </p>
                </div>

                {modelsLoading ? (
                  <div className="text-sm text-slate-600 dark:text-white/65">
                    {t("common.loading_ellipsis")}
                  </div>
                ) : modelsError === "unsupported" ? (
                  <EmptyState
                    title={t("auth_files.api_not_supported")}
                    description={t("auth_files.no_models_api")}
                  />
                ) : modelsList.length === 0 ? (
                  <EmptyState
                    title={t("common.no_model_data")}
                    description={t("auth_files_page.models_hint")}
                  />
                ) : (
                  <div className="space-y-2">
                    {modelsList.map((model) => (
                      <div
                        key={model.id}
                        className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="font-mono text-xs text-slate-900 dark:text-white">
                            {model.id}
                          </p>
                          {(() => {
                            const providerKey = normalizeProviderKey(modelsFileType);
                            const excludedModels = excluded[providerKey] ?? [];
                            const hit = excludedModels.some((pattern) =>
                              matchesModelPattern(model.id, pattern),
                            );
                            if (!hit) return null;
                            return (
                              <span className="inline-flex rounded-lg bg-rose-600/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                {t("auth_files.oauth_excluded")}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="mt-1 text-xs text-slate-600 dark:text-white/65">
                          {model.display_name ? `display_name: ${model.display_name}` : ""}
                          {model.owned_by ? ` · owned_by: ${model.owned_by}` : ""}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="fields" className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auth_files.detail_tab_fields")}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
                    {t("auth_files.prefix_proxy_desc")}
                  </p>
                </div>

                {prefixProxyEditor.loading ? (
                  <div className="text-sm text-slate-600 dark:text-white/65">
                    {t("common.loading_ellipsis")}
                  </div>
                ) : prefixProxyEditor.json ? (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("auth_files.prefix_label")}
                      </p>
                      <div className="mt-2">
                        <TextInput
                          value={prefixProxyEditor.prefix}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setPrefixProxyEditor((prev) => ({ ...prev, prefix: value }));
                          }}
                          placeholder={t("auth_files.prefix_placeholder")}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                        {t("auth_files.leave_empty_prefix")}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("auth_files.proxy_url_label")}
                      </p>
                      <div className="mt-2">
                        <TextInput
                          value={prefixProxyEditor.proxyUrl}
                          onChange={(e) => {
                            const value = e.currentTarget.value;
                            setPrefixProxyEditor((prev) => ({ ...prev, proxyUrl: value }));
                          }}
                          placeholder={t("auth_files.proxy_url_placeholder")}
                        />
                      </div>
                      <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                        {t("auth_files.leave_empty_proxy")}
                      </p>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        {t("auth_files.preview_after_save")}
                      </p>
                      <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
                        {prefixProxyUpdatedText}
                      </pre>
                      <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                        {t("auth_files.save_note", { size: formatFileSize(MAX_AUTH_FILE_SIZE) })}
                      </p>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title={t("auth_files_page.cannot_edit")}
                    description={prefixProxyEditor.error || t("auth_files.unknown_error")}
                  />
                )}
              </TabsContent>

              <TabsContent value="channel" className="space-y-4">
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("auth_files.detail_tab_channel")}
                  </p>
                  <p className="mt-1 text-xs text-slate-600 dark:text-white/60">
                    {t("auth_files.edit_channel_name_desc")}
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
                      {t("auth_files.channel_name_label")}
                    </label>
                    <TextInput
                      value={channelEditor.label}
                      onChange={(e) => {
                        const value = e.currentTarget.value;
                        setChannelEditor((prev) => ({ ...prev, label: value, error: null }));
                      }}
                      placeholder={t("auth_files.channel_name_placeholder")}
                    />
                  </div>
                  {channelEditor.error ? (
                    <p className="text-sm text-rose-600 dark:text-rose-300">
                      {channelEditor.error}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 dark:text-white/55">
                      {t("auth_files.channel_name_hint")}
                    </p>
                  )}
                </div>
              </TabsContent>
            </div>
          </Tabs>
        )}
      </Modal>

      <Modal
        open={importOpen}
        title={t("auth_files.import_title", { name: importChannel || "--" })}
        description={t("auth_files.fetch_models_desc")}
        onClose={() => setImportOpen(false)}
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              {t("auth_files.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={applyImport}
              disabled={importLoading || !importModels.length}
            >
              <ShieldCheck size={14} />
              {t("auth_files.import_selected")}
            </Button>
          </div>
        }
      >
        {importLoading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">
            {t("common.loading_ellipsis")}
          </div>
        ) : importModels.length === 0 ? (
          <EmptyState
            title={t("common.no_model_def")}
            description={t("auth_files_page.cannot_edit_desc")}
          />
        ) : (
          <div className="space-y-3">
            <TextInput
              value={importSearch}
              onChange={(e) => setImportSearch(e.currentTarget.value)}
              placeholder={t("auth_files.search_models_placeholder")}
              endAdornment={<Search size={16} className="text-slate-400" />}
            />

            <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <p className="text-xs text-slate-600 dark:text-white/65 tabular-nums">
                {t("auth_files.models_selected", {
                  models: importFilteredModels.length,
                  selected: importSelected.size,
                })}
              </p>
              <div className="mt-2 max-h-72 overflow-y-auto space-y-1">
                {importFilteredModels.map((model) => {
                  const checked = importSelected.has(model.id);
                  return (
                    <label
                      key={model.id}
                      className={
                        checked
                          ? "flex cursor-pointer items-center gap-2 rounded-xl bg-slate-900 px-2 py-1 text-xs font-mono text-white dark:bg-white dark:text-neutral-950"
                          : "flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-xs font-mono hover:bg-slate-50 dark:hover:bg-white/5"
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setImportSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(model.id)) next.delete(model.id);
                            else next.add(model.id);
                            return next;
                          });
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-700 dark:bg-neutral-950 dark:text-white dark:focus-visible:ring-white/15"
                      />
                      <span className="truncate">{model.id}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Modal>

      <OAuthLoginDialog
        open={oauthDialogOpen}
        defaultTab={oauthDialogDefaultTab}
        onClose={() => setOauthDialogOpen(false)}
        onAuthorized={() => void loadAll()}
      />

      <ConfirmModal
        open={confirm !== null}
        title={
          confirm?.type === "deleteAll"
            ? filter === "all"
              ? t("auth_files.delete_all_auth_files")
              : t("auth_files.delete_filter_title", { filter })
            : t("auth_files.delete_auth_file")
        }
        description={
          confirm?.type === "deleteAll"
            ? filter === "all"
              ? t("auth_files.confirm_delete_all")
              : t("auth_files.confirm_delete_filter", { filter })
            : t("auth_files.confirm_delete_file", {
                name: confirm?.type === "deleteFile" ? confirm.name : "",
              })
        }
        confirmText={t("common.delete")}
        cancelText={t("common.cancel")}
        busy={deletingAll}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          if (!action) return;
          if (action.type === "deleteAll") {
            void handleDeleteAll().finally(() => setConfirm(null));
            return;
          }
          void handleDelete(action.name).finally(() => setConfirm(null));
        }}
      />
    </div>
  );
}
