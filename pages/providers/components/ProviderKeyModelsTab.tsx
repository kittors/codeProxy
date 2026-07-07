import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@code-proxy/ui";
import { Checkbox } from "@code-proxy/ui";
import { DataTable, type DataTableColumn } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { SearchableSelect } from "@code-proxy/ui";
import { type ProviderKeyDraft } from "../providers-helpers";
import {
  createEmptyModelEntry,
  ModelInputList,
  type ModelEntryDraft,
} from "../ModelInputList";
import { ExcludedModelsEditor } from "./ExcludedModelsEditor";

type ModelAccessRow = { id: string; owned_by?: string };

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
    {children}
  </div>
);

interface ProviderKeyModelsTabProps {
  isOpenCodeGo: boolean;
  isCline: boolean;
  openCodeModels: { id: string; owned_by?: string }[];
  openCodeModelsLoading: boolean;
  openCodeModelsError: string | null;
  openCodeModelQuery: string;
  setOpenCodeModelQuery: (value: string) => void;
  filteredOpenCodeModels: { id: string; owned_by?: string }[];
  allowedOpenCodeCount: number;
  excludeAll: boolean;
  excludedModelIds: Set<string>;
  enabledOpenCodeModelIds: Set<string>;
  fetchOpenCodeModels: () => Promise<void>;
  setAllFetchedOpenCodeModelsAllowed: (allowed: boolean) => void;
  setOpenCodeModelAllowed: (modelId: string, allowed: boolean) => void;
  selectedModelGroup: string;
  setSelectedModelGroup: (value: string) => void;
  modelGroupOptions: { value: string; label: string }[];
  modelConfigsLoading: boolean;
  loadModelsFromGroup: () => void;
  editKeyType: string;
  keyDraft: ProviderKeyDraft;
  setKeyDraft: React.Dispatch<React.SetStateAction<ProviderKeyDraft>>;
  editKeyExcludedCount: number;
  editKeyEnabledToggle: (checked: boolean) => void;
}

