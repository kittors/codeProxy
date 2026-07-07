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
import { modelsApi } from "@code-proxy/api-client";
import type { ProxyPoolEntry } from "@code-proxy/api-client/endpoints/proxies";
import { Button } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@code-proxy/ui";
import type { ProviderKeyDraft } from "../providers-helpers";
import {
  excludedModelsFromText,
  hasDisableAllModelsRule,
} from "../providers-helpers";
import { createEmptyModelEntry, type ModelEntryDraft } from "../ModelInputList";
import { ProviderKeyStatusBadges } from "./ProviderKeyStatusBadges";
import { ProviderKeyBasicTab } from "./ProviderKeyBasicTab";
import { ProviderKeyRequestTab } from "./ProviderKeyRequestTab";
import { ProviderKeyModelsTab } from "./ProviderKeyModelsTab";
import {
  fetchModelAccessCatalog,
  isModelAllowedForProvider,
  type ModelAccessProvider,
} from "../provider-model-access";

type ProviderKeyModalTab = "basic" | "request" | "models";

const isOpenCodeGoVisionModel = (modelId: string): boolean => {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) return false;
  const baseModel = normalized.includes("/")
    ? normalized.slice(normalized.lastIndexOf("/") + 1)
    : normalized;
  const candidates = [normalized, baseModel];
  // OpenCode Go and Cline model lists do not expose capability metadata, so keep
  // the known visual models plus conservative name tokens used by both catalogs.
  const knownVisionModels = new Set([
    "qwen3.5-plus",
    "qwen3.6-plus",
    "mimo-v2-omni",
    "mimo-v2.5",
    "mimo-v2.5-pro",
  ]);
  if (candidates.some((candidate) => knownVisionModels.has(candidate)))
    return true;
  if (
    candidates.some(
      (candidate) =>
        candidate.includes("vision") ||
        candidate.includes("multimodal") ||
        candidate.includes("omni"),
    )
  ) {
    return true;
  }
  return candidates.some((candidate) =>
    candidate.split(/[-_./:]+/).some((token) => token === "vl"),
  );
};

interface ProviderKeyModalProps {
  open: boolean;
  editKeyIndex: number | null;
  editKeyTitle: string;
  editKeyType:
    | "gemini"
    | "claude"
    | "codex"
    | "opencode-go"
    | "cline"
    | "ollama-cloud"
    | "vertex"
    | "bedrock";
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
  const [openCodeModels, setOpenCodeModels] = useState<
    { id: string; owned_by?: string }[]
  >([]);
  const [openCodeModelsLoading, setOpenCodeModelsLoading] = useState(false);
  const [openCodeModelsError, setOpenCodeModelsError] = useState<string | null>(
    null,
  );
  const [openCodeModelQuery, setOpenCodeModelQuery] = useState("");

  const isBedrock = editKeyType === "bedrock";
  const isOpenCodeGo = editKeyType === "opencode-go";
  const isCline = editKeyType === "cline";
  const isOllamaCloud = editKeyType === "ollama-cloud";
  const isModelAccessProvider = isOpenCodeGo || isCline || isOllamaCloud;
  const showModelsTab = true;

  const [modelConfigs, setModelConfigs] = useState<
    { id: string; owned_by: string }[]
  >([]);
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
    const models = modelConfigs.filter(
      (m) => m.owned_by === selectedModelGroup,
    );
    if (!models.length) return;

