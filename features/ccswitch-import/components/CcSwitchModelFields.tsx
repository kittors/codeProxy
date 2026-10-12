import { useTranslation } from "react-i18next";
import { ArrowRight, LoaderCircle, Trash2 } from "lucide-react";
import {
  Button,
  FormField,
  FormSection,
  SearchableCheckboxMultiSelect,
  SearchableSelect,
  TextInput,
  type SearchableSelectOption,
} from "@code-proxy/ui";
import {
  CC_SWITCH_CLAUDE_TIER_ROLES,
  getCcSwitchClientConfig,
} from "@code-proxy/domain/ccswitch/ccswitchClients";
import type { CcSwitchModelMapping } from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import {
  getAliasMappings,
  getAliasRequestNames,
  getDefaultMapping,
  getPrimaryModel,
  getRoleMapping,
  getRouteModels,
  isAliasMapping,
  removeAliasMapping,
  setClaudeRoleModel,
  setDefaultContextWindow,
  setDefaultModel,
  setRouteModels,
  type ConfigDraft,
} from "./ccswitchConfigDraft";
import { dedupeModels } from "./useChannelGroupModels";

type DraftUpdate = (update: (draft: ConfigDraft) => ConfigDraft) => void;

/** Model options: what the group serves plus the current picks, minus names aliases own. */
function modelOptions(
  models: readonly string[],
  reserved: ReadonlySet<string>,
): SearchableSelectOption[] {
  return dedupeModels(models)
    .filter((model) => !reserved.has(model.toLowerCase()))
    .map((model) => ({ value: model, label: model, searchText: model }));
}

/**
 * The preset's models, the way CC Switch uses them.
 *
 * Claude Code: a main model and four optional tiers. Other apps: a default model, the list of
 * models the route serves, and — for Codex — the default model's context window. Names left
 * over from earlier editors (a request name rewritten to another model) are listed compactly
 * so they can be removed, and never disappear on their own.
 */
