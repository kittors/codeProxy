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
import { setCachedData } from "../provider-cache";
import {
  buildProviderKeyDraft,
  commitModelEntries,
  excludedModelsFromText,
  hasDisableAllModelsRule,
  maskApiKey,
  stripDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
  type ProviderKeyDraft,
} from "../providers-helpers";
import { findDuplicateProviderIndex } from "../provider-duplicate-key";
import {
  isModelAllowedForProvider,
  type ModelAccessProvider,
} from "../provider-model-access";

export type ProviderKeyType =
  | "gemini"
  | "claude"
  | "codex"
  | "opencode-go"
  | "cline"
  | "ollama-cloud"
  | "commandcode"
  | "vertex"
  | "bedrock";

interface UseProviderKeyEditorArgs {
  geminiKeys: ProviderSimpleConfig[];
  claudeKeys: ProviderSimpleConfig[];
  codexKeys: ProviderSimpleConfig[];
  openCodeGoKeys: ProviderSimpleConfig[];
  clineKeys: ProviderSimpleConfig[];
  ollamaCloudKeys: ProviderSimpleConfig[];
  commandCodeKeys: ProviderSimpleConfig[];
  vertexKeys: ProviderSimpleConfig[];
  bedrockKeys: BedrockProviderConfig[];
  setGeminiKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setClaudeKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setCodexKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setOpenCodeGoKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setClineKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setOllamaCloudKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setCommandCodeKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
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
  commandCodeKeys,
  vertexKeys,
  bedrockKeys,
  setGeminiKeys,
  setClaudeKeys,
  setCodexKeys,
  setOpenCodeGoKeys,
  setClineKeys,
  setOllamaCloudKeys,
  setCommandCodeKeys,
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
                  : type === "commandcode"
                    ? commandCodeKeys
                    : type === "vertex"
                      ? vertexKeys
                      : bedrockKeys,
    [
      bedrockKeys,
      claudeKeys,
      clineKeys,
      codexKeys,
      commandCodeKeys,
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
            : type === "commandcode" && !draft.baseUrl.trim()
              ? {
                  ...draft,
                  baseUrl: "https://api.commandcode.ai/provider/v1",
                }
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
    const isOpenCodeGo = editKeyType === "opencode-go";
    const isCline = editKeyType === "cline";
    const isOllamaCloud = editKeyType === "ollama-cloud";
    const isCommandCode = editKeyType === "commandcode";
    const canKeepExistingApiKey =
      editKeyIndex !== null &&
      (isOpenCodeGo || isCline || isOllamaCloud || isCommandCode);
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
    } else if (!apiKey && !canKeepExistingApiKey) {
      setKeyDraftError(t("providers.api_key_error"));
      return null;
    }

    // Vertex compat rows are dropped upstream without a base URL (see
    // SanitizeVertexCompatKeys, "BaseURL is required"). Without this check the
    // save reported success and the channel never appeared.
    if (editKeyType === "vertex" && !keyDraft.baseUrl.trim()) {
      setKeyDraftError(t("providers.base_url_error"));
      return null;
    }

    const headers = keyValueEntriesToRecord(keyDraft.headersEntries);
    const rawExcludedModels = keyDraft.excludedModelsText.trim()
      ? excludedModelsFromText(keyDraft.excludedModelsText)
      : undefined;
    const modelAccessProvider: ModelAccessProvider | null = isOpenCodeGo
      ? "opencode-go"
      : isCline
        ? "cline"
        : isOllamaCloud
          ? "ollama-cloud"
          : isCommandCode
            ? "commandcode"
            : null;
    const disableAllModelAccess = Boolean(
      modelAccessProvider && hasDisableAllModelsRule(rawExcludedModels),
    );
    const excludedModels = modelAccessProvider
      ? disableAllModelAccess
        ? ["*"]
        : undefined
      : rawExcludedModels;

