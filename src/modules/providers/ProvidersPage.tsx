import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Cloud, Download, LayoutGrid, RefreshCw, Upload } from "lucide-react";
import iconGemini from "@/assets/icons/gemini.svg";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconVertex from "@/assets/icons/vertex.svg";
import iconAmp from "@/assets/icons/amp.svg";
import iconOpenai from "@/assets/icons/openai.svg";
import iconOpenCodeDark from "@/assets/icons/opencode-dark.svg";
import iconOpenCodeLight from "@/assets/icons/opencode-light.svg";
import { ampcodeApi, providersApi, usageApi } from "@/lib/http/apis";
import { apiKeyEntriesApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { channelGroupsApi, type ChannelGroupItem } from "@/lib/http/apis/channel-groups";
import { proxiesApi, type ProxyPoolEntry } from "@/lib/http/apis/proxies";
import type { BedrockProviderConfig, OpenAIProvider, ProviderSimpleConfig } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Modal } from "@/modules/ui/Modal";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { downloadTextAsFile } from "@/modules/auth-files/helpers/authFilesPageUtils";
import { AmpcodePanel } from "@/modules/providers/components/AmpcodePanel";
import { OpenAIProviderModal } from "@/modules/providers/components/OpenAIProviderModal";
import { OpenAIProvidersTab } from "@/modules/providers/components/OpenAIProvidersTab";
import { ProviderKeyModal } from "@/modules/providers/components/ProviderKeyModal";
import { useOpenAIProviderEditor } from "@/modules/providers/hooks/useOpenAIProviderEditor";
import { ProviderKeyListCard } from "@/modules/providers/ProviderKeyListCard";
import { useProviderKeyEditor } from "@/modules/providers/hooks/useProviderKeyEditor";
import { useProviderLatency } from "@/modules/providers/hooks/useProviderLatency";
import { useProviderUsageSummary } from "@/modules/providers/hooks/useProviderUsageSummary";
import { normalizeUsageSourceId, type KeyStatBucket } from "@/modules/providers/provider-usage";
import {
  maskApiKey,
  readBool,
  readString,
  type AmpMappingEntry,
} from "@/modules/providers/providers-helpers";
import {
  createProviderExportText,
  prepareProviderImport,
  type ProviderImportDiff,
  type ProviderImportKind,
} from "@/modules/providers/provider-import-export";
import { summarizeProviderAccess } from "@/modules/providers/provider-access";

type ProviderTab =
  | "gemini"
  | "claude"
  | "codex"
  | "opencode-go"
  | "vertex"
  | "bedrock"
  | "openai"
  | "ampcode";

const PROVIDER_TAB_STORAGE_KEY = "providers-page:tab";
const PROVIDER_TAB_VALUES: ProviderTab[] = [
  "gemini",
  "claude",
  "codex",
  "opencode-go",
  "vertex",
  "bedrock",
  "openai",
  "ampcode",
];

