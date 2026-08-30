import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, Copy, LoaderCircle, Plus, Trash2 } from "lucide-react";
import iconClaude from "@code-proxy/assets/icons/claude.svg";
import iconCodex from "@code-proxy/assets/icons/codex.svg";
import iconGemini from "@code-proxy/assets/icons/gemini.svg";
import { modelsApi } from "@code-proxy/api-client";
import { Button, COLUMN_WIDTH } from "@code-proxy/ui";
import {
  DataTable,
  TABLE_ROW_ACTIONS_COLUMN,
  type DataTableColumn,
  type DataTableSortState,
} from "@code-proxy/ui";
import { TextInput } from "@code-proxy/ui";
import { Modal } from "@code-proxy/ui";
import { SearchableSelect, type SearchableSelectOption } from "@code-proxy/ui";
import { Select } from "@code-proxy/ui";
import { Tabs, TabsList, TabsTrigger } from "@code-proxy/ui";
import {
  CC_SWITCH_CLIENTS,
  type CcSwitchClientType,
} from "@code-proxy/domain/ccswitch/ccswitchImport";
import {
  filterByConfiguredModelAvailability,
  loadConfiguredModelAvailability,
} from "@features/model-availability";
import {
  CC_SWITCH_CLAUDE_AUTH_FIELDS,
  DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  normalizeCcSwitchClaudeAuthField,
  type CcSwitchClaudeAuthField,
} from "@code-proxy/domain/ccswitch/ccswitchImportSettings";
import {
  ensureCcSwitchRoutePath,
  type CcSwitchModelMapping,
} from "@code-proxy/domain/ccswitch/ccswitchImportConfigList";
import type { CcSwitchClaudeModelRole } from "@code-proxy/domain/ccswitch/ccswitchImport";
import {
  DEFAULT_CODEX_CONTEXT_WINDOW,
  appendUrlPath,
  dedupeModels,
  defaultProviderName,
  getDuplicateGenericRequestModels,
  isSpecificModelConfigOwnerKey,
  modelMetadataMatchesOwnerKeys,
  normalizeModelOwnerKey,
  prepareDraftForSave,
  reconcileModelMappings,
  resolveGenericDefaultModel,
  routeLabel,
  withCodexMappingContextWindows,
  type ConfigDraft,
  type ModelMetadataLike,
} from "./ccswitchConfigDraft";

export interface CcSwitchChannelGroupOption {
  value: string;
  label: string;
  description?: string;
  routePath?: string;
  allowedModels?: string[];
  channels?: string[];
  modelOwnerKeys?: string[];
  authoritativeModelOwnerKeys?: string[];
}

const iconByType: Record<CcSwitchClientType, string> = {
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
};

const labelClassName = "text-sm font-medium text-slate-700 dark:text-white/80";
const fieldClassName = "flex flex-col gap-1.5";
const sectionClassName =
  "rounded-2xl bg-slate-50/70 p-4 ring-1 ring-slate-900/8 dark:bg-white/[0.03] dark:ring-white/8";

const MODEL_MAPPING_LOADING_ROWS = ["short", "medium", "long"];
const CONFIG_MODAL_CLIENTS = CC_SWITCH_CLIENTS.filter((client) => client.type !== "gemini");

function modelOptions(models: readonly string[]): SearchableSelectOption[] {
  return dedupeModels(models).map((model) => ({
    value: model,
    label: model,
    searchText: model,
  }));
}

