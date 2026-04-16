import { useCallback, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/modules/ui/ToastProvider";
import type { ProviderSimpleConfig } from "@/lib/http/types";
import { providersApi } from "@/lib/http/apis";
import { keyValueEntriesToRecord } from "@/modules/providers/KeyValueInputList";
import {
  buildProviderKeyDraft,
  commitModelEntries,
  excludedModelsFromText,
  hasDisableAllModelsRule,
  stripDisableAllModelsRule,
  withDisableAllModelsRule,
  withoutDisableAllModelsRule,
  type ProviderKeyDraft,
} from "@/modules/providers/providers-helpers";

export type ProviderKeyType = "gemini" | "claude" | "codex" | "vertex";

interface UseProviderKeyEditorArgs {
  geminiKeys: ProviderSimpleConfig[];
  claudeKeys: ProviderSimpleConfig[];
  codexKeys: ProviderSimpleConfig[];
  vertexKeys: ProviderSimpleConfig[];
  setGeminiKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setClaudeKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setCodexKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  setVertexKeys: Dispatch<SetStateAction<ProviderSimpleConfig[]>>;
  refreshAll: () => Promise<void>;
  startRefreshTransition: (action: () => void) => void;
  afterClose: () => void;
}

export function useProviderKeyEditor({
  geminiKeys,
  claudeKeys,
  codexKeys,
  vertexKeys,
  setGeminiKeys,
  setClaudeKeys,
  setCodexKeys,
  setVertexKeys,
  refreshAll,
  startRefreshTransition,
  afterClose,
}: UseProviderKeyEditorArgs) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [editKeyOpen, setEditKeyOpen] = useState(false);
  const [editKeyType, setEditKeyType] = useState<ProviderKeyType>("gemini");
  const [editKeyIndex, setEditKeyIndex] = useState<number | null>(null);
  const [keyDraft, setKeyDraft] = useState<ProviderKeyDraft>(() => buildProviderKeyDraft(null));
  const [keyDraftError, setKeyDraftError] = useState<string | null>(null);

  const getListByType = useCallback(
    (type: ProviderKeyType) =>
      type === "gemini"
        ? geminiKeys
        : type === "claude"
          ? claudeKeys
          : type === "codex"
            ? codexKeys
            : vertexKeys,
    [claudeKeys, codexKeys, geminiKeys, vertexKeys],
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
      setKeyDraft(buildProviderKeyDraft(current));
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
  }, [editKeyType, keyDraft, t]);

  const saveKeyDraft = useCallback(async () => {
    const value = commitKeyDraft();
    if (!value) return;

    const type = editKeyType;
    const index = editKeyIndex;
    const apply = (list: ProviderSimpleConfig[]) => {
      if (index === null) return [...list, value];
      return list.map((item, itemIndex) => (itemIndex === index ? value : item));
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
      startRefreshTransition(() => void refreshAll());
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
    setClaudeKeys,
    setCodexKeys,
    setGeminiKeys,
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
          setGeminiKeys((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
        } else if (type === "claude") {
          await providersApi.deleteClaudeConfig(entry.apiKey);
          setClaudeKeys((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
        } else if (type === "codex") {
          await providersApi.deleteCodexConfig(entry.apiKey);
          setCodexKeys((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
        } else {
          await providersApi.deleteVertexConfig(entry.apiKey);
          setVertexKeys((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
        }
        notify({ type: "success", message: t("providers.deleted") });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("providers.delete_failed"),
        });
      }
    },
    [getListByType, notify, setClaudeKeys, setCodexKeys, setGeminiKeys, setVertexKeys, t],
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
      const nextList = prev.map((item, itemIndex) => (itemIndex === index ? nextItem : item));

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
        startRefreshTransition(() => void refreshAll());
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
    [
      claudeKeys,
      codexKeys,
      geminiKeys,
      notify,
      refreshAll,
      setClaudeKeys,
      setCodexKeys,
      setGeminiKeys,
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
          : "Vertex";

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
    () => keyDraft.headersEntries.filter((entry) => entry.key.trim() && entry.value.trim()).length,
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
