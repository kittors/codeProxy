import {
  useCallback,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@code-proxy/ui";
import type {
  BedrockProviderConfig,
  ProviderSimpleConfig,
} from "@code-proxy/api-client";
import { providersApi } from "@code-proxy/api-client";
import { invalidateConfiguredModelAvailability } from "@features/model-availability";
import { keyValueEntriesToRecord } from "../KeyValueInputList";
import {
  buildProviderKeyDraft,
  commitModelEntries,
  excludedModelsFromText,
  hasDisableAllModelsRule,
  stripDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
  type ProviderKeyDraft,
} from "../providers-helpers";

export type ProviderKeyType =
  | "gemini"
  | "claude"
  | "codex"
  | "opencode-go"
  | "cline"
  | "ollama-cloud"
  | "vertex"
  | "bedrock";

interface UseProviderKeyEditorArgs {
  geminiKeys: ProviderSimpleConfig[];
  claudeKeys: ProviderSimpleConfig[];
  codexKeys: ProviderSimpleConfig[];
  openCodeGoKeys: ProviderSimpleConfig[];
  clineKeys: ProviderSimpleConfig[];
  ollamaCloudKeys: ProviderSimpleConfig[];
  vertexKeys: ProviderSimpleConfig[];
  bedrockKeys: BedrockProviderConfig[];
  setGeminiKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setClaudeKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setCodexKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setOpenCodeGoKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setClineKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setOllamaCloudKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setVertexKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setBedrockKeys: Dispatch<SetStateAction<BedrockProviderConfig[]>>;
  refreshAll: () => Promise<void>;
  startRefreshTransition: (action: () => void) => void;
  afterClose: () => void;
}

export function useProviderKeyEditor({
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
  startRefreshTransition,
  afterClose,
}: UseProviderKeyEditorArgs) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [editKeyOpen, setEditKeyOpen] = useState(false);
  const [editKeyType, setEditKeyType] = useState<ProviderKeyType>("gemini");
  const [editKeyIndex, setEditKeyIndex] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState<ProviderKeyDraft>(() =>
    buildProviderKeyDraft(null),
  );
  const [keyDraftError, setKeyDraftError] = useState<string | null>(null);

  const getListByType = useCallback(
    (type: ProviderKeyType) =>
      type === "gemini"
        ? geminiKeys
        : type === "claude"
          ? claudeKeys
          : type === "codex"
            ? codexKeys
            : type === "opencode-go"
              ? openCodeGoKeys
              : type === "cline"
                ? clineKeys
                : type === "ollama-cloud"
                  ? ollamaCloudKeys
                  : type === "vertex"
                    ? vertexKeys
                    : bedrockKeys,
    [
      bedrockKeys,
      claudeKeys,
      clineKeys,
      codexKeys,
      geminiKeys,
      ollamaCloudKeys,
      openCodeGoKeys,
      vertexKeys,
    ],
  );

  const closeKeyEditor = useCallback(() => {
    setEditKeyOpen(false);
    afterClose();
  }, [afterClose]);

  const openKeyEditor = useCallback(
    (type: ProviderKeyType, index: number | null) => {
      const list = getListByType(type);
      const current = index === null ? null : (list[index] ?? null);
      setEditKeyType(type);
      setEditKeyIndex(index);
      const draft = buildProviderKeyDraft(current);
      setKeyDraft(
        type === "cline" && !draft.baseUrl.trim()
          ? { ...draft, baseUrl: "https://api.cline.bot/api/v1" }
          : type === "ollama-cloud" && !draft.baseUrl.trim()
            ? { ...draft, baseUrl: "https://ollama.com" }
            : draft,
      );
      setKeyDraftError(null);
      setEditKeyOpen(true);
    },
    [getListByType],
  );

  const commitKeyDraft = useCallback((): ProviderSimpleConfig | null => {
    const name = keyDraft.name.trim();
    if (!name) {
      setKeyDraftError(t("providers.channel_name_error"));
      return null;
    }

    const apiKey = keyDraft.apiKey.trim();
    const bedrockAccessKeyId = keyDraft.accessKeyId.trim();
    const bedrockSecretAccessKey = keyDraft.secretAccessKey.trim();
    if (editKeyType === "bedrock") {
      if (keyDraft.authMode === "api-key" && !apiKey) {
        setKeyDraftError(t("providers.api_key_error"));
        return null;
      }
      if (
        keyDraft.authMode === "sigv4" &&
        (!bedrockAccessKeyId || !bedrockSecretAccessKey)
      ) {
        setKeyDraftError(t("providers.bedrock_sigv4_error"));
        return null;
      }
    } else if (!apiKey) {
      setKeyDraftError(t("providers.api_key_error"));
      return null;
    }

    const headers = keyValueEntriesToRecord(keyDraft.headersEntries);
    const rawExcludedModels = keyDraft.excludedModelsText.trim()
      ? excludedModelsFromText(keyDraft.excludedModelsText)
      : undefined;
    const isOpenCodeGo = editKeyType === "opencode-go";
    const isCline = editKeyType === "cline";
    const usesDynamicModelCatalog = isOpenCodeGo || isCline || editKeyType === "ollama-cloud";
    const excludedModels = rawExcludedModels;

    const requireAlias = editKeyType === "vertex";
    const modelCommit = usesDynamicModelCatalog
      ? {}
      : commitModelEntries(keyDraft.modelEntries, {
          requireAlias,
        });
    if (modelCommit.error) {
      setKeyDraftError(
        requireAlias ? `Vertex: ${modelCommit.error}` : modelCommit.error,
      );
      return null;
    }
    const result: ProviderSimpleConfig | BedrockProviderConfig = {
      apiKey:
        editKeyType === "bedrock" && keyDraft.authMode === "sigv4"
          ? bedrockAccessKeyId
          : apiKey,
      name,
      ...(keyDraft.prefix.trim() ? { prefix: keyDraft.prefix.trim() } : {}),
      ...(!isOpenCodeGo && keyDraft.baseUrl.trim()
        ? { baseUrl: keyDraft.baseUrl.trim() }
        : {}),
      ...(isCline && !keyDraft.baseUrl.trim()
        ? { baseUrl: "https://api.cline.bot/api/v1" }
        : {}),
      ...(editKeyType === "ollama-cloud" && !keyDraft.baseUrl.trim()
        ? { baseUrl: "https://ollama.com" }
        : {}),
      ...(keyDraft.proxyUrl.trim()
        ? { proxyUrl: keyDraft.proxyUrl.trim() }
        : {}),
      ...(keyDraft.proxyId.trim() ? { proxyId: keyDraft.proxyId.trim() } : {}),
      ...(headers ? { headers } : {}),
      ...(excludedModels ? { excludedModels } : {}),
      ...(isOpenCodeGo && keyDraft.workspaceId.trim()
        ? { workspaceId: keyDraft.workspaceId.trim() }
        : {}),
      ...(isOpenCodeGo && keyDraft.authCookie.trim()
        ? { authCookie: keyDraft.authCookie.trim() }
        : {}),
      ...((isOpenCodeGo || isCline) && keyDraft.visionFallbackModel.trim()
        ? { visionFallbackModel: keyDraft.visionFallbackModel.trim() }
        : {}),
      ...(modelCommit.models ? { models: modelCommit.models } : {}),
      ...(editKeyType === "claude" && keyDraft.skipAnthropicProcessing
        ? { skipAnthropicProcessing: true }
        : {}),
      ...(editKeyType === "bedrock"
        ? {
            authMode: keyDraft.authMode,
            ...(keyDraft.authMode === "sigv4"
              ? {
                  accessKeyId: bedrockAccessKeyId,
                  secretAccessKey: bedrockSecretAccessKey,
                  ...(keyDraft.sessionToken.trim()
                    ? { sessionToken: keyDraft.sessionToken.trim() }
                    : {}),
                }
              : {}),
            ...(keyDraft.region.trim()
              ? { region: keyDraft.region.trim() }
              : {}),
            ...(keyDraft.forceGlobal ? { forceGlobal: true } : {}),
          }
        : {}),
    };

    setKeyDraftError(null);
    return result;
  }, [editKeyType, keyDraft, t]);

  const saveKeyDraft = useCallback(async () => {
    const value = commitKeyDraft();
    if (!value) return;

    const type = editKeyType;
    const index = editKeyIndex;
    const apply = (list: ProviderSimpleConfig[]) => {
      if (index === null) return [...list, value];
      return list.map((item, itemIndex) =>
        itemIndex === index ? value : item,
      );
    };

    try {
      if (type === "gemini") {
        const next = apply(geminiKeys);
        await providersApi.saveGeminiKeys(next);
        setGeminiKeys(next);
      } else if (type === "claude") {
        const next = apply(claudeKeys);
        await providersApi.saveClaudeConfigs(next);
        setClaudeKeys(next);
      } else if (type === "codex") {
        const next = apply(codexKeys);
        await providersApi.saveCodexConfigs(next);
        setCodexKeys(next);
      } else if (type === "opencode-go") {
        const next = apply(openCodeGoKeys);
        await providersApi.saveOpenCodeGoConfigs(next);
        setOpenCodeGoKeys(next);
      } else if (type === "cline") {
        const next = apply(clineKeys);
        await providersApi.saveClineConfigs(next);
        setClineKeys(next);
      } else if (type === "ollama-cloud") {
        const next = apply(ollamaCloudKeys);
        await providersApi.saveOllamaCloudConfigs(next);
        setOllamaCloudKeys(next);
      } else if (type === "vertex") {
        const next = apply(vertexKeys);
        await providersApi.saveVertexConfigs(next);
        setVertexKeys(next);
      } else {
        const next = apply(bedrockKeys) as BedrockProviderConfig[];
        await providersApi.saveBedrockConfigs(next);
        setBedrockKeys(next);
      }
      invalidateConfiguredModelAvailability();
      notify({ type: "success", message: t("providers.saved") });
      closeKeyEditor();
      startRefreshTransition(() => void refreshAll());
    } catch (err: unknown) {
      notify({
        type: "error",
        message:
          err instanceof Error ? err.message : t("providers.save_failed"),
      });
    }
  }, [
    claudeKeys,
    bedrockKeys,
    clineKeys,
    closeKeyEditor,
    codexKeys,
    commitKeyDraft,
    editKeyIndex,
    editKeyType,
    geminiKeys,
    notify,
    ollamaCloudKeys,
    openCodeGoKeys,
    refreshAll,
    setClaudeKeys,
    setCodexKeys,
    setBedrockKeys,
    setClineKeys,
    setGeminiKeys,
    setOllamaCloudKeys,
    setOpenCodeGoKeys,
    setVertexKeys,
    startRefreshTransition,
    t,
    vertexKeys,
  ]);

  const deleteKey = useCallback(
    async (type: ProviderKeyType, index: number) => {
      const list = getListByType(type);
      const entry = list[index];
      if (!entry) return;

      try {
        if (type === "gemini") {
          await providersApi.deleteGeminiKey(entry.apiKey);
          setGeminiKeys((prev) =>
            prev.filter((_, itemIndex) => itemIndex !== index),
          );
        } else if (type === "claude") {
          await providersApi.deleteClaudeConfig(entry.apiKey);
          setClaudeKeys((prev) =>
            prev.filter((_, itemIndex) => itemIndex !== index),
          );
        } else if (type === "codex") {
          await providersApi.deleteCodexConfig(entry.apiKey);
          setCodexKeys((prev) =>
            prev.filter((_, itemIndex) => itemIndex !== index),
          );
        } else if (type === "opencode-go") {
          await providersApi.deleteOpenCodeGoConfig(entry.apiKey);
          setOpenCodeGoKeys((prev) =>
            prev.filter((_, itemIndex) => itemIndex !== index),
          );
        } else if (type === "cline") {
          await providersApi.deleteClineConfig(entry.apiKey);
          setClineKeys((prev) =>
            prev.filter((_, itemIndex) => itemIndex !== index),
          );
        } else if (type === "ollama-cloud") {
          await providersApi.deleteOllamaCloudConfig(entry.apiKey);
          setOllamaCloudKeys((prev) =>
            prev.filter((_, itemIndex) => itemIndex !== index),
          );
        } else if (type === "vertex") {
          await providersApi.deleteVertexConfig(entry.apiKey);
          setVertexKeys((prev) =>
            prev.filter((_, itemIndex) => itemIndex !== index),
          );
        } else {
          await providersApi.deleteBedrockConfig(index);
          setBedrockKeys((prev) =>
            prev.filter((_, itemIndex) => itemIndex !== index),
          );
        }
        invalidateConfiguredModelAvailability();
        notify({ type: "success", message: t("providers.deleted") });
      } catch (err: unknown) {
        notify({
          type: "error",
          message:
            err instanceof Error ? err.message : t("providers.delete_failed"),
        });
      }
    },
    [
      getListByType,
      notify,
      setBedrockKeys,
      setClaudeKeys,
      setClineKeys,
      setCodexKeys,
      setGeminiKeys,
      setOllamaCloudKeys,
      setOpenCodeGoKeys,
      setVertexKeys,
      t,
    ],
  );

  const toggleKeyEnabled = useCallback(
    async (
      type: "gemini" | "claude" | "codex" | "opencode-go" | "cline" | "ollama-cloud" | "bedrock",
      index: number,
      enabled: boolean,
    ) => {
      const list =
        type === "gemini"
          ? geminiKeys
          : type === "claude"
            ? claudeKeys
            : type === "codex"
              ? codexKeys
              : type === "opencode-go"
                ? openCodeGoKeys
                : type === "cline"
                  ? clineKeys
                  : type === "ollama-cloud"
                    ? ollamaCloudKeys
                    : bedrockKeys;
      const current = list[index];
      if (!current) return;
      const prev = list;

      const nextExcluded = enabled
        ? withoutDisableAllModelsRule(current.excludedModels)
        : withDisableAllModelsRule(current.excludedModels);

      const nextItem: ProviderSimpleConfig = {
        ...current,
        excludedModels: nextExcluded,
      };
      const nextList = prev.map((item, itemIndex) =>
        itemIndex === index ? nextItem : item,
      );

      try {
        if (type === "gemini") {
          setGeminiKeys(nextList);
          await providersApi.saveGeminiKeys(nextList);
        } else if (type === "claude") {
          setClaudeKeys(nextList);
          await providersApi.saveClaudeConfigs(nextList);
        } else if (type === "codex") {
          setCodexKeys(nextList);
          await providersApi.saveCodexConfigs(nextList);
        } else if (type === "opencode-go") {
          setOpenCodeGoKeys(nextList);
          await providersApi.saveOpenCodeGoConfigs(nextList);
        } else if (type === "cline") {
          setClineKeys(nextList);
          await providersApi.saveClineConfigs(nextList);
        } else if (type === "ollama-cloud") {
          setOllamaCloudKeys(nextList);
          await providersApi.saveOllamaCloudConfigs(nextList);
        } else {
          setBedrockKeys(nextList as BedrockProviderConfig[]);
          await providersApi.saveBedrockConfigs(
            nextList as BedrockProviderConfig[],
          );
        }
        notify({
          type: "success",
          message: enabled
            ? t("providers.toggle_enabled")
            : t("providers.toggle_disabled"),
        });
        startRefreshTransition(() => void refreshAll());
      } catch (err: unknown) {
        if (type === "gemini") setGeminiKeys(prev);
        else if (type === "claude") setClaudeKeys(prev);
        else if (type === "codex") setCodexKeys(prev);
        else if (type === "opencode-go") setOpenCodeGoKeys(prev);
        else if (type === "cline") setClineKeys(prev);
        else if (type === "ollama-cloud") setOllamaCloudKeys(prev);
        else setBedrockKeys(prev as BedrockProviderConfig[]);
        notify({
          type: "error",
          message:
            err instanceof Error ? err.message : t("providers.update_failed"),
        });
      }
    },
    [
      claudeKeys,
      bedrockKeys,
      clineKeys,
      codexKeys,
      geminiKeys,
      notify,
      ollamaCloudKeys,
      openCodeGoKeys,
      refreshAll,
      setClaudeKeys,
      setCodexKeys,
      setBedrockKeys,
      setClineKeys,
      setGeminiKeys,
      setOllamaCloudKeys,
      setOpenCodeGoKeys,
      startRefreshTransition,
      t,
    ],
  );

  const editKeyTitle =
    editKeyType === "gemini"
      ? "Gemini"
      : editKeyType === "claude"
        ? "Claude"
        : editKeyType === "codex"
          ? "Codex"
          : editKeyType === "opencode-go"
            ? "OpenCode Go"
            : editKeyType === "cline"
              ? "ClinePass"
              : editKeyType === "ollama-cloud"
                ? "Ollama Cloud"
                : editKeyType === "vertex"
                  ? "Vertex"
                  : "Bedrock";

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

  const editKeyHeaderCount = useMemo(
    () =>
      keyDraft.headersEntries.filter(
        (entry) => entry.key.trim() && entry.value.trim(),
      ).length,
    [keyDraft.headersEntries],
  );

  const editKeyModelCount = useMemo(
    () => keyDraft.modelEntries.filter((entry) => entry.name.trim()).length,
    [keyDraft.modelEntries],
  );

  return {
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
  };
}
