import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CircleHelp,
  Download,
  Eye,
  FileJson,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { authFilesApi, usageApi } from "@/lib/http/apis";
import { formatLatency } from "@/modules/providers/hooks/useProviderLatency";
import type { AuthFileItem, OAuthModelAliasEntry, UsageData } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";
import { HoverTooltip } from "@/modules/ui/Tooltip";
import { ProviderStatusBar } from "@/modules/providers/ProviderStatusBar";
import {
  calculateStatusBarData,
  normalizeUsageSourceId,
  type KeyStatBucket,
  type StatusBarData,
} from "@/modules/providers/provider-usage";

type AuthFileModelItem = { id: string; display_name?: string; type?: string; owned_by?: string };

const MIN_PAGE_SIZE = 6;
const MAX_PAGE_SIZE = 30;
const MAX_AUTH_FILE_SIZE = 50 * 1024;

const AUTH_FILES_UI_STATE_KEY = "authFilesPage.uiState.v2";

type AuthFilesUiState = {
  tab?: "files" | "excluded" | "alias";
  filter?: string;
  search?: string;
  page?: number;
  pageSize?: number;
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

const clampPageSize = (value: number) =>
  Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, Math.round(value)));

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

type UsageIndex = {
  statsBySource: Record<string, KeyStatBucket>;
  statsByAuthIndex: Record<string, KeyStatBucket>;
};