export function CcSwitchModelFields({
  draft,
  groupModels,
  modelsLoading,
  groupSelected,
  primaryError,
  onChange,
}: {
  draft: ConfigDraft;
  groupModels: readonly string[];
  modelsLoading: boolean;
  groupSelected: boolean;
  primaryError?: string;
  onChange: DraftUpdate;
}) {
  const { t } = useTranslation();
  const isClaude = draft.clientType === "claude";
  const clientLabel = t(getCcSwitchClientConfig(draft.clientType).labelKey);
  const primaryModel = getPrimaryModel(draft);
  const defaultMapping = getDefaultMapping(draft);
  const routeModels = getRouteModels(draft);
  const aliases = getAliasMappings(draft);

  const selectCopy = {
    allowCreate: true,
    createLabel: (value: string) => t("ccswitch.model_use_custom", { value }),
    placeholder: t("ccswitch.import_model_placeholder"),
    searchPlaceholder: t("ccswitch.config_model_search_placeholder"),
    className: "w-full",
    disabled: !groupSelected,
  };

  const optionsFor = (mapping: CcSwitchModelMapping | undefined, extra: readonly string[] = []) =>
    modelOptions(
      [...groupModels, ...extra, ...(mapping ? [mapping.targetModel] : [])],
      getAliasRequestNames(draft, mapping),
    );

  /** Shown under a picker whose mapping keeps an earlier request name. */
  const aliasHint = (mapping: CcSwitchModelMapping | undefined) =>
    mapping && isAliasMapping(mapping)
      ? t("ccswitch.config_alias_request_hint", { model: mapping.requestModel })
      : undefined;

  const routeModelOptions = modelOptions(
    [...groupModels, ...routeModels],
    getAliasRequestNames(draft),
  );
  // A picker shows the model a request name is routed to; when that name is an earlier
  // alias, one line explains the "Sent as" notes under the pickers.
  const showsAliasNames = isClaude
    ? draft.modelMappings.some((mapping) => mapping.role && isAliasMapping(mapping))
    : Boolean(defaultMapping && isAliasMapping(defaultMapping));

  return (
    <FormSection
      title={t("ccswitch.config_models_title")}
      description={
        groupSelected
          ? t("ccswitch.config_models_description", { client: clientLabel })
          : t("ccswitch.config_models_select_group_first")
      }
      actions={
        modelsLoading ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-3">
            <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />
            {t("ccswitch.import_model_loading")}
          </span>
        ) : null
      }
    >
      {isClaude ? (
        <>
          <FormField
            label={t("ccswitch.config_claude_role_main")}
            required
            error={primaryError}
            description={
              aliasHint(getRoleMapping(draft, "main")) ?? t("ccswitch.config_claude_main_hint")
            }
          >
            <SearchableSelect
              {...selectCopy}
              value={primaryModel}
              onChange={(model) =>
                onChange((current) => setClaudeRoleModel(current, "main", model))
              }
              options={optionsFor(getRoleMapping(draft, "main"))}
            />
          </FormField>
          <div className="grid gap-x-3 gap-y-4 sm:grid-cols-2">
            {CC_SWITCH_CLAUDE_TIER_ROLES.map((role) => {
              const mapping = getRoleMapping(draft, role);
              return (
                <FormField
                  key={role}
                  label={t(`ccswitch.config_claude_role_${role}`)}
                  optional
                  description={aliasHint(mapping)}
                >
                  <SearchableSelect
                    {...selectCopy}
                    value={mapping?.targetModel ?? ""}
                    onChange={(model) =>
                      onChange((current) => setClaudeRoleModel(current, role, model))
                    }
                    options={[
                      { value: "", label: t("ccswitch.config_claude_tier_follow_main") },
                      ...optionsFor(mapping),
                    ]}
                  />
                </FormField>
              );
            })}
          </div>
          <div className="space-y-1 text-xs leading-5 text-ink-3">
            <p>{t("ccswitch.config_claude_tiers_hint")}</p>
            {showsAliasNames ? <p>{t("ccswitch.config_alias_request_explain")}</p> : null}
          </div>
        </>
      ) : (
        <>
          <FormField
            label={t("ccswitch.config_default_model")}
            required
            error={primaryError}
            description={
              aliasHint(defaultMapping) ??
              t("ccswitch.config_default_model_hint", { client: clientLabel })
            }
          >
            <SearchableSelect
              {...selectCopy}
              value={primaryModel}
              onChange={(model) => onChange((current) => setDefaultModel(current, model))}
              options={optionsFor(defaultMapping, routeModels)}
            />
          </FormField>
          <FormField
            label={t("ccswitch.config_route_models")}
            description={t("ccswitch.config_route_models_hint")}
          >
            <SearchableCheckboxMultiSelect
              value={routeModels}
              onChange={(models) => onChange((current) => setRouteModels(current, models))}
              options={routeModelOptions}
              placeholder={t("ccswitch.config_route_models_placeholder")}
              searchPlaceholder={t("ccswitch.config_model_search_placeholder")}
              selectFilteredLabel={t("ccswitch.config_select_shown")}
              deselectFilteredLabel={t("ccswitch.config_deselect_shown")}
              selectedCountLabel={(count) => t("ccswitch.config_selected_count", { count })}
              noResultsLabel={t("ccswitch.config_no_matching_models")}
              disabled={!groupSelected}
              maxSummaryItems={3}
              className="w-full"
            />
          </FormField>
          {draft.clientType === "codex" ? (
            <FormField
              label={t("ccswitch.config_codex_context_window")}
              optional
              description={t("ccswitch.config_codex_context_window_hint")}
            >
              <TextInput
                type="number"
                min={1}
                inputMode="numeric"
                value={defaultMapping?.contextWindow ? String(defaultMapping.contextWindow) : ""}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  onChange((current) => setDefaultContextWindow(current, value));
                }}
                placeholder={t("ccswitch.config_codex_context_window_placeholder")}
                disabled={!defaultMapping}
              />
            </FormField>
          ) : null}
          {showsAliasNames ? (
            <p className="text-xs leading-5 text-ink-3">
              {t("ccswitch.config_alias_request_explain")}
            </p>
          ) : null}
        </>
      )}

      {aliases.length > 0 ? (
        <div data-testid="ccswitch-alias-list" className="space-y-2 pt-2">
          <div>
            <div className="text-sm font-medium text-ink">{t("ccswitch.config_aliases_title")}</div>
            <p className="text-xs leading-5 text-ink-3">{t("ccswitch.config_aliases_hint")}</p>
          </div>
          <ul className="space-y-1">
            {aliases.map((alias) => {
              const isDefault = alias === defaultMapping;
              return (
                <li
                  key={`${alias.requestModel}::${alias.targetModel}`}
                  className="flex items-center gap-2 rounded-xl bg-subtle py-1 pl-3 pr-1 font-mono text-xs text-ink-2"
                >
                  <span className="min-w-0 truncate" title={alias.requestModel}>
                    {alias.requestModel}
                  </span>
                  <ArrowRight size={12} className="shrink-0 text-ink-3" aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate" title={alias.targetModel}>
                    {alias.targetModel}
                  </span>
                  {isDefault ? (
                    <span className="shrink-0 rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-sans text-2xs font-medium text-ink-3 dark:bg-white/[0.07]">
                      {t("ccswitch.config_alias_default")}
                    </span>
                  ) : null}
                  <Button
                    size="xs"
                    variant="ghost"
                    aria-label={t("ccswitch.config_alias_delete", { model: alias.requestModel })}
                    onClick={() =>
                      onChange((current) => removeAliasMapping(current, alias.requestModel))
                    }
                  >
                    <Trash2 size={13} />
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </FormSection>
  );
}