    const requireAlias = editKeyType === "vertex";
    const modelCommit = commitModelEntries(keyDraft.modelEntries, {
      requireAlias,
    });
    if (modelCommit.error) {
      setKeyDraftError(
        requireAlias ? `Vertex: ${modelCommit.error}` : modelCommit.error,
      );
      return null;
    }
    const models =
      modelAccessProvider && modelCommit.models
        ? modelCommit.models.filter((model) => {
            const name = model.name?.trim() ?? "";
            return name && isModelAllowedForProvider(modelAccessProvider, name);
          })
        : modelCommit.models;
    const modelAccessModels = modelAccessProvider
      ? disableAllModelAccess
        ? []
        : (models ?? [])
      : models;
    const modelAccessExcludedModels =
      modelAccessProvider && (!modelAccessModels?.length || disableAllModelAccess)
        ? ["*"]
        : modelAccessProvider
          ? []
          : undefined;
    const result: ProviderSimpleConfig | BedrockProviderConfig = {
      ...(keyDraft.id.trim() ? { id: keyDraft.id.trim() } : {}),
      apiKey:
        editKeyType === "bedrock" && keyDraft.authMode === "sigv4"
          ? bedrockAccessKeyId
          : apiKey,
      ...(modelAccessProvider ? { disabled: keyDraft.disabled } : {}),
      name,
      ...(keyDraft.prefix.trim() ? { prefix: keyDraft.prefix.trim() } : {}),
      ...(!isOpenCodeGo && keyDraft.baseUrl.trim()
        ? { baseUrl: keyDraft.baseUrl.trim() }
        : {}),
      ...(isCline && !keyDraft.baseUrl.trim()
        ? { baseUrl: "https://api.cline.bot/api/v1" }
        : {}),
      ...(isOllamaCloud && !keyDraft.baseUrl.trim()
        ? { baseUrl: "https://ollama.com" }
        : {}),
      ...(keyDraft.proxyUrl.trim()
        ? { proxyUrl: keyDraft.proxyUrl.trim() }
        : {}),
      ...(keyDraft.proxyId.trim() ? { proxyId: keyDraft.proxyId.trim() } : {}),
      ...(headers ? { headers } : {}),
      ...(modelAccessExcludedModels !== undefined
        ? { excludedModels: modelAccessExcludedModels }
        : excludedModels?.length
          ? { excludedModels }
          : {}),
      ...(isOpenCodeGo && keyDraft.workspaceId.trim()
        ? { workspaceId: keyDraft.workspaceId.trim() }
        : {}),
      ...(isOpenCodeGo && keyDraft.authCookie.trim()
        ? { authCookie: keyDraft.authCookie.trim() }
        : {}),
      ...((isCline || isOllamaCloud) && keyDraft.authCookie.trim()
        ? { authCookie: keyDraft.authCookie.trim() }
        : {}),
      ...(modelAccessProvider && keyDraft.visionFallbackModel.trim()
        ? { visionFallbackModel: keyDraft.visionFallbackModel.trim() }
        : {}),
      ...(modelAccessProvider
        ? { models: modelAccessModels }
        : modelAccessModels?.length
          ? { models: modelAccessModels }
          : {}),
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

    // Channels that deduplicate upstream drop the colliding row and still answer
    // 200, so without this the save said "saved" and no card appeared.
    const duplicateIndex = findDuplicateProviderIndex(
      editKeyType,
      getListByType(editKeyType),
      result,
      editKeyIndex,
    );
    if (duplicateIndex !== -1) {
      const existing = getListByType(editKeyType)[duplicateIndex];
      setKeyDraftError(
        t("providers.duplicate_api_key_error", {
          name: existing?.name?.trim() || maskApiKey(result.apiKey),
        }),
      );
      return null;
    }

    setKeyDraftError(null);
    return result;
  }, [editKeyIndex, editKeyType, getListByType, keyDraft, t]);

  const saveKeyDraft = useCallback(async () => {
    const value = commitKeyDraft();
    if (!value) return;

    const type = editKeyType;
    const index = editKeyIndex;
    const apply = (list: ProviderSimpleConfig[]) => {
      if (index === null) return [...list, value];
      return list.map((item, itemIndex) =>
        itemIndex === index
          ? { ...value, apiKey: value.apiKey || item.apiKey }
          : item,
      );
    };

    try {
      if (type === "gemini") {
        const next = apply(geminiKeys);
        await providersApi.saveGeminiKeys(next);
        setGeminiKeys(next);
        setCachedData("gemini", next);
      } else if (type === "claude") {
        const next = apply(claudeKeys);
        await providersApi.saveClaudeConfigs(next);
        setClaudeKeys(next);
        setCachedData("claude", next);
      } else if (type === "codex") {
        const next = apply(codexKeys);
        await providersApi.saveCodexConfigs(next);
        setCodexKeys(next);
        setCachedData("codex", next);
      } else if (type === "opencode-go") {
        const next = apply(openCodeGoKeys);
        if (index === null) {
          await providersApi.saveOpenCodeGoConfigs(next);
        } else {
          await providersApi.patchOpenCodeGoConfig(index, value);
        }
        setOpenCodeGoKeys(next);
        setCachedData("opencode-go", next);
      } else if (type === "cline") {
        const next = apply(clineKeys);
        if (index === null) {
          await providersApi.saveClineConfigs(next);
        } else {
          await providersApi.patchClineConfig(index, value);
        }
        setClineKeys(next);
        setCachedData("cline", next);
      } else if (type === "ollama-cloud") {
        const next = apply(ollamaCloudKeys);
        if (index === null) {
          await providersApi.saveOllamaCloudConfigs(next);
        } else {
          await providersApi.patchOllamaCloudConfig(index, value);
        }
        setOllamaCloudKeys(next);
        setCachedData("ollama-cloud", next);
      } else if (type === "commandcode") {
        const next = apply(commandCodeKeys);
        if (index === null) {
          await providersApi.saveCommandCodeConfigs(next);
        } else {
          await providersApi.patchCommandCodeConfig(index, value);
        }
        setCommandCodeKeys(next);
        setCachedData("commandcode", next);
      } else if (type === "vertex") {
        const next = apply(vertexKeys);
        await providersApi.saveVertexConfigs(next);
        setVertexKeys(next);
        setCachedData("vertex", next);
      } else {
        const next = apply(bedrockKeys) as BedrockProviderConfig[];
        await providersApi.saveBedrockConfigs(next);
        setBedrockKeys(next);
        setCachedData("bedrock", next);
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
    commandCodeKeys,
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
    setCommandCodeKeys,
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
          setGeminiKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("gemini", next);
            return next;
          });
        } else if (type === "claude") {
          await providersApi.deleteClaudeConfig(entry.apiKey);
          setClaudeKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("claude", next);
            return next;
          });
        } else if (type === "codex") {
          await providersApi.deleteCodexConfig(entry.apiKey);
          setCodexKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("codex", next);
            return next;
          });
        } else if (type === "opencode-go") {
          await providersApi.deleteOpenCodeGoConfig(entry.apiKey);
          setOpenCodeGoKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("opencode-go", next);
            return next;
          });
        } else if (type === "cline") {
          await providersApi.deleteClineConfig(entry.apiKey);
          setClineKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("cline", next);
            return next;
          });
        } else if (type === "ollama-cloud") {
          await providersApi.deleteOllamaCloudConfig(entry.apiKey);
          setOllamaCloudKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("ollama-cloud", next);
            return next;
          });
        } else if (type === "commandcode") {
          await providersApi.deleteCommandCodeConfig(entry.apiKey);
          setCommandCodeKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("commandcode", next);
            return next;
          });
        } else if (type === "vertex") {
          await providersApi.deleteVertexConfig(entry.apiKey);
          setVertexKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("vertex", next);
            return next;
          });
        } else {
          await providersApi.deleteBedrockConfig(index);
          setBedrockKeys((prev) => {
            const next = prev.filter((_, itemIndex) => itemIndex !== index);
            setCachedData("bedrock", next);
            return next;
          });
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
      setCommandCodeKeys,
      setGeminiKeys,
      setOllamaCloudKeys,
      setOpenCodeGoKeys,
      setVertexKeys,
      t,
    ],
  );

  const toggleKeyEnabled = useCallback(
    async (
      type:
        | "gemini"
        | "claude"
        | "codex"
        | "opencode-go"
        | "cline"
        | "ollama-cloud"
        | "commandcode"
        | "bedrock",
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
                    : type === "commandcode"
                      ? commandCodeKeys
                      : bedrockKeys;
      const current = list[index];
      if (!current) return;
      const prev = list;

      const usesExplicitDisabled =
        type === "opencode-go" || type === "cline" || type === "ollama-cloud";

      const nextExcluded = usesExplicitDisabled
        ? current.excludedModels
        : enabled
          ? withoutDisableAllModelsRule(current.excludedModels)
          : withDisableAllModelsRule(current.excludedModels);

      const nextItem: ProviderSimpleConfig = {
        ...current,
        ...(usesExplicitDisabled ? { disabled: !enabled } : {}),
        ...(nextExcluded ? { excludedModels: nextExcluded } : {}),
      };
      const nextList = prev.map((item, itemIndex) =>
        itemIndex === index ? nextItem : item,
      );

      try {
        if (type === "gemini") {
          setGeminiKeys(nextList);
          setCachedData("gemini", nextList);
          await providersApi.saveGeminiKeys(nextList);
        } else if (type === "claude") {
          setClaudeKeys(nextList);
          setCachedData("claude", nextList);
          await providersApi.saveClaudeConfigs(nextList);
        } else if (type === "codex") {
          setCodexKeys(nextList);
          setCachedData("codex", nextList);
          await providersApi.saveCodexConfigs(nextList);
        } else if (type === "opencode-go") {
          setOpenCodeGoKeys(nextList);
          setCachedData("opencode-go", nextList);
          await providersApi.patchOpenCodeGoConfig(index, {
            apiKey: "",
            disabled: !enabled,
          });
        } else if (type === "cline") {
          setClineKeys(nextList);
          setCachedData("cline", nextList);
          await providersApi.patchClineConfig(index, {
            apiKey: "",
            disabled: !enabled,
          });
        } else if (type === "ollama-cloud") {
          setOllamaCloudKeys(nextList);
          setCachedData("ollama-cloud", nextList);
          await providersApi.patchOllamaCloudConfig(index, {
            apiKey: "",
            disabled: !enabled,
          });
        } else if (type === "commandcode") {
          setCommandCodeKeys(nextList);
          setCachedData("commandcode", nextList);
          await providersApi.patchCommandCodeConfig(index, {
            apiKey: "",
            disabled: !enabled,
          });
        } else {
          setBedrockKeys(nextList as BedrockProviderConfig[]);
          setCachedData("bedrock", nextList);
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
        else if (type === "commandcode") setCommandCodeKeys(prev);
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
      commandCodeKeys,
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
      setCommandCodeKeys,
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
    if (
      editKeyType === "opencode-go" ||
      editKeyType === "cline" ||
      editKeyType === "ollama-cloud"
    ) {
      return !keyDraft.disabled;
    }
    const list = excludedModelsFromText(keyDraft.excludedModelsText);
    return !hasDisableAllModelsRule(list);
  }, [editKeyType, keyDraft.disabled, keyDraft.excludedModelsText]);

  const editKeyEnabledToggle = useCallback(
    (enabled: boolean) => {
      if (
        editKeyType === "opencode-go" ||
        editKeyType === "cline" ||
        editKeyType === "ollama-cloud"
      ) {
        setKeyDraft((prev) => ({ ...prev, disabled: !enabled }));
        return;
      }
      const current = excludedModelsFromText(keyDraft.excludedModelsText);
      const next = enabled
        ? withoutDisableAllModelsRule(current)
        : withDisableAllModelsRule(current);
      setKeyDraft((prev) => ({ ...prev, excludedModelsText: next.join("\n") }));
    },
    [editKeyType, keyDraft.excludedModelsText],
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
