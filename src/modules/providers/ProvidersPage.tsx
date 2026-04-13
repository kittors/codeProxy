import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { Bot, Database, FileKey, Globe, RefreshCw } from "lucide-react";

// Vendor SVG icons
import iconGemini from "@/assets/icons/gemini.svg";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconVertex from "@/assets/icons/vertex.svg";
import iconAmp from "@/assets/icons/amp.svg";
import iconOpenai from "@/assets/icons/openai.svg";
import {
  ampcodeApi,
  apiCallApi,
  getApiCallErrorMessage,
  providersApi,
  usageApi,
} from "@/lib/http/apis";
import type { ApiCallResult, OpenAIProvider, ProviderSimpleConfig } from "@/lib/http/types";
import { Button } from "@/modules/ui/Button";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { useToast } from "@/modules/ui/ToastProvider";
import { AmpcodePanel } from "@/modules/providers/components/AmpcodePanel";
import { OpenAIProviderModal } from "@/modules/providers/components/OpenAIProviderModal";
import { OpenAIProvidersTab } from "@/modules/providers/components/OpenAIProvidersTab";
import { ProviderKeyModal } from "@/modules/providers/components/ProviderKeyModal";
import { keyValueEntriesToRecord } from "@/modules/providers/KeyValueInputList";
import { createEmptyModelEntry } from "@/modules/providers/ModelInputList";
import { ProviderKeyListCard } from "@/modules/providers/ProviderKeyListCard";
import { useProviderLatency } from "@/modules/providers/hooks/useProviderLatency";
import {
  buildCandidateUsageSourceIds,
  normalizeUsageSourceId,
  type KeyStatBucket,
} from "@/modules/providers/provider-usage";
import {
  buildModelsEndpoint,
  buildOpenAIDraft,
  buildProviderKeyDraft,
  commitModelEntries,
  hasDisableAllModelsRule,
  maskApiKey,
  normalizeDiscoveredModels,
  excludedModelsFromText,
  readBool,
  readString,
  stripDisableAllModelsRule,
  sumStatsByCandidates,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
  type AmpMappingEntry,
  type OpenAIDraft,
  type ProviderKeyDraft,
} from "@/modules/providers/providers-helpers";

