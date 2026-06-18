import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useTranslation } from "react-i18next";
import { Check } from "lucide-react";
import {
  apiCallApi,
  authFilesApi,
  getApiCallErrorMessage,
  modelsApi,
} from "@code-proxy/api-client";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { Button } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@code-proxy/ui";
import type { ProviderKeyDraft } from "../providers-helpers";
import {
  excludedModelsFromText,
  hasDisableAllModelsRule,
  normalizeDiscoveredModels,
  stripDisableAllModelsRule,
} from "../providers-helpers";
import type { ModelEntryDraft } from "../ModelInputList";
import { ProviderKeyStatusBadges } from "./ProviderKeyStatusBadges";
import { ProviderKeyBasicTab } from "./ProviderKeyBasicTab";
import { ProviderKeyRequestTab } from "./ProviderKeyRequestTab";
import { ProviderKeyModelsTab } from "./ProviderKeyModelsTab";

type ProviderKeyModalTab = "basic" | "request" | "models";

const OPENCODE_GO_MODELS_URL = "https://opencode.ai/zen/go/v1/models";

const createModelEntryDraft = (name: string): ModelEntryDraft => ({
  id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`,
  name,
  alias: "",
  priorityText: "",
  testModel: "",
});

const isOpenCodeGoVisionModel = (modelId: string): boolean => {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;
  const KNOWN = new Set([
    "qwen3.5-plus",
    "qwen3.6-plus",
    "mimo-v2-omni",
    "mimo-v2.5",
    "mimo-v2.5-pro",
  ]);
  if (KNOWN.has(normalized)) return true;
  if (
    normalized.includes("vision") ||
    normalized.includes("multimodal") ||
    normalized.includes("omni")
  ) {
    return true;
  }
  return normalized.split(/[-_./:]+/).some((token) => token === "vl");
};

interface ProviderKeyModalProps {
  open: boolean;
  editKeyIndex: number | null;
  editKeyTitle: string;
  editKeyType: "gemini" | "claude" | "codex" | "opencode-go" | "vertex" | "bedrock";
  keyDraft: ProviderKeyDraft;
  setKeyDraft: Dispatch<SetStateAction<ProviderKeyDraft>>;
  keyDraftError: string | null;
  closeKeyEditor: () => void;
  saveKeyDraft: () => Promise<void>;
  editKeyEnabled: boolean;
  editKeyEnabledToggle: (checked: boolean) => void;
  editKeyHeaderCount: number;
  editKeyModelCount: number;
  editKeyExcludedCount: number;
  proxyPoolEntries: ProxyPoolEntry[];
  copyText: (text: string) => Promise<void>;
  maskApiKey: (value: string) => string;
}

export function ProviderKeyModal({
  open,
  editKeyIndex,
  editKeyTitle,
  editKeyType,
  keyDraft,
  setKeyDraft,
  keyDraftError,
  closeKeyEditor,
  saveKeyDraft,
  editKeyEnabled,
  editKeyEnabledToggle,
  editKeyHeaderCount,
  editKeyModelCount,
  editKeyExcludedCount,
  proxyPoolEntries,
  copyText,
  maskApiKey,
}: ProviderKeyModalProps) {
  const { t } = useTranslation();
  const [modalTab, setModalTab] = useState<ProviderKeyModalTab>("basic");
  const [openCodeModels, setOpenCodeModels] = useState<{ id: string; owned_by?: string }[]>([]);
  const [openCodeStaticModels, setOpenCodeStaticModels] = useState<
    { id: string; owned_by?: string }[]
  >([]);
  const [openCodeModelsSeeded, setOpenCodeModelsSeeded] = useState(false);
  const [openCodeModelsLoading, setOpenCodeModelsLoading] = useState(false);
  const [openCodeModelsError, setOpenCodeModelsError] = useState<string | null>(null);
  const [openCodeModelQuery, setOpenCodeModelQuery] = useState("");

  const isBedrock = editKeyType === "bedrock";
  const isOpenCodeGo = editKeyType === "opencode-go";

  const [modelConfigs, setModelConfigs] = useState<{ id: string; owned_by: string }[]>([]);
  const [modelConfigsLoading, setModelConfigsLoading] = useState(false);
  const [selectedModelGroup, setSelectedModelGroup] = useState("");

  const modelGroupOptions = useMemo(() => {
    const uniqueOwners = Array.from(
      new Set(modelConfigs.map((m) => m.owned_by).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b));
    return [
      { value: "", label: t("providers.model_group_placeholder") },
      ...uniqueOwners.map((owner) => ({ value: owner, label: owner })),
    ];
  }, [modelConfigs, t]);

  const loadModelsFromGroup = useCallback(() => {
    if (!selectedModelGroup) return;
    const models = modelConfigs.filter((m) => m.owned_by === selectedModelGroup);
    if (!models.length) return;

    const existingNames = new Set(
      keyDraft.modelEntries.map((e) => e.name.trim().toLowerCase()).filter(Boolean),
    );

    const newEntries: ModelEntryDraft[] = [];
    for (const model of models) {
      const name = model.id.trim();
      if (!name || existingNames.has(name.toLowerCase())) continue;
      existingNames.add(name.toLowerCase());
      newEntries.push({
        id: `model-${Date.now()}-${Math.random().toString(16).slice(2)}-${name}`,
        name,
        alias: "",
        priorityText: "",
        testModel: "",
      });
    }

    if (newEntries.length === 0) return;
    setKeyDraft((prev) => ({
      ...prev,
      modelEntries: [...prev.modelEntries, ...newEntries],
    }));
  }, [selectedModelGroup, modelConfigs, keyDraft.modelEntries, setKeyDraft]);

  useEffect(() => {
    if (!open) return;
    setModalTab("basic");
    setOpenCodeModelQuery("");
    setSelectedModelGroup("");
    setOpenCodeModelsSeeded(false);
  }, [editKeyIndex, editKeyType, open]);

  useEffect(() => {
    if (!open || isOpenCodeGo) return;
    let cancelled = false;
    setModelConfigsLoading(true);
    modelsApi
      .getModelConfigs("library")
      .then((items) => {
        if (cancelled) return;
        setModelConfigs(items.map((item) => ({ id: item.id, owned_by: item.owned_by })));
      })
      .catch(() => {
        if (cancelled) return;
        setModelConfigs([]);
      })
      .finally(() => {
        if (!cancelled) setModelConfigsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, isOpenCodeGo]);

  const fetchOpenCodeModels = useCallback(async () => {
    if (!isOpenCodeGo) return;
    setOpenCodeModelsLoading(true);
    setOpenCodeModelsError(null);
    try {
      const result = await apiCallApi.request({
        method: "GET",
        url: OPENCODE_GO_MODELS_URL,
      });
      if (result.statusCode < 200 || result.statusCode >= 300) {
        throw new Error(getApiCallErrorMessage(result));
      }
      setOpenCodeModels(normalizeDiscoveredModels(result.body ?? result.bodyText));
    } catch (err: unknown) {
      setOpenCodeModelsError(
        err instanceof Error ? err.message : t("providers.fetch_models_failed"),
      );
    } finally {
      setOpenCodeModelsLoading(false);
    }
  }, [isOpenCodeGo, t]);

  useEffect(() => {
    if (!open || !isOpenCodeGo) return;
    void fetchOpenCodeModels();
  }, [fetchOpenCodeModels, isOpenCodeGo, open]);

  useEffect(() => {
    if (!open || !isOpenCodeGo) return;
    let cancelled = false;
    authFilesApi
      .getModelDefinitions("opencode-go")
      .then((items) => {
        if (cancelled) return;
        setOpenCodeStaticModels(
          normalizeDiscoveredModels({ data: items.map((item) => ({ ...item, object: "model" })) }),
        );
      })
      .catch(() => {
        if (!cancelled) setOpenCodeStaticModels([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpenCodeGo, open]);

  const excludedModels = useMemo(
    () => excludedModelsFromText(keyDraft.excludedModelsText),
    [keyDraft.excludedModelsText],
  );
  const disableAllModels = hasDisableAllModelsRule(excludedModels);
  const excludedModelIds = useMemo(
    () => new Set(stripDisableAllModelsRule(excludedModels).map((model) => model.toLowerCase())),
    [excludedModels],
  );
  const enabledOpenCodeModelIds = useMemo(
    () =>
      new Set(
        keyDraft.modelEntries.map((entry) => entry.name.trim().toLowerCase()).filter(Boolean),
      ),
    [keyDraft.modelEntries],
  );
  const isOpenCodeModelAllowed = useCallback(
    (modelId: string) => {
      const normalized = modelId.trim().toLowerCase();
      return (
        normalized !== "" &&
        !disableAllModels &&
        enabledOpenCodeModelIds.has(normalized) &&
        !excludedModelIds.has(normalized)
      );
    },
    [disableAllModels, enabledOpenCodeModelIds, excludedModelIds],
  );
  const filteredOpenCodeModels = useMemo(() => {
    const query = openCodeModelQuery.trim().toLowerCase();
    if (!query) return openCodeModels;
    return openCodeModels.filter((model) => {
      const owner = (model.owned_by ?? "").toLowerCase();
      return model.id.toLowerCase().includes(query) || owner.includes(query);
    });
  }, [openCodeModelQuery, openCodeModels]);
  const allowedOpenCodeCount = openCodeModels.filter((model) =>
    isOpenCodeModelAllowed(model.id),
  ).length;
  const openCodeVisionFallbackOptions = useMemo(() => {
    const allowedModels = openCodeModels.filter(
      (model) => isOpenCodeGoVisionModel(model.id) && isOpenCodeModelAllowed(model.id),
    );
    const modelOptions = allowedModels.map((model) => ({
      value: model.id,
      label: model.owned_by ? `${model.id} · ${model.owned_by}` : model.id,
    }));
    return [{ value: "", label: t("providers.opencode_go_vision_fallback_none") }, ...modelOptions];
  }, [isOpenCodeModelAllowed, openCodeModels, t]);

  useEffect(() => {
    if (!open || !isOpenCodeGo || openCodeModelsSeeded) return;
    if (disableAllModels || keyDraft.modelEntries.some((entry) => entry.name.trim())) {
      setOpenCodeModelsSeeded(true);
      return;
    }
    if (openCodeStaticModels.length === 0) return;

    const entries = openCodeStaticModels
      .map((model) => model.id.trim())
      .filter((id) => id && !excludedModelIds.has(id.toLowerCase()))
      .map(createModelEntryDraft);
    setOpenCodeModelsSeeded(true);
    if (entries.length === 0) return;
    setKeyDraft((prev) =>
      prev.modelEntries.some((entry) => entry.name.trim())
        ? prev
        : { ...prev, modelEntries: entries },
    );
  }, [
    disableAllModels,
    excludedModelIds,
    isOpenCodeGo,
    keyDraft.modelEntries,
    open,
    openCodeModelsSeeded,
    openCodeStaticModels,
    setKeyDraft,
  ]);

  useEffect(() => {
    if (!open || !isOpenCodeGo || openCodeModels.length === 0) return;
    const fallback = keyDraft.visionFallbackModel.trim();
    if (!fallback) return;
    const fallbackLower = fallback.toLowerCase();
    const allowed = openCodeModels.some(
      (model) =>
        model.id.toLowerCase() === fallbackLower &&
        isOpenCodeGoVisionModel(model.id) &&
        isOpenCodeModelAllowed(model.id),
    );
    if (allowed) return;
    setKeyDraft((prev) =>
      prev.visionFallbackModel.trim().toLowerCase() === fallbackLower
        ? { ...prev, visionFallbackModel: "" }
        : prev,
    );
  }, [
    isOpenCodeModelAllowed,
    isOpenCodeGo,
    keyDraft.visionFallbackModel,
    open,
    openCodeModels,
    setKeyDraft,
  ]);

  const setOpenCodeModelAllowed = useCallback(
    (modelId: string, allowed: boolean) => {
      const normalized = modelId.trim().toLowerCase();
      if (!normalized) return;
      setKeyDraft((prev) => {
        const currentExcluded = stripDisableAllModelsRule(
          excludedModelsFromText(prev.excludedModelsText),
        );
        const nextExcluded = currentExcluded.filter(
          (model) => model.trim().toLowerCase() !== normalized,
        );
        const modelEntries = prev.modelEntries.filter(
          (entry) => entry.name.trim().toLowerCase() !== normalized,
        );
        return {
          ...prev,
          modelEntries: allowed ? [...modelEntries, createModelEntryDraft(modelId)] : modelEntries,
          excludedModelsText: (allowed ? nextExcluded : [...nextExcluded, modelId]).join("\n"),
        };
      });
    },
    [setKeyDraft],
  );

  const setAllFetchedOpenCodeModelsAllowed = useCallback(
    (allowed: boolean) => {
      const fetchedIds = new Set(openCodeModels.map((model) => model.id.toLowerCase()));
      setKeyDraft((prev) => {
        const currentExcluded = stripDisableAllModelsRule(
          excludedModelsFromText(prev.excludedModelsText),
        );
        const unknownExcluded = currentExcluded.filter(
          (model) => !fetchedIds.has(model.toLowerCase()),
        );
        const unknownEntries = prev.modelEntries.filter(
          (entry) => !fetchedIds.has(entry.name.trim().toLowerCase()),
        );
        return {
          ...prev,
          modelEntries: allowed
            ? [...unknownEntries, ...openCodeModels.map((model) => createModelEntryDraft(model.id))]
            : unknownEntries,
          excludedModelsText: (allowed
            ? unknownExcluded
            : [...unknownExcluded, ...openCodeModels.map((model) => model.id)]
          ).join("\n"),
        };
      });
    },
    [openCodeModels, setKeyDraft],
  );

  const statusBadges = (
    <ProviderKeyStatusBadges
      editKeyEnabled={editKeyEnabled}
      editKeyHeaderCount={editKeyHeaderCount}
      editKeyModelCount={editKeyModelCount}
      editKeyExcludedCount={editKeyExcludedCount}
      editKeyType={editKeyType}
      isOpenCodeGo={isOpenCodeGo}
      allowedOpenCodeCount={allowedOpenCodeCount}
      totalOpenCodeModels={openCodeModels.length}
      authMode={keyDraft.authMode}
    />
  );

  return (
    <Modal
      open={open}
      title={
        editKeyIndex === null
          ? t("providers.add_config", { type: editKeyTitle })
          : t("providers.edit_config", { type: editKeyTitle })
      }
      description={
        editKeyType === "vertex"
          ? t("providers.vertex_config_desc")
          : isBedrock
            ? t("providers.bedrock_config_desc")
            : isOpenCodeGo
              ? t("providers.opencode_go_config_desc")
              : t("providers.generic_config_desc")
      }
      onClose={closeKeyEditor}
      maxWidth="max-w-4xl"
      bodyHeightClassName="max-h-[74vh]"
      bodyClassName="!px-0 !py-0"
      footer={
        <div className="flex flex-wrap items-center gap-2">
          {keyDraftError ? (
            <span className="text-sm font-semibold text-rose-700 dark:text-rose-200">
              {keyDraftError}
            </span>
          ) : null}
          <Button variant="secondary" onClick={closeKeyEditor}>
            {t("providers.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void saveKeyDraft()}>
            <Check size={14} />
            {t("providers.save")}
          </Button>
        </div>
      }
    >
      <Tabs value={modalTab} onValueChange={(next) => setModalTab(next as ProviderKeyModalTab)}>
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <TabsList>
            <TabsTrigger value="basic">{t("providers.modal_tab_basic")}</TabsTrigger>
            <TabsTrigger value="request">{t("providers.modal_tab_request")}</TabsTrigger>
            <TabsTrigger value="models">{t("providers.modal_tab_models")}</TabsTrigger>
          </TabsList>
        </div>

        <div className="px-5 py-4">
          <TabsContent value="basic">
            <ProviderKeyBasicTab
              keyDraft={keyDraft}
              setKeyDraft={setKeyDraft}
              editKeyType={editKeyType}
              editKeyEnabled={editKeyEnabled}
              editKeyEnabledToggle={editKeyEnabledToggle}
              copyText={copyText}
              maskApiKey={maskApiKey}
              statusBadges={statusBadges}
            />
          </TabsContent>

          <TabsContent value="request">
            <ProviderKeyRequestTab
              keyDraft={keyDraft}
              setKeyDraft={setKeyDraft}
              editKeyType={editKeyType}
              proxyPoolEntries={proxyPoolEntries}
              isOpenCodeGo={isOpenCodeGo}
              openCodeVisionFallbackOptions={openCodeVisionFallbackOptions}
              openCodeModelsLoading={openCodeModelsLoading}
            />
          </TabsContent>

          <TabsContent value="models">
            <ProviderKeyModelsTab
              isOpenCodeGo={isOpenCodeGo}
              openCodeModels={openCodeModels}
              openCodeModelsLoading={openCodeModelsLoading}
              openCodeModelsError={openCodeModelsError}
              openCodeModelQuery={openCodeModelQuery}
              setOpenCodeModelQuery={setOpenCodeModelQuery}
              filteredOpenCodeModels={filteredOpenCodeModels}
              allowedOpenCodeCount={allowedOpenCodeCount}
              excludeAll={disableAllModels}
              excludedModelIds={excludedModelIds}
              enabledOpenCodeModelIds={enabledOpenCodeModelIds}
              fetchOpenCodeModels={fetchOpenCodeModels}
              setAllFetchedOpenCodeModelsAllowed={setAllFetchedOpenCodeModelsAllowed}
              setOpenCodeModelAllowed={setOpenCodeModelAllowed}
              selectedModelGroup={selectedModelGroup}
              setSelectedModelGroup={setSelectedModelGroup}
              modelGroupOptions={modelGroupOptions}
              modelConfigsLoading={modelConfigsLoading}
              loadModelsFromGroup={loadModelsFromGroup}
              editKeyType={editKeyType}
              keyDraft={keyDraft}
              setKeyDraft={setKeyDraft}
              editKeyExcludedCount={editKeyExcludedCount}
              editKeyEnabledToggle={editKeyEnabledToggle}
            />
          </TabsContent>
        </div>
      </Tabs>
    </Modal>
  );
}