const buildUsageIndex = (usage: import("@/lib/http/types").EntityStatsResponse | null): { index: UsageIndex } => {
  const statsBySource: Record<string, KeyStatBucket> = {};
  const statsByAuthIndex: Record<string, KeyStatBucket> = {};

  if (usage?.source) {
    usage.source.forEach(pt => {
      const src = normalizeUsageSourceId(pt.entity_name, v => v);
      if (src) {
        statsBySource[src] = { success: pt.requests - pt.failed, failure: pt.failed };
      }
    });
  }

  if (usage?.auth_index) {
    usage.auth_index.forEach(pt => {
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

const resolveAuthFileStatusBar = (file: AuthFileItem, index: UsageIndex): import("@/utils/usage").StatusBarData => {
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
      rate: (successPart + failPart) > 0 ? (successPart / (successPart + failPart)) : -1,
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
  const navigate = useNavigate();
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

  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(9);
  const [pageSizeInput, setPageSizeInput] = useState("9");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const modelsCacheRef = useRef<Map<string, AuthFileModelItem[]>>(new Map());

  const [usageLoading, setUsageLoading] = useState(false);
  const [usageData, setUsageData] = useState<import("@/lib/http/types").EntityStatsResponse | null>(null);

  const { index: usageIndex } = useMemo(() => buildUsageIndex(usageData), [usageData]);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailFile, setDetailFile] = useState<AuthFileItem | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailText, setDetailText] = useState("");

  const [modelsOpen, setModelsOpen] = useState(false);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsFileName, setModelsFileName] = useState("");
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
    if (typeof state.pageSize === "number" && Number.isFinite(state.pageSize))
      setPageSize(clampPageSize(state.pageSize));
  }, []);

  useEffect(() => {
    const requestedTab = searchParams.get("tab");
    if (requestedTab === "files" || requestedTab === "excluded" || requestedTab === "alias") {
      setTab(requestedTab);
    }
  }, [searchParams]);

  useEffect(() => {
    writeAuthFilesUiState({ tab, filter, search, page, pageSize });
  }, [filter, page, pageSize, search, tab]);

  useEffect(() => {
    setPageSizeInput(String(pageSize));
  }, [pageSize]);

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

  const totalPages = Math.max(1, Math.ceil(filteredFiles.length / pageSize));
  const safePage = Math.min(totalPages, Math.max(1, page));
  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredFiles.slice(start, start + pageSize);
  }, [filteredFiles, pageSize, safePage]);

  useEffect(() => {
    if (safePage !== page) setPage(safePage);
  }, [page, safePage]);

  const openDetail = useCallback(
    async (file: AuthFileItem) => {
      setDetailOpen(true);
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

  const openModels = useCallback(
    async (file: AuthFileItem) => {
      setModelsOpen(true);
      setModelsFileName(file.name);
      setModelsFileType(resolveFileType(file));
      setModelsLoading(true);
      setModelsList([]);
      setModelsError(null);

      const cached = modelsCacheRef.current.get(file.name);
      if (cached) {
        setModelsList(cached);
        setModelsLoading(false);
        return;
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
      setChannelEditor({ open: false, fileName: "", label: "", saving: false, error: null });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t("auth_files.save_failed");
      setChannelEditor((prev) => ({ ...prev, saving: false, error: message }));
      notify({ type: "error", message });
    }
  }, [channelEditor.fileName, channelEditor.label, loadAll, notify, t]);

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
      setPrefixProxyEditor({
        open: false,
        fileName: "",
        loading: false,
        saving: false,
        error: null,
        json: null,
        prefix: "",
        proxyUrl: "",
      });
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("auth_files.save_failed"),
      });
      setPrefixProxyEditor((prev) => ({ ...prev, saving: false }));
    }
  }, [
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
          <Button variant="secondary" size="sm" onClick={() => navigate("/quota")}>
            <ShieldCheck size={14} />
            {t("auth_files.quota")}
          </Button>
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

                <div className="flex shrink-0 flex-col gap-1">
                  <p className="text-[11px] font-semibold text-slate-600 dark:text-white/65">
                    {t("auth_files.per_page")}
                  </p>
                  <div className="flex items-center gap-2">
                    <TextInput
                      value={pageSizeInput}
                      onChange={(e) => setPageSizeInput(e.currentTarget.value)}
                      onBlur={() => {
                        const parsed = Number(pageSizeInput);
                        if (Number.isFinite(parsed)) setPageSize(clampPageSize(parsed));
                        else setPageSizeInput(String(pageSize));
                      }}
                      aria-label={t("auth_files_page.per_page")}
                      placeholder={t("auth_files.count_placeholder")}
                      inputMode="numeric"
                      className="w-24"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      className="min-w-16 whitespace-nowrap"
                      onClick={() => {
                        const parsed = Number(pageSizeInput);
                        if (Number.isFinite(parsed)) setPageSize(clampPageSize(parsed));
                        else setPageSizeInput(String(pageSize));
                      }}
                    >
                      {t("auth_files.apply")}
                    </Button>
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {pageItems.length === 0 ? (
                  <div className="md:col-span-2 xl:col-span-3">
                    <EmptyState
                      title={t("auth_files_page.no_files")}
                      description={t("auth_files_page.no_files_desc")}
                    />
                  </div>
                ) : (
                  pageItems.map((file) => {
                    const typeKey = resolveFileType(file);
                    const badgeClass = TYPE_BADGE_CLASSES[typeKey] ?? TYPE_BADGE_CLASSES.unknown;
                    const disabled = Boolean(file.disabled);
                    const switching = Boolean(statusUpdating[file.name]);
                    const runtimeOnly = isRuntimeOnlyAuthFile(file);
                    const authIndexKey = normalizeAuthIndexValue(file.auth_index ?? file.authIndex);
                    const isOauthFile =
                      String(file.account_type || "")
                        .trim()
                        .toLowerCase() === "oauth";
                    const channelName = readAuthFileChannelName(file);

                    const stats = resolveAuthFileStats(file, usageIndex);
                    const statusData = resolveAuthFileStatusBar(file, usageIndex);

                    const showModels = !runtimeOnly || typeKey === "aistudio";

                    return (
                      <article
                        key={file.name}
                        className={[
                          "rounded-2xl border border-slate-200 p-4 shadow-sm dark:border-neutral-800",
                          runtimeOnly
                            ? "bg-slate-50/80 dark:bg-neutral-950/55"
                            : "bg-white dark:bg-neutral-950/70",
                          disabled ? " opacity-85" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="flex items-center gap-2 truncate font-mono text-xs text-slate-900 dark:text-white">
                              <span className="truncate">{file.name}</span>
                              {(() => {
                                const cs = connectivityState.get(file.name);
                                return (
                                  <button
                                    type="button"
                                    disabled={cs?.loading}
                                    className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] tabular-nums text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 disabled:cursor-default disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/60 dark:hover:border-blue-600 dark:hover:bg-blue-950 dark:hover:text-blue-300"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      void checkAuthFileConnectivity(file.name);
                                    }}
                                    title={t("auth_files.check_connectivity")}
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
                              })()}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${badgeClass}`}
                              >
                                {typeKey}
                              </span>
                              {runtimeOnly ? (
                                <span className="inline-flex rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
                                  {t("auth_files.virtual_auth_file")}
                                </span>
                              ) : null}
                              {authIndexKey ? (
                                <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-white/70">
                                  auth_index {authIndexKey}
                                </span>
                              ) : null}
                              {runtimeOnly ? null : disabled ? (
                                <span className="inline-flex rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                  {t("auth_files.disabled")}
                                </span>
                              ) : (
                                <span className="inline-flex rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                  {t("auth_files.enabled")}
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-slate-600 dark:text-white/65">
                              {formatFileSize(file.size)} · {formatModified(file)}
                            </p>
                            {isOauthFile && channelName ? (
                              <p className="mt-2 text-xs text-slate-600 dark:text-white/65">
                                {t("auth_files.channel_name")}:{" "}
                                <span className="font-medium text-slate-800 dark:text-white/80">
                                  {channelName}
                                </span>
                              </p>
                            ) : null}
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs tabular-nums">
                              <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                {t("auth_files.success_count", { count: stats.success })}
                              </span>
                              <span className="rounded-full bg-rose-600/10 px-2 py-0.5 font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                {t("auth_files.failed_count", { count: stats.failure })}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {runtimeOnly ? null : (
                              <div className="inline-flex items-center gap-2">
                                <span className="text-sm font-semibold leading-none text-slate-900 dark:text-white">
                                  {t("auth_files.enable")}
                                </span>
                                <ToggleSwitch
                                  ariaLabel={t("auth_files.enable_disable")}
                                  checked={!disabled}
                                  onCheckedChange={(enabled) => void setFileEnabled(file, enabled)}
                                  disabled={switching}
                                />
                              </div>
                            )}
                          </div>
                        </div>

                        <ProviderStatusBar data={statusData} />

                        <div className="mt-4 flex flex-wrap items-center gap-2">
                          {showModels ? (
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void openModels(file)}
                            >
                              <ShieldCheck size={14} />
                              {t("auth_files.models")}
                            </Button>
                          ) : null}

                          {runtimeOnly ? (
                            <p className="text-xs text-slate-600 dark:text-white/55">
                              {t("auth_files.virtual_hint")}
                            </p>
                          ) : (
                            <>
                              {isOauthFile && !runtimeOnly ? (
                                <Button
                                  variant="secondary"
                                  size="sm"
                                  onClick={() => openChannelEditor(file)}
                                >
                                  <Settings2 size={14} />
                                  {t("auth_files.edit_channel_name")}
                                </Button>
                              ) : null}
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void openDetail(file)}
                              >
                                <Eye size={14} />
                                {t("auth_files.view")}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void openPrefixProxyEditor(file)}
                              >
                                <Settings2 size={14} />
                                {t("auth_files.prefix_proxy")}
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={async () => {
                                  try {
                                    const text = await authFilesApi.downloadText(file.name);
                                    downloadTextAsFile(text, file.name);
                                  } catch (err: unknown) {
                                    notify({
                                      type: "error",
                                      message:
                                        err instanceof Error
                                          ? err.message
                                          : t("auth_files.download_failed"),
                                    });
                                  }
                                }}
                              >
                                <Download size={14} />
                                {t("auth_files.download")}
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setConfirm({ type: "deleteFile", name: file.name })}
                              >
                                <Trash2 size={14} />
                                {t("common.delete")}
                              </Button>
                            </>
                          )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

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
        open={channelEditor.open}
        title={t("auth_files.edit_channel_name_title", { name: channelEditor.fileName || "--" })}
        description={t("auth_files.edit_channel_name_desc")}
        onClose={() =>
          setChannelEditor({ open: false, fileName: "", label: "", saving: false, error: null })
        }
        footer={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setChannelEditor({
                  open: false,
                  fileName: "",
                  label: "",
                  saving: false,
                  error: null,
                })
              }
            >
              {t("auth_files.cancel")}
            </Button>
            <Button variant="primary" onClick={() => void saveChannelEditor()} disabled={channelEditor.saving}>
              <ShieldCheck size={14} />
              {t("auth_files.save")}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-white/80">
              {t("auth_files.channel_name_label")}
            </label>
            <TextInput
              value={channelEditor.label}
              onChange={(e) =>
                setChannelEditor((prev) => ({ ...prev, label: e.currentTarget.value, error: null }))
              }
              placeholder={t("auth_files.channel_name_placeholder")}
            />
          </div>
          {channelEditor.error ? (
            <p className="text-sm text-rose-600 dark:text-rose-300">{channelEditor.error}</p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-white/55">
              {t("auth_files.channel_name_hint")}
            </p>
          )}
        </div>
      </Modal>

      <Modal
        open={detailOpen}
        title={
          detailFile
            ? t("auth_files.view_file_title", { name: detailFile.name })
            : t("auth_files.view_auth_file")
        }
        onClose={() => setDetailOpen(false)}
        footer={
          <div className="flex items-center gap-2">
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
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>
              {t("auth_files.close")}
            </Button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">
            {t("common.loading_ellipsis")}
          </div>
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
            {detailText || "--"}
          </pre>
        )}
      </Modal>

      <Modal
        open={modelsOpen}
        title={t("auth_files.models_list_title", {
          name: modelsFileName || "--",
          type: modelsFileType || "",
        })}
        onClose={() => setModelsOpen(false)}
        footer={
          <Button variant="secondary" onClick={() => setModelsOpen(false)}>
            {t("auth_files.close")}
          </Button>
        }
      >
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
                  <p className="font-mono text-xs text-slate-900 dark:text-white">{model.id}</p>
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
      </Modal>

      <Modal
        open={prefixProxyEditor.open}
        title={t("auth_files.edit_title", { name: prefixProxyEditor.fileName || "--" })}
        description={t("auth_files.prefix_proxy_desc")}
        onClose={() =>
          setPrefixProxyEditor({
            open: false,
            fileName: "",
            loading: false,
            saving: false,
            error: null,
            json: null,
            prefix: "",
            proxyUrl: "",
          })
        }
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {prefixProxyEditor.error ? (
              <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                {prefixProxyEditor.error}
              </span>
            ) : null}
            <Button
              variant="secondary"
              onClick={() =>
                setPrefixProxyEditor({
                  open: false,
                  fileName: "",
                  loading: false,
                  saving: false,
                  error: null,
                  json: null,
                  prefix: "",
                  proxyUrl: "",
                })
              }
            >
              {t("auth_files.cancel")}
            </Button>
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
          </div>
        }
      >
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
                  onChange={(e) =>
                    setPrefixProxyEditor((prev) => ({ ...prev, prefix: e.currentTarget.value }))
                  }
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
                  onChange={(e) =>
                    setPrefixProxyEditor((prev) => ({ ...prev, proxyUrl: e.currentTarget.value }))
                  }
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
