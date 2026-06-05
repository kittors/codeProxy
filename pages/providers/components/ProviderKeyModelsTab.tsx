import { useTranslation } from "react-i18next";
import { RefreshCw } from "lucide-react";
import { Button } from "@code-proxy/ui";
import { Checkbox } from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { SearchableSelect } from "@code-proxy/ui";
import { ModelInputList } from "../ModelInputList";
import type { ProviderKeyDraft } from "../providers-helpers";
import { ExcludedModelsEditor } from "./ExcludedModelsEditor";

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-slate-200 bg-white/70 p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950/60">
    {children}
  </div>
);

interface ProviderKeyModelsTabProps {
  isOpenCodeGo: boolean;
  openCodeModels: { id: string; owned_by?: string }[];
  openCodeModelsLoading: boolean;
  openCodeModelsError: string | null;
  openCodeModelQuery: string;
  setOpenCodeModelQuery: (value: string) => void;
  filteredOpenCodeModels: { id: string; owned_by?: string }[];
  allowedOpenCodeCount: number;
  excludeAll: boolean;
  excludedModelIds: Set<string>;
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
  openCodeModels,
  openCodeModelsLoading,
  openCodeModelsError,
  openCodeModelQuery,
  setOpenCodeModelQuery,
  filteredOpenCodeModels,
  allowedOpenCodeCount,
  excludeAll,
  excludedModelIds,
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

  if (isOpenCodeGo) {
    return (
      <div className="space-y-4">
        <SectionCard>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">
                {t("providers.opencode_go_models_title")}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-white/55">
                {t("providers.opencode_go_models_hint")}
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void fetchOpenCodeModels()}
              disabled={openCodeModelsLoading}
            >
              <RefreshCw size={14} className={openCodeModelsLoading ? "animate-spin" : ""} />
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

          <div className="mt-3 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            {openCodeModelsLoading && openCodeModels.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-white/55">
                {t("providers.models_loading")}
              </div>
            ) : filteredOpenCodeModels.length ? (
              <div className="divide-y divide-slate-100 dark:divide-neutral-900">
                {filteredOpenCodeModels.map((model) => {
                  const checked = !excludeAll && !excludedModelIds.has(model.id.toLowerCase());
                  return (
                    <label
                      key={model.id}
                      className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(next) => setOpenCodeModelAllowed(model.id, next)}
                        aria-label={model.id}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-xs font-semibold text-slate-800 dark:text-white/85">
                          {model.id}
                        </span>
                        {model.owned_by ? (
                          <span className="block truncate text-[11px] text-slate-500 dark:text-white/45">
                            {model.owned_by}
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={
                          checked
                            ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-200"
                            : "rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-700 dark:text-rose-200"
                        }
                      >
                        {checked ? t("providers.model_allowed") : t("providers.model_blocked")}
                      </span>
                    </label>
                  );
                })}
              </div>
            ) : (
              <div className="px-3 py-6 text-center text-sm text-slate-500 dark:text-white/55">
                {t("providers.no_discovered_models")}
              </div>
            )}
          </div>
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
                searchPlaceholder={t("providers.model_group_search_placeholder")}
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
          onChange={(next) => setKeyDraft((prev) => ({ ...prev, modelEntries: next }))}
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
