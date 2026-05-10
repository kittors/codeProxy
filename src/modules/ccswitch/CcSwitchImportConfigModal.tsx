import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import { modelsApi } from "@/lib/http/apis/models";
import { Button } from "@/modules/ui/Button";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { SearchableSelect, type SearchableSelectOption } from "@/modules/ui/SearchableSelect";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import {
  CC_SWITCH_CLIENTS,
  getCcSwitchClientConfig,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import {
  filterByConfiguredModelAvailability,
  loadConfiguredModelAvailability,
} from "@/modules/models/modelAvailability";
import {
  CC_SWITCH_CLAUDE_AUTH_FIELDS,
  DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  normalizeCcSwitchClaudeAuthField,
  type CcSwitchClaudeAuthField,
} from "@/modules/ccswitch/ccswitchImportSettings";
import type {
  CcSwitchClaudeModelRole,
  CcSwitchImportConfigListItem,
  CcSwitchModelMapping,
} from "@/modules/ccswitch/ccswitchImportConfigList";

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

const labelClassName =
  "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45";
const controlClassName =
  "h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-sm text-slate-900 shadow-none hover:border-slate-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-slate-900/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:border-neutral-700 dark:focus-visible:ring-white/15";
const fieldClassName = "flex flex-col gap-1.5";

const CLAUDE_ROLE_ORDER: CcSwitchClaudeModelRole[] = ["main", "haiku", "sonnet", "opus"];

const rolePriority: Record<CcSwitchClaudeModelRole, string[]> = {
  main: ["sonnet", "opus", "haiku", "claude"],
  haiku: ["haiku", "sonnet", "claude"],
  sonnet: ["sonnet", "claude"],
  opus: ["opus", "sonnet", "claude"],
};

type ConfigDraft = CcSwitchImportConfigListItem;

const normalizeRoutePath = (path: string | undefined): string => {
  const trimmed = String(path ?? "").trim();
  if (!trimmed || trimmed === "/") return "";
  return `/${trimmed.replace(/^\/+|\/+$/g, "")}`;
};

const appendUrlPath = (baseUrl: string, path: string): string => {
  const normalizedBase = String(baseUrl ?? "").trim().replace(/\/+$/, "");
  const normalizedPath = normalizeRoutePath(path);
  if (!normalizedBase) return normalizedPath;
  if (!normalizedPath) return normalizedBase;
  if (normalizedBase.toLowerCase().endsWith(normalizedPath.toLowerCase())) {
    return normalizedBase;
  }
  return `${normalizedBase}${normalizedPath}`;
};

const routeLabel = (routePath: string | undefined): string => normalizeRoutePath(routePath) || "/";

function defaultProviderName(clientType: CcSwitchClientType) {
  return `CliProxy ${getCcSwitchClientConfig(clientType).fallbackLabel}`;
}

function dedupeModels(models: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  models.forEach((model) => {
    const normalized = String(model ?? "").trim();
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result.sort((a, b) => a.localeCompare(b));
}

const normalizeModelOwnerKey = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase();

function pickClaudeRoleModel(role: CcSwitchClaudeModelRole, models: readonly string[]): string {
  const normalized = dedupeModels(models);
  const priorities = rolePriority[role];
  for (const priority of priorities) {
    const match = normalized.find((model) => model.toLowerCase().includes(priority));
    if (match) return match;
  }
  return normalized[0] ?? "";
}

function reconcileGenericMappings(
  currentMappings: readonly CcSwitchModelMapping[],
  models: readonly string[],
  fallbackModel: string,
): CcSwitchModelMapping[] {
  const currentByTarget = new Map(
    currentMappings
      .filter((mapping) => !mapping.role)
      .map((mapping) => [mapping.targetModel.trim().toLowerCase(), mapping]),
  );
  const currentTargets = currentMappings
    .filter((mapping) => !mapping.role)
    .map((mapping) => mapping.targetModel);
  const targets = dedupeModels(models.length > 0 ? [...currentTargets, ...models] : currentTargets);
  const resolvedTargets = targets.length > 0 ? targets : dedupeModels([fallbackModel]);

  return resolvedTargets.map((targetModel) => {
    const existing = currentByTarget.get(targetModel.toLowerCase());
    return {
      requestModel: existing?.requestModel.trim() || targetModel,
      targetModel,
    };
  });
}

function reconcileClaudeMappings(
  currentMappings: readonly CcSwitchModelMapping[],
  models: readonly string[],
  fallbackModel: string,
): CcSwitchModelMapping[] {
  const currentByRole = new Map(
    currentMappings
      .filter((mapping) => mapping.role)
      .map((mapping) => [mapping.role, mapping]),
  );

  return CLAUDE_ROLE_ORDER.map((role) => {
    const existing = currentByRole.get(role);
    const targetModel =
      existing?.targetModel.trim() ||
      pickClaudeRoleModel(role, models) ||
      (role === "main" ? fallbackModel.trim() : "");
    const existingRequestModel = existing?.requestModel.trim() ?? "";
    return {
      role,
      requestModel:
        existingRequestModel && existingRequestModel !== role ? existingRequestModel : targetModel,
      targetModel,
    };
  });
}

function resolveGenericDefaultModel(
  modelMappings: readonly CcSwitchModelMapping[],
  fallbackModel: string,
): string {
  const normalizedFallback = fallbackModel.trim();
  if (
    normalizedFallback &&
    modelMappings.some(
      (mapping) =>
        !mapping.role &&
        mapping.requestModel.trim().toLowerCase() === normalizedFallback.toLowerCase(),
    )
  ) {
    return normalizedFallback;
  }
  return modelMappings.find((mapping) => !mapping.role && mapping.requestModel.trim())
    ?.requestModel.trim() || "";
}

function reconcileModelMappings(draft: ConfigDraft, models: readonly string[]): ConfigDraft {
  const modelMappings =
    draft.clientType === "claude"
      ? reconcileClaudeMappings(draft.modelMappings, models, draft.defaultModel)
      : reconcileGenericMappings(draft.modelMappings, models, draft.defaultModel);
  const defaultModel =
    draft.clientType === "claude"
      ? modelMappings.find((mapping) => mapping.role === "main")?.targetModel || ""
      : resolveGenericDefaultModel(modelMappings, draft.defaultModel);

  return {
    ...draft,
    modelMappings,
    defaultModel,
  };
}

function modelOptions(models: readonly string[]): SearchableSelectOption[] {
  return dedupeModels(models).map((model) => ({
    value: model,
    label: model,
    searchText: model,
  }));
}

function prepareDraftForSave(draft: ConfigDraft): ConfigDraft {
  const endpointPath = DEFAULT_CC_SWITCH_IMPORT_SETTINGS[draft.clientType].endpointPath;
  const selectedGroup = draft.allowedChannelGroups[0] ?? "";
  const normalizedMappings = draft.modelMappings
    .map((mapping) => {
      const targetModel = mapping.targetModel.trim();
      const requestModel = mapping.requestModel.trim() || targetModel;
      return {
        ...(mapping.role ? { role: mapping.role } : {}),
        requestModel,
        targetModel,
      };
    })
    .filter((mapping) => mapping.targetModel && (mapping.role || mapping.requestModel));
  const defaultModel =
    draft.clientType === "claude"
      ? normalizedMappings.find((mapping) => mapping.role === "main")?.targetModel || ""
      : resolveGenericDefaultModel(normalizedMappings, draft.defaultModel);

  return {
    ...draft,
    allowedChannelGroups: selectedGroup ? [selectedGroup] : [],
    endpointPath,
    defaultModel,
    modelMappings: normalizedMappings,
  };
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

  useEffect(() => {
    if (!open) return;
    setDraft({
      ...value,
      endpointPath: DEFAULT_CC_SWITCH_IMPORT_SETTINGS[value.clientType].endpointPath,
    });
    setAvailableModels([]);
  }, [open, value]);

  const selectedGroup = draft.allowedChannelGroups[0] ?? "";
  const selectedGroupOption = channelGroupOptions.find((option) => option.value === selectedGroup);
  const selectedGroupAllowedModelsKey = (selectedGroupOption?.allowedModels ?? []).join("\n");
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
    if (authoritativeModelOwnerKeys.size > 0) {
      setModelsLoading(true);
      modelsApi
        .getModelConfigs("active")
        .then((modelConfigs) => {
          if (cancelled) return;
          const modelIds = modelConfigs
            .filter(
              (model) =>
                authoritativeModelOwnerKeys.has(normalizeModelOwnerKey(model.owned_by)) ||
                authoritativeModelOwnerKeys.has(normalizeModelOwnerKey(model.source)),
            )
            .map((model) => model.id);
          setAvailableModels(dedupeModels(modelIds));
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
    }

    const lookupChannels = dedupeModels(selectedGroupOption?.channels ?? []);
    const modelOwnerKeys = new Set(
      (selectedGroupOption?.modelOwnerKeys ?? []).map(normalizeModelOwnerKey).filter(Boolean),
    );
    const lookupParams =
      lookupChannels.length > 0
        ? { allowedChannels: lookupChannels }
        : { allowedChannelGroups: [selectedGroup] };

    setModelsLoading(true);
    modelsApi
      .listAvailableModels(lookupParams)
      .then(async (models) => {
        if (cancelled) return;
        const availability = await loadConfiguredModelAvailability();
        if (cancelled) return;
        let visibleModels = filterByConfiguredModelAvailability(models, availability);
        if (modelOwnerKeys.size > 0) {
          const modelConfigs = await modelsApi.getModelConfigs("active").catch(() => []);
          if (cancelled) return;
          const allowedModelIds = new Set(
            modelConfigs
              .filter(
                (model) =>
                  modelOwnerKeys.has(normalizeModelOwnerKey(model.owned_by)) ||
                  modelOwnerKeys.has(normalizeModelOwnerKey(model.source)),
              )
              .map((model) => model.id.toLowerCase()),
          );
          if (allowedModelIds.size > 0) {
            visibleModels = visibleModels.filter((model) =>
              allowedModelIds.has(model.id.toLowerCase()),
            );
          }
        }
        const modelIds = visibleModels.map((model) => model.id);
        setAvailableModels(dedupeModels(modelIds));
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
    selectedGroupAuthoritativeOwnerKey,
    selectedGroupOwnerKey,
  ]);

  const availableModelsKey = availableModels.join("\n");
  useEffect(() => {
    if (!open) return;
    setDraft((current) => {
      const currentSelectedGroup = current.allowedChannelGroups[0] ?? "";
      return currentSelectedGroup
        ? reconcileModelMappings(current, availableModels)
        : {
            ...current,
            defaultModel: "",
            modelMappings: [],
          };
    });
  }, [availableModelsKey, open, selectedGroup]);

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

  const client = getCcSwitchClientConfig(draft.clientType);
  const clientLabel = t(client.labelKey);
  const groupSelectOptions = useMemo<SearchableSelectOption[]>(
    () =>
      channelGroupOptions.map((option) => {
        const path = routeLabel(option.routePath);
        return {
          value: option.value,
          triggerLabel: (
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate font-semibold">{option.label}</span>
              <span className="shrink-0 font-mono text-[11px] text-slate-500 dark:text-white/50">
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
              <span className="truncate font-mono text-[11px] text-slate-500 dark:text-white/50">
                {path}
                {option.description ? ` · ${option.description}` : ""}
              </span>
            </span>
          ),
        };
      }),
    [channelGroupOptions],
  );
  const fullBaseUrl = appendUrlPath(
    appendUrlPath(baseUrl, selectedGroupOption?.routePath ?? ""),
    DEFAULT_CC_SWITCH_IMPORT_SETTINGS[draft.clientType].endpointPath,
  );
  const currentModelOptions = useMemo(() => modelOptions(availableModels), [availableModels]);
  const preparedDraft = prepareDraftForSave(draft);
  const isSaveDisabled =
    !preparedDraft.providerName.trim() ||
    !selectedGroup ||
    !preparedDraft.defaultModel.trim() ||
    preparedDraft.modelMappings.length === 0;

  const setClientType = (clientType: CcSwitchClientType) => {
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

  const updateGenericRequestModel = (targetModel: string, requestModel: string) => {
    setDraft((current) => {
      const modelMappings = current.modelMappings.map((mapping) =>
        !mapping.role && mapping.targetModel === targetModel
          ? { ...mapping, requestModel }
          : mapping,
      );
      return {
        ...current,
        modelMappings,
        defaultModel:
          modelMappings.find((mapping) => !mapping.role && mapping.requestModel.trim())
            ?.requestModel.trim() ?? "",
      };
    });
  };

  const updateClaudeRoleModel = (role: CcSwitchClaudeModelRole, targetModel: string) => {
    setDraft((current) => {
      const modelMappings = current.modelMappings.map((mapping) =>
        mapping.role === role ? { ...mapping, targetModel } : mapping,
      );
      return reconcileModelMappings({ ...current, modelMappings }, availableModels);
    });
  };

  const updateClaudeRequestModel = (role: CcSwitchClaudeModelRole, requestModel: string) => {
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

  return (
    <Modal
      open={open}
      title={t(mode === "create" ? "ccswitch.config_modal_create" : "ccswitch.config_modal_edit")}
      description={t("ccswitch.config_modal_description")}
      maxWidth="max-w-[820px]"
      bodyHeightClassName="max-h-[78vh]"
      bodyClassName="bg-slate-50/45 dark:bg-neutral-950/45"
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
        <section className="space-y-3 rounded-3xl border border-slate-200/80 bg-white p-4 shadow-[0_18px_44px_rgb(15_23_42_/_0.06)] dark:border-neutral-800 dark:bg-neutral-950/80">
          <label className={fieldClassName}>
            <span className={labelClassName}>{t("ccswitch.config_select_channel_group")}</span>
            <SearchableSelect
              value={selectedGroup}
              onChange={(next) =>
                setDraft((current) => ({
                  ...current,
                  allowedChannelGroups: next ? [next] : [],
                  modelMappings: [],
                  defaultModel: "",
                }))
              }
              options={groupSelectOptions}
              placeholder={
                channelGroupsLoading
                  ? t("ccswitch.config_channel_groups_loading")
                  : t("ccswitch.config_channel_groups_placeholder")
              }
              searchPlaceholder={t("ccswitch.config_channel_groups_search_placeholder")}
              aria-label={t("ccswitch.config_select_channel_group")}
              className={controlClassName}
            />
          </label>

          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className={labelClassName}>{t("ccswitch.config_full_base_url")}</span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300">
                {t("ccswitch.config_live_preview")}
              </span>
            </div>
            <div
              data-testid="ccswitch-config-endpoint-preview"
              className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-950 px-3 py-2.5 font-mono text-sm text-emerald-200 shadow-inner dark:border-neutral-800"
            >
              {fullBaseUrl || "--"}
            </div>
          </div>
        </section>

        <Tabs
          value={draft.clientType}
          onValueChange={(next) => setClientType(next as CcSwitchClientType)}
        >
          <TabsList aria-label={t("ccswitch.import_client_type")}>
            {CC_SWITCH_CLIENTS.map((item) => {
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

        <section className="grid grid-cols-1 gap-3 rounded-3xl border border-slate-200/80 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-950/80 sm:grid-cols-2">
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
              className={controlClassName}
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
              className={controlClassName}
            />
          </label>

          {draft.clientType === "claude" ? (
            <label className={fieldClassName}>
              <span className={labelClassName}>
                {t("ccswitch.settings_auth_field", { client: clientLabel })}
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
                aria-label={t("ccswitch.settings_auth_field", { client: clientLabel })}
                className={controlClassName}
              />
            </label>
          ) : null}

          <label className={fieldClassName}>
            <span className={labelClassName}>
              {t("ccswitch.settings_usage_interval", { client: clientLabel })}
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
              aria-label={t("ccswitch.settings_usage_interval", { client: clientLabel })}
              className={controlClassName}
            />
          </label>
        </section>

        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white shadow-[0_18px_44px_rgb(15_23_42_/_0.05)] dark:border-neutral-800 dark:bg-neutral-950/80">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/75 px-4 py-3 dark:border-neutral-800">
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
            {modelsLoading ? (
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500 dark:bg-neutral-900 dark:text-white/55">
                {t("ccswitch.import_model_loading")}
              </span>
            ) : null}
          </div>

          {draft.modelMappings.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500 dark:text-white/50">
              {selectedGroup
                ? t("ccswitch.config_model_mapping_empty")
                : t("ccswitch.config_model_mapping_select_group_first")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              {draft.clientType === "claude" ? (
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-neutral-900/60 dark:text-white/45">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">
                        {t("ccswitch.config_claude_model_role")}
                      </th>
                      <th className="px-4 py-2.5 font-semibold">
                        {t("ccswitch.config_request_model_name")}
                      </th>
                      <th className="px-4 py-2.5 font-semibold">
                        {t("ccswitch.config_actual_channel_model")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-neutral-800">
                    {CLAUDE_ROLE_ORDER.map((role) => {
                      const mapping = draft.modelMappings.find((item) => item.role === role);
                      const label = t(`ccswitch.config_claude_role_${role}`);
                      return (
                        <tr key={role}>
                          <td className="px-4 py-3 font-medium text-slate-800 dark:text-white/80">
                            {label}
                          </td>
                          <td className="px-4 py-3">
                            <TextInput
                              value={mapping?.requestModel ?? ""}
                              onChange={(event) => {
                                const requestModel = event.currentTarget.value;
                                updateClaudeRequestModel(role, requestModel);
                              }}
                              aria-label={t("ccswitch.config_claude_request_model_for", {
                                role: label,
                              })}
                              className={controlClassName}
                            />
                          </td>
                          <td className="px-4 py-3">
                            <SearchableSelect
                              value={mapping?.targetModel ?? ""}
                              onChange={(next) => updateClaudeRoleModel(role, next)}
                              options={currentModelOptions}
                              allowCreate
                              createLabel={(value) => t("ccswitch.model_use_custom", { value })}
                              placeholder={t("ccswitch.import_model_placeholder")}
                              searchPlaceholder={t("ccswitch.config_model_search_placeholder")}
                              aria-label={label}
                              className={`${controlClassName} w-full`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-[620px] w-full text-left text-sm">
                  <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-neutral-900/60 dark:text-white/45">
                    <tr>
                      <th className="px-4 py-2.5 font-semibold">
                        {t("ccswitch.config_actual_channel_model")}
                      </th>
                      <th className="px-4 py-2.5 font-semibold">
                        {t("ccswitch.config_request_model_name")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-neutral-800">
                    {draft.modelMappings.map((mapping) => (
                      <tr key={mapping.targetModel}>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-slate-700 dark:text-white/75">
                            {mapping.targetModel}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <TextInput
                            value={mapping.requestModel}
                            onChange={(event) => {
                              const requestModel = event.currentTarget.value;
                              updateGenericRequestModel(mapping.targetModel, requestModel);
                            }}
                            aria-label={t("ccswitch.config_request_model_for", {
                              model: mapping.targetModel,
                            })}
                            className={controlClassName}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}