function readSavedProviderTab(): ProviderTab {
  try {
    const saved = localStorage.getItem(PROVIDER_TAB_STORAGE_KEY);
    if (saved && PROVIDER_TAB_VALUES.includes(saved as ProviderTab)) return saved as ProviderTab;
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

const GRID_COLUMNS_STORAGE_KEY = "providers-page:gridColumns";

function readSavedGridColumns(): number {
  try {
    const saved = localStorage.getItem(GRID_COLUMNS_STORAGE_KEY);
    if (saved) {
      const num = Number(saved);
      if (num >= 1 && num <= 4) return num;
    }
  } catch {
    // ignore
  }
  return 2;
}

function saveGridColumns(cols: number): void {
  try {
    localStorage.setItem(GRID_COLUMNS_STORAGE_KEY, String(cols));
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

  const [gridColumns, setGridColumnsState] = useState(readSavedGridColumns);
  const setGridColumns = useCallback((cols: number) => {
    setGridColumnsState(cols);
    saveGridColumns(cols);
  }, []);

  const [geminiKeys, setGeminiKeys] = useState<ProviderSimpleConfig[]>([]);
  const [claudeKeys, setClaudeKeys] = useState<ProviderSimpleConfig[]>([]);
  const [codexKeys, setCodexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [openCodeGoKeys, setOpenCodeGoKeys] = useState<ProviderSimpleConfig[]>([]);
  const [vertexKeys, setVertexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [bedrockKeys, setBedrockKeys] = useState<BedrockProviderConfig[]>([]);
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProvider[]>([]);
  const [apiKeyEntries, setApiKeyEntries] = useState<ApiKeyEntry[]>([]);
  const [channelGroups, setChannelGroups] = useState<ChannelGroupItem[]>([]);
  const [proxyPoolEntries, setProxyPoolEntries] = useState<ProxyPoolEntry[]>([]);

  const [usageStatsBySource, setUsageStatsBySource] = useState<Record<string, KeyStatBucket>>({});

  const [ampcode, setAmpcode] = useState<Record<string, unknown> | null>(null);
  const [ampUpstreamUrl, setAmpUpstreamUrl] = useState("");
  const [ampUpstreamApiKey, setAmpUpstreamApiKey] = useState("");
  const [ampForceMappings, setAmpForceMappings] = useState(false);
  const [ampMappings, setAmpMappings] = useState<AmpMappingEntry[]>([]);

  const [confirm, setConfirm] = useState<
    | null
    | {
        type: "deleteKey";
        keyType: "gemini" | "claude" | "codex" | "opencode-go" | "vertex" | "bedrock";
        index: number;
      }
    | { type: "deleteOpenAI"; index: number }
  >(null);
  const handledRouteRef = useRef("");
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [importPreview, setImportPreview] = useState<{
    kind: ProviderImportKind;
    nextItems: ProviderSimpleConfig[] | BedrockProviderConfig[] | OpenAIProvider[];
    diff: ProviderImportDiff;
    filename: string;
  } | null>(null);
  const [importing, setImporting] = useState(false);
  const [selectedExportKeys, setSelectedExportKeys] = useState<string[]>([]);
  const refreshTab = useCallback(
    async (tabId: typeof tab) => {
      setLoading(true);
      try {
        switch (tabId) {
          case "gemini":
            setGeminiKeys(await providersApi.getGeminiKeys());
            break;
          case "claude":
            setClaudeKeys(await providersApi.getClaudeConfigs());
            break;
          case "codex":
            setCodexKeys(await providersApi.getCodexConfigs());
            break;
          case "opencode-go":
            setOpenCodeGoKeys(await providersApi.getOpenCodeGoConfigs());
            break;
          case "vertex":
            setVertexKeys(await providersApi.getVertexConfigs());
            break;
          case "bedrock":
            setBedrockKeys(await providersApi.getBedrockConfigs());
            break;
          case "openai":
            setOpenaiProviders(await providersApi.getOpenAIProviders());
            break;
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
            setAmpForceMappings(readBool(ampObj, "forceModelMappings", "force-model-mappings"));

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
              entries.length ? entries : [{ id: `map-${Date.now()}`, from: "", to: "" }],
            );
            break;
          }
        }
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("providers.load_failed"),
        });
      } finally {
        setLoading(false);
      }
    },
    [notify],
  );

  const loadUsage = useCallback(async () => {
    try {
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
      }
    } catch {}
  }, []);

  const loadAccessSnapshot = useCallback(async () => {
    try {
      const [entries, groups] = await Promise.all([
        apiKeyEntriesApi.list(),
        channelGroupsApi.list(),
      ]);
      setApiKeyEntries(entries);
      setChannelGroups(groups);
    } catch {
      setApiKeyEntries([]);
      setChannelGroups([]);
    }
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
    await Promise.all([refreshTab(tab), loadUsage(), loadAccessSnapshot(), loadProxyPool()]);
  }, [loadAccessSnapshot, loadProxyPool, loadUsage, refreshTab, tab]);

  useEffect(() => {
    void refreshTab(tab);
    void loadUsage();
    void loadAccessSnapshot();
    void loadProxyPool();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getProviderAccessSummary = useCallback(
    (item: ProviderSimpleConfig) => {
      const channelName = String(item.name ?? "").trim();
      if (!channelName) {
        return null;
      }
      return summarizeProviderAccess(channelName, apiKeyEntries, channelGroups);
    },
    [apiKeyEntries, channelGroups],
  );

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
    vertexKeys,
    bedrockKeys,
    setGeminiKeys,
    setClaudeKeys,
    setCodexKeys,
    setOpenCodeGoKeys,
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
        message: err instanceof Error ? err.message : t("providers.save_failed"),
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
        case "vertex":
          return vertexKeys;
        case "bedrock":
          return bedrockKeys;
        case "openai":
          return openaiProviders;
      }
    },
    [bedrockKeys, claudeKeys, codexKeys, geminiKeys, openCodeGoKeys, openaiProviders, vertexKeys],
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
              item as ProviderSimpleConfig | BedrockProviderConfig | OpenAIProvider,
              index,
            ),
          )
        : [],
    [currentImportKind, currentTabItems],
  );
  const selectedExportKeySet = useMemo(() => new Set(selectedExportKeys), [selectedExportKeys]);
  const selectedExportCount = selectedExportKeys.length;
  const allCurrentSelected =
    currentSelectableKeys.length > 0 &&
    currentSelectableKeys.every((key) => selectedExportKeySet.has(key));

  const saveImportedItems = useCallback(
    async (
      kind: ProviderImportKind,
      items: ProviderSimpleConfig[] | BedrockProviderConfig[] | OpenAIProvider[],
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
          await providersApi.saveOpenCodeGoConfigs(items as ProviderSimpleConfig[]);
          return;
        case "vertex":
          await providersApi.saveVertexConfigs(items as ProviderSimpleConfig[]);
          return;
        case "bedrock":
          await providersApi.saveBedrockConfigs(items as BedrockProviderConfig[]);
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
  }, [currentImportKind, currentTabItems, selectedExportCount, selectedExportKeySet]);

  const handleImportFile = useCallback(
    async (file: File | null) => {
      const kind = currentImportKind;
      if (!kind || !file) return;
      if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") {
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
        message: t("providers.import_success", { filename: importPreview.filename }),
      });
      setImportPreview(null);
      startTransition(() => void refreshAll());
    } catch (error: unknown) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("providers.save_failed"),
      });
    } finally {
      setImporting(false);
    }
  }, [importPreview, notify, refreshAll, saveImportedItems, startTransition, t]);

  return (
    <div
      data-testid="providers-page-shell"
      className="flex h-[calc(100dvh-97px)] min-h-0 flex-col gap-6 overflow-hidden sm:h-[calc(100dvh-113px)]"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {t("providers.config_overview")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-white/55">
            {t("providers.config_overview_desc")}
          </p>
        </div>
      </div>

      <div
        data-testid="providers-batch-actions"
        className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-slate-50/80 px-2 py-1.5 transition-colors duration-200 ease-out dark:bg-white/3"
      >
        {currentImportKind ? (
          <>
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
            <Button
              variant="secondary"
              size="sm"
              className="h-8! px-2 text-xs"
              onClick={() => importInputRef.current?.click()}
            >
              <Upload size={14} />
              {t("providers.import_json")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8! px-2 text-xs"
              onClick={handleExport}
              disabled={currentTabItems.length === 0}
            >
              <Download size={14} />
              {t("providers.export_json")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8! px-2 text-xs"
              onClick={() => selectAllCurrentItems(!allCurrentSelected)}
              disabled={currentSelectableKeys.length === 0}
            >
              {allCurrentSelected
                ? t("providers.batch_deselect_all")
                : t("providers.batch_select_all")}
            </Button>
            <span className="ml-1 text-xs font-medium text-slate-600 dark:text-white/65">
              {t("providers.batch_selected", { count: selectedExportCount })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-8! px-2 text-xs"
              onClick={() => setSelectedExportKeys([])}
              disabled={selectedExportCount === 0}
            >
              {t("providers.batch_clear")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8! px-2 text-xs"
              onClick={handleExportSelected}
              disabled={selectedExportCount === 0}
            >
              {t("providers.export_selected_json")}
            </Button>
          </>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          className="h-8! px-2 text-xs"
          onClick={() => void refreshTab(tab)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("providers.refresh")}
        </Button>
        <div className="ml-auto flex items-center gap-1.5">
          <LayoutGrid size={14} className="text-slate-500 dark:text-white/50" />
          <Select
            value={String(gridColumns)}
            onChange={(v) => setGridColumns(Number(v))}
            options={[
              { value: "1", label: t("providers.grid_cols_1") },
              { value: "2", label: t("providers.grid_cols_2") },
              { value: "3", label: t("providers.grid_cols_3") },
              { value: "4", label: t("providers.grid_cols_4") },
            ]}
            size="sm"
            aria-label={t("providers.grid_columns_aria")}
          />
        </div>
      </div>

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
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="flex shrink-0">
            <TabsList>
              <TabsTrigger value="gemini">
                <img src={iconGemini} alt="" className="size-4" />
                Gemini
              </TabsTrigger>
              <TabsTrigger value="claude">
                <img src={iconClaude} alt="" className="size-4" />
                Claude
              </TabsTrigger>
              <TabsTrigger value="codex">
                <img src={iconCodex} alt="" className="size-4 dark:hidden" />
                <img src={iconCodex} alt="" className="hidden size-4 dark:block" />
                Codex
              </TabsTrigger>
              <TabsTrigger value="opencode-go">
                <img src={iconOpenCodeLight} alt="" className="size-4 dark:hidden" />
                <img src={iconOpenCodeDark} alt="" className="hidden size-4 dark:block" />
                OpenCode Go
              </TabsTrigger>
              <TabsTrigger value="vertex">
                <img src={iconVertex} alt="" className="size-4" />
                Vertex
              </TabsTrigger>
              <TabsTrigger value="bedrock">
                <Cloud size={16} />
                Bedrock
              </TabsTrigger>
              <TabsTrigger value="openai">
                <img src={iconOpenai} alt="" className="size-4 dark:hidden" />
                <img src={iconOpenai} alt="" className="hidden size-4 dark:block" />
                {t("providers.openai_compatible")}
              </TabsTrigger>
              <TabsTrigger value="ampcode">
                <img src={iconAmp} alt="" className="size-4" />
                Ampcode
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="gemini" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              title={t("providers.gemini_keys")}
              description={t("providers.openai_desc")}
              items={geminiKeys}
              loading={isActiveTabListLoading("gemini")}
              onAdd={() => openKeyEditor("gemini", null)}
              onEdit={(idx) => openKeyEditor("gemini", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "gemini", index: idx })}
              onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("gemini", idx, enabled)}
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getAccessSummary={getProviderAccessSummary}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              gridColumns={gridColumns}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="claude" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              title={t("providers.claude_keys")}
              description={t("providers.codex_desc")}
              items={claudeKeys}
              loading={isActiveTabListLoading("claude")}
              onAdd={() => openKeyEditor("claude", null)}
              onEdit={(idx) => openKeyEditor("claude", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "claude", index: idx })}
              onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("claude", idx, enabled)}
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getAccessSummary={getProviderAccessSummary}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              gridColumns={gridColumns}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="codex" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              title={t("providers.codex_keys")}
              description={t("providers.gemini_desc")}
              items={codexKeys}
              loading={isActiveTabListLoading("codex")}
              onAdd={() => openKeyEditor("codex", null)}
              onEdit={(idx) => openKeyEditor("codex", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "codex", index: idx })}
              onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("codex", idx, enabled)}
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getAccessSummary={getProviderAccessSummary}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              gridColumns={gridColumns}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="opencode-go" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              title={t("providers.opencode_go_keys")}
              description={t("providers.opencode_go_desc")}
              items={openCodeGoKeys}
              loading={isActiveTabListLoading("opencode-go")}
              onAdd={() => openKeyEditor("opencode-go", null)}
              onEdit={(idx) => openKeyEditor("opencode-go", idx)}
              onDelete={(idx) =>
                setConfirm({ type: "deleteKey", keyType: "opencode-go", index: idx })
              }
              onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("opencode-go", idx, enabled)}
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getAccessSummary={getProviderAccessSummary}
              showBaseUrl={false}
              gridColumns={gridColumns}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="vertex" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              title={t("providers.vertex_keys")}
              description={t("providers.vertex_desc")}
              items={vertexKeys}
              loading={isActiveTabListLoading("vertex")}
              onAdd={() => openKeyEditor("vertex", null)}
              onEdit={(idx) => openKeyEditor("vertex", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "vertex", index: idx })}
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getAccessSummary={getProviderAccessSummary}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              gridColumns={gridColumns}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="bedrock" className="min-h-0 flex flex-1 flex-col">
            <ProviderKeyListCard
              title={t("providers.bedrock_keys")}
              description={t("providers.bedrock_desc")}
              items={bedrockKeys}
              loading={isActiveTabListLoading("bedrock")}
              onAdd={() => openKeyEditor("bedrock", null)}
              onEdit={(idx) => openKeyEditor("bedrock", idx)}
              onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "bedrock", index: idx })}
              onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("bedrock", idx, enabled)}
              getStats={getSimpleStats}
              getStatusBar={getSimpleStatusBar}
              getAccessSummary={getProviderAccessSummary}
              getLatencyEntry={getLatencyEntry}
              checkLatency={checkLatency}
              gridColumns={gridColumns}
              selectedKeys={selectedExportKeySet}
              onToggleSelected={toggleExportSelection}
            />
          </TabsContent>

          <TabsContent value="openai" className="min-h-0 flex flex-1 flex-col">
            <OpenAIProvidersTab
              providers={openaiProviders}
              loading={isActiveTabListLoading("openai")}
              openOpenAIEditor={openOpenAIEditor}
              confirmDelete={(index) => setConfirm({ type: "deleteOpenAI", index })}
              maskApiKey={maskApiKey}
              getKeyEntryStats={getOpenAIKeyEntryStats}
              getProviderStats={getOpenAIProviderStats}
              getProviderStatusBar={getOpenAIProviderStatusBar}
              onToggleProviderEnabled={(providerIndex, enabled) =>
                void toggleOpenAIProviderEnabled(providerIndex, enabled)
              }
              onToggleKeyEntryEnabled={(providerIndex, entryIndex, enabled) =>
                void toggleOpenAIKeyEntryEnabled(providerIndex, entryIndex, enabled)
              }
              gridColumns={gridColumns}
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
            ? t("providers.import_preview_desc", { filename: importPreview.filename })
            : undefined
        }
        maxWidth="max-w-2xl"
        onClose={() => {
          if (importing) return;
          setImportPreview(null);
        }}
        footer={
          <>
            <Button variant="secondary" onClick={() => setImportPreview(null)} disabled={importing}>
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
                <div>{t("providers.diff_added", { count: importPreview.diff.added })}</div>
                <div>{t("providers.diff_updated", { count: importPreview.diff.changed })}</div>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
                <div>{t("providers.diff_removed", { count: importPreview.diff.removed })}</div>
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
                <p className="font-semibold">{t("providers.diff_added_label")}</p>
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
                <p className="font-semibold">{t("providers.diff_updated_label")}</p>
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
                <p className="font-semibold">{t("providers.diff_removed_label")}</p>
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