export function CcSwitchImportConfigModal({
  open,
  mode,
  value,
  baseUrl,
  channelGroupOptions,
  channelGroupsLoading,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: "create" | "edit";
  value: ConfigDraft;
  baseUrl: string;
  channelGroupOptions: CcSwitchChannelGroupOption[];
  channelGroupsLoading: boolean;
  onClose: () => void;
  onSave: (value: ConfigDraft) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ConfigDraft>(value);
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelMappingSort, setModelMappingSort] = useState<DataTableSortState | null>(null);
  const [copiedBaseUrl, setCopiedBaseUrl] = useState(false);
  const copiedResetRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (copiedResetRef.current) window.clearTimeout(copiedResetRef.current);
    },
    [],
  );

  useEffect(() => {
    if (open) return;
    setCopiedBaseUrl(false);
    if (copiedResetRef.current) window.clearTimeout(copiedResetRef.current);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setDraft({
      ...value,
      modelMappings: withCodexMappingContextWindows(value),
      endpointPath:
        value.endpointPath || DEFAULT_CC_SWITCH_IMPORT_SETTINGS[value.clientType].endpointPath,
    });
    setAvailableModels(
      dedupeModels(value.modelMappings.map((mapping) => mapping.targetModel).filter(Boolean)),
    );
    setModelMappingSort(null);
  }, [open, value]);

  const selectedGroup = draft.allowedChannelGroups[0] ?? "";
  const selectedGroupOption = channelGroupOptions.find((option) => option.value === selectedGroup);
  const selectedGroupAllowedModelsKey = (selectedGroupOption?.allowedModels ?? []).join("\n");
  const selectedGroupChannelsKey = (selectedGroupOption?.channels ?? []).join("\n");
  const selectedGroupAuthoritativeOwnerKey = (
    selectedGroupOption?.authoritativeModelOwnerKeys ?? []
  ).join("\n");
  const selectedGroupOwnerKey = (selectedGroupOption?.modelOwnerKeys ?? []).join("\n");

  useEffect(() => {
    if (!open || !selectedGroup) {
      setAvailableModels([]);
      setModelsLoading(false);
      return;
    }

    let cancelled = false;
    const groupAllowedModels = dedupeModels(selectedGroupOption?.allowedModels ?? []);
    if (groupAllowedModels.length > 0) {
      setAvailableModels(groupAllowedModels);
      setModelsLoading(false);
      return;
    }

    const authoritativeModelOwnerKeys = new Set(
      (selectedGroupOption?.authoritativeModelOwnerKeys ?? [])
        .map(normalizeModelOwnerKey)
        .filter(Boolean),
    );
    const lookupChannels = dedupeModels(selectedGroupOption?.channels ?? []);
    const modelOwnerKeys = new Set(
      (selectedGroupOption?.modelOwnerKeys ?? []).map(normalizeModelOwnerKey).filter(Boolean),
    );
    const useResolvedChannels = lookupChannels.length > 0;
    const lookupParams = useResolvedChannels
      ? { allowedChannels: lookupChannels }
      : { allowedChannelGroups: [selectedGroup] };

    setModelsLoading(true);
    modelsApi
      .listAvailableModels(lookupParams)
      .then(async (models) => {
        if (cancelled) return;
        const availability = useResolvedChannels
          ? await loadConfiguredModelAvailability()
          : await loadConfiguredModelAvailability({ allowedChannelGroups: [selectedGroup] });
        if (cancelled) return;
        let visibleModels = filterByConfiguredModelAvailability(models, availability);
        const optionMap = new Map<string, string>();
        const addModelId = (id: string) => {
          const normalized = String(id ?? "").trim();
          if (!normalized) return;
          const key = normalized.toLowerCase();
          if (!optionMap.has(key)) optionMap.set(key, normalized);
        };
        const needsModelConfigs = authoritativeModelOwnerKeys.size > 0 || modelOwnerKeys.size > 0;
        if (needsModelConfigs) {
          const modelConfigs: ModelMetadataLike[] = [
            ...(availability.metadataItems ?? []),
            ...availability.items,
          ];
          if (modelOwnerKeys.size > 0 && authoritativeModelOwnerKeys.size === 0) {
            const allowedModelIds = new Set(
              modelConfigs
                .filter((model) => modelMetadataMatchesOwnerKeys(model, modelOwnerKeys))
                .map((model) => model.id.toLowerCase()),
            );
            if (allowedModelIds.size > 0) {
              visibleModels = visibleModels.filter((model) =>
                allowedModelIds.has(model.id.toLowerCase()),
              );
            }
          }
          if (authoritativeModelOwnerKeys.size > 0) {
            for (const model of modelConfigs) {
              if (modelMetadataMatchesOwnerKeys(model, authoritativeModelOwnerKeys)) {
                addModelId(model.id);
              }
            }
          } else if (modelOwnerKeys.size > 0) {
            const expandableOwnerKeys = new Set(
              Array.from(modelOwnerKeys).filter(isSpecificModelConfigOwnerKey),
            );
            if (expandableOwnerKeys.size > 0) {
              for (const model of modelConfigs) {
                if (modelMetadataMatchesOwnerKeys(model, expandableOwnerKeys)) {
                  addModelId(model.id);
                }
              }
            }
          }
        }
        for (const model of visibleModels) addModelId(model.id);
        setAvailableModels(dedupeModels(Array.from(optionMap.values())));
      })
      .catch(() => {
        if (!cancelled) setAvailableModels([]);
      })
      .finally(() => {
        if (!cancelled) setModelsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    open,
    selectedGroup,
    selectedGroupAllowedModelsKey,
    selectedGroupChannelsKey,
    selectedGroupAuthoritativeOwnerKey,
    selectedGroupOwnerKey,
  ]);

  const availableModelsKey = availableModels.join("\n");
  useEffect(() => {
    if (!open) return;
    setDraft((current) => {
      const currentSelectedGroup = current.allowedChannelGroups[0] ?? "";
      if (!currentSelectedGroup) {
        return { ...current, defaultModel: "", modelMappings: [] };
      }
      if (modelsLoading && availableModels.length === 0 && current.modelMappings.length > 0) {
        return current;
      }
      return reconcileModelMappings(current, availableModels);
    });
  }, [availableModelsKey, open, selectedGroup, modelsLoading, availableModels.length]);

  const authFieldOptions = useMemo(
    () =>
      CC_SWITCH_CLAUDE_AUTH_FIELDS.map((field) => ({
        value: field,
        label: t(
          field === "ANTHROPIC_AUTH_TOKEN"
            ? "ccswitch.auth_field_anthropic_auth_token"
            : "ccswitch.auth_field_anthropic_api_key",
        ),
      })),
    [t],
  );

  const groupSelectOptions = useMemo<SearchableSelectOption[]>(() => {
    const options = channelGroupOptions.map((option) => {
      const path = routeLabel(option.routePath);
      return {
        value: option.value,
        triggerLabel: (
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{option.label}</span>
            <span className="shrink-0 font-mono text-xs text-slate-500 dark:text-white/50">
              {path}
            </span>
          </span>
        ),
        searchText: `${option.label} ${path} ${option.description ?? ""}`,
        label: (
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              {option.label}
            </span>
            <span className="truncate font-mono text-xs text-slate-500 dark:text-white/50">
              {path}
              {option.description ? ` · ${option.description}` : ""}
            </span>
          </span>
        ),
      };
    });

    const currentGroup = draft.allowedChannelGroups[0] ?? "";
    if (currentGroup && !channelGroupOptions.some((o) => o.value === currentGroup)) {
      const hiddenLabel = `${currentGroup} ${t("ccswitch.config_channel_group_hidden")}`;
      options.push({
        value: currentGroup,
        triggerLabel: <span>{hiddenLabel}</span>,
        searchText: hiddenLabel,
        label: <span>{hiddenLabel}</span>,
      });
    }

    return options;
  }, [channelGroupOptions, draft.allowedChannelGroups, t]);
  const previewRoutePath = selectedGroup
    ? ensureCcSwitchRoutePath(draft.routePath, selectedGroup, draft.id)
    : "";
  const fullBaseUrl = appendUrlPath(
    appendUrlPath(baseUrl, previewRoutePath),
    DEFAULT_CC_SWITCH_IMPORT_SETTINGS[draft.clientType].endpointPath,
  );
  const copyBaseUrl = async () => {
    if (!fullBaseUrl) return;
    try {
      await navigator.clipboard.writeText(fullBaseUrl);
      setCopiedBaseUrl(true);
      if (copiedResetRef.current) window.clearTimeout(copiedResetRef.current);
      copiedResetRef.current = window.setTimeout(() => setCopiedBaseUrl(false), 1600);
    } catch {
      // Clipboard can be blocked (insecure origin / denied permission); the preview text
      // stays selectable, so failing silently beats a toast the user cannot act on.
    }
  };
  const currentModelOptions = useMemo(
    () =>
      modelOptions([
        ...availableModels,
        ...draft.modelMappings
          .filter((mapping) => !mapping.role)
          .map((mapping) => mapping.targetModel),
      ]),
    [availableModels, draft.modelMappings],
  );
  const codexDefaultModelOptions = useMemo(() => {
    const requestModels = draft.modelMappings
      .filter((mapping) => !mapping.role)
      .map((mapping) => mapping.requestModel.trim() || mapping.targetModel.trim())
      .filter(Boolean);
    return modelOptions([...requestModels, draft.defaultModel]);
  }, [draft.defaultModel, draft.modelMappings]);
  const preparedDraft = prepareDraftForSave(draft);
  const isClaudeMapping = draft.clientType === "claude";
  const hasRenderableMappings = draft.modelMappings.length > 0;
  const modelMappingsLoading = Boolean(selectedGroup && modelsLoading && !hasRenderableMappings);
  const duplicateRequestModels = getDuplicateGenericRequestModels(draft.modelMappings);
  const isSaveDisabled =
    !preparedDraft.providerName.trim() ||
    !selectedGroup ||
    !preparedDraft.defaultModel.trim() ||
    preparedDraft.modelMappings.length === 0 ||
    duplicateRequestModels.length > 0;

  const setClientType = (clientType: CcSwitchClientType) => {
    setModelMappingSort(null);
    const defaults = DEFAULT_CC_SWITCH_IMPORT_SETTINGS[clientType];
    setDraft((current) =>
      reconcileModelMappings(
        {
          ...current,
          clientType,
          endpointPath: defaults.endpointPath,
          usageAutoInterval:
            current.clientType === clientType
              ? current.usageAutoInterval
              : defaults.usageAutoInterval,
          defaultModel: current.clientType === clientType ? current.defaultModel : "",
          modelMappings: current.clientType === clientType ? current.modelMappings : [],
          providerName:
            !current.providerName.trim() ||
            current.providerName.trim() === defaultProviderName(current.clientType)
              ? ""
              : current.providerName,
          apiKeyField:
            clientType === "claude"
              ? normalizeCcSwitchClaudeAuthField(current.apiKeyField ?? defaults.apiKeyField)
              : undefined,
        },
        availableModels,
      ),
    );
  };

  const addGenericModelMapping = () => {
    setModelMappingSort(null);
    setDraft((current) => ({
      ...current,
      modelMappings: [
        ...current.modelMappings.filter((mapping) => !mapping.role),
        {
          requestModel: "",
          targetModel: "",
        },
      ],
      defaultModel: current.defaultModel.trim(),
    }));
  };

  const removeGenericModelMapping = (index: number) => {
    setModelMappingSort(null);
    setDraft((current) => {
      const modelMappings = current.modelMappings.filter((mapping, mappingIndex) => {
        if (mapping.role) return false;
        return mappingIndex !== index;
      });
      return {
        ...current,
        modelMappings,
        defaultModel: resolveGenericDefaultModel(modelMappings, current.defaultModel),
      };
    });
  };

  const updateGenericTargetModel = (index: number, targetModel: string) => {
    setModelMappingSort(null);
    setDraft((current) => {
      const modelMappings = current.modelMappings.map((mapping, mappingIndex) =>
        !mapping.role && mappingIndex === index ? { ...mapping, targetModel } : mapping,
      );
      return {
        ...current,
        modelMappings,
        defaultModel: resolveGenericDefaultModel(modelMappings, current.defaultModel),
      };
    });
  };

  const updateGenericRequestModel = (index: number, requestModel: string) => {
    setModelMappingSort(null);
    setDraft((current) => {
      const currentDefault = current.defaultModel.trim().toLowerCase();
      // Prefer the mapping that currently owns the default request name.
      const defaultRowIndex = current.modelMappings.findIndex(
        (mapping) =>
          !mapping.role &&
          currentDefault &&
          mapping.requestModel.trim().toLowerCase() === currentDefault,
      );
      const modelMappings = current.modelMappings.map((mapping, mappingIndex) =>
        !mapping.role && mappingIndex === index ? { ...mapping, requestModel } : mapping,
      );
      if (defaultRowIndex === index) {
        // Keep default glued to that row while typing (including empty mid-edit).
        return {
          ...current,
          modelMappings,
          defaultModel: requestModel.trim() || current.defaultModel.trim(),
        };
      }
      return {
        ...current,
        modelMappings,
        defaultModel: resolveGenericDefaultModel(modelMappings, current.defaultModel),
      };
    });
  };

  const setCodexDefaultModel = (defaultModel: string) => {
    setDraft((current) => ({
      ...current,
      defaultModel: defaultModel.trim(),
    }));
  };

  const updateGenericContextWindow = (index: number, contextWindow: string) => {
    setDraft((current) => {
      const parsed = Number(contextWindow);
      const nextContextWindow =
        contextWindow.trim() && Number.isFinite(parsed) && parsed > 0
          ? Math.round(parsed)
          : undefined;
      const modelMappings = current.modelMappings.map((mapping, mappingIndex) =>
        !mapping.role && mappingIndex === index
          ? { ...mapping, contextWindow: nextContextWindow }
          : mapping,
      );
      return { ...current, modelMappings };
    });
  };

  const updateClaudeRoleModel = (role: CcSwitchClaudeModelRole, targetModel: string) => {
    setModelMappingSort(null);
    setDraft((current) => {
      const modelMappings = current.modelMappings.map((mapping) =>
        mapping.role === role ? { ...mapping, targetModel } : mapping,
      );
      return reconcileModelMappings({ ...current, modelMappings }, availableModels);
    });
  };

  const updateClaudeRequestModel = (role: CcSwitchClaudeModelRole, requestModel: string) => {
    setModelMappingSort(null);
    setDraft((current) => {
      const modelMappings = current.modelMappings.map((mapping) =>
        mapping.role === role ? { ...mapping, requestModel } : mapping,
      );
      return {
        ...current,
        modelMappings,
      };
    });
  };

  const replaceModelMappingRows = (modelMappings: CcSwitchModelMapping[]) => {
    setDraft((current) => ({
      ...current,
      modelMappings,
      defaultModel:
        current.clientType === "claude"
          ? modelMappings.find((mapping) => mapping.role === "main")?.targetModel || ""
          : resolveGenericDefaultModel(modelMappings, current.defaultModel),
    }));
  };

  const modelMappingColumns: DataTableColumn<CcSwitchModelMapping>[] =
    draft.clientType === "claude"
      ? [
          {
            key: "role",
            label: t("ccswitch.config_claude_model_role"),
            width: COLUMN_WIDTH.badgeGroup,
            cellContentClassName: "font-medium text-slate-800 dark:text-white/80",
            render: (mapping) =>
              mapping.role ? t(`ccswitch.config_claude_role_${mapping.role}`) : "",
          },
          {
            key: "requestModel",
            label: t("ccswitch.config_request_model_name"),
            width: COLUMN_WIDTH.nameStacked,
            sort: { getValue: (mapping) => mapping.requestModel },
            render: (mapping) => {
              const role = mapping.role;
              const label = role ? t(`ccswitch.config_claude_role_${role}`) : "";
              return (
                <TextInput size="sm" value={mapping.requestModel}
                  onChange={(event) => {
                    if (role) updateClaudeRequestModel(role, event.currentTarget.value);
                  }}
                  aria-label={t("ccswitch.config_claude_request_model_for", { role: label })}
                />
              );
            },
          },
          {
            key: "targetModel",
            label: t("ccswitch.config_actual_channel_model"),
            width: COLUMN_WIDTH.composite,
            sort: { getValue: (mapping) => mapping.targetModel },
            render: (mapping) => {
              const role = mapping.role;
              const label = role ? t(`ccswitch.config_claude_role_${role}`) : "";
              return (
                <SearchableSelect size="sm" value={mapping.targetModel}
                  onChange={(next) => {
                    if (role) updateClaudeRoleModel(role, next);
                  }}
                  options={currentModelOptions}
                  allowCreate
                  createLabel={(value) => t("ccswitch.model_use_custom", { value })}
                  placeholder={t("ccswitch.import_model_placeholder")}
                  searchPlaceholder={t("ccswitch.config_model_search_placeholder")}
                  aria-label={label}
                  className="w-full"
                />
              );
            },
          },
        ]
      : [
          {
            key: "targetModel",
            label: t("ccswitch.config_actual_channel_model"),
            width: COLUMN_WIDTH.nameStacked,
            sort: { getValue: (mapping) => mapping.targetModel },
            render: (mapping, index) => (
              <SearchableSelect size="sm" value={mapping.targetModel}
                onChange={(next) => updateGenericTargetModel(index, next)}
                options={currentModelOptions}
                allowCreate
                createLabel={(value) => t("ccswitch.model_use_custom", { value })}
                placeholder={t("ccswitch.import_model_placeholder")}
                searchPlaceholder={t("ccswitch.config_model_search_placeholder")}
                aria-label={t("ccswitch.config_actual_channel_model_for_mapping", {
                  index: index + 1,
                })}
                className="w-full"
              />
            ),
          },
          {
            key: "requestModel",
            label: t("ccswitch.config_request_model_name"),
            width: COLUMN_WIDTH.nameStacked,
            sort: { getValue: (mapping) => mapping.requestModel },
            render: (mapping, index) => (
              <TextInput size="sm" value={mapping.requestModel}
                onChange={(event) => updateGenericRequestModel(index, event.currentTarget.value)}
                aria-label={t("ccswitch.config_request_model_for_mapping", {
                  index: index + 1,
                })}
              />
            ),
          },
          {
            key: "contextWindow",
            // Header wraps below w-52 in en/ru, which reads as a truncated label.
            label: t("ccswitch.config_codex_context_window"),
            width: COLUMN_WIDTH.name,
            render: (mapping, index) => (
              <TextInput
                size="sm"
                type="number"
                min={1}
                inputMode="numeric"
                value={mapping.contextWindow === undefined ? "" : String(mapping.contextWindow)}
                onChange={(event) => updateGenericContextWindow(index, event.currentTarget.value)}
                placeholder={String(DEFAULT_CODEX_CONTEXT_WINDOW)}
                aria-label={t("ccswitch.config_context_window_for_mapping", {
                  index: index + 1,
                })}
              />
            ),
          },
          {
            key: "actions",
            label: t("ccswitch.config_table_actions"),
            ...TABLE_ROW_ACTIONS_COLUMN,
            lockOrder: "end",
            reorderable: false,
            headerClassName: "text-right",
            cellClassName: "text-right",
            render: (_mapping, index) => (
              <Button
                size="xs"
                variant="ghost"
                aria-label={t("ccswitch.config_delete_model_mapping", {
                  index: index + 1,
                })}
                onClick={() => removeGenericModelMapping(index)}
              >
                <Trash2 size={14} />
              </Button>
            ),
          },
        ];

  return (
    <Modal
      open={open}
      title={t(mode === "create" ? "ccswitch.config_modal_create" : "ccswitch.config_modal_edit")}
      description={t("ccswitch.config_modal_description")}
      maxWidth="max-w-6xl"
      bodyHeightClassName="max-h-[78vh]"
      bodyClassName="bg-slate-50/60 dark:bg-white/[0.015]"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() => onSave(prepareDraftForSave(draft))}
            disabled={isSaveDisabled}
          >
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <section className={`${sectionClassName} space-y-3`}>
          <label className={fieldClassName}>
            <span className={labelClassName}>{t("ccswitch.config_select_channel_group")}</span>
            <SearchableSelect
              value={selectedGroup}
              onChange={(next) => {
                setModelMappingSort(null);
                setDraft((current) => ({
                  ...current,
                  allowedChannelGroups: next ? [next] : [],
                  routePath: next ? ensureCcSwitchRoutePath("", next, current.id) : "",
                  modelMappings: [],
                  defaultModel: "",
                }));
              }}
              options={groupSelectOptions}
              placeholder={
                channelGroupsLoading
                  ? t("ccswitch.config_channel_groups_loading")
                  : t("ccswitch.config_channel_groups_placeholder")
              }
              searchPlaceholder={t("ccswitch.config_channel_groups_search_placeholder")}
              aria-label={t("ccswitch.config_select_channel_group")}
              className="w-full"
            />
          </label>

          <div className={fieldClassName}>
            <span className={labelClassName}>{t("ccswitch.config_full_base_url")}</span>
            <div className="flex items-center gap-2">
              <div
                data-testid="ccswitch-config-endpoint-preview"
                className="min-w-0 flex-1 overflow-x-auto rounded-2xl bg-slate-100/80 px-3.5 py-2.5 font-mono text-sm text-slate-700 dark:bg-white/[0.055] dark:text-white/80"
              >
                <span className="whitespace-nowrap">{fullBaseUrl || "--"}</span>
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void copyBaseUrl()}
                disabled={!fullBaseUrl}
                aria-label={copiedBaseUrl ? t("common.copied") : t("common.copy")}
              >
                {copiedBaseUrl ? <Check size={14} /> : <Copy size={14} />}
                {copiedBaseUrl ? t("common.copied") : t("common.copy")}
              </Button>
            </div>
          </div>
        </section>

        <Tabs
          value={draft.clientType}
          onValueChange={(next) => setClientType(next as CcSwitchClientType)}
        >
          <TabsList aria-label={t("ccswitch.import_client_type")}>
            {CONFIG_MODAL_CLIENTS.map((item) => {
              const label = t(item.labelKey);
              return (
                <TabsTrigger key={item.type} value={item.type} aria-label={label}>
                  <img src={iconByType[item.type]} alt="" className="h-4 w-4" />
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <section className={`grid grid-cols-1 gap-3 ${sectionClassName} sm:grid-cols-2`}>
          <label className={fieldClassName}>
            <span className={labelClassName}>{t("ccswitch.import_provider_name")}</span>
            <TextInput
              value={draft.providerName}
              onChange={(event) => {
                const providerName = event.currentTarget.value;
                setDraft((current) => ({ ...current, providerName }));
              }}
              placeholder={t("ccswitch.import_provider_name_placeholder")}
              aria-label={t("ccswitch.import_provider_name")}
            />
          </label>

          <label className={fieldClassName}>
            <span className={labelClassName}>{t("ccswitch.config_remark")}</span>
            <TextInput
              value={draft.note}
              onChange={(event) => {
                const note = event.currentTarget.value;
                setDraft((current) => ({ ...current, note }));
              }}
              placeholder={t("ccswitch.config_remark_placeholder")}
              aria-label={t("ccswitch.config_remark")}
            />
          </label>

          {draft.clientType === "claude" ? (
            <label className={fieldClassName}>
              <span className={labelClassName}>
                {t("ccswitch.config_auth_field")}
              </span>
              <Select
                value={draft.apiKeyField ?? "ANTHROPIC_API_KEY"}
                onChange={(next) =>
                  setDraft((current) => ({
                    ...current,
                    apiKeyField: normalizeCcSwitchClaudeAuthField(next) as CcSwitchClaudeAuthField,
                  }))
                }
                options={authFieldOptions}
                aria-label={t("ccswitch.config_auth_field")}
                fullWidth
              />
            </label>
          ) : null}

          {draft.clientType === "codex" ? (
            <label className={fieldClassName}>
              <span className={labelClassName}>
                {t("ccswitch.config_default_model")}
              </span>
              <SearchableSelect
                value={draft.defaultModel}
                onChange={setCodexDefaultModel}
                options={codexDefaultModelOptions}
                allowCreate
                createLabel={(value) => t("ccswitch.model_use_custom", { value })}
                placeholder={t("ccswitch.settings_default_model_placeholder")}
                searchPlaceholder={t("ccswitch.config_model_search_placeholder")}
                aria-label={t("ccswitch.config_default_model")}
                className="w-full"
                disabled={!selectedGroup}
              />
            </label>
          ) : null}

          <label className={fieldClassName}>
            <span className={labelClassName}>
              {t("ccswitch.config_usage_interval")}
            </span>
            <TextInput
              type="number"
              min={1}
              inputMode="numeric"
              value={String(draft.usageAutoInterval)}
              onChange={(event) => {
                const parsed = Number(event.currentTarget.value);
                setDraft((current) => ({
                  ...current,
                  usageAutoInterval: Number.isFinite(parsed) ? parsed : current.usageAutoInterval,
                }));
              }}
              placeholder="30"
              aria-label={t("ccswitch.config_usage_interval")}
            />
          </label>
        </section>

        <section className="overflow-hidden rounded-2xl bg-slate-50/70 ring-1 ring-slate-900/8 dark:bg-white/[0.03] dark:ring-white/8">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900/8 px-4 py-3 dark:border-white/8">
            <div>
              <div className="text-sm font-semibold text-slate-950 dark:text-white">
                {t("ccswitch.config_model_mapping_title")}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-white/50">
                {draft.clientType === "claude"
                  ? t("ccswitch.config_claude_model_mapping_hint")
                  : t("ccswitch.config_model_mapping_hint")}
              </p>
            </div>
            {modelMappingsLoading ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-500 dark:bg-white/10 dark:text-white/55">
                <LoaderCircle size={12} className="animate-spin" />
                {t("ccswitch.import_model_loading")}
              </span>
            ) : draft.clientType === "codex" ? (
              <Button
                size="xs"
                variant="secondary"
                onClick={addGenericModelMapping}
                disabled={!selectedGroup}
              >
                <Plus size={13} />
                {t("ccswitch.config_add_model_mapping")}
              </Button>
            ) : null}
          </div>

          {modelMappingsLoading ? (
            <div
              role="status"
              aria-label={t("ccswitch.config_model_mapping_loading")}
              data-testid="ccswitch-model-mapping-loading"
              className="px-4 py-5"
            >
              <div className="flex items-center gap-3 rounded-2xl bg-slate-100/80 px-4 py-3 dark:bg-white/[0.055]">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 ring-1 ring-slate-900/8 dark:bg-white/10 dark:text-white/60 dark:ring-white/8">
                  <LoaderCircle size={17} className="animate-spin" />
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-white/85">
                    {t("ccswitch.config_model_mapping_loading")}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-white/50">
                    {t("ccswitch.config_model_mapping_loading_hint")}
                  </p>
                </div>
              </div>
              <div className="mt-4 space-y-2" aria-hidden="true">
                {MODEL_MAPPING_LOADING_ROWS.map((row) => (
                  <div
                    key={row}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)] items-center gap-3 rounded-xl bg-slate-100/60 px-3 py-3.5 dark:bg-white/[0.035]"
                  >
                    <span className="h-3 rounded-full bg-slate-200/90 dark:bg-white/10" />
                    <span
                      className={`h-3 rounded-full bg-slate-200/90 dark:bg-white/10 ${
                        row === "short" ? "w-1/2" : row === "medium" ? "w-2/3" : "w-5/6"
                      }`}
                    />
                  </div>
                ))}
              </div>
            </div>
          ) : draft.modelMappings.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-white/50">
              {selectedGroup
                ? draft.clientType === "codex"
                  ? t("ccswitch.config_model_mapping_empty_manual")
                  : t("ccswitch.config_model_mapping_empty")
                : t("ccswitch.config_model_mapping_select_group_first")}
            </div>
          ) : (
            <div data-testid="ccswitch-model-mapping-table" className="px-4 pt-3 pb-4">
              {/* naturalFlow: the table grows with its rows so the modal body owns the only
                  scrollbar. A fixed inner height clipped the last Claude role behind a second,
                  undiscoverable scroll area. */}
              <div className="min-w-0 overflow-x-auto overscroll-x-contain rounded-xl">
                <DataTable<CcSwitchModelMapping>
                  rows={draft.modelMappings}
                  columns={modelMappingColumns}
                  rowKey={(mapping, index) => mapping.role ?? `mapping-${index}`}
                  rowReorderable
                  onRowsChange={(rows) => replaceModelMappingRows(rows)}
                  sortState={modelMappingSort}
                  onSortStateChange={setModelMappingSort}
                  rowHeight={56}
                  height="h-auto"
                  minHeight="min-h-0"
                  minWidth={isClaudeMapping ? "min-w-[760px]" : "min-w-[900px]"}
                  caption={t("ccswitch.config_model_mapping_title")}
                  showAllLoadedMessage={false}
                  rowDividers
                  naturalFlow
                  columnResizable={false}
                  columnReorderable={false}
                  persistColumnOrder={false}
                />
              </div>
              {duplicateRequestModels.length > 0 ? (
                <div className="mt-3 rounded-xl bg-rose-50 px-4 py-2 text-xs font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-200">
                  {t("ccswitch.config_request_model_duplicate", {
                    model: duplicateRequestModels.join(", "),
                  })}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