    const existingNames = new Set(
      keyDraft.modelEntries
        .map((e) => e.name.trim().toLowerCase())
        .filter(Boolean),
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
  }, [editKeyIndex, editKeyType, open]);

  useEffect(() => {
    if (!open || !showModelsTab) return;
    let cancelled = false;
    setModelConfigsLoading(true);
    modelsApi
      .getModelConfigs("library")
      .then((items) => {
        if (cancelled) return;
        setModelConfigs(
          items.map((item) => ({ id: item.id, owned_by: item.owned_by })),
        );
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
  }, [open, showModelsTab]);

  const fetchOpenCodeModels = useCallback(async () => {
    if (!isModelAccessProvider) return;
    setOpenCodeModelsLoading(true);
    setOpenCodeModelsError(null);
    try {
      setOpenCodeModels(
        await fetchModelAccessCatalog(
          isCline ? "cline" : isOllamaCloud ? "ollama-cloud" : "opencode-go",
        ),
      );
    } catch (err: unknown) {
      setOpenCodeModelsError(
        err instanceof Error ? err.message : t("providers.fetch_models_failed"),
      );
    } finally {
      setOpenCodeModelsLoading(false);
    }
  }, [isCline, isModelAccessProvider, isOllamaCloud, t]);

  useEffect(() => {
    if (!open || !isModelAccessProvider) return;
    void fetchOpenCodeModels();
  }, [fetchOpenCodeModels, isModelAccessProvider, open]);

  const excludedModels = useMemo(
    () => excludedModelsFromText(keyDraft.excludedModelsText),
    [keyDraft.excludedModelsText],
  );
  const disableAllModels = hasDisableAllModelsRule(excludedModels);
  const excludedModelIds = useMemo(() => new Set<string>(), []);
  const enabledOpenCodeModelIds = useMemo(
    () =>
      new Set(
        keyDraft.modelEntries
          .map((model) => model.name.trim().toLowerCase())
          .filter(Boolean),
      ),
    [keyDraft.modelEntries],
  );
  const isOpenCodeModelAllowed = useCallback(
    (modelId: string) => {
      const normalized = modelId.trim().toLowerCase();
      return (
        normalized !== "" &&
        !disableAllModels &&
        enabledOpenCodeModelIds.has(normalized)
      );
    },
    [disableAllModels, enabledOpenCodeModelIds],
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
    const optionMap = new Map<string, { value: string; label: string }>();
    for (const model of openCodeModels) {
      if (
        !isOpenCodeGoVisionModel(model.id) ||
        !isOpenCodeModelAllowed(model.id)
      )
        continue;
      optionMap.set(model.id.toLowerCase(), {
        value: model.id,
        label: model.owned_by ? `${model.id} · ${model.owned_by}` : model.id,
      });
    }
    for (const model of modelConfigs) {
      const id = model.id.trim();
      if (!id) continue;
      optionMap.set(id.toLowerCase(), {
        value: id,
        label: model.owned_by ? `${id} · ${model.owned_by}` : id,
      });
    }
    const modelOptions = Array.from(optionMap.values()).sort((a, b) =>
      a.value.localeCompare(b.value),
    );
    const currentFallback = keyDraft.visionFallbackModel.trim();
    const hasCurrentFallback =
      currentFallback !== "" &&
      !modelOptions.some(
        (model) => model.value.toLowerCase() === currentFallback.toLowerCase(),
      );
    // Preserve existing configs even when "*" or a catalog refresh makes the model unavailable.
    const currentFallbackOption = hasCurrentFallback
      ? [
          {
            value: currentFallback,
            label: t("providers.opencode_go_vision_fallback_unavailable", {
              model: currentFallback,
            }),
          },
        ]
      : [];
    return [
      { value: "", label: t("providers.opencode_go_vision_fallback_none") },
      ...currentFallbackOption,
      ...modelOptions,
    ];
  }, [
    isOpenCodeModelAllowed,
    keyDraft.visionFallbackModel,
    modelConfigs,
    openCodeModels,
    t,
  ]);

  const setOpenCodeModelAllowed = useCallback(
    (modelId: string, allowed: boolean) => {
      const normalized = modelId.trim().toLowerCase();
      if (!normalized) return;
      setKeyDraft((prev) => {
        const exists = prev.modelEntries.some(
          (entry) => entry.name.trim().toLowerCase() === normalized,
        );
        const currentExcluded = excludedModelsFromText(prev.excludedModelsText);
        const nextExcluded = allowed
          ? currentExcluded.filter((model) => model.trim() !== "*")
          : currentExcluded;
        const nextEntries = allowed
          ? exists
            ? prev.modelEntries
            : [
                ...prev.modelEntries,
                { ...createEmptyModelEntry(), name: modelId },
              ]
          : prev.modelEntries.filter(
              (entry) => entry.name.trim().toLowerCase() !== normalized,
            );
        return {
          ...prev,
          excludedModelsText: nextExcluded.join("\n"),
          modelEntries: nextEntries,
        };
      });
    },
    [setKeyDraft],
  );

  const setAllFetchedOpenCodeModelsAllowed = useCallback(
    (allowed: boolean) => {
      const fetchedIds = new Set(
        openCodeModels.map((model) => model.id.trim().toLowerCase()),
      );
      setKeyDraft((prev) => {
        const currentExcluded = excludedModelsFromText(prev.excludedModelsText);
        const existingNames = new Set(
          prev.modelEntries
            .map((entry) => entry.name.trim().toLowerCase())
            .filter(Boolean),
        );
        const addedEntries = openCodeModels
          .filter((model) => !existingNames.has(model.id.trim().toLowerCase()))
          .map((model) => ({ ...createEmptyModelEntry(), name: model.id }));
        return {
          ...prev,
          excludedModelsText: allowed
            ? currentExcluded.filter((model) => model.trim() !== "*").join("\n")
            : prev.excludedModelsText,
          modelEntries: allowed
            ? [...prev.modelEntries, ...addedEntries]
            : prev.modelEntries.filter(
                (entry) => !fetchedIds.has(entry.name.trim().toLowerCase()),
              ),
        };
      });
    },
    [openCodeModels, setKeyDraft],
  );

  useEffect(() => {
    if (!open || !isModelAccessProvider || openCodeModels.length === 0) return;
    const provider: ModelAccessProvider = isCline
      ? "cline"
      : isOllamaCloud
        ? "ollama-cloud"
        : "opencode-go";
    setKeyDraft((prev) => {
      const existingNames = new Set(
        prev.modelEntries
          .map((entry) => entry.name.trim().toLowerCase())
          .filter(Boolean),
      );
      const nextEntries = [...prev.modelEntries];
      for (const model of openCodeModels) {
        const name = model.id.trim();
        const key = name.toLowerCase();
        if (!key || existingNames.has(key)) continue;
        if (!isModelAllowedForProvider(provider, name)) continue;
        existingNames.add(key);
        nextEntries.push({ ...createEmptyModelEntry(), name });
      }
      return nextEntries.length === prev.modelEntries.length
        ? prev
        : { ...prev, modelEntries: nextEntries };
    });
  }, [
    isCline,
    isModelAccessProvider,
    isOllamaCloud,
    open,
    openCodeModels,
    setKeyDraft,
  ]);
  const statusBadges = (
    <ProviderKeyStatusBadges
      editKeyEnabled={editKeyEnabled}
      editKeyHeaderCount={editKeyHeaderCount}
      editKeyModelCount={editKeyModelCount}
      editKeyExcludedCount={editKeyExcludedCount}
      editKeyType={editKeyType}
      showModelBadges={showModelsTab}
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
            : isCline
              ? t("providers.cline_config_desc")
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
      <Tabs
        value={modalTab}
        onValueChange={(next) => setModalTab(next as ProviderKeyModalTab)}
      >
        <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-5 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
          <TabsList>
            <TabsTrigger value="basic">
              {t("providers.modal_tab_basic")}
            </TabsTrigger>
            <TabsTrigger value="request">
              {t("providers.modal_tab_request")}
            </TabsTrigger>
            {showModelsTab ? (
              <TabsTrigger value="models">
                {t("providers.modal_tab_models")}
              </TabsTrigger>
            ) : null}
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
              isCline={isCline}
              isOllamaCloud={isOllamaCloud}
              openCodeVisionFallbackOptions={openCodeVisionFallbackOptions}
              openCodeModelsLoading={openCodeModelsLoading}
            />
          </TabsContent>

          {showModelsTab ? (
            <TabsContent value="models">
              <ProviderKeyModelsTab
                isOpenCodeGo={isOpenCodeGo}
                isCline={isCline}
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
                setAllFetchedOpenCodeModelsAllowed={
                  setAllFetchedOpenCodeModelsAllowed
                }
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
          ) : null}
        </div>
      </Tabs>
    </Modal>
  );
}
