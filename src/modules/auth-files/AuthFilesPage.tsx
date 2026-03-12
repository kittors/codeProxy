import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  CircleHelp,
  Download,
  Eye,
  FileJson,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { authFilesApi, usageApi } from "@/lib/http/apis";
import type { AuthFileItem, OAuthModelAliasEntry, UsageDetail, UsageData } from "@/lib/http/types";
import { iterateUsageRecords } from "@/modules/monitor/monitor-utils";
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

type UsageEntry = {
  timestamp: string;
  failed: boolean;
  source: string;
  authIndexKey: string | null;
};

type UsageIndex = {
  entriesBySource: Record<string, UsageEntry[]>;
  entriesByAuthIndex: Record<string, UsageEntry[]>;
  statsBySource: Record<string, KeyStatBucket>;
  statsByAuthIndex: Record<string, KeyStatBucket>;
};

const buildUsageIndex = (usage: UsageData | null): { entries: UsageEntry[]; index: UsageIndex } => {
  const entries = usage
    ? (iterateUsageRecords(usage)
      .map((detail) => {
        const source = normalizeUsageSourceId((detail as UsageDetail).source, (v) => v);
        if (!source) return null;
        const authIndexKey = normalizeAuthIndexValue((detail as UsageDetail).auth_index);
        return {
          timestamp: (detail as UsageDetail).timestamp,
          failed: Boolean((detail as UsageDetail).failed),
          source,
          authIndexKey,
        };
      })
      .filter(Boolean) as UsageEntry[])
    : [];

  const entriesBySource: Record<string, UsageEntry[]> = {};
  const entriesByAuthIndex: Record<string, UsageEntry[]> = {};
  const statsBySource: Record<string, KeyStatBucket> = {};
  const statsByAuthIndex: Record<string, KeyStatBucket> = {};

  const bump = (bucket: KeyStatBucket, failed: boolean) => {
    if (failed) bucket.failure += 1;
    else bucket.success += 1;
  };

  entries.forEach((entry) => {
    (entriesBySource[entry.source] ??= []).push(entry);
    bump((statsBySource[entry.source] ??= { success: 0, failure: 0 }), entry.failed);

    if (entry.authIndexKey) {
      (entriesByAuthIndex[entry.authIndexKey] ??= []).push(entry);
      bump((statsByAuthIndex[entry.authIndexKey] ??= { success: 0, failure: 0 }), entry.failed);
    }
  });

  return {
    entries,
    index: { entriesBySource, entriesByAuthIndex, statsBySource, statsByAuthIndex },
  };
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

const resolveAuthFileStatusBar = (file: AuthFileItem, index: UsageIndex): StatusBarData => {
  const authIndexKey = normalizeAuthIndexValue(
    file.auth_index ?? file.authIndex ?? file.authIndex ?? file.auth_index,
  );
  if (authIndexKey && index.entriesByAuthIndex[authIndexKey]?.length) {
    const details = index.entriesByAuthIndex[authIndexKey].map((e) => ({
      timestamp: e.timestamp,
      failed: e.failed,
    }));
    return calculateStatusBarData(details);
  }

  const candidates = buildAuthFileSourceCandidates(file);
  const merged: UsageEntry[] = [];
  const seen = new Set<string>();
  candidates.forEach((key) => {
    const list = index.entriesBySource[key] ?? [];
    list.forEach((item) => {
      const dedupe = `${item.timestamp}::${item.failed ? 1 : 0}`;
      if (seen.has(dedupe)) return;
      seen.add(dedupe);
      merged.push(item);
    });
  });
  return calculateStatusBarData(merged.map((e) => ({ timestamp: e.timestamp, failed: e.failed })));
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
  const [usageData, setUsageData] = useState<UsageData | null>(null);

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

  const loadAll = useCallback(async () => {
    setLoading(true);
    setUsageLoading(true);
    try {
      const [filesRes, usageRes] = await Promise.all([
        authFilesApi.list(),
        usageApi.getUsage().catch(() => null),
      ]);
      const list = Array.isArray(filesRes?.files) ? filesRes.files : [];
      setFiles(list);
      setUsageData(usageRes);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "Failed to load auth files" });
    } finally {
      setLoading(false);
      setUsageLoading(false);
    }
  }, [notify]);

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
        notify({ type: "error", message: err instanceof Error ? err.message : "Failed to read file" });
      } finally {
        setDetailLoading(false);
      }
    },
    [notify],
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
        notify({ type: "error", message: message || "Failed to get models" });
      } finally {
        setModelsLoading(false);
      }
    },
    [notify],
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
          message: `File too large (${formatFileSize(first.size)}): ${first.name} (max ${formatFileSize(MAX_AUTH_FILE_SIZE)})`,
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
          notify({ type: "success", message: `Upload success (${success} files)` });
        } else {
          notify({
            type: failed > 0 ? "error" : "info",
            message: `Upload done: ${success} success, ${failed} failed, ${tooLarge.length} skipped`,
          });
        }

        await loadAll();
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "Upload failed" });
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [loadAll, notify],
  );

  const handleDelete = useCallback(
    async (name: string) => {
      try {
        await authFilesApi.deleteFile(name);
        setFiles((prev) => prev.filter((file) => file.name !== name));
        notify({ type: "success", message: "Deleted" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "Delete failed" });
      }
    },
    [notify],
  );

  const handleDeleteAll = useCallback(async () => {
    setDeletingAll(true);
    try {
      const normalizedFilter = normalizeProviderKey(filter);
      if (!normalizedFilter || normalizedFilter === "all") {
        await authFilesApi.deleteAll();
        setFiles([]);
        notify({ type: "success", message: "All auth files deleted" });
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
        notify({ type: "info", message: `No deletable auth files in filter: ${filter}` });
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
        notify({ type: "success", message: `Deleted ${success} ${filter} auth files` });
      } else {
        notify({ type: "error", message: `${filter} delete done: ${success} success, ${failed} failed` });
      }
      setFilter("all");
      setPage(1);
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "Delete failed" });
    } finally {
      setDeletingAll(false);
    }
  }, [filter, files, notify, search]);

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
        notify({ type: "success", message: enabled ? "Enabled" : "Disabled" });
      } catch (err: unknown) {
        setFiles((prev) =>
          prev.map((it) => (it.name === name ? { ...it, disabled: prevDisabled } : it)),
        );
        notify({ type: "error", message: err instanceof Error ? err.message : "Failed to update status" });
      } finally {
        setStatusUpdating((prev) => {
          const next = { ...prev };
          delete next[name];
          return next;
        });
      }
    },
    [notify],
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
            error: "File is not valid JSON and cannot be edited.",
          }));
          return;
        }

        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          setPrefixProxyEditor((prev) => ({
            ...prev,
            loading: false,
            error: "File is not a JSON object and cannot be edited.",
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
        notify({ type: "error", message: err instanceof Error ? err.message : "Failed to read file" });
        setPrefixProxyEditor((prev) => ({ ...prev, loading: false, error: "Read failed" }));
      }
    },
    [notify],
  );

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
      notify({ type: "error", message: `Save failed: file too large (${formatFileSize(fileSize)})` });
      return;
    }

    const name = prefixProxyEditor.fileName;
    setPrefixProxyEditor((prev) => ({ ...prev, saving: true }));
    try {
      const file = new File([payload], name, { type: "application/json" });
      await authFilesApi.upload(file);
      notify({ type: "success", message: "Saved" });
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
      notify({ type: "error", message: err instanceof Error ? err.message : "Save failed" });
      setPrefixProxyEditor((prev) => ({ ...prev, saving: false }));
    }
  }, [
    loadAll,
    notify,
    prefixProxyDirty,
    prefixProxyEditor.fileName,
    prefixProxyEditor.json,
    prefixProxyUpdatedText,
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
      notify({ type: "error", message: message || "Failed to load OAuth excluded models" });
    } finally {
      setExcludedLoading(false);
    }
  }, [notify]);

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
      notify({ type: "error", message: message || "Failed to load OAuth model aliases" });
    } finally {
      setAliasLoading(false);
    }
  }, [notify]);

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
          message:
            "Server does not support OAuth excluded models API (/oauth-excluded-models). Please upgrade.",
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
        notify({ type: "success", message: "Saved" });
        startTransition(() => void refreshExcluded());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "Save failed" });
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
        notify({ type: "success", message: "Deleted" });
        startTransition(() => void refreshExcluded());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "Delete failed" });
      }
    },
    [excludedUnsupported, notify, refreshExcluded, startTransition],
  );

  const addExcludedProvider = useCallback(() => {
    const key = normalizeProviderKey(excludedNewProvider);
    if (!key) {
      notify({ type: "info", message: "Please enter provider" });
      return;
    }
    setExcluded((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
    setExcludedDraft((prev) => (prev[key] !== undefined ? prev : { ...prev, [key]: "" }));
    setExcludedNewProvider("");
  }, [excludedNewProvider, notify]);

  const addAliasChannel = useCallback(() => {
    const key = normalizeProviderKey(aliasNewChannel);
    if (!key) {
      notify({ type: "info", message: "Please enter channel" });
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
          message: "Server does not support OAuth model alias API (/oauth-model-alias). Please upgrade.",
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
        notify({ type: "success", message: "Saved" });
        startTransition(() => void refreshAlias());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "Save failed" });
      }
    },
    [aliasEditing, aliasUnsupported, notify, refreshAlias, startTransition],
  );

  const deleteAliasChannel = useCallback(
    async (channel: string) => {
      if (aliasUnsupported) {
        notify({
          type: "error",
          message: "Server does not support OAuth model alias API (/oauth-model-alias). Please upgrade.",
        });
        return;
      }
      const key = normalizeProviderKey(channel);
      try {
        await authFilesApi.deleteOauthModelAlias(key);
        notify({ type: "success", message: "Deleted" });
        startTransition(() => void refreshAlias());
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "Delete failed" });
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
        notify({ type: "error", message: err instanceof Error ? err.message : "Failed to get model definitions" });
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
      notify({ type: "info", message: "No models selected" });
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
    notify({ type: "success", message: "Imported (default alias=same name)" });
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
      <Card
        title={t("auth_files_page.title")}
        description={t("auth_files_page.description")}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => navigate("/quota")}>
              <ShieldCheck size={14} />
              Quota
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
                  Refresh
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                >
                  <Upload size={14} />
                  Upload
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => setConfirm({ type: "deleteAll" })}
                  disabled={deletingAll || loading || uploading}
                >
                  <Trash2 size={14} />
                  {filter === "all" ? "Delete All" : `Delete ${filter}`}
                </Button>
              </>
            ) : null}
          </div>
        }
        loading={loading}
      >
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
                      Type Filter
                    </p>
                    <HoverTooltip content="Count based on search results" placement="top">
                      <span
                        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 dark:text-white/45"
                        aria-label="Count info"
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
                      const label = key === "all" ? "All" : key;
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
                    Search
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
                    Per page
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
                      placeholder="Count"
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
                      Apply
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
                            <p className="truncate font-mono text-xs text-slate-900 dark:text-white">
                              {file.name}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <span
                                className={`inline-flex rounded-lg px-2 py-1 text-xs font-semibold ${badgeClass}`}
                              >
                                {typeKey}
                              </span>
                              {runtimeOnly ? (
                                <span className="inline-flex rounded-lg bg-slate-900 px-2 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
                                  Virtual auth file
                                </span>
                              ) : null}
                              {authIndexKey ? (
                                <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-white/70">
                                  auth_index {authIndexKey}
                                </span>
                              ) : null}
                              {runtimeOnly ? null : disabled ? (
                                <span className="inline-flex rounded-lg bg-rose-50 px-2 py-1 text-xs font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                  Disabled
                                </span>
                              ) : (
                                <span className="inline-flex rounded-lg bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                  Enabled
                                </span>
                              )}
                            </div>
                            <p className="mt-2 text-xs text-slate-600 dark:text-white/65">
                              {formatFileSize(file.size)} · {formatModified(file)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs tabular-nums">
                              <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                Success {stats.success}
                              </span>
                              <span className="rounded-full bg-rose-600/10 px-2 py-0.5 font-semibold text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                Failed {stats.failure}
                              </span>
                            </div>
                          </div>

                          <div className="shrink-0">
                            {runtimeOnly ? null : (
                              <div className="inline-flex items-center gap-2">
                                <span className="text-sm font-semibold leading-none text-slate-900 dark:text-white">
                                  Enable
                                </span>
                                <ToggleSwitch
                                  ariaLabel="Enable/Disable"
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
                              Models
                            </Button>
                          ) : null}

                          {runtimeOnly ? (
                            <p className="text-xs text-slate-600 dark:text-white/55">
                              Virtual auth files are for runtime injection only: cannot View/Download/Edit/Delete.
                            </p>
                          ) : (
                            <>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void openDetail(file)}
                              >
                                <Eye size={14} />
                                View
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void openPrefixProxyEditor(file)}
                              >
                                <Settings2 size={14} />
                                Prefix/Proxy
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
                                      message: err instanceof Error ? err.message : "DownloadFailed",
                                    });
                                  }
                                }}
                              >
                                <Download size={14} />
                                Download
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => setConfirm({ type: "deleteFile", name: file.name })}
                              >
                                <Trash2 size={14} />
                                Delete
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
                  Total {filteredFiles.length} · Page {safePage} / {totalPages}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                    disabled={safePage <= 1}
                  >
                    Prev
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={safePage >= totalPages}
                  >
                    Next
                  </Button>
                </div>
              </div>

              {usageData ? null : (
                <p className="text-xs text-slate-500 dark:text-white/55">
                  Usage stats loading failed: File management is not affected, but success/failed stats will show 0.
                </p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="excluded" className="mt-4">
            <Card
              title={t("auth_files_page.excluded_title")}
              description={t("auth_files_page.excluded_desc")}
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void refreshExcluded()}
                    disabled={excludedLoading || isPending}
                  >
                    <RefreshCw size={14} className={excludedLoading ? "animate-spin" : ""} />
                    Refresh
                  </Button>
                </div>
              }
              loading={excludedLoading}
            >
              {excludedUnsupported ? (
                <div className="mb-4">
                  <EmptyState
                    title={t("auth_files_page.api_not_supported")}
                    description="Server does not implement /oauth-excluded-models (or version is too old). Please update the server."
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={excludedNewProvider}
                  onChange={(e) => setExcludedNewProvider(e.currentTarget.value)}
                  placeholder="Add provider (e.g. codex / gemini-cli)"
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
                  Add
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
                        excludedDraft[provider] ?? (Array.isArray(models) ? models.join("\n") : "");
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
                                共 {count} 条
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
                                Save
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => void deleteExcludedProvider(provider)}
                                disabled={isPending || excludedUnsupported}
                              >
                                Delete
                              </Button>
                            </div>
                          </div>
                          <textarea
                            value={excludedDraft[provider] ?? text}
                            onChange={(e) => {
                              const nextText = e.currentTarget.value;
                              setExcludedDraft((prev) => ({ ...prev, [provider]: nextText }));
                            }}
                            placeholder="One model per line; use * to disable all models"
                            aria-label={`${provider} Excluded Models`}
                            disabled={excludedUnsupported}
                            className="mt-3 min-h-[120px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
                          />
                        </div>
                      );
                    })
                )}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="alias" className="mt-4">
            <Card
              title={t("auth_files_page.alias_title")}
              description="Maintain Models name -> alias mapping by channel (for OAuth)."
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void refreshAlias()}
                    disabled={aliasLoading || isPending}
                  >
                    <RefreshCw size={14} className={aliasLoading ? "animate-spin" : ""} />
                    Refresh
                  </Button>
                </div>
              }
              loading={aliasLoading}
            >
              {aliasUnsupported ? (
                <div className="mb-4">
                  <EmptyState
                    title="API Not Supported"
                    description="Server does not implement /oauth-model-alias. Please upgrade the server."
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  value={aliasNewChannel}
                  onChange={(e) => setAliasNewChannel(e.currentTarget.value)}
                  placeholder="Add channel (e.g. codex/gemini/anthropic)"
                  disabled={aliasUnsupported}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={addAliasChannel}
                  disabled={isPending || aliasUnsupported}
                >
                  <Plus size={14} />
                  Add
                </Button>
              </div>

              <div className="mt-4 space-y-3">
                {Object.keys(aliasEditing).length === 0 ? (
                  <EmptyState title="No config" description={t("auth_files_page.alias_no_config")} />
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
                                Valid mappings: {mappingCount}
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
                                导入Models
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => void saveAliasChannel(channel)}
                                disabled={isPending || aliasUnsupported}
                              >
                                Save
                              </Button>
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={() => void deleteAliasChannel(channel)}
                                disabled={isPending || aliasUnsupported}
                              >
                                Delete
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
                                    placeholder="name"
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
                                    placeholder="alias"
                                  />
                                </div>
                                <div className="lg:col-span-1 flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                                  <span className="text-xs text-slate-600 dark:text-white/65">
                                    fork
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
                                    title="Delete"
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
                                Add一行
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })
                )}
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </Card>

      <Modal
        open={detailOpen}
        title={detailFile ? `View：${detailFile.name}` : t("auth_files.view_auth_file", "View Auth File")}
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
              Download
            </Button>
            <Button variant="secondary" onClick={() => setDetailOpen(false)}>
              Close
            </Button>
          </div>
        }
      >
        {detailLoading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">Loading…</div>
        ) : (
          <pre className="whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-4 font-mono text-xs text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
            {detailText || "--"}
          </pre>
        )}
      </Modal>

      <Modal
        open={modelsOpen}
        title={`Models List: ${modelsFileName || "--"}${modelsFileType ? ` (${modelsFileType})` : ""}`}
        onClose={() => setModelsOpen(false)}
        footer={
          <Button variant="secondary" onClick={() => setModelsOpen(false)}>
            Close
          </Button>
        }
      >
        {modelsLoading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">Loading…</div>
        ) : modelsError === "unsupported" ? (
          <EmptyState
            title="API Not Supported"
            description="Server does not implement /auth-files/models or auth file does not support querying models."
          />
        ) : modelsList.length === 0 ? (
          <EmptyState
            title={t("common.no_model_data", "No Models Data")}
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
                        OAuth Excluded
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
        title={`Edit: ${prefixProxyEditor.fileName || "--"}`}
        description="Only modifies prefix/proxy_url, everything else remains unchanged (by re-uploading file with same name)."
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
              Cancel
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
              Save
            </Button>
          </div>
        }
      >
        {prefixProxyEditor.loading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">Loading…</div>
        ) : prefixProxyEditor.json ? (
          <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">prefix (optional)</p>
              <div className="mt-2">
                <TextInput
                  value={prefixProxyEditor.prefix}
                  onChange={(e) =>
                    setPrefixProxyEditor((prev) => ({ ...prev, prefix: e.currentTarget.value }))
                  }
                  placeholder="e.g. team-a"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                Leave empty to remove prefix.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                proxy_url (optional)
              </p>
              <div className="mt-2">
                <TextInput
                  value={prefixProxyEditor.proxyUrl}
                  onChange={(e) =>
                    setPrefixProxyEditor((prev) => ({ ...prev, proxyUrl: e.currentTarget.value }))
                  }
                  placeholder="e.g. http://127.0.0.1:7890"
                />
              </div>
              <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                Leave empty to remove proxy_url.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Preview (After Save)
              </p>
              <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap break-words rounded-2xl border border-slate-200 bg-white p-3 font-mono text-xs text-slate-900 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100">
                {prefixProxyUpdatedText}
              </pre>
              <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                Note: Saving will re-upload the file; recommended max size is{" "}
                {formatFileSize(MAX_AUTH_FILE_SIZE)}。
              </p>
            </div>
          </div>
        ) : (
          <EmptyState title={t("auth_files_page.cannot_edit")} description={prefixProxyEditor.error || "Unknown error"} />
        )}
      </Modal>

      <Modal
        open={importOpen}
        title={`Import Models: ${importChannel || "--"}`}
        description="Fetch models from /model-definitions and batch generate aliases (default alias=same)."
        onClose={() => setImportOpen(false)}
        footer={
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={applyImport}
              disabled={importLoading || !importModels.length}
            >
              <ShieldCheck size={14} />
              Import Selected
            </Button>
          </div>
        }
      >
        {importLoading ? (
          <div className="text-sm text-slate-600 dark:text-white/65">Loading…</div>
        ) : importModels.length === 0 ? (
          <EmptyState
            title={t("common.no_model_def", "No Model Definitions")}
            description={t("auth_files_page.cannot_edit_desc")}
          />
        ) : (
          <div className="space-y-3">
            <TextInput
              value={importSearch}
              onChange={(e) => setImportSearch(e.currentTarget.value)}
              placeholder="SearchModels id / display_name"
              endAdornment={<Search size={16} className="text-slate-400" />}
            />

            <div className="rounded-2xl border border-slate-200 bg-white/70 p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
              <p className="text-xs text-slate-600 dark:text-white/65 tabular-nums">
                {importFilteredModels.length} models · {importSelected.size} selected
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
              ? t("auth_files.delete_all_auth_files", "Delete All Auth Files")
              : `Delete ${filter} Auth files`
            : t("auth_files.delete_auth_file", "Delete Auth File")
        }
        description={
          confirm?.type === "deleteAll"
            ? filter === "all"
              ? t("auth_files.confirm_delete_all", "Are you sure you want to delete all auth files? This operation is irreversible.")
              : `Are you sure you want to delete auth files under current filter (${filter})? This operation is irreversible.`
            : `Are you sure you want to delete ${confirm?.type === "deleteFile" ? confirm.name : ""}? This operation is irreversible.`
        }
        confirmText="Delete"
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