export function ProvidersPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();
  const location = useLocation();
  const navigate = useNavigate();
  const { getEntry: getLatencyEntry, checkLatency } = useProviderLatency();

  const [tab, setTab] = useState<"gemini" | "claude" | "codex" | "vertex" | "openai" | "ampcode">(
    "gemini",
  );
  const [loading, setLoading] = useState(true);

  const [geminiKeys, setGeminiKeys] = useState<ProviderSimpleConfig[]>([]);
  const [claudeKeys, setClaudeKeys] = useState<ProviderSimpleConfig[]>([]);
  const [codexKeys, setCodexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [vertexKeys, setVertexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProvider[]>([]);

  const [usageStatsBySource, setUsageStatsBySource] = useState<Record<string, KeyStatBucket>>({});

  const [ampcode, setAmpcode] = useState<Record<string, unknown> | null>(null);
  const [ampUpstreamUrl, setAmpUpstreamUrl] = useState("");
  const [ampUpstreamApiKey, setAmpUpstreamApiKey] = useState("");
  const [ampForceMappings, setAmpForceMappings] = useState(false);
  const [ampMappings, setAmpMappings] = useState<AmpMappingEntry[]>([]);

  const [editKeyOpen, setEditKeyOpen] = useState(false);
  const [editKeyType, setEditKeyType] = useState<"gemini" | "claude" | "codex" | "vertex">(
    "gemini",
  );
  const [editKeyIndex, setEditKeyIndex] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState<ProviderKeyDraft>(() => buildProviderKeyDraft(null));
  const [keyDraftError, setKeyDraftError] = useState<string | null>(null);

  const [editOpenAIOpen, setEditOpenAIOpen] = useState(false);
  const [editOpenAIIndex, setEditOpenAIIndex] = useState<number | null>(null);
  const [openaiDraft, setOpenaiDraft] = useState<OpenAIDraft>(() => buildOpenAIDraft(null));
  const [openaiDraftError, setOpenaiDraftError] = useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<{ id: string; owned_by?: string }[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverSelected, setDiscoverSelected] = useState<Set<string>>(new Set());

  const [confirm, setConfirm] = useState<
    | null
    | { type: "deleteKey"; keyType: "gemini" | "claude" | "codex" | "vertex"; index: number }
    | { type: "deleteOpenAI"; index: number }
  >(null);

  const editKeyTitle =
    editKeyType === "gemini"
      ? "Gemini"
      : editKeyType === "claude"
        ? "Claude"
        : editKeyType === "codex"
          ? "Codex"
          : "Vertex";

  // 按 Tab 加载数据，切换 Tab 时只请求当前 Tab 的数据
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
    } catch {
      // usage加载Failed不影响主要功能
    }
  }, []);

  // refreshAll 保留作为兼容入口（Save后刷新当前 Tab）
  const refreshAll = useCallback(async () => {
    await refreshTab(tab);
  }, [refreshTab, tab]);

  useEffect(() => {
    void refreshTab(tab);
    void loadUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeKeyEditor = useCallback(() => {
    setEditKeyOpen(false);
    if (location.pathname !== "/ai-providers") {
      navigate("/ai-providers", { replace: true, viewTransition: true });
    }
  }, [location.pathname, navigate]);

  const closeOpenAIEditor = useCallback(() => {
    setEditOpenAIOpen(false);
    if (location.pathname !== "/ai-providers") {
      navigate("/ai-providers", { replace: true, viewTransition: true });
    }
  }, [location.pathname, navigate]);

  const openKeyEditor = useCallback(
    (type: "gemini" | "claude" | "codex" | "vertex", index: number | null) => {
      const list =
        type === "gemini"
          ? geminiKeys
          : type === "claude"
            ? claudeKeys
            : type === "codex"
              ? codexKeys
              : vertexKeys;
      const current = index === null ? null : (list[index] ?? null);
      setEditKeyType(type);
      setEditKeyIndex(index);
      setKeyDraft(buildProviderKeyDraft(current));
      setKeyDraftError(null);
      setEditKeyOpen(true);
    },
    [claudeKeys, codexKeys, geminiKeys, vertexKeys],
  );

  const commitKeyDraft = useCallback((): ProviderSimpleConfig | null => {
    const name = keyDraft.name.trim();
    if (!name) {
      setKeyDraftError(t("providers.channel_name_error"));
      return null;
    }

    const apiKey = keyDraft.apiKey.trim();
    if (!apiKey) {
      setKeyDraftError(t("providers.api_key_error"));
      return null;
    }

    const headers = keyValueEntriesToRecord(keyDraft.headersEntries);

    const excludedModels = keyDraft.excludedModelsText.trim()
      ? excludedModelsFromText(keyDraft.excludedModelsText)
      : undefined;

    const requireAlias = editKeyType === "vertex";
    const modelCommit = commitModelEntries(keyDraft.modelEntries, { requireAlias });
    if (modelCommit.error) {
      setKeyDraftError(requireAlias ? `Vertex: ${modelCommit.error}` : modelCommit.error);
      return null;
    }

    const result: ProviderSimpleConfig = {
      apiKey,
      name,
      ...(keyDraft.prefix.trim() ? { prefix: keyDraft.prefix.trim() } : {}),
      ...(keyDraft.baseUrl.trim() ? { baseUrl: keyDraft.baseUrl.trim() } : {}),
      ...(keyDraft.proxyUrl.trim() ? { proxyUrl: keyDraft.proxyUrl.trim() } : {}),
      ...(headers ? { headers } : {}),
      ...(excludedModels ? { excludedModels } : {}),
      ...(modelCommit.models ? { models: modelCommit.models } : {}),
      ...(editKeyType === "claude" && keyDraft.skipAnthropicProcessing
        ? { skipAnthropicProcessing: true }
        : {}),
    };

    setKeyDraftError(null);
    return result;
  }, [editKeyType, keyDraft]);

  const saveKeyDraft = useCallback(async () => {
    const value = commitKeyDraft();
    if (!value) return;

    const type = editKeyType;
    const index = editKeyIndex;
    const apply = (list: ProviderSimpleConfig[]) => {
      if (index === null) return [...list, value];
      return list.map((item, i) => (i === index ? value : item));
    };

    try {
      if (type === "gemini") {
        const next = apply(geminiKeys);
        setGeminiKeys(next);
        await providersApi.saveGeminiKeys(next);
      } else if (type === "claude") {
        const next = apply(claudeKeys);
        setClaudeKeys(next);
        await providersApi.saveClaudeConfigs(next);
      } else if (type === "codex") {
        const next = apply(codexKeys);
        setCodexKeys(next);
        await providersApi.saveCodexConfigs(next);
      } else {
        const next = apply(vertexKeys);
        setVertexKeys(next);
        await providersApi.saveVertexConfigs(next);
      }
      notify({ type: "success", message: t("providers.saved") });
      closeKeyEditor();
      startTransition(() => void refreshAll());
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("providers.save_failed"),
      });
    }
  }, [
    claudeKeys,
    closeKeyEditor,
    codexKeys,
    commitKeyDraft,
    editKeyIndex,
    editKeyType,
    geminiKeys,
    notify,
    refreshAll,
    startTransition,
    vertexKeys,
  ]);

  const deleteKey = useCallback(
    async (type: "gemini" | "claude" | "codex" | "vertex", index: number) => {
      const list =
        type === "gemini"
          ? geminiKeys
          : type === "claude"
            ? claudeKeys
            : type === "codex"
              ? codexKeys
              : vertexKeys;
      const entry = list[index];
      if (!entry) return;

      try {
        if (type === "gemini") {
          await providersApi.deleteGeminiKey(entry.apiKey);
          setGeminiKeys((prev) => prev.filter((_, i) => i !== index));
        } else if (type === "claude") {
          await providersApi.deleteClaudeConfig(entry.apiKey);
          setClaudeKeys((prev) => prev.filter((_, i) => i !== index));
        } else if (type === "codex") {
          await providersApi.deleteCodexConfig(entry.apiKey);
          setCodexKeys((prev) => prev.filter((_, i) => i !== index));
        } else {
          await providersApi.deleteVertexConfig(entry.apiKey);
          setVertexKeys((prev) => prev.filter((_, i) => i !== index));
        }
        notify({ type: "success", message: t("providers.deleted") });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("providers.delete_failed"),
        });
      }
    },
    [claudeKeys, codexKeys, geminiKeys, notify, vertexKeys],
  );

  const toggleKeyEnabled = useCallback(
    async (type: "gemini" | "claude" | "codex", index: number, enabled: boolean) => {
      const list = type === "gemini" ? geminiKeys : type === "claude" ? claudeKeys : codexKeys;
      const current = list[index];
      if (!current) return;
      const prev = list;

      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);

      const nextItem: ProviderSimpleConfig = { ...current, excludedModels: nextExcluded };
      const nextList = prev.map((item, i) => (i === index ? nextItem : item));

      try {
        if (type === "gemini") {
          setGeminiKeys(nextList);
          await providersApi.saveGeminiKeys(nextList);
        } else if (type === "claude") {
          setClaudeKeys(nextList);
          await providersApi.saveClaudeConfigs(nextList);
        } else {
          setCodexKeys(nextList);
          await providersApi.saveCodexConfigs(nextList);
        }
        notify({
          type: "success",
          message: enabled ? t("providers.toggle_enabled") : t("providers.toggle_disabled"),
        });
        startTransition(() => void refreshAll());
      } catch (err: unknown) {
        if (type === "gemini") setGeminiKeys(prev);
        else if (type === "claude") setClaudeKeys(prev);
        else setCodexKeys(prev);
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("providers.update_failed"),
        });
      }
    },
    [claudeKeys, codexKeys, geminiKeys, notify, refreshAll, startTransition],
  );

  const openOpenAIEditor = useCallback(
    (index: number | null) => {
      const current = index === null ? null : (openaiProviders[index] ?? null);
      setEditOpenAIIndex(index);
      setOpenaiDraft(buildOpenAIDraft(current));
      setOpenaiDraftError(null);
      setDiscoveredModels([]);
      setDiscoverSelected(new Set());
      setEditOpenAIOpen(true);
    },
    [openaiProviders],
  );

  useEffect(() => {
    if (loading) return;
    const pathname = location.pathname;
    if (!pathname.startsWith("/ai-providers/")) return;

    const parts = pathname.split("/").filter(Boolean);
    const provider = parts[1] ?? "";
    const action = parts[2] ?? "";

    if (
      provider === "gemini" ||
      provider === "claude" ||
      provider === "codex" ||
      provider === "vertex"
    ) {
      setTab(provider);
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
    }
  }, [loading, location.pathname, openKeyEditor, openOpenAIEditor]);

  const commitOpenAIDraft = useCallback((): OpenAIProvider | null => {
    const name = openaiDraft.name.trim();
    const baseUrl = openaiDraft.baseUrl.trim();
    if (!name) {
      setOpenaiDraftError(t("providers.name_error"));
      return null;
    }
    if (!baseUrl) {
      setOpenaiDraftError(t("providers.base_url_error"));
      return null;
    }

    const headers = keyValueEntriesToRecord(openaiDraft.headersEntries);

    const priorityText = openaiDraft.priorityText.trim();
    const priority = priorityText !== "" ? Number(priorityText) : undefined;
    if (priority !== undefined && !Number.isFinite(priority)) {
      setOpenaiDraftError(t("providers.priority_error"));
      return null;
    }

    const apiKeyEntries = openaiDraft.apiKeyEntries
      .map((entry) => {
        const apiKey = entry.apiKey.trim();
        if (!apiKey) return null;
        const entryHeaders = keyValueEntriesToRecord(entry.headersEntries);
        const proxyUrl = entry.proxyUrl.trim();
        return {
          apiKey,
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(entryHeaders ? { headers: entryHeaders } : {}),
        };
      })
      .filter(Boolean) as OpenAIProvider["apiKeyEntries"];

    if (!apiKeyEntries || apiKeyEntries.length === 0) {
      setOpenaiDraftError(t("providers.key_entry_error"));
      return null;
    }

    const modelCommit = commitModelEntries(openaiDraft.modelEntries);
    if (modelCommit.error) {
      setOpenaiDraftError(modelCommit.error);
      return null;
    }

    setOpenaiDraftError(null);

    return {
      name,
      baseUrl,
      ...(openaiDraft.prefix.trim() ? { prefix: openaiDraft.prefix.trim() } : {}),
      ...(headers ? { headers } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(openaiDraft.testModel.trim() ? { testModel: openaiDraft.testModel.trim() } : {}),
      ...(modelCommit.models ? { models: modelCommit.models } : {}),
      apiKeyEntries,
    };
  }, [openaiDraft]);

  const saveOpenAIDraft = useCallback(async () => {
    try {
      const value = commitOpenAIDraft();
      if (!value) return;

      const index = editOpenAIIndex;
      const next =
        index === null
          ? [...openaiProviders, value]
          : openaiProviders.map((p, i) => (i === index ? value : p));

      setOpenaiProviders(next);
      await providersApi.saveOpenAIProviders(next);
      notify({ type: "success", message: t("providers.saved") });
      closeOpenAIEditor();
      startTransition(() => void refreshAll());
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("providers.save_failed"),
      });
    }
  }, [
    closeOpenAIEditor,
    commitOpenAIDraft,
    editOpenAIIndex,
    notify,
    openaiProviders,
    refreshAll,
    startTransition,
  ]);

  const deleteOpenAIProvider = useCallback(
    async (index: number) => {
      const entry = openaiProviders[index];
      if (!entry) return;
      try {
        await providersApi.deleteOpenAIProvider(entry.name);
        setOpenaiProviders((prev) => prev.filter((_, i) => i !== index));
        notify({ type: "success", message: t("providers.deleted") });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("providers.delete_failed"),
        });
      }
    },
    [notify, openaiProviders],
  );

  const discoverModels = useCallback(async () => {
    const baseUrl = openaiDraft.baseUrl.trim();
    if (!baseUrl) {
      notify({ type: "info", message: t("providers.fill_base_url_first") });
      return;
    }

    setDiscovering(true);
    setDiscoveredModels([]);
    setDiscoverSelected(new Set());
    try {
      const endpoint = buildModelsEndpoint(baseUrl);

      const providerHeaders = keyValueEntriesToRecord(openaiDraft.headersEntries) ?? {};
      const firstEntry = openaiDraft.apiKeyEntries.find((entry) => entry.apiKey.trim());
      const keyHeaders = firstEntry
        ? (keyValueEntriesToRecord(firstEntry.headersEntries) ?? {})
        : {};

      const headers: Record<string, string> = { ...providerHeaders, ...keyHeaders };

      const hasAuthHeader = Boolean(headers.Authorization || (headers as any).authorization);
      const firstKey = firstEntry?.apiKey.trim();
      if (!hasAuthHeader && firstKey) {
        headers.Authorization = `Bearer ${firstKey}`;
      }

      const result: ApiCallResult = await apiCallApi.request({
        method: "GET",
        url: endpoint,
        header: Object.keys(headers).length ? headers : undefined,
      });
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }
      const list = normalizeDiscoveredModels(result.body ?? result.bodyText);
      setDiscoveredModels(list);
      setDiscoverSelected(new Set(list.map((m) => m.id)));
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("providers.fetch_models_failed"),
      });
    } finally {
      setDiscovering(false);
    }
  }, [notify, openaiDraft.apiKeyEntries, openaiDraft.baseUrl, openaiDraft.headersEntries]);

  const applyDiscoveredModels = useCallback(() => {
    const selected = new Set(discoverSelected);
    const picked = discoveredModels.filter((m) => selected.has(m.id));
    if (picked.length === 0) {
      notify({ type: "info", message: t("providers.no_models_selected") });
      return;
    }

    const current = openaiDraft.modelEntries;
    const seen = new Set(current.map((m) => m.name.trim().toLowerCase()).filter(Boolean));

    const merged = [...current];
    for (const model of picked) {
      const key = model.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...createEmptyModelEntry(), name: model.id });
    }

    setOpenaiDraft((prev) => ({ ...prev, modelEntries: merged }));
    notify({ type: "success", message: t("providers.models_merged") });
  }, [discoverSelected, discoveredModels, notify, openaiDraft.modelEntries]);

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

  const getSimpleStats = useCallback(
    (config: ProviderSimpleConfig): KeyStatBucket => {
      const candidates = buildCandidateUsageSourceIds({
        apiKey: config.apiKey,
        prefix: config.prefix,
        masker: maskApiKey,
      });
      return sumStatsByCandidates(candidates, usageStatsBySource);
    },
    [usageStatsBySource],
  );

  const mockStatusBarData = useCallback(
    (stats: KeyStatBucket): import("@/utils/usage").StatusBarData => {
      if (stats.success === 0 && stats.failure === 0) {
        return { blocks: [], blockDetails: [], successRate: 100, totalSuccess: 0, totalFailure: 0 };
      }
      const BLOCK_COUNT = 20;
      const blocks: import("@/utils/usage").StatusBlockState[] = [];
      const blockDetails: import("@/utils/usage").StatusBlockDetail[] = [];
      const total = stats.success + stats.failure;
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
    },
    [],
  );

  const getSimpleStatusBar = useCallback(
    (config: ProviderSimpleConfig): import("@/utils/usage").StatusBarData => {
      return mockStatusBarData(getSimpleStats(config));
    },
    [getSimpleStats, mockStatusBarData],
  );

  const getOpenAIProviderStats = useCallback(
    (provider: OpenAIProvider): KeyStatBucket => {
      const candidates = new Set<string>();
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({
          apiKey: entry.apiKey,
          prefix: provider.prefix,
          masker: maskApiKey,
        }).forEach((c) => candidates.add(c));
      });
      return sumStatsByCandidates(Array.from(candidates), usageStatsBySource);
    },
    [usageStatsBySource],
  );

  const getOpenAIKeyEntryStats = useCallback(
    (entry: NonNullable<OpenAIProvider["apiKeyEntries"]>[number]): KeyStatBucket => {
      const candidates = buildCandidateUsageSourceIds({
        apiKey: entry.apiKey,
        masker: maskApiKey,
      });
      return sumStatsByCandidates(candidates, usageStatsBySource);
    },
    [usageStatsBySource],
  );

  const getOpenAIProviderStatusBar = useCallback(
    (provider: OpenAIProvider): import("@/utils/usage").StatusBarData => {
      return mockStatusBarData(getOpenAIProviderStats(provider));
    },
    [getOpenAIProviderStats, mockStatusBarData],
  );

  const editKeyEnabled = useMemo(() => {
    const list = excludedModelsFromText(keyDraft.excludedModelsText);
    return !hasDisableAllModelsRule(list);
  }, [keyDraft.excludedModelsText]);

  const editKeyEnabledToggle = useCallback(
    (enabled: boolean) => {
      const current = excludedModelsFromText(keyDraft.excludedModelsText);
      const next = enabled
        ? withoutDisableAllModelsRule(current)
        : withDisableAllModelsRule(current);
      setKeyDraft((prev) => ({ ...prev, excludedModelsText: next.join("\n") }));
    },
    [keyDraft.excludedModelsText],
  );

  const editKeyExcludedCount = useMemo(() => {
    const list = excludedModelsFromText(keyDraft.excludedModelsText);
    return stripDisableAllModelsRule(list).length;
  }, [keyDraft.excludedModelsText]);

  const editKeyHeaderCount = useMemo(() => {
    return keyDraft.headersEntries.filter((e) => e.key.trim() && e.value.trim()).length;
  }, [keyDraft.headersEntries]);

  const editKeyModelCount = useMemo(() => {
    return keyDraft.modelEntries.filter((e) => e.name.trim()).length;
  }, [keyDraft.modelEntries]);

  return (
    <div className="space-y-6">
      {/* 标题头：描述 + 刷新 */}
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

      {/* Tabs 导航 */}
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