export function ProviderKeyModelsTab({
  isOpenCodeGo,
  isCline,
  openCodeModels,
  openCodeModelsLoading,
  openCodeModelsError,
  openCodeModelQuery,
  setOpenCodeModelQuery,
  filteredOpenCodeModels,
  allowedOpenCodeCount,
  excludeAll,
  excludedModelIds,
  enabledOpenCodeModelIds,
  fetchOpenCodeModels,
  setAllFetchedOpenCodeModelsAllowed,
  setOpenCodeModelAllowed,
  selectedModelGroup,
  setSelectedModelGroup,
  modelGroupOptions,
  modelConfigsLoading,
  loadModelsFromGroup,
  editKeyType,
  keyDraft,
  setKeyDraft,
  editKeyExcludedCount,
  editKeyEnabledToggle,
}: ProviderKeyModelsTabProps) {
  const { t } = useTranslation();
  const isOllamaCloud = editKeyType === "ollama-cloud";
  const isModelAccessProvider = isOpenCodeGo || isCline || isOllamaCloud;
  const modelAccessTitle = isCline
    ? t("providers.cline_models_title")
    : isOllamaCloud
      ? t("providers.ollama_cloud_models_title")
      : t("providers.opencode_go_models_title");
  const modelAccessHint = isCline
    ? t("providers.cline_models_hint")
    : isOllamaCloud
      ? t("providers.ollama_cloud_models_hint")
      : t("providers.opencode_go_models_hint");
  const modelEntryByName = useMemo(() => {
    const out = new Map<string, ModelEntryDraft>();
    for (const entry of keyDraft.modelEntries) {
      const key = entry.name.trim().toLowerCase();
      if (key) out.set(key, entry);
    }
    return out;
  }, [keyDraft.modelEntries]);

  const setModelAlias = useCallback(
    (modelId: string, alias: string) => {
      const key = modelId.trim().toLowerCase();
      if (!key) return;
      setKeyDraft((prev) => {
        const existing = prev.modelEntries.find(
          (entry) => entry.name.trim().toLowerCase() === key,
        );
        if (existing) {
          return {
            ...prev,
            modelEntries: prev.modelEntries.map((entry) =>
              entry.id === existing.id ? { ...entry, alias } : entry,
            ),
          };
        }
        return {
          ...prev,
          modelEntries: [
            ...prev.modelEntries,
            { ...createEmptyModelEntry(), name: modelId, alias },
          ],
        };
      });
    },
    [setKeyDraft],
  );

  const modelAccessColumns = useMemo<DataTableColumn<ModelAccessRow>[]>(
    () => [
      {
        key: "model",
        label: t("providers.real_model_id"),
        minWidthPx: 280,
        overflowTooltip: (model) =>
          model.owned_by ? `${model.id}\n${model.owned_by}` : model.id,
        render: (model) => (
          <span className="min-w-0">
            <span className="block truncate font-mono text-xs font-semibold text-slate-800 dark:text-white/85">
              {model.id}
            </span>
            {model.owned_by ? (
              <span className="block truncate text-[11px] text-slate-500 dark:text-white/45">
                {model.owned_by}
              </span>
            ) : null}
          </span>
        ),
      },
      {
        key: "alias",
        label: t("providers.model_alias"),
        minWidthPx: 220,
        render: (model) => {
          const entry = modelEntryByName.get(model.id.toLowerCase());
          return (
            <TextInput
              value={entry?.alias ?? ""}
              onChange={(event) =>
                setModelAlias(model.id, event.currentTarget.value)
              }
              placeholder={t("common.model_alias_placeholder")}
              className="h-8"
            />
          );
        },
      },
      {
        key: "enabled",
        label: t("providers.model_enabled"),
        width: "w-20",
        minWidthPx: 80,
        headerClassName: "text-center",
        cellClassName: "text-center",
        render: (model) => {
          const normalized = model.id.toLowerCase();
          const checked =
            !excludeAll &&
            enabledOpenCodeModelIds.has(normalized) &&
            !excludedModelIds.has(normalized);
          return (
            <div className="flex justify-center">
              <Checkbox
                checked={checked}
                onCheckedChange={(next) =>
                  setOpenCodeModelAllowed(model.id, next)
                }
                aria-label={model.id}
              />
            </div>
          );
        },
      },
    ],
    [
      enabledOpenCodeModelIds,
      excludeAll,
      excludedModelIds,
      modelEntryByName,
      setModelAlias,
      setOpenCodeModelAllowed,
      t,
    ],
  );

  if (isModelAccessProvider) {
    return (
      <div className="space-y-4">
        <SectionCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {modelAccessTitle}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                {modelAccessHint}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchOpenCodeModels()}
              disabled={openCodeModelsLoading}
            >
              <RefreshCw
                size={14}
                className={openCodeModelsLoading ? "animate-spin" : ""}
              />
              {t("providers.refresh")}
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TextInput
              value={openCodeModelQuery}
              onChange={(e) => setOpenCodeModelQuery(e.currentTarget.value)}
              placeholder={t("providers.models_search_placeholder")}
              className="max-w-xs"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAllFetchedOpenCodeModelsAllowed(true)}
              disabled={openCodeModels.length === 0}
            >
              {t("providers.models_select_all")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAllFetchedOpenCodeModelsAllowed(false)}
              disabled={openCodeModels.length === 0}
            >
              {t("providers.models_select_none")}
            </Button>
            <span className="text-xs tabular-nums text-slate-500 dark:text-white/55">
              {t("providers.models_allowed_count", {
                allowed: allowedOpenCodeCount,
                total: openCodeModels.length,
              })}
            </span>
          </div>

          {openCodeModelsError ? (
            <p className="mt-3 rounded-xl bg-rose-500/10 px-3 py-2 text-xs font-medium text-rose-700 dark:text-rose-200">
              {openCodeModelsError}
            </p>
          ) : null}

          <div className="mt-3">
            <DataTable<ModelAccessRow>
              tableId={`provider-model-access-${editKeyType}`}
              rows={filteredOpenCodeModels}
              columns={modelAccessColumns}
              rowKey={(model) => model.id}
              loading={openCodeModelsLoading && openCodeModels.length === 0}
              rowHeight={52}
              caption={modelAccessTitle}
              emptyText={t("providers.no_discovered_models")}
              minWidth="min-w-[720px]"
              height="h-80"
              minHeight="min-h-0"
              showAllLoadedMessage={false}
              columnReorderable={false}
              persistColumnOrder={false}
            />
          </div>
        </SectionCard>

        <SectionCard>
          <ExcludedModelsEditor
            count={editKeyExcludedCount}
            editKeyEnabledToggle={editKeyEnabledToggle}
            keyDraft={keyDraft}
            setKeyDraft={setKeyDraft}
          />
        </SectionCard>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("providers.model_group_label")}
            </p>
            <div className="mt-2">
              <SearchableSelect
                value={selectedModelGroup}
                onChange={(value) => setSelectedModelGroup(value)}
                options={modelGroupOptions}
                placeholder={t("providers.model_group_placeholder")}
                searchPlaceholder={t(
                  "providers.model_group_search_placeholder",
                )}
                aria-label={t("providers.model_group_label")}
              />
            </div>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={loadModelsFromGroup}
            disabled={!selectedModelGroup || modelConfigsLoading}
          >
            {t("providers.load_models")}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
          {t("providers.model_group_hint")}
        </p>
      </SectionCard>

      <SectionCard>
        <ModelInputList
          title={
            editKeyType === "vertex"
              ? t("providers.models_vertex_title")
              : t("providers.models_optional_title")
          }
          entries={keyDraft.modelEntries}
          onChange={(next) =>
            setKeyDraft((prev) => ({ ...prev, modelEntries: next }))
          }
          showPriority
          showTestModel={false}
        />
        {editKeyType === "vertex" ? (
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.vertex_alias_hint")}
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500 dark:text-white/55">
            {t("providers.models_default_hint")}
          </p>
        )}
      </SectionCard>

      <ExcludedModelsEditor
        count={editKeyExcludedCount}
        editKeyEnabledToggle={editKeyEnabledToggle}
        keyDraft={keyDraft}
        setKeyDraft={setKeyDraft}
      />
    </div>
  );
}
