import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { ampcodeApi, providersApi, usageApi } from "@code-proxy/api-client";
import {
  proxiesApi,
  type ProxyPoolEntry,
} from "@code-proxy/api-client/endpoints/proxies";
import type {
  BedrockProviderConfig,
  OpenAIProvider,
  ProviderSimpleConfig,
} from "@code-proxy/api-client";
import { Button } from "@code-proxy/ui";
import { ConfirmModal } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { Tabs, TabsContent } from "@code-proxy/ui";
import { useToast } from "@code-proxy/ui";
import { downloadTextAsFile } from "@code-proxy/domain";
import { AmpcodePanel } from "./AmpcodePanel";
import { OpenAIProviderModal } from "./OpenAIProviderModal";
import { OpenAIProvidersTab } from "./OpenAIProvidersTab";
import { ProviderKeyModal } from "./ProviderKeyModal";
import { useOpenAIProviderEditor } from "../hooks/useOpenAIProviderEditor";
import { ProviderKeyListCard } from "../ProviderKeyListCard";
import {
  OpenCodeGoUsageCardSection,
  mergeOpenCodeGoUsage,
  type OpenCodeGoUsageCacheEntry,
} from "./OpenCodeGoUsageCardSection";
import { useProviderKeyEditor } from "../hooks/useProviderKeyEditor";
import { useProviderLatency } from "../hooks/useProviderLatency";
import { useProviderUsageSummary } from "../hooks/useProviderUsageSummary";
import { normalizeUsageSourceId, type KeyStatBucket } from "@code-proxy/domain";
import { getCachedData, removeCachedData, setCachedData } from "../provider-cache";
import {
  maskApiKey,
  readBool,
  readString,
  type AmpMappingEntry,
} from "../providers-helpers";
import {
  createProviderExportText,
  prepareProviderImport,
  type ProviderImportDiff,
  type ProviderImportKind,
} from "../provider-import-export";
import {
  fetchModelAccessCatalog,
  getEffectiveProviderModels,
  type DiscoveredProviderModel,
  type ModelAccessProvider,
} from "../provider-model-access";
import { ProvidersToolbar } from "./ProvidersToolbar";
import { ProviderTabsWithCounts } from "./ProviderTabsWithCounts";
import type { ProviderTabId } from "./ProviderTabsWithCounts";

type ProviderTab = ProviderTabId;

const PROVIDER_TAB_STORAGE_KEY = "providers-page:tab";
const PROVIDER_TAB_VALUES: ProviderTab[] = [
  "gemini",
  "claude",
  "codex",
  "opencode-go",
  "cline",
  "ollama-cloud",
  "vertex",
  "bedrock",
  "openai",
  "ampcode",
];
const PROVIDER_LIST_TAB_VALUES: Exclude<ProviderTab, "ampcode">[] =
  PROVIDER_TAB_VALUES.filter((item) => item !== "ampcode") as Exclude<
    ProviderTab,
    "ampcode"
  >[];

function readSavedProviderTab(): ProviderTab {
  try {
    const saved = localStorage.getItem(PROVIDER_TAB_STORAGE_KEY);
    if (saved && PROVIDER_TAB_VALUES.includes(saved as ProviderTab))
      return saved as ProviderTab;
  } catch {
    // ignore
  }
  return "gemini";
}

function saveProviderTab(tab: ProviderTab): void {
  try {
    localStorage.setItem(PROVIDER_TAB_STORAGE_KEY, tab);
  } catch {
    // ignore
  }
}

const getProviderSelectionKey = (
  kind: ProviderImportKind,
  item: ProviderSimpleConfig | BedrockProviderConfig | OpenAIProvider,
  index: number,
) =>
  kind === "openai"
    ? `${String((item as OpenAIProvider).name ?? "")
        .trim()
        .toLowerCase()}:${index}`
    : `${String((item as ProviderSimpleConfig).apiKey ?? "")
        .trim()
        .toLowerCase()}:${index}`;

const getOpenCodeGoUsageCacheKey = (
  item: ProviderSimpleConfig,
  index: number,
) =>
  [
    item.workspaceId?.trim() || "no-workspace",
    item.name?.trim() || `item-${index}`,
    index,
  ].join(":");

const hasOpenCodeGoUsageQuery = (item: ProviderSimpleConfig) =>
  Boolean(item.workspaceId?.trim() && item.authCookie?.trim());

type OpenCodeGoUsageState = Record<string, OpenCodeGoUsageCacheEntry>;
type OpenCodeGoUsageLoadingState = Record<string, boolean>;
type ModelAccessCatalogState = Record<
  ModelAccessProvider,
  DiscoveredProviderModel[]
>;
type ModelAccessCatalogLoadedState = Record<ModelAccessProvider, boolean>;

const EMPTY_MODEL_ACCESS_CATALOGS: ModelAccessCatalogState = {
  "opencode-go": [],
  cline: [],
  "ollama-cloud": [],
};

const EMPTY_MODEL_ACCESS_CATALOG_LOADED: ModelAccessCatalogLoadedState = {
  "opencode-go": false,
  cline: false,
  "ollama-cloud": false,
};

const isModelAccessProvider = (
  tabId: ProviderTab,
): tabId is ModelAccessProvider =>
  tabId === "opencode-go" || tabId === "cline" || tabId === "ollama-cloud";

