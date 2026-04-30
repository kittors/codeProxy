import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Cloud, Database, FileKey, Globe, RefreshCw } from "lucide-react";
import iconGemini from "@/assets/icons/gemini.svg";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconVertex from "@/assets/icons/vertex.svg";
import iconAmp from "@/assets/icons/amp.svg";
import iconOpenai from "@/assets/icons/openai.svg";
import { ampcodeApi, providersApi, usageApi } from "@/lib/http/apis";
import { apiKeyEntriesApi, type ApiKeyEntry } from "@/lib/http/apis/api-keys";
import { channelGroupsApi, type ChannelGroupItem } from "@/lib/http/apis/channel-groups";
import { proxiesApi, type ProxyPoolEntry } from "@/lib/http/apis/proxies";
import type { BedrockProviderConfig, OpenAIProvider, ProviderSimpleConfig } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
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
import { summarizeProviderAccess } from "@/modules/providers/provider-access";

export function ProvidersPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();
  const location = useLocation();
  const navigate = useNavigate();
  const { getEntry: getLatencyEntry, checkLatency } = useProviderLatency();

  const [tab, setTab] = useState<
    "gemini" | "claude" | "codex" | "vertex" | "bedrock" | "openai" | "ampcode"
  >("gemini");
  const [loading, setLoading] = useState(true);

  const [geminiKeys, setGeminiKeys] = useState<ProviderSimpleConfig[]>([]);
  const [claudeKeys, setClaudeKeys] = useState<ProviderSimpleConfig[]>([]);
  const [codexKeys, setCodexKeys] = useState<ProviderSimpleConfig[]>([]);
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
        keyType: "gemini" | "claude" | "codex" | "vertex" | "bedrock";
        index: number;
      }
    | { type: "deleteOpenAI"; index: number }
  >(null);
  const handledRouteRef = useRef("");

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
    vertexKeys,
    bedrockKeys,
    setGeminiKeys,
    setClaudeKeys,
    setCodexKeys,
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
        provider === "vertex" ||
        provider === "bedrock"
      ) {
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">
            {t("providers.config_overview")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-white/55">
            {t("providers.config_overview_desc")}
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refreshTab(tab)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("providers.refresh")}
        </Button>
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => {
          const nextTab = next as typeof tab;
          setTab(nextTab);
          void refreshTab(nextTab);
        }}
      >
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

        <TabsContent value="gemini" className="mt-6">
          <ProviderKeyListCard
            icon={Globe}
            title={t("providers.gemini_keys")}
            description={t("providers.openai_desc")}
            items={geminiKeys}
            onAdd={() => openKeyEditor("gemini", null)}
            onEdit={(idx) => openKeyEditor("gemini", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "gemini", index: idx })}
            onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("gemini", idx, enabled)}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
            getAccessSummary={getProviderAccessSummary}
            getLatencyEntry={getLatencyEntry}
            checkLatency={checkLatency}
          />
        </TabsContent>

        <TabsContent value="claude" className="mt-6">
          <ProviderKeyListCard
            icon={Bot}
            title={t("providers.claude_keys")}
            description={t("providers.codex_desc")}
            items={claudeKeys}
            onAdd={() => openKeyEditor("claude", null)}
            onEdit={(idx) => openKeyEditor("claude", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "claude", index: idx })}
            onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("claude", idx, enabled)}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
            getAccessSummary={getProviderAccessSummary}
            getLatencyEntry={getLatencyEntry}
            checkLatency={checkLatency}
          />
        </TabsContent>

        <TabsContent value="codex" className="mt-6">
          <ProviderKeyListCard
            icon={FileKey}
            title={t("providers.codex_keys")}
            description={t("providers.gemini_desc")}
            items={codexKeys}
            onAdd={() => openKeyEditor("codex", null)}
            onEdit={(idx) => openKeyEditor("codex", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "codex", index: idx })}
            onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("codex", idx, enabled)}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
            getAccessSummary={getProviderAccessSummary}
            getLatencyEntry={getLatencyEntry}
            checkLatency={checkLatency}
          />
        </TabsContent>

        <TabsContent value="vertex" className="mt-6">
          <ProviderKeyListCard
            icon={Database}
            title={t("providers.vertex_keys")}
            description={t("providers.vertex_desc")}
            items={vertexKeys}
            onAdd={() => openKeyEditor("vertex", null)}
            onEdit={(idx) => openKeyEditor("vertex", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "vertex", index: idx })}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
            getAccessSummary={getProviderAccessSummary}
            getLatencyEntry={getLatencyEntry}
            checkLatency={checkLatency}
          />
        </TabsContent>

        <TabsContent value="bedrock" className="mt-6">
          <ProviderKeyListCard
            icon={Cloud}
            title={t("providers.bedrock_keys")}
            description={t("providers.bedrock_desc")}
            items={bedrockKeys}
            onAdd={() => openKeyEditor("bedrock", null)}
            onEdit={(idx) => openKeyEditor("bedrock", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "bedrock", index: idx })}
            onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("bedrock", idx, enabled)}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
            getAccessSummary={getProviderAccessSummary}
            getLatencyEntry={getLatencyEntry}
            checkLatency={checkLatency}
          />
        </TabsContent>

        <TabsContent value="openai" className="mt-6">
          <OpenAIProvidersTab
            providers={openaiProviders}
            openOpenAIEditor={openOpenAIEditor}
            confirmDelete={(index) => setConfirm({ type: "deleteOpenAI", index })}
            maskApiKey={maskApiKey}
            getKeyEntryStats={getOpenAIKeyEntryStats}
            getProviderStats={getOpenAIProviderStats}
            getProviderStatusBar={getOpenAIProviderStatusBar}
          />
        </TabsContent>

        <TabsContent value="ampcode" className="mt-6">
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
    </div>
  );
}
