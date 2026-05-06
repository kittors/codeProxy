import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiCallApi, getApiCallErrorMessage, providersApi } from "@/lib/http/apis";
import type { ApiCallResult, OpenAIProvider } from "@/lib/http/types";
import { useToast } from "@/modules/ui/ToastProvider";
import { keyValueEntriesToRecord } from "@/modules/providers/KeyValueInputList";
import { createEmptyModelEntry } from "@/modules/providers/ModelInputList";
import {
  buildModelsEndpoint,
  buildOpenAIDraft,
  commitModelEntries,
  normalizeDiscoveredModels,
  type OpenAIDraft,
} from "@/modules/providers/providers-helpers";

interface UseOpenAIProviderEditorArgs {
  openaiProviders: OpenAIProvider[];
  setOpenaiProviders: React.Dispatch<React.SetStateAction<OpenAIProvider[]>>;
  refreshAll: () => Promise<void>;
  startRefreshTransition: (action: () => void) => void;
  afterClose: () => void;
}

export function useOpenAIProviderEditor({
  openaiProviders,
  setOpenaiProviders,
  refreshAll,
  startRefreshTransition,
  afterClose,
}: UseOpenAIProviderEditorArgs) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [editOpenAIOpen, setEditOpenAIOpen] = useState(false);
  const [editOpenAIIndex, setEditOpenAIIndex] = useState<number | null>(null);
  const [openaiDraft, setOpenaiDraft] = useState<OpenAIDraft>(() => buildOpenAIDraft(null));
  const [openaiDraftError, setOpenaiDraftError] = useState<string | null>(null);
  const [discoveredModels, setDiscoveredModels] = useState<{ id: string; owned_by?: string }[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverSelected, setDiscoverSelected] = useState<Set<string>>(new Set());

  const closeOpenAIEditor = useCallback(() => {
    setEditOpenAIOpen(false);
    afterClose();
  }, [afterClose]);

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
    if (priority !== undefined && (!Number.isFinite(priority) || !Number.isInteger(priority))) {
      setOpenaiDraftError(t("providers.priority_error"));
      return null;
    }

    const apiKeyEntries = openaiDraft.apiKeyEntries
      .map((entry) => {
        const apiKey = entry.apiKey.trim();
        if (!apiKey) return null;
        const entryHeaders = keyValueEntriesToRecord(entry.headersEntries);
        const proxyUrl = entry.proxyUrl.trim();
        const proxyId = entry.proxyId.trim();
        return {
          apiKey,
          ...(proxyUrl ? { proxyUrl } : {}),
          ...(proxyId ? { proxyId } : {}),
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
  }, [openaiDraft, t]);

  const saveOpenAIDraft = useCallback(async () => {
    try {
      const value = commitOpenAIDraft();
      if (!value) return;

      const index = editOpenAIIndex;
      const next =
        index === null
          ? [...openaiProviders, value]
          : openaiProviders.map((provider, providerIndex) =>
              providerIndex === index ? value : provider,
            );

      setOpenaiProviders(next);
      await providersApi.saveOpenAIProviders(next);
      notify({ type: "success", message: t("providers.saved") });
      closeOpenAIEditor();
      startRefreshTransition(() => void refreshAll());
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
    setOpenaiProviders,
    startRefreshTransition,
    t,
  ]);

  const deleteOpenAIProvider = useCallback(
    async (index: number) => {
      const entry = openaiProviders[index];
      if (!entry) return;
      try {
        await providersApi.deleteOpenAIProvider(entry.name);
        setOpenaiProviders((prev) => prev.filter((_, itemIndex) => itemIndex !== index));
        notify({ type: "success", message: t("providers.deleted") });
      } catch (err: unknown) {
        notify({
          type: "error",
          message: err instanceof Error ? err.message : t("providers.delete_failed"),
        });
      }
    },
    [notify, openaiProviders, setOpenaiProviders, t],
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
      setDiscoverSelected(new Set(list.map((model) => model.id)));
    } catch (err: unknown) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("providers.fetch_models_failed"),
      });
    } finally {
      setDiscovering(false);
    }
  }, [notify, openaiDraft.apiKeyEntries, openaiDraft.baseUrl, openaiDraft.headersEntries, t]);

  const applyDiscoveredModels = useCallback(() => {
    const selected = new Set(discoverSelected);
    const picked = discoveredModels.filter((model) => selected.has(model.id));
    if (picked.length === 0) {
      notify({ type: "info", message: t("providers.no_models_selected") });
      return;
    }

    const current = openaiDraft.modelEntries;
    const seen = new Set(current.map((model) => model.name.trim().toLowerCase()).filter(Boolean));
    const merged = [...current];
    for (const model of picked) {
      const key = model.id.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...createEmptyModelEntry(), name: model.id });
    }

    setOpenaiDraft((prev) => ({ ...prev, modelEntries: merged }));
    notify({ type: "success", message: t("providers.models_merged") });
  }, [discoverSelected, discoveredModels, notify, openaiDraft.modelEntries, t]);

  return {
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
  };
}
