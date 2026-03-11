import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bot,
  Check,
  Copy,
  Database,
  FileKey,
  Globe,
  Plus,
  RefreshCw,
  Save,
  Settings2,
  Trash2,
} from "lucide-react";

// Vendor SVG icons
import iconGemini from "@/assets/icons/gemini.svg";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodexLight from "@/assets/icons/codex_light.svg";
import iconCodexDark from "@/assets/icons/codex_drak.svg";
import iconVertex from "@/assets/icons/vertex.svg";
import iconAmp from "@/assets/icons/amp.svg";
import iconOpenaiLight from "@/assets/icons/openai-light.svg";
import iconOpenaiDark from "@/assets/icons/openai-dark.svg";
import {
  ampcodeApi,
  apiCallApi,
  getApiCallErrorMessage,
  providersApi,
  usageApi,
} from "@/lib/http/apis";
import type { ApiCallResult, OpenAIProvider, ProviderSimpleConfig } from "@/lib/http/types";
import { iterateUsageRecords } from "@/modules/monitor/monitor-utils";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { EmptyState } from "@/modules/ui/EmptyState";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { ConfirmModal } from "@/modules/ui/ConfirmModal";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import { ToggleSwitch } from "@/modules/ui/ToggleSwitch";
import { useToast } from "@/modules/ui/ToastProvider";
import { KeyValueInputList, keyValueEntriesToRecord } from "@/modules/providers/KeyValueInputList";
import { ModelInputList, createEmptyModelEntry } from "@/modules/providers/ModelInputList";
import { ProviderStatusBar } from "@/modules/providers/ProviderStatusBar";
import { ProviderKeyListCard } from "@/modules/providers/ProviderKeyListCard";
import {
  buildCandidateUsageSourceIds,
  calculateStatusBarData,
  normalizeUsageSourceId,
  type KeyStatBucket,
  type StatusBarData,
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
  const { notify } = useToast();
  const [isPending, startTransition] = useTransition();
  const location = useLocation();
  const navigate = useNavigate();

  const [tab, setTab] = useState<"gemini" | "claude" | "codex" | "vertex" | "openai" | "ampcode">(
    "gemini",
  );
  const [loading, setLoading] = useState(true);

  const [geminiKeys, setGeminiKeys] = useState<ProviderSimpleConfig[]>([]);
  const [claudeKeys, setClaudeKeys] = useState<ProviderSimpleConfig[]>([]);
  const [codexKeys, setCodexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [vertexKeys, setVertexKeys] = useState<ProviderSimpleConfig[]>([]);
  const [openaiProviders, setOpenaiProviders] = useState<OpenAIProvider[]>([]);

  const [usageEntries, setUsageEntries] = useState<
    Array<{ timestamp: string; failed: boolean; source: string }>
  >([]);
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
        notify({ type: "error", message: err instanceof Error ? err.message : "加载配置失败" });
      } finally {
        setLoading(false);
      }
    },
    [notify],
  );

  // Usage 统计单独加载一次
  const loadUsage = useCallback(async () => {
    try {
      const usage = await usageApi.getUsage().catch(() => null);
      if (usage) {
        const flattened = iterateUsageRecords(usage);
        const normalized = flattened
          .map((detail) => {
            const source = normalizeUsageSourceId(detail.source, maskApiKey);
            if (!source) return null;
            return { timestamp: detail.timestamp, failed: Boolean(detail.failed), source };
          })
          .filter(Boolean) as Array<{ timestamp: string; failed: boolean; source: string }>;

        const stats: Record<string, KeyStatBucket> = {};
        normalized.forEach((detail) => {
          const bucket = (stats[detail.source] ??= { success: 0, failure: 0 });
          if (detail.failed) bucket.failure += 1;
          else bucket.success += 1;
        });

        setUsageEntries(normalized);
        setUsageStatsBySource(stats);
      }
    } catch {
      // usage加载失败不影响主要功能
    }
  }, []);

  // refreshAll 保留作为兼容入口（保存后刷新当前 Tab）
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
      setKeyDraftError("渠道名称不能为空");
      return null;
    }

    const apiKey = keyDraft.apiKey.trim();
    if (!apiKey) {
      setKeyDraftError("API Key 不能为空");
      return null;
    }

    const headers = keyValueEntriesToRecord(keyDraft.headersEntries);

    const excludedModels = keyDraft.excludedModelsText.trim()
      ? excludedModelsFromText(keyDraft.excludedModelsText)
      : undefined;

    const requireAlias = editKeyType === "vertex";
    const modelCommit = commitModelEntries(keyDraft.modelEntries, { requireAlias });
    if (modelCommit.error) {
      setKeyDraftError(requireAlias ? `Vertex：${modelCommit.error}` : modelCommit.error);
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
      notify({ type: "success", message: "已保存" });
      closeKeyEditor();
      startTransition(() => void refreshAll());
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
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
        notify({ type: "success", message: "已删除" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
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
        notify({ type: "success", message: enabled ? "已启用" : "已禁用" });
        startTransition(() => void refreshAll());
      } catch (err: unknown) {
        if (type === "gemini") setGeminiKeys(prev);
        else if (type === "claude") setClaudeKeys(prev);
        else setCodexKeys(prev);
        notify({ type: "error", message: err instanceof Error ? err.message : "更新失败" });
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
      setOpenaiDraftError("name 不能为空");
      return null;
    }
    if (!baseUrl) {
      setOpenaiDraftError("baseUrl 不能为空");
      return null;
    }

    const headers = keyValueEntriesToRecord(openaiDraft.headersEntries);

    const priorityText = openaiDraft.priorityText.trim();
    const priority = priorityText !== "" ? Number(priorityText) : undefined;
    if (priority !== undefined && !Number.isFinite(priority)) {
      setOpenaiDraftError("priority 必须是数字");
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
      setOpenaiDraftError("至少需要一个 apiKeyEntry");
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
      notify({ type: "success", message: "已保存" });
      closeOpenAIEditor();
      startTransition(() => void refreshAll());
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
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
        notify({ type: "success", message: "已删除" });
      } catch (err: unknown) {
        notify({ type: "error", message: err instanceof Error ? err.message : "删除失败" });
      }
    },
    [notify, openaiProviders],
  );

  const discoverModels = useCallback(async () => {
    const baseUrl = openaiDraft.baseUrl.trim();
    if (!baseUrl) {
      notify({ type: "info", message: "请先填写 baseUrl" });
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
      notify({ type: "error", message: err instanceof Error ? err.message : "拉取模型失败" });
    } finally {
      setDiscovering(false);
    }
  }, [notify, openaiDraft.apiKeyEntries, openaiDraft.baseUrl, openaiDraft.headersEntries]);

  const applyDiscoveredModels = useCallback(() => {
    const selected = new Set(discoverSelected);
    const picked = discoveredModels.filter((m) => selected.has(m.id));
    if (picked.length === 0) {
      notify({ type: "info", message: "未选择任何模型" });
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
    notify({ type: "success", message: "已合并模型列表" });
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

      notify({ type: "success", message: "Ampcode 配置已保存" });
      startTransition(() => void refreshAll());
      setAmpUpstreamApiKey("");
    } catch (err: unknown) {
      notify({ type: "error", message: err instanceof Error ? err.message : "保存失败" });
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
        notify({ type: "success", message: "已复制" });
      } catch {
        notify({ type: "error", message: "复制失败" });
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

  const getSimpleStatusBar = useCallback(
    (config: ProviderSimpleConfig): StatusBarData => {
      const candidates = new Set(
        buildCandidateUsageSourceIds({
          apiKey: config.apiKey,
          prefix: config.prefix,
          masker: maskApiKey,
        }),
      );
      const details = candidates.size ? usageEntries.filter((d) => candidates.has(d.source)) : [];
      return calculateStatusBarData(details);
    },
    [usageEntries],
  );

  const getOpenAIProviderStats = useCallback(
    (provider: OpenAIProvider): KeyStatBucket => {
      const candidates = new Set<string>();
      buildCandidateUsageSourceIds({ prefix: provider.prefix, masker: maskApiKey }).forEach((id) =>
        candidates.add(id),
      );
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({ apiKey: entry.apiKey, masker: maskApiKey }).forEach((id) =>
          candidates.add(id),
        );
      });
      return sumStatsByCandidates(Array.from(candidates), usageStatsBySource);
    },
    [usageStatsBySource],
  );

  const getOpenAIProviderStatusBar = useCallback(
    (provider: OpenAIProvider): StatusBarData => {
      const candidates = new Set<string>();
      buildCandidateUsageSourceIds({ prefix: provider.prefix, masker: maskApiKey }).forEach((id) =>
        candidates.add(id),
      );
      (provider.apiKeyEntries || []).forEach((entry) => {
        buildCandidateUsageSourceIds({ apiKey: entry.apiKey, masker: maskApiKey }).forEach((id) =>
          candidates.add(id),
        );
      });
      const details = candidates.size ? usageEntries.filter((d) => candidates.has(d.source)) : [];
      return calculateStatusBarData(details);
    },
    [usageEntries],
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
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">配置总览</h2>
          <p className="text-xs text-slate-500 dark:text-white/55">
            在各标签页管理 API Key / OpenAI 提供商 / Ampcode 映射。
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void refreshTab(tab)}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          刷新
        </Button>
      </div>

      {/* Tabs 导航 */}
      <Tabs value={tab} onValueChange={(next) => {
        const nextTab = next as typeof tab;
        setTab(nextTab);
        void refreshTab(nextTab);
      }}>
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
            <img src={iconCodexLight} alt="" className="size-4 dark:hidden" />
            <img src={iconCodexDark} alt="" className="hidden size-4 dark:block" />
            Codex
          </TabsTrigger>
          <TabsTrigger value="vertex">
            <img src={iconVertex} alt="" className="size-4" />
            Vertex
          </TabsTrigger>
          <TabsTrigger value="openai">
            <img src={iconOpenaiLight} alt="" className="size-4 dark:hidden" />
            <img src={iconOpenaiDark} alt="" className="hidden size-4 dark:block" />
            OpenAI 兼容
          </TabsTrigger>
          <TabsTrigger value="ampcode">
            <img src={iconAmp} alt="" className="size-4" />
            Ampcode
          </TabsTrigger>
        </TabsList>

        <TabsContent value="gemini" className="mt-6">
          <ProviderKeyListCard
            icon={Globe}
            title="Gemini Keys"
            description="API Key / Prefix / Base URL / Excluded Models / Headers / Models"
            items={geminiKeys}
            onAdd={() => openKeyEditor("gemini", null)}
            onEdit={(idx) => openKeyEditor("gemini", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "gemini", index: idx })}
            onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("gemini", idx, enabled)}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
          />
        </TabsContent>

        <TabsContent value="claude" className="mt-6">
          <ProviderKeyListCard
            icon={Bot}
            title="Claude Keys"
            description="支持 proxyUrl / 自定义 headers / 模型别名 / Excluded Models（用 * 一键禁用）。"
            items={claudeKeys}
            onAdd={() => openKeyEditor("claude", null)}
            onEdit={(idx) => openKeyEditor("claude", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "claude", index: idx })}
            onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("claude", idx, enabled)}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
          />
        </TabsContent>

        <TabsContent value="codex" className="mt-6">
          <ProviderKeyListCard
            icon={FileKey}
            title="Codex Keys"
            description="支持 baseUrl / proxyUrl / headers / models 等配置。"
            items={codexKeys}
            onAdd={() => openKeyEditor("codex", null)}
            onEdit={(idx) => openKeyEditor("codex", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "codex", index: idx })}
            onToggleEnabled={(idx, enabled) => void toggleKeyEnabled("codex", idx, enabled)}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
          />
        </TabsContent>

        <TabsContent value="vertex" className="mt-6">
          <ProviderKeyListCard
            icon={Database}
            title="Vertex Keys"
            description="models 必须维护 name=>alias，用于将下游模型名映射到 Vertex。"
            items={vertexKeys}
            onAdd={() => openKeyEditor("vertex", null)}
            onEdit={(idx) => openKeyEditor("vertex", idx)}
            onDelete={(idx) => setConfirm({ type: "deleteKey", keyType: "vertex", index: idx })}
            getStats={getSimpleStats}
            getStatusBar={getSimpleStatusBar}
          />
        </TabsContent>

        <TabsContent value="openai" className="mt-6">
          <Card
            title="OpenAI 兼容提供商"
            description="多密钥、headers、模型别名与 /models 发现。"
            actions={
              <Button variant="primary" size="sm" onClick={() => openOpenAIEditor(null)}>
                <Plus size={14} />
                新增提供商
              </Button>
            }
          >
            {openaiProviders.length === 0 ? (
              <EmptyState title="暂无 OpenAI 提供商" description="点击“新增提供商”开始配置。" />
            ) : (
              <div className="space-y-3">
                {openaiProviders.map((provider, idx) => {
                  const headerEntries = Object.entries(provider.headers || {});
                  const stats = getOpenAIProviderStats(provider);
                  const statusData = getOpenAIProviderStatusBar(provider);

                  return (
                    <div
                      key={`${provider.name}:${idx}`}
                      className="rounded-2xl border border-slate-200 bg-white/70 px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {provider.name}
                          </p>
                          {provider.prefix ? (
                            <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                              prefix：{provider.prefix}
                            </p>
                          ) : null}
                          <p className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-slate-200">
                            baseUrl：{provider.baseUrl || "--"}
                          </p>

                          {headerEntries.length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {headerEntries.map(([k, v]) => (
                                <span
                                  key={k}
                                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75"
                                >
                                  <span className="font-semibold">{k}:</span> {String(v)}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          {provider.apiKeyEntries?.length ? (
                            <div className="mt-2 space-y-1">
                              <p className="text-xs font-semibold text-slate-700 dark:text-white/75">
                                Keys：{provider.apiKeyEntries.length}
                              </p>
                              <div className="space-y-1">
                                {provider.apiKeyEntries.map((entry, entryIndex) => {
                                  const entryCandidates = buildCandidateUsageSourceIds({
                                    apiKey: entry.apiKey,
                                    masker: maskApiKey,
                                  });
                                  const entryStats = sumStatsByCandidates(
                                    entryCandidates,
                                    usageStatsBySource,
                                  );
                                  return (
                                    <div
                                      key={`${entry.apiKey}:${entryIndex}`}
                                      className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white/70 px-3 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-950/60"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate font-mono text-slate-900 dark:text-white">
                                          {entryIndex + 1}. {maskApiKey(entry.apiKey)}
                                        </p>
                                        {entry.proxyUrl ? (
                                          <p className="mt-0.5 truncate font-mono text-slate-600 dark:text-white/55">
                                            proxy：{entry.proxyUrl}
                                          </p>
                                        ) : null}
                                      </div>
                                      <div className="flex items-center gap-2 tabular-nums">
                                        <span className="rounded-full bg-emerald-600/10 px-2 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200">
                                          成功 {entryStats.success}
                                        </span>
                                        <span className="rounded-full bg-rose-600/10 px-2 py-0.5 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200">
                                          失败 {entryStats.failure}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-white/65 tabular-nums">
                            <span>models：{provider.models?.length ?? 0}</span>
                            <span>·</span>
                            <span>成功：{stats.success}</span>
                            <span>·</span>
                            <span>失败：{stats.failure}</span>
                            {provider.testModel ? (
                              <>
                                <span>·</span>
                                <span className="truncate">testModel：{provider.testModel}</span>
                              </>
                            ) : null}
                          </div>

                          {provider.models?.length ? (
                            <div className="mt-2 flex flex-wrap gap-1">
                              {provider.models.map((model) => (
                                <span
                                  key={model.name}
                                  className="rounded-full bg-slate-900 px-2 py-0.5 text-[11px] text-white dark:bg-white dark:text-neutral-950"
                                  title={
                                    model.alias && model.alias !== model.name
                                      ? `${model.name} => ${model.alias}`
                                      : model.name
                                  }
                                >
                                  {model.alias && model.alias !== model.name
                                    ? `${model.name} → ${model.alias}`
                                    : model.name}
                                </span>
                              ))}
                            </div>
                          ) : null}

                          <ProviderStatusBar data={statusData} />
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => openOpenAIEditor(idx)}
                          >
                            <Settings2 size={14} />
                            编辑
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            onClick={() => setConfirm({ type: "deleteOpenAI", index: idx })}
                          >
                            <Trash2 size={14} />
                            删除
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        <TabsContent value="ampcode" className="mt-6">
          <Card
            title="Ampcode 集成"
            description="配置上游 URL / API Key、模型映射与强制映射开关。"
            actions={
              <Button
                variant="primary"
                size="sm"
                onClick={() => void saveAmpcode()}
                disabled={loading || isPending}
              >
                <Save size={14} />
                保存
              </Button>
            }
          >
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <TextInput
                  value={ampUpstreamUrl}
                  onChange={(e) => setAmpUpstreamUrl(e.currentTarget.value)}
                  placeholder="upstream-url（为空则清除）"
                />
                <TextInput
                  value={ampUpstreamApiKey}
                  onChange={(e) => setAmpUpstreamApiKey(e.currentTarget.value)}
                  placeholder="upstream-api-key（仅用于更新；为空不改）"
                />
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <ToggleSwitch
                    label="强制模型映射"
                    description="开启后仅允许映射列表中的模型。"
                    checked={ampForceMappings}
                    onCheckedChange={setAmpForceMappings}
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                  <p className="text-xs text-slate-600 dark:text-white/65">
                    当前：{ampcode ? "已加载" : "未加载"} · 映射 {ampMappings.length} 条
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">模型映射</p>
                {ampMappings.map((entry, idx) => (
                  <div key={entry.id} className="grid gap-2 md:grid-cols-12">
                    <div className="md:col-span-5">
                      <TextInput
                        value={entry.from}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setAmpMappings((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, from: value } : it)),
                          );
                        }}
                        placeholder="from"
                      />
                    </div>
                    <div className="md:col-span-5">
                      <TextInput
                        value={entry.to}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setAmpMappings((prev) =>
                            prev.map((it, i) => (i === idx ? { ...it, to: value } : it)),
                          );
                        }}
                        placeholder="to"
                      />
                    </div>
                    <div className="md:col-span-2 flex items-center justify-end">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => setAmpMappings((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={ampMappings.length <= 1}
                        aria-label="删除映射"
                        title="删除映射"
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setAmpMappings((prev) => [
                        ...prev,
                        { id: `map-${Date.now()}`, from: "", to: "" },
                      ])
                    }
                  >
                    <Plus size={14} />
                    新增
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() =>
                      setAmpMappings([{ id: `map-${Date.now()}`, from: "", to: "" }])
                    }
                  >
                    清空
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <Modal
        open={editKeyOpen}
        title={`${editKeyIndex === null ? "新增" : "编辑"} ${editKeyTitle} 配置`}
        description={
          editKeyType === "vertex"
            ? "Vertex 的 models 必须填写 alias（name => alias）。Excluded Models 中使用 * 可一键禁用该配置。"
            : "支持 Excluded Models（每行一个；用 * 一键禁用）、自定义 headers 与 models。"
        }
        onClose={closeKeyEditor}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {keyDraftError ? (
              <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                {keyDraftError}
              </span>
            ) : null}
            <Button variant="secondary" onClick={closeKeyEditor}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void saveKeyDraft()}>
              <Check size={14} />
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={
                editKeyEnabled
                  ? "rounded-full bg-emerald-600/10 px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200"
                  : "rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-700 dark:text-amber-200"
              }
            >
              {editKeyEnabled ? "已启用" : "已禁用"}
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
              headers：<span className="font-semibold tabular-nums">{editKeyHeaderCount}</span>
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
              models：<span className="font-semibold tabular-nums">{editKeyModelCount}</span>
            </span>
            <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 dark:border-neutral-800 dark:bg-neutral-950/60 dark:text-white/75">
              excluded：<span className="font-semibold tabular-nums">{editKeyExcludedCount}</span>
            </span>
            {editKeyType === "vertex" ? (
              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-semibold text-white dark:bg-white dark:text-neutral-950">
                Vertex：需要 alias
              </span>
            ) : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              渠道名称（必填）
            </p>
            <div className="mt-2">
              <TextInput
                value={keyDraft.name}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, name: val }));
                }}
                placeholder="例如：Gemini 主力渠道"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              用于在列表中区分不同渠道，建议填写易于辨认的名称。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <ToggleSwitch
              label="启用"
              description={editKeyEnabled ? "当前：启用" : "当前：禁用（已写入 * 规则）"}
              checked={editKeyEnabled}
              onCheckedChange={editKeyEnabledToggle}
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              禁用本质是向 Excluded Models 写入 <span className="font-mono">*</span>
              ；你也可以在下方手动编辑。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">API Key</p>
              <span className="text-xs text-slate-500 dark:text-white/55">
                展示：{maskApiKey(keyDraft.apiKey)}
              </span>
            </div>
            <div className="mt-2">
              <TextInput
                value={keyDraft.apiKey}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, apiKey: val }));
                }}
                placeholder="粘贴 API Key"
                endAdornment={
                  <button
                    type="button"
                    onClick={() => void copyText(keyDraft.apiKey.trim())}
                    disabled={!keyDraft.apiKey.trim()}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-700 shadow-sm transition hover:bg-white disabled:opacity-50 dark:border-neutral-800 dark:bg-neutral-950/70 dark:text-slate-200 dark:hover:bg-neutral-950"
                    aria-label="复制 API Key"
                    title="复制"
                  >
                    <Copy size={14} />
                  </button>
                }
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              建议只粘贴纯 Key；如果粘贴包含其他文本，统计来源可能不一致。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              路由标识（Prefix，可选）
            </p>
            <div className="mt-2">
              <TextInput
                value={keyDraft.prefix}
                onChange={(e) => {
                  const val = e.currentTarget.value;
                  setKeyDraft((prev) => ({ ...prev, prefix: val }));
                }}
                placeholder="例如：team-a"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              Prefix 既用于路由，也用于使用统计来源匹配；设置后更容易区分多条 Key。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              连接与代理（可选）
            </p>
            <div className="mt-3 grid gap-3">
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-white/75">Base URL</p>
                <TextInput
                  value={keyDraft.baseUrl}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setKeyDraft((prev) => ({ ...prev, baseUrl: val }));
                  }}
                  placeholder={
                    editKeyType === "claude" ? "例如：https://api.anthropic.com" : "baseUrl"
                  }
                />
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-700 dark:text-white/75">Proxy URL</p>
                <TextInput
                  value={keyDraft.proxyUrl}
                  onChange={(e) => {
                    const val = e.currentTarget.value;
                    setKeyDraft((prev) => ({ ...prev, proxyUrl: val }));
                  }}
                  placeholder="proxyUrl"
                />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              Base URL 用于切换上游地址；Proxy URL 用于单 Key 走独立代理（如内网/隧道）。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <KeyValueInputList
              title="Headers（可选）"
              entries={keyDraft.headersEntries}
              onChange={(next) => setKeyDraft((prev) => ({ ...prev, headersEntries: next }))}
              keyPlaceholder="Header 名称"
              valuePlaceholder="Header 值"
            />
            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              常见：<span className="font-mono">x-api-key</span>、
              <span className="font-mono">anthropic-version</span>、自定义鉴权头等。
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <ModelInputList
              title={
                editKeyType === "vertex"
                  ? "Models（必须填写 alias：name => alias）"
                  : "Models（可选）"
              }
              entries={keyDraft.modelEntries}
              onChange={(next) => setKeyDraft((prev) => ({ ...prev, modelEntries: next }))}
              showPriority
              showTestModel={false}
            />
            {editKeyType === "vertex" ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                Vertex 需要把“下游模型名”映射成 Vertex 可识别的名称，所以每条都必须填 alias。
              </p>
            ) : (
              <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
                不填写则使用默认路由；填写后可实现模型别名、优先级等高级路由。
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Excluded Models（可选）
              </p>
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => editKeyEnabledToggle(false)}>
                  写入 * 禁用
                </Button>
                <Button variant="secondary" size="sm" onClick={() => editKeyEnabledToggle(true)}>
                  移除 *
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setKeyDraft((prev) => ({ ...prev, excludedModelsText: "" }))}
                >
                  清空
                </Button>
              </div>
            </div>

            <textarea
              value={keyDraft.excludedModelsText}
              onChange={(e) => {
                const val = e.currentTarget.value;
                setKeyDraft((prev) => ({ ...prev, excludedModelsText: val }));
              }}
              placeholder="每行一个模型；写 * 表示禁用全部模型"
              aria-label="excludedModels"
              className="mt-3 min-h-[140px] w-full resize-y rounded-2xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
            />

            <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
              当前排除：<span className="font-semibold tabular-nums">{editKeyExcludedCount}</span>{" "}
              条（不含 *）。
            </p>
          </div>
        </div>
      </Modal>

      <Modal
        open={editOpenAIOpen}
        title={`${editOpenAIIndex === null ? "新增" : "编辑"} OpenAI 提供商`}
        description="配置 name/baseUrl、多个 apiKeyEntries、headers 与模型别名；支持通过 /models 自动拉取并合并。"
        onClose={closeOpenAIEditor}
        footer={
          <div className="flex flex-wrap items-center gap-2">
            {openaiDraftError ? (
              <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">
                {openaiDraftError}
              </span>
            ) : null}
            <Button variant="secondary" onClick={closeOpenAIEditor}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void saveOpenAIDraft()}>
              <Check size={14} />
              保存
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Name</p>
              <TextInput
                value={openaiDraft.name}
                onChange={(e) =>
                  setOpenaiDraft((prev) => ({ ...prev, name: e.currentTarget.value }))
                }
                placeholder="name"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Base URL</p>
              <TextInput
                value={openaiDraft.baseUrl}
                onChange={(e) =>
                  setOpenaiDraft((prev) => ({
                    ...prev,
                    baseUrl: e.currentTarget.value,
                  }))
                }
                placeholder="baseUrl"
              />
              <p className="text-xs text-slate-500 dark:text-white/55">
                /models 拉取地址：
                {openaiDraft.baseUrl.trim() ? buildModelsEndpoint(openaiDraft.baseUrl) : "--"}
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Prefix（可选）</p>
              <TextInput
                value={openaiDraft.prefix}
                onChange={(e) =>
                  setOpenaiDraft((prev) => ({ ...prev, prefix: e.currentTarget.value }))
                }
                placeholder="prefix"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Priority（可选）
              </p>
              <TextInput
                value={openaiDraft.priorityText}
                onChange={(e) =>
                  setOpenaiDraft((prev) => ({ ...prev, priorityText: e.currentTarget.value }))
                }
                placeholder="数字"
                inputMode="numeric"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                Test Model（可选）
              </p>
              <TextInput
                value={openaiDraft.testModel}
                onChange={(e) =>
                  setOpenaiDraft((prev) => ({ ...prev, testModel: e.currentTarget.value }))
                }
                placeholder="testModel"
              />
            </div>
          </div>

          <KeyValueInputList
            title="Provider Headers（可选）"
            entries={openaiDraft.headersEntries}
            onChange={(next) => setOpenaiDraft((prev) => ({ ...prev, headersEntries: next }))}
          />

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                API Key Entries
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() =>
                  setOpenaiDraft((prev) => ({
                    ...prev,
                    apiKeyEntries: [
                      ...prev.apiKeyEntries,
                      { id: `key-${Date.now()}`, apiKey: "", proxyUrl: "", headersEntries: [] },
                    ],
                  }))
                }
              >
                <Plus size={14} />
                新增
              </Button>
            </div>

            <div className="space-y-3">
              {openaiDraft.apiKeyEntries.map((entry, idx) => (
                <div
                  key={entry.id}
                  className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      Key #{idx + 1}
                    </p>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() =>
                        setOpenaiDraft((prev) => ({
                          ...prev,
                          apiKeyEntries: prev.apiKeyEntries.filter((_, i) => i !== idx),
                        }))
                      }
                      disabled={openaiDraft.apiKeyEntries.length <= 1}
                    >
                      <Trash2 size={14} />
                      删除
                    </Button>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        API Key
                      </p>
                      <TextInput
                        value={entry.apiKey}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setOpenaiDraft((prev) => ({
                            ...prev,
                            apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                              i === idx ? { ...it, apiKey: value } : it,
                            ),
                          }));
                        }}
                        placeholder="apiKey"
                      />
                      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-white/55">
                        <span>展示：{maskApiKey(entry.apiKey)}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => void copyText(entry.apiKey.trim())}
                          disabled={!entry.apiKey.trim()}
                        >
                          <Copy size={14} />
                          复制
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Proxy URL（可选）
                      </p>
                      <TextInput
                        value={entry.proxyUrl}
                        onChange={(e) => {
                          const value = e.currentTarget.value;
                          setOpenaiDraft((prev) => ({
                            ...prev,
                            apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                              i === idx ? { ...it, proxyUrl: value } : it,
                            ),
                          }));
                        }}
                        placeholder="proxyUrl"
                      />
                    </div>
                  </div>

                  <div className="mt-3">
                    <KeyValueInputList
                      title="Key Headers（可选）"
                      entries={entry.headersEntries}
                      onChange={(next) => {
                        setOpenaiDraft((prev) => ({
                          ...prev,
                          apiKeyEntries: prev.apiKeyEntries.map((it, i) =>
                            i === idx ? { ...it, headersEntries: next } : it,
                          ),
                        }));
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Models</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => void discoverModels()}
                  disabled={discovering}
                >
                  <RefreshCw size={14} className={discovering ? "animate-spin" : ""} />
                  拉取 /models
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={applyDiscoveredModels}
                  disabled={discoveredModels.length === 0}
                >
                  <Check size={14} />
                  合并所选
                </Button>
              </div>
            </div>

            <ModelInputList
              title="模型列表（可选）"
              entries={openaiDraft.modelEntries}
              onChange={(next) => setOpenaiDraft((prev) => ({ ...prev, modelEntries: next }))}
              showPriority
              showTestModel
            />

            {discoveredModels.length ? (
              <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
                <p className="text-xs text-slate-600 dark:text-white/65">
                  发现 {discoveredModels.length} 个模型（默认全选）
                </p>
                <div className="mt-2 max-h-48 overflow-y-auto space-y-1">
                  {discoveredModels.map((model) => {
                    const checked = discoverSelected.has(model.id);
                    return (
                      <label
                        key={model.id}
                        className={[
                          "flex cursor-pointer items-center gap-2 rounded-xl px-2 py-1 text-xs font-mono",
                          checked
                            ? "bg-slate-900 text-white dark:bg-white dark:text-neutral-950"
                            : "hover:bg-slate-50 dark:hover:bg-white/5",
                        ].join(" ")}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            setDiscoverSelected((prev) => {
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
            ) : null}
          </section>
        </div>
      </Modal>

      <ConfirmModal
        open={confirm !== null}
        title="确认删除"
        description={
          confirm?.type === "deleteOpenAI"
            ? `确定要删除 OpenAI 提供商 “${openaiProviders[confirm.index]?.name ?? ""}” 吗？此操作不可恢复。`
            : confirm?.type === "deleteKey"
              ? "确定要删除该配置吗？此操作不可恢复。"
              : "确定要删除吗？"
        }
        confirmText="删除"
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
    </div >
  );
}