export function ProvidersPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();
  const location = useLocation();
  const navigate = useNavigate();
  const { getEntry: getLatencyEntry, checkLatency } = useProviderLatency();

  const [tab, setTabState] = useState<ProviderTab>(readSavedProviderTab);
  const setTab = useCallback((next: ProviderTab) => {
    setTabState(next);
    saveProviderTab(next);
  }, []);
  const [loading, setLoading] = useState(true);

  const cachedUsageState =
    getCachedData<OpenCodeGoUsageState>("opencode-go-usage");
  const [openCodeGoUsageState, setOpenCodeGoUsageState] =
    useState<OpenCodeGoUsageState>(cachedUsageState ?? {});
  const [openCodeGoUsageLoadingState, setOpenCodeGoUsageLoadingState] =
    useState<OpenCodeGoUsageLoadingState>({});
  const [modelAccessCatalogs, setModelAccessCatalogs] =
    useState<ModelAccessCatalogState>(EMPTY_MODEL_ACCESS_CATALOGS);
  const [modelAccessCatalogLoaded, setModelAccessCatalogLoaded] =
    useState<ModelAccessCatalogLoadedState>(EMPTY_MODEL_ACCESS_CATALOG_LOADED);

  const loadModelAccessCatalog = useCallback(
    async (provider: ModelAccessProvider) => {
      try {
        const catalog = await fetchModelAccessCatalog(provider);
        setModelAccessCatalogs((prev) => ({ ...prev, [provider]: catalog }));
      } catch {
        setModelAccessCatalogs((prev) => ({ ...prev, [provider]: [] }));
      } finally {
        setModelAccessCatalogLoaded((prev) => ({ ...prev, [provider]: true }));
      }
    },
    [],
  );

  const refreshOpenCodeGoUsage = useCallback(
    async (item: ProviderSimpleConfig, index: number) => {
      const hasQuery = Boolean(
        item.workspaceId?.trim() && item.authCookie?.trim(),
      );
      if (!hasQuery) return;

      const cacheKey = getOpenCodeGoUsageCacheKey(item, index);
      setOpenCodeGoUsageLoadingState((prev) => ({ ...prev, [cacheKey]: true }));
      try {
        const result = await providersApi.queryOpenCodeGoUsage({
          "workspace-id": item.workspaceId?.trim(),
          "auth-cookie": item.authCookie?.trim(),
          "proxy-id": item.proxyId?.trim(),
          "proxy-url": item.proxyUrl?.trim(),
          name: item.name?.trim(),
          "api-key": item.apiKey?.trim(),
          index,
        });
        const entry: OpenCodeGoUsageCacheEntry = {
          workspaceId: result.workspace_id,
          usage: result.usage,
          updatedAt: Date.now(),
        };
        setOpenCodeGoUsageState((prev) => {
          const existing = prev[cacheKey];
          const merged = mergeOpenCodeGoUsage(
            existing?.usage ?? [],
            entry.usage,
          );
          const next = {
            ...prev,
            [cacheKey]: {
              ...entry,
              usage: merged,
              workspaceId: entry.workspaceId ?? existing?.workspaceId,
            },
          };
          setCachedData("opencode-go-usage", next);
          return next;
        });
        setOpenCodeGoUsageLoadingState((prev) => ({
          ...prev,
          [cacheKey]: false,
        }));
      } catch (err: unknown) {
        setOpenCodeGoUsageState((prev) => {
          const existing = prev[cacheKey];
          const entry: OpenCodeGoUsageCacheEntry = {
            workspaceId: existing?.workspaceId,
            usage: existing?.usage ?? [],
            updatedAt: Date.now(),
            error:
              err instanceof Error
                ? err.message
                : t("providers.opencode_go_usage_query_failed"),
          };
          const next = { ...prev, [cacheKey]: entry };
          setCachedData("opencode-go-usage", next);
          return next;
        });
        setOpenCodeGoUsageLoadingState((prev) => ({
          ...prev,
          [cacheKey]: false,
        }));
      }
    },
    [t],
  );

  const [geminiKeys, setGeminiKeys] = useState<ProviderSimpleConfig[]>([]);
  const [claudeKeys, setClaudeKeys] = useState<ProviderSimpleConfig[]>([]);
  const [codexKeys, setCodexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [openCodeGoKeys, setOpenCodeGoKeys] = useState<ProviderSimpleConfig[]>(
    [],
  );
  const [clineKeys, setClineKeys] = useState<ProviderSimpleConfig[]>([]);
  const [ollamaCloudKeys, setOllamaCloudKeys] = useState<
    ProviderSimpleConfig[]
  >([]);
  const [vertexKeys, setVertexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [bedrockKeys, setBedrockKeys] = useState<BedrockProviderConfig[]>([]);
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProvider[]>([]);

  // Auto-refresh OpenCode Go usage when tab switches to opencode-go and cache is stale
  const OPEN_CODE_GO_USAGE_STALE_MS = 5 * 60 * 1000;
  const autoRefreshOpenCodeGoInFlightRef = useRef(false);

  useEffect(() => {
    if (tab !== "opencode-go") return;
    if (loading) return;
    if (openCodeGoKeys.length === 0) return;
    if (autoRefreshOpenCodeGoInFlightRef.current) return;

    const staleKeys = openCodeGoKeys
      .map((item, idx) => ({
        item,
        idx,
        key: getOpenCodeGoUsageCacheKey(item, idx),
      }))
      .filter(({ item }) =>
        Boolean(item.workspaceId?.trim() && item.authCookie?.trim()),
      )
      .filter(({ key }) => {
        if (openCodeGoUsageLoadingState[key]) return false;
        const entry = openCodeGoUsageState[key];
        return (
          !entry || Date.now() - entry.updatedAt > OPEN_CODE_GO_USAGE_STALE_MS
        );
      });

    if (staleKeys.length === 0) return;

    autoRefreshOpenCodeGoInFlightRef.current = true;

    const refreshBatch = async () => {
      for (let i = 0; i < staleKeys.length; i += 2) {
        const batch = staleKeys.slice(i, i + 2);
        await Promise.allSettled(
          batch.map(({ item, idx }) => refreshOpenCodeGoUsage(item, idx)),
        );
      }
      autoRefreshOpenCodeGoInFlightRef.current = false;
    };

    void refreshBatch();
  }, [
    tab,
    loading,
    openCodeGoKeys,
    openCodeGoUsageState,
    openCodeGoUsageLoadingState,
    refreshOpenCodeGoUsage,
  ]);

  useEffect(() => {
    if (!isModelAccessProvider(tab)) return;
    if (modelAccessCatalogLoaded[tab]) return;
    void loadModelAccessCatalog(tab);
  }, [loadModelAccessCatalog, modelAccessCatalogLoaded, tab]);

  const [proxyPoolEntries, setProxyPoolEntries] = useState<ProxyPoolEntry[]>(
    [],
  );

  const [usageStatsBySource, setUsageStatsBySource] = useState<
    Record<string, KeyStatBucket>
  >({});

  const [ampcode, setAmpcode] = useState<Record<string, unknown> | null>(null);
  const [ampUpstreamUrl, setAmpUpstreamUrl] = useState("");
  const [ampUpstreamApiKey, setAmpUpstreamApiKey] = useState("");
  const [ampForceMappings, setAmpForceMappings] = useState(false);
  const [ampMappings, setAmpMappings] = useState<AmpMappingEntry[]>([]);

  const [confirm, setConfirm] = useState<
    | null
    | {
        type: "deleteKey";
        keyType:
          | "gemini"
          | "claude"
          | "codex"
          | "opencode-go"
          | "cline"
          | "ollama-cloud"
          | "vertex"
          | "bedrock";
        index: number;
      }
    | { type: "deleteOpenAI"; index: number }
  >(null);
  const handledRouteRef = useRef("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<{
    kind: ProviderImportKind;
    nextItems:
      ProviderSimpleConfig[] | BedrockProviderConfig[] | OpenAIProvider[];
    diff: ProviderImportDiff;
    filename: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedExportKeys, setSelectedExportKeys] = useState<string[]>([]);

  // Clean up stale usage cache entries when config list changes
  useEffect(() => {
    setOpenCodeGoUsageState((prev) => {
      const validKeys = new Set(
        openCodeGoKeys.map((item, idx) =>
          getOpenCodeGoUsageCacheKey(item, idx),
        ),
      );
      const staleKeys = Object.keys(prev).filter((k) => !validKeys.has(k));
      if (staleKeys.length === 0) return prev;
      const next = { ...prev };
      staleKeys.forEach((k) => delete next[k]);
      setCachedData("opencode-go-usage", next);
      return next;
    });
  }, [openCodeGoKeys]);

  const loadProviderTab = useCallback(async (tabId: ProviderTab) => {
    switch (tabId) {
      case "gemini": {
        const cachedG = getCachedData<ProviderSimpleConfig[]>("gemini");
        if (cachedG) setGeminiKeys(cachedG);
        const freshG = await providersApi.getGeminiKeys();
        setGeminiKeys(freshG);
        setCachedData("gemini", freshG);
        break;
      }
      case "claude": {
        const cachedC = getCachedData<ProviderSimpleConfig[]>("claude");
        if (cachedC) setClaudeKeys(cachedC);
        const freshC = await providersApi.getClaudeConfigs();
        setClaudeKeys(freshC);
        setCachedData("claude", freshC);
        break;
      }
      case "codex": {
        const cachedX = getCachedData<ProviderSimpleConfig[]>("codex");
        if (cachedX) setCodexKeys(cachedX);
        const freshX = await providersApi.getCodexConfigs();
        setCodexKeys(freshX);
        setCachedData("codex", freshX);
        break;
      }
      case "opencode-go": {
        removeCachedData("opencode-go");
        const freshO = await providersApi.getOpenCodeGoConfigs();
        setOpenCodeGoKeys(freshO);
        break;
      }
      case "cline": {
        removeCachedData("cline");
        const freshCl = await providersApi.getClineConfigs();
        setClineKeys(freshCl);
        break;
      }
      case "ollama-cloud": {
        removeCachedData("ollama-cloud");
        const freshOl = await providersApi.getOllamaCloudConfigs();
        setOllamaCloudKeys(freshOl);
        break;
      }
      case "vertex": {
        const cachedV = getCachedData<ProviderSimpleConfig[]>("vertex");
        if (cachedV) setVertexKeys(cachedV);
        const freshV = await providersApi.getVertexConfigs();
        setVertexKeys(freshV);
        setCachedData("vertex", freshV);
        break;
      }
      case "bedrock": {
        const cachedB = getCachedData<BedrockProviderConfig[]>("bedrock");
        if (cachedB) setBedrockKeys(cachedB);
        const freshB = await providersApi.getBedrockConfigs();
        setBedrockKeys(freshB);
        setCachedData("bedrock", freshB);
        break;
      }
      case "openai": {
        const cachedA = getCachedData<OpenAIProvider[]>("openai");
        if (cachedA) setOpenaiProviders(cachedA);
        const freshA = await providersApi.getOpenAIProviders();
        setOpenaiProviders(freshA);
        setCachedData("openai", freshA);
        break;
      }
      case "ampcode": {
        const [amp, ampMap] = await Promise.all([
          ampcodeApi.getAmpcode(),
          ampcodeApi.getModelMappings(),
        ]);
        const ampObj =
          amp && typeof amp === "object" && !Array.isArray(amp)
            ? (amp as Record<string, unknown>)
            : {};
        setAmpcode(ampObj);
        setAmpUpstreamUrl(readString(ampObj, "upstreamUrl", "upstream-url"));
        setAmpForceMappings(
          readBool(ampObj, "forceModelMappings", "force-model-mappings"),
        );

        const mappings = Array.isArray(ampMap) ? ampMap : [];
        const entries: AmpMappingEntry[] = mappings
          .map((item, idx) => {
            if (!item || typeof item !== "object") return null;
            const record = item as Record<string, unknown>;
            const from = String(record.from ?? "").trim();
            const to = String(record.to ?? "").trim();
            if (!from || !to) return null;
            return { id: `map-${idx}-${from}`, from, to };
          })
          .filter(Boolean) as AmpMappingEntry[];
        setAmpMappings(
          entries.length
            ? entries
            : [{ id: `map-${Date.now()}`, from: "", to: "" }],
        );
        break;
      }
    }
  }, []);

  const refreshTab = useCallback(
    async (tabId: typeof tab) => {
      setLoading(true);
      try {
        await loadProviderTab(tabId);
      } catch (err: unknown) {
        notify({
          type: "error",
          message:
            err instanceof Error ? err.message : t("providers.load_failed"),
        });
      } finally {
        setLoading(false);
      }
    },
    [loadProviderTab, notify, t],
  );

  const loadUsage = useCallback(async () => {
    try {
      const cachedUsage =
        getCachedData<Record<string, KeyStatBucket>>("usage-stats");
      if (cachedUsage) setUsageStatsBySource(cachedUsage);
      const usage = await usageApi.getEntityStats(30, "all").catch(() => null);
      if (usage?.source) {
        const stats: Record<string, KeyStatBucket> = {};
        usage.source.forEach((pt) => {
          const src = normalizeUsageSourceId(pt.entity_name, maskApiKey);
          if (src) {
            const bucket = stats[src] ?? { success: 0, failure: 0 };
            bucket.success += pt.requests - pt.failed;
            bucket.failure += pt.failed;
            stats[src] = bucket;
          }
        });
        setUsageStatsBySource(stats);
        setCachedData("usage-stats", stats);
      }
    } catch {}
  }, []);

  const loadProxyPool = useCallback(async () => {
    try {
      setProxyPoolEntries(await proxiesApi.list());
    } catch {
      setProxyPoolEntries([]);
    }
  }, []);

  const {
    getSimpleStats,
    getSimpleStatusBar,
    getOpenAIProviderStats,
    getOpenAIKeyEntryStats,
    getOpenAIProviderStatusBar,
  } = useProviderUsageSummary({
    usageStatsBySource,
    maskApiKey,
  });

  const refreshAll = useCallback(async () => {
    setLoading(true);
    const tabsToRefresh: ProviderTab[] =
      tab === "ampcode"
        ? [...PROVIDER_LIST_TAB_VALUES, "ampcode"]
        : PROVIDER_LIST_TAB_VALUES;
    const results = await Promise.allSettled([
      ...tabsToRefresh.map((tabId) => loadProviderTab(tabId)),
      loadUsage(),
      loadProxyPool(),
    ]);
    const failed = results.find((result) => result.status === "rejected");
    if (failed) {
      notify({
        type: "error",
        message:
          failed.reason instanceof Error
            ? failed.reason.message
            : t("providers.load_failed"),
      });
    }
    setLoading(false);
  }, [loadProviderTab, loadProxyPool, loadUsage, notify, t, tab]);

  useEffect(() => {
    void refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleKeyEditorRouteClose = useCallback(() => {
    if (location.pathname !== "/ai-providers") {
      navigate("/ai-providers", { replace: true, viewTransition: true });
    }
  }, [location.pathname, navigate]);

  const handleOpenAIEditorRouteClose = useCallback(() => {
    if (location.pathname !== "/ai-providers") {
      navigate("/ai-providers", { replace: true, viewTransition: true });
    }
  }, [location.pathname, navigate]);

  const {
    editKeyOpen,
    editKeyType,
    editKeyIndex,
    editKeyTitle,
    keyDraft,
    setKeyDraft,
    keyDraftError,
    closeKeyEditor,
    openKeyEditor,
    saveKeyDraft,
    deleteKey,
    toggleKeyEnabled,
    editKeyEnabled,
    editKeyEnabledToggle,
    editKeyExcludedCount,
    editKeyHeaderCount,
    editKeyModelCount,
  } = useProviderKeyEditor({
    geminiKeys,
    claudeKeys,
    codexKeys,
    openCodeGoKeys,
    clineKeys,
    ollamaCloudKeys,
    vertexKeys,
    bedrockKeys,
    setGeminiKeys,
    setClaudeKeys,
    setCodexKeys,
    setOpenCodeGoKeys,
    setClineKeys,
    setOllamaCloudKeys,
    setVertexKeys,
    setBedrockKeys,
    refreshAll,
    startRefreshTransition: startTransition,
    afterClose: handleKeyEditorRouteClose,
  });

  const {
    editOpenAIOpen,
    editOpenAIIndex,
    openaiDraft,
    setOpenaiDraft,
    openaiDraftError,
    discoveredModels,
    discovering,
    discoverSelected,
    setDiscoverSelected,
    closeOpenAIEditor,
    openOpenAIEditor,
    saveOpenAIDraft,
    deleteOpenAIProvider,
    toggleOpenAIProviderEnabled,
    toggleOpenAIKeyEntryEnabled,
    discoverModels,
    applyDiscoveredModels,
  } = useOpenAIProviderEditor({
    openaiProviders,
    setOpenaiProviders,
    refreshAll,
    startRefreshTransition: startTransition,
    afterClose: handleOpenAIEditorRouteClose,
  });

  useEffect(() => {
    if (loading) return;
    const pathname = location.pathname;
    if (!pathname.startsWith("/ai-providers/")) {
      handledRouteRef.current = "";
      return;
    }
    if (handledRouteRef.current === pathname) return;
    handledRouteRef.current = pathname;

    const parts = pathname.split("/").filter(Boolean);
    const provider = parts[1] ?? "";
    const action = parts[2] ?? "";

    void (async () => {
      if (
        provider === "gemini" ||
        provider === "claude" ||
        provider === "codex" ||
        provider === "opencode-go" ||
        provider === "cline" ||
        provider === "ollama-cloud" ||
        provider === "vertex" ||
        provider === "bedrock"
      ) {
        setSelectedExportKeys([]);
        setTab(provider);
        await refreshTab(provider);
        if (action === "new") {
          openKeyEditor(provider, null);
          return;
        }
        const index = Number(action);
        if (Number.isFinite(index) && index >= 0) {
          openKeyEditor(provider, index);
        }
        return;
      }

      if (provider === "openai") {
        setSelectedExportKeys([]);
        setTab("openai");
        await refreshTab("openai");
        if (action === "new") {
          openOpenAIEditor(null);
          return;
        }
        const index = Number(action);
        if (Number.isFinite(index) && index >= 0) {
          openOpenAIEditor(index);
        }
        return;
      }

      if (provider === "ampcode") {
        setSelectedExportKeys([]);
        setTab("ampcode");
        await refreshTab("ampcode");
      }
    })();
  }, [loading, location.pathname, openKeyEditor, openOpenAIEditor, refreshTab]);

  const saveAmpcode = useCallback(async () => {
    try {
      const upstreamUrl = ampUpstreamUrl.trim();
      if (upstreamUrl) {
        await ampcodeApi.updateUpstreamUrl(upstreamUrl);
      } else {
        await ampcodeApi.clearUpstreamUrl();
      }

      const upstreamKey = ampUpstreamApiKey.trim();
      if (upstreamKey) {
        await ampcodeApi.updateUpstreamApiKey(upstreamKey);
      }

      await ampcodeApi.updateForceModelMappings(ampForceMappings);

      const mappings = ampMappings
        .map((m) => ({ from: m.from.trim(), to: m.to.trim() }))
        .filter((m) => m.from && m.to);
      await ampcodeApi.patchModelMappings(mappings);

      notify({ type: "success", message: t("providers.ampcode_saved") });
      startTransition(() => void refreshAll());
      setAmpUpstreamApiKey("");
    } catch (err: unknown) {
      notify({
        type: "error",
        message:
          err instanceof Error ? err.message : t("providers.save_failed"),
      });
    }
  }, [
    ampForceMappings,
    ampMappings,
    ampUpstreamApiKey,
    ampUpstreamUrl,
    notify,
    refreshAll,
    startTransition,
  ]);

  const copyText = useCallback(
    async (value: string) => {
      try {
        await navigator.clipboard.writeText(value);
        notify({ type: "success", message: t("providers.copied") });
      } catch {
        notify({ type: "error", message: t("providers.copy_failed") });
      }
    },
    [notify],
  );

  const getImportKind = useCallback((): ProviderImportKind | null => {
    if (tab === "ampcode") return null;
    return tab;
  }, [tab]);

  const getCurrentItems = useCallback(
    (kind: ProviderImportKind) => {
      switch (kind) {
        case "gemini":
          return geminiKeys;
        case "claude":
          return claudeKeys;
        case "codex":
          return codexKeys;
        case "opencode-go":
          return openCodeGoKeys;
        case "cline":
          return clineKeys;
        case "ollama-cloud":
          return ollamaCloudKeys;
        case "vertex":
          return vertexKeys;
        case "bedrock":
          return bedrockKeys;
        case "openai":
          return openaiProviders;
      }
    },
    [
      bedrockKeys,
      claudeKeys,
      clineKeys,
      codexKeys,
      geminiKeys,
      ollamaCloudKeys,
      openCodeGoKeys,
      openaiProviders,
      vertexKeys,
    ],
  );

  const currentImportKind = getImportKind();
  const isActiveTabListLoading = useCallback(
    (tabId: ProviderTab) => tab === tabId && loading,
    [loading, tab],
  );
  const currentTabItems = useMemo(
    () => (currentImportKind ? getCurrentItems(currentImportKind) : []),
    [currentImportKind, getCurrentItems],
  );
  const currentSelectableKeys = useMemo(
    () =>
      currentImportKind
        ? currentTabItems.map((item, index) =>
            getProviderSelectionKey(
              currentImportKind,
              item as
                ProviderSimpleConfig | BedrockProviderConfig | OpenAIProvider,
              index,
            ),
          )
        : [],
    [currentImportKind, currentTabItems],
  );
  const selectedExportKeySet = useMemo(
    () => new Set(selectedExportKeys),
    [selectedExportKeys],
  );
  const selectedExportCount = selectedExportKeys.length;
  const allCurrentSelected =
    currentSelectableKeys.length > 0 &&
    currentSelectableKeys.every((key) => selectedExportKeySet.has(key));

  const tabCounts = useMemo<Record<ProviderTab, number | null>>(() => {
    const ampcodeCount =
      ampcode && ampMappings.length > 0
        ? ampMappings.filter((m) => m.from.trim() && m.to.trim()).length
        : null;
    return {
      gemini: geminiKeys.length,
      claude: claudeKeys.length,
      codex: codexKeys.length,
      "opencode-go": openCodeGoKeys.length,
      cline: clineKeys.length,
      "ollama-cloud": ollamaCloudKeys.length,
      vertex: vertexKeys.length,
      bedrock: bedrockKeys.length,
      openai: openaiProviders.length,
      ampcode: ampcodeCount,
    };
  }, [
    geminiKeys,
    claudeKeys,
    clineKeys,
    codexKeys,
    openCodeGoKeys,
    ollamaCloudKeys,
    vertexKeys,
    bedrockKeys,
    openaiProviders,
    ampcode,
    ampMappings,
  ]);

  const saveImportedItems = useCallback(
    async (
      kind: ProviderImportKind,
      items:
        ProviderSimpleConfig[] | BedrockProviderConfig[] | OpenAIProvider[],
    ) => {
      switch (kind) {
        case "gemini":
          await providersApi.saveGeminiKeys(items as ProviderSimpleConfig[]);
          return;
        case "claude":
          await providersApi.saveClaudeConfigs(items as ProviderSimpleConfig[]);
          return;
        case "codex":
          await providersApi.saveCodexConfigs(items as ProviderSimpleConfig[]);
          return;
        case "opencode-go":
          await providersApi.saveOpenCodeGoConfigs(
            items as ProviderSimpleConfig[],
          );
          return;
        case "cline":
          await providersApi.saveClineConfigs(items as ProviderSimpleConfig[]);
          return;
        case "ollama-cloud":
          await providersApi.saveOllamaCloudConfigs(
            items as ProviderSimpleConfig[],
          );
          return;
        case "vertex":
          await providersApi.saveVertexConfigs(items as ProviderSimpleConfig[]);
          return;
        case "bedrock":
          await providersApi.saveBedrockConfigs(
            items as BedrockProviderConfig[],
          );
          return;
        case "openai":
          await providersApi.saveOpenAIProviders(items as OpenAIProvider[]);
          return;
      }
    },
    [],
  );

  useEffect(() => {
    if (selectedExportKeys.length === 0) return;
    const selectableKeySet = new Set(currentSelectableKeys);
    const next = selectedExportKeys.filter((key) => selectableKeySet.has(key));
    if (next.length !== selectedExportKeys.length) {
      setSelectedExportKeys(next);
    }
  }, [currentSelectableKeys, selectedExportKeys]);

  const toggleExportSelection = useCallback((key: string, checked: boolean) => {
    setSelectedExportKeys((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return Array.from(next);
    });
  }, []);

  const selectAllCurrentItems = useCallback(
    (checked: boolean) => {
      if (!checked) {
        setSelectedExportKeys([]);
        return;
      }
      setSelectedExportKeys(currentSelectableKeys);
    },
    [currentSelectableKeys],
  );

  const handleExport = useCallback(() => {
    const kind = currentImportKind;
    if (!kind) return;
    downloadTextAsFile(
      createProviderExportText(kind, getCurrentItems(kind) as never),
      `${kind}-providers.json`,
    );
  }, [currentImportKind, getCurrentItems]);

  const handleExportSelected = useCallback(() => {
    const kind = currentImportKind;
    if (!kind || selectedExportCount === 0) return;
    const selectedItems = currentTabItems.filter((item, index) =>
      selectedExportKeySet.has(
        getProviderSelectionKey(
          kind,
          item as ProviderSimpleConfig | BedrockProviderConfig | OpenAIProvider,
          index,
        ),
      ),
    );
    downloadTextAsFile(
      createProviderExportText(kind, selectedItems as never),
      `${kind}-providers-selected.json`,
    );
  }, [
    currentImportKind,
    currentTabItems,
    selectedExportCount,
    selectedExportKeySet,
  ]);

  const handleImportFile = useCallback(
    async (file: File | null) => {
      const kind = currentImportKind;
      if (!kind || !file) return;
      if (
        !file.name.toLowerCase().endsWith(".json") &&
        file.type !== "application/json"
      ) {
        notify({ type: "error", message: t("upload_error_json") });
        return;
      }

      try {
        const preview = prepareProviderImport(
          kind,
          await file.text(),
          getCurrentItems(kind) as never,
        );
        setImportPreview({
          kind,
          nextItems: preview.nextItems,
          diff: preview.diff,
          filename: file.name,
        });
      } catch (error: unknown) {
        notify({
          type: "error",
          message:
            error instanceof Error && error.message === "provider_mismatch"
              ? t("providers.import_provider_mismatch")
              : t("providers.import_invalid"),
        });
      }
    },
    [currentImportKind, getCurrentItems, notify, t],
  );

  const confirmImport = useCallback(async () => {
    if (!importPreview || !importPreview.diff.hasChanges) return;
    setImporting(true);
    try {
      await saveImportedItems(importPreview.kind, importPreview.nextItems);
      notify({
        type: "success",
        message: t("providers.import_success", {
          filename: importPreview.filename,
        }),
      });
      setImportPreview(null);
      startTransition(() => void refreshAll());
    } catch (error: unknown) {
      notify({
        type: "error",
        message:
          error instanceof Error ? error.message : t("providers.save_failed"),
      });
    } finally {
      setImporting(false);
    }
  }, [
    importPreview,
    notify,
    refreshAll,
    saveImportedItems,
    startTransition,
    t,
  ]);

  return (
    <div
      data-testid="providers-page-shell"
      className="flex h-[calc(100dvh-97px)] min-h-0 flex-col gap-6 overflow-hidden sm:h-[calc(100dvh-113px)]"
    >
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        aria-label={t("providers.import_json")}
        className="sr-only"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0] ?? null;
          void handleImportFile(file);
          event.currentTarget.value = "";
        }}
      />
      <ProvidersToolbar
        currentImportKind={currentImportKind}
        currentTabItemsCount={currentTabItems.length}
        selectedExportCount={selectedExportCount}
        allCurrentSelected={allCurrentSelected}
        loading={loading}
        onImportClick={() => importInputRef.current?.click()}
        onExport={handleExport}
        onExportSelected={handleExportSelected}
        onSelectAll={selectAllCurrentItems}
        onRefresh={() => void refreshAll()}
        onAddCurrent={
          tab === "ampcode"
            ? null
            : tab === "openai"
              ? () => openOpenAIEditor(null)
              : () => openKeyEditor(tab, null)
        }
      />

      <Tabs
        value={tab}
        onValueChange={(next) => {
          const nextTab = next as typeof tab;
          if (nextTab === tab) return;
          setSelectedExportKeys([]);
          setTab(nextTab);
          void refreshTab(nextTab);
        }}
      >
        <ProviderTabsWithCounts
          tabs={[
            { id: "gemini", label: "Gemini", count: tabCounts.gemini },
            { id: "claude", label: "Claude", count: tabCounts.claude },
            { id: "codex", label: "Codex", count: tabCounts.codex },
            {
              id: "opencode-go",
              label: "OpenCode Go",
              count: tabCounts["opencode-go"],
            },
            { id: "cline", label: "ClinePass", count: tabCounts.cline },
            {
              id: "ollama-cloud",
              label: "Ollama Cloud",
              count: tabCounts["ollama-cloud"],
            },
            { id: "vertex", label: "Vertex", count: tabCounts.vertex },
            { id: "bedrock", label: "Bedrock", count: tabCounts.bedrock },
            {
              id: "openai",
              label: t("providers.openai_compatible"),
              count: tabCounts.openai,
            },
            { id: "ampcode", label: "Ampcode", count: tabCounts.ampcode },
          ]}
          value={tab}
        />
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <TabsContent value="gemini" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              items={geminiKeys}
              loading={isActiveTabListLoading("gemini")}
              onAdd={() => openKeyEditor("gemini", null)}
              onEdit={(idx) => openKeyEditor("gemini", idx)}
              onDelete={(idx) =>
                setConfirm({ type: "deleteKey", keyType: "gemini", index: idx })
              }
              onToggleEnabled={(idx, enabled) =>
                void toggleKeyEnabled("gemini", idx, enabled)
              }
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="claude" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              items={claudeKeys}
              loading={isActiveTabListLoading("claude")}
              onAdd={() => openKeyEditor("claude", null)}
              onEdit={(idx) => openKeyEditor("claude", idx)}
              onDelete={(idx) =>
                setConfirm({ type: "deleteKey", keyType: "claude", index: idx })
              }
              onToggleEnabled={(idx, enabled) =>
                void toggleKeyEnabled("claude", idx, enabled)
              }
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="codex" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              items={codexKeys}
              loading={isActiveTabListLoading("codex")}
              onAdd={() => openKeyEditor("codex", null)}
              onEdit={(idx) => openKeyEditor("codex", idx)}
              onDelete={(idx) =>
                setConfirm({ type: "deleteKey", keyType: "codex", index: idx })
              }
              onToggleEnabled={(idx, enabled) =>
                void toggleKeyEnabled("codex", idx, enabled)
              }
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent
            value="opencode-go"
            className="min-h-0 flex flex-1 flex-col"
          >
            <ProviderKeyListCard
              items={openCodeGoKeys}
              loading={isActiveTabListLoading("opencode-go")}
              onAdd={() => openKeyEditor("opencode-go", null)}
              onEdit={(idx) => openKeyEditor("opencode-go", idx)}
              onDelete={(idx) =>
                setConfirm({
                  type: "deleteKey",
                  keyType: "opencode-go",
                  index: idx,
                })
              }
              onToggleEnabled={(idx, enabled) =>
                void toggleKeyEnabled("opencode-go", idx, enabled)
              }
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getDisplayModels={(item) =>
                getEffectiveProviderModels(
                  "opencode-go",
                  item,
                  modelAccessCatalogs["opencode-go"],
                )
              }
              showBaseUrl={false}
              naturalHeight
              showConnectionRows={false}
              showModelMetric={false}
              showExcludedModels={false}
              renderExtra={(item, idx) => {
                const queryReady = hasOpenCodeGoUsageQuery(item);
                const cacheKey = getOpenCodeGoUsageCacheKey(item, idx);
                const usageEntry = openCodeGoUsageState[cacheKey];
                return (
                  <OpenCodeGoUsageCardSection
                    queryReady={queryReady}
                    usageEntry={queryReady ? usageEntry : undefined}
                    loading={
                      queryReady
                        ? (openCodeGoUsageLoadingState[cacheKey] ?? !usageEntry)
                        : false
                    }
                  />
                );
              }}
              renderMetricsExtra={(item, idx) => {
                if (!(item.workspaceId?.trim() && item.authCookie?.trim()))
                  return null;
                const cacheKey = getOpenCodeGoUsageCacheKey(item, idx);
                const loading = openCodeGoUsageLoadingState[cacheKey] ?? false;
                const hasError = Boolean(openCodeGoUsageState[cacheKey]?.error);
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void refreshOpenCodeGoUsage(item, idx);
                    }}
                    disabled={loading}
                    className={[
                      "inline-flex h-6 w-6 items-center justify-center rounded-lg transition-all duration-150",
                      "text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/25",
                      "dark:text-white/40 dark:hover:bg-white/10 dark:hover:text-white/60 dark:focus-visible:ring-white/20",
                      loading || hasError
                        ? "opacity-100"
                        : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
                    ].join(" ")}
                    aria-label="Refresh usage"
                    title="Refresh usage"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={loading ? "animate-spin" : ""}
                    >
                      <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                      <path d="M21 3v5h-5" />
                      <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                      <path d="M3 21v-5h5" />
                    </svg>
                  </button>
                );
              }}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="cline" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              items={clineKeys}
              loading={isActiveTabListLoading("cline")}
              onAdd={() => openKeyEditor("cline", null)}
              onEdit={(idx) => openKeyEditor("cline", idx)}
              onDelete={(idx) =>
                setConfirm({ type: "deleteKey", keyType: "cline", index: idx })
              }
              onToggleEnabled={(idx, enabled) =>
                void toggleKeyEnabled("cline", idx, enabled)
              }
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getDisplayModels={(item) =>
                getEffectiveProviderModels(
                  "cline",
                  item,
                  modelAccessCatalogs.cline,
                )
              }
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              showExcludedModels={false}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent
            value="ollama-cloud"
            className="min-h-0 flex flex-1 flex-col"
          >
            <ProviderKeyListCard
              items={ollamaCloudKeys}
              loading={isActiveTabListLoading("ollama-cloud")}
              onAdd={() => openKeyEditor("ollama-cloud", null)}
              onEdit={(idx) => openKeyEditor("ollama-cloud", idx)}
              onDelete={(idx) =>
                setConfirm({
                  type: "deleteKey",
                  keyType: "ollama-cloud",
                  index: idx,
                })
              }
              onToggleEnabled={(idx, enabled) =>
                void toggleKeyEnabled("ollama-cloud", idx, enabled)
              }
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getDisplayModels={(item) =>
                getEffectiveProviderModels(
                  "ollama-cloud",
                  item,
                  modelAccessCatalogs["ollama-cloud"],
                )
              }
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              showExcludedModels={false}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="vertex" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              items={vertexKeys}
              loading={isActiveTabListLoading("vertex")}
              onAdd={() => openKeyEditor("vertex", null)}
              onEdit={(idx) => openKeyEditor("vertex", idx)}
              onDelete={(idx) =>
                setConfirm({ type: "deleteKey", keyType: "vertex", index: idx })
              }
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="bedrock" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              items={bedrockKeys}
              loading={isActiveTabListLoading("bedrock")}
              onAdd={() => openKeyEditor("bedrock", null)}
              onEdit={(idx) => openKeyEditor("bedrock", idx)}
              onDelete={(idx) =>
                setConfirm({
                  type: "deleteKey",
                  keyType: "bedrock",
                  index: idx,
                })
              }
              onToggleEnabled={(idx, enabled) =>
                void toggleKeyEnabled("bedrock", idx, enabled)
              }
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="openai" className="min-h-0 flex flex-1 flex-col">
            <OpenAIProvidersTab
              providers={openaiProviders}
              loading={isActiveTabListLoading("openai")}
              openOpenAIEditor={openOpenAIEditor}
              confirmDelete={(index) =>
                setConfirm({ type: "deleteOpenAI", index })
              }
              maskApiKey={maskApiKey}
              getKeyEntryStats={getOpenAIKeyEntryStats}
              getProviderStats={getOpenAIProviderStats}
              getProviderStatusBar={getOpenAIProviderStatusBar}
              onToggleProviderEnabled={(providerIndex, enabled) =>
                void toggleOpenAIProviderEnabled(providerIndex, enabled)
              }
              onToggleKeyEntryEnabled={(providerIndex, entryIndex, enabled) =>
                void toggleOpenAIKeyEntryEnabled(
                  providerIndex,
                  entryIndex,
                  enabled,
                )
              }
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="ampcode" className="min-h-0 flex flex-1 flex-col">
            <AmpcodePanel
              loading={loading}
              isPending={isPending}
              saveAmpcode={saveAmpcode}
              ampcode={ampcode}
              ampMappings={ampMappings}
              ampUpstreamUrl={ampUpstreamUrl}
              setAmpUpstreamUrl={setAmpUpstreamUrl}
              ampUpstreamApiKey={ampUpstreamApiKey}
              setAmpUpstreamApiKey={setAmpUpstreamApiKey}
              ampForceMappings={ampForceMappings}
              setAmpForceMappings={setAmpForceMappings}
              setAmpMappings={setAmpMappings}
            />
          </TabsContent>
        </div>
      </Tabs>

      <ProviderKeyModal
        open={editKeyOpen}
        editKeyIndex={editKeyIndex}
        editKeyTitle={editKeyTitle}
        editKeyType={editKeyType}
        keyDraft={keyDraft}
        setKeyDraft={setKeyDraft}
        keyDraftError={keyDraftError}
        closeKeyEditor={closeKeyEditor}
        saveKeyDraft={saveKeyDraft}
        editKeyEnabled={editKeyEnabled}
        editKeyEnabledToggle={editKeyEnabledToggle}
        editKeyHeaderCount={editKeyHeaderCount}
        editKeyModelCount={editKeyModelCount}
        editKeyExcludedCount={editKeyExcludedCount}
        proxyPoolEntries={proxyPoolEntries}
        copyText={copyText}
        maskApiKey={maskApiKey}
      />

      <OpenAIProviderModal
        open={editOpenAIOpen}
        editOpenAIIndex={editOpenAIIndex}
        openaiDraft={openaiDraft}
        setOpenaiDraft={setOpenaiDraft}
        openaiDraftError={openaiDraftError}
        closeOpenAIEditor={closeOpenAIEditor}
        saveOpenAIDraft={saveOpenAIDraft}
        discovering={discovering}
        discoverModels={discoverModels}
        applyDiscoveredModels={applyDiscoveredModels}
        discoveredModels={discoveredModels}
        discoverSelected={discoverSelected}
        setDiscoverSelected={setDiscoverSelected}
        proxyPoolEntries={proxyPoolEntries}
        copyText={copyText}
        maskApiKey={maskApiKey}
      />

      <ConfirmModal
        open={confirm !== null}
        title={t("providers.confirm_delete")}
        description={
          confirm?.type === "deleteOpenAI"
            ? t("providers.confirm_delete_openai", {
                name: openaiProviders[confirm.index]?.name ?? "",
              })
            : confirm?.type === "deleteKey"
              ? t("providers.confirm_delete_config")
              : t("providers.confirm_delete_generic")
        }
        confirmText={t("providers.delete")}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          const action = confirm;
          setConfirm(null);
          if (!action) return;
          if (action.type === "deleteOpenAI") {
            void deleteOpenAIProvider(action.index);
            return;
          }
          void deleteKey(action.keyType, action.index);
        }}
      />

      <Modal
        open={importPreview !== null}
        title={t("providers.import_preview_title")}
        description={
          importPreview
            ? t("providers.import_preview_desc", {
                filename: importPreview.filename,
              })
            : undefined
        }
        maxWidth="max-w-2xl"
        onClose={() => {
          if (importing) return;
          setImportPreview(null);
        }}
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setImportPreview(null)}
              disabled={importing}
            >
              {t("common.cancel")}
            </Button>
            <Button
              variant="primary"
              onClick={() => void confirmImport()}
              disabled={!importPreview?.diff.hasChanges || importing}
            >
              {t("providers.confirm_import")}
            </Button>
          </>
        }
      >
        {importPreview ? (
          <div className="space-y-4 text-sm text-slate-700 dark:text-white/75">
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div>
                  {t("providers.diff_added", {
                    count: importPreview.diff.added,
                  })}
                </div>
                <div>
                  {t("providers.diff_updated", {
                    count: importPreview.diff.changed,
                  })}
                </div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div>
                  {t("providers.diff_removed", {
                    count: importPreview.diff.removed,
                  })}
                </div>
                <div>
                  {t("providers.diff_duplicates_cleaned", {
                    count: importPreview.diff.duplicateEntriesRemoved,
                  })}
                </div>
              </div>
            </div>

            {!importPreview.diff.hasChanges ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
                {t("providers.import_no_changes")}
              </div>
            ) : null}

            {importPreview.diff.addedLabels.length ? (
              <div>
                <p className="font-semibold">
                  {t("providers.diff_added_label")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {importPreview.diff.addedLabels.map((label) => (
                    <span
                      key={`added-${label}`}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {importPreview.diff.changedLabels.length ? (
              <div>
                <p className="font-semibold">
                  {t("providers.diff_updated_label")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {importPreview.diff.changedLabels.map((label) => (
                    <span
                      key={`changed-${label}`}
                      className="rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-100"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {importPreview.diff.removedLabels.length ? (
              <div>
                <p className="font-semibold">
                  {t("providers.diff_removed_label")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {importPreview.diff.removedLabels.map((label) => (
                    <span
                      key={`removed-${label}`}
                      className="rounded-full border border-rose-200 bg-rose-50 px-2 py-1 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-100"
                    >
                      {label}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
