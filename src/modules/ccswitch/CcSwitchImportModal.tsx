import type { TFunction } from "i18next";
import { Button } from "@/modules/ui/Button";
import { Checkbox } from "@/modules/ui/Checkbox";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { Select } from "@/modules/ui/Select";
import { Tabs, TabsList, TabsTrigger } from "@/modules/ui/Tabs";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import {
  CC_SWITCH_CLIENTS,
  getCcSwitchClientConfig,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import {
  CC_SWITCH_CLAUDE_AUTH_FIELDS,
  DEFAULT_CC_SWITCH_IMPORT_SETTINGS,
  type CcSwitchClaudeAuthField,
} from "@/modules/ccswitch/ccswitchImportSettings";

export interface CcSwitchImportGroupOption {
  value: string;
  label: string;
  baseUrl: string;
  description?: string;
}

export interface CcSwitchImportSelection {
  apiKeyField?: CcSwitchClaudeAuthField;
  baseUrl: string;
  channelGroup: string;
  clientType: CcSwitchClientType;
  enabled: boolean;
  model: string;
  providerName: string;
}

const labelClassName =
  "text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/45";
const controlClassName =
  "h-10 rounded-xl border border-slate-200/80 bg-white px-3 text-sm text-slate-900 shadow-none hover:border-slate-300 hover:bg-white focus-visible:ring-2 focus-visible:ring-slate-900/10 dark:border-neutral-800 dark:bg-neutral-900 dark:text-white dark:hover:border-neutral-700 dark:focus-visible:ring-white/15";
const fieldClassName = "space-y-1.5";

const iconByType: Record<CcSwitchClientType, string> = {
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
};

export function CcSwitchImportModal({
  t,
  open,
  baseUrl,
  channelGroup,
  channelGroupOptions = [],
  clientType,
  claudeApiKeyField,
  enabled,
  model,
  models = [],
  modelsLoading = false,
  providerName,
  onChannelGroupChange,
  onClientTypeChange,
  onClose,
  onClaudeApiKeyFieldChange,
  onEnabledChange,
  onModelChange,
  onProviderNameChange,
  onSelect,
}: {
  t: TFunction;
  open: boolean;
  baseUrl: string;
  channelGroup: string;
  channelGroupOptions?: readonly CcSwitchImportGroupOption[];
  clientType: CcSwitchClientType;
  claudeApiKeyField: CcSwitchClaudeAuthField;
  enabled: boolean;
  model: string;
  models?: readonly string[];
  modelsLoading?: boolean;
  providerName: string;
  onChannelGroupChange: (value: string) => void;
  onClientTypeChange: (value: CcSwitchClientType) => void;
  onClose: () => void;
  onClaudeApiKeyFieldChange: (value: CcSwitchClaudeAuthField) => void;
  onEnabledChange: (enabled: boolean) => void;
  onModelChange: (value: string) => void;
  onProviderNameChange: (value: string) => void;
  onSelect: (selection: CcSwitchImportSelection) => void;
}) {
  const client = getCcSwitchClientConfig(clientType);
  const clientLabel = t(client.labelKey);
  const groupOptions =
    channelGroupOptions.length > 0
      ? channelGroupOptions.map((option) => ({
          value: option.value,
          label: option.description ? `${option.label} · ${option.description}` : option.label,
          triggerLabel: option.label,
        }))
      : [
          {
            value: "",
            label: t("ccswitch.import_channel_group_none"),
          },
        ];
  const modelOptions = models.map((item) => ({ value: item, label: item }));
  const claudeApiKeyFieldOptions = CC_SWITCH_CLAUDE_AUTH_FIELDS.map((value) => ({
    value,
    label: t(
      value === "ANTHROPIC_AUTH_TOKEN"
        ? "ccswitch.auth_field_anthropic_auth_token"
        : "ccswitch.auth_field_anthropic_api_key",
    ),
  }));
  const submitLabel = t("ccswitch.import_client", { client: clientLabel });
  const endpointPath = DEFAULT_CC_SWITCH_IMPORT_SETTINGS[clientType].endpointPath;
  const endpointHint = endpointPath || t("ccswitch.import_endpoint_root");

  return (
    <Modal
      open={open}
      title={t("ccswitch.import_to_ccswitch")}
      description={t("ccswitch.import_modal_desc")}
      maxWidth="max-w-2xl"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button
            variant="primary"
            onClick={() =>
              onSelect({
                apiKeyField: clientType === "claude" ? claudeApiKeyField : undefined,
                baseUrl,
                channelGroup,
                clientType,
                enabled,
                model,
                providerName,
              })
            }
          >
            {submitLabel}
          </Button>
        </>
      }
      bodyClassName="bg-slate-50/45 dark:bg-neutral-950/45"
    >
      <div className="space-y-3.5">
        <Tabs
          value={clientType}
          onValueChange={(value) => onClientTypeChange(value as CcSwitchClientType)}
        >
          <TabsList
            aria-label={t("ccswitch.import_client_type")}
            className="sticky top-0 z-10 shadow-sm shadow-slate-900/5"
          >
            {CC_SWITCH_CLIENTS.map((item) => {
              const label = t(item.labelKey);
              return (
                <TabsTrigger key={item.type} value={item.type} aria-label={label}>
                  <img
                    src={iconByType[item.type]}
                    alt=""
                    data-testid={`ccswitch-client-tab-icon-${item.type}`}
                    className="h-4 w-4"
                  />
                  {label}
                </TabsTrigger>
              );
            })}
          </TabsList>
        </Tabs>

        <section
          data-testid="ccswitch-client-specific-panel"
          className="min-h-[76px] rounded-2xl border border-slate-200/75 bg-white p-3.5 shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] dark:border-neutral-800 dark:bg-neutral-950/70"
        >
          {clientType === "claude" ? (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.9fr)] sm:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/75 bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900">
                    <img src={iconByType.claude} alt="" className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                      {clientLabel}
                    </div>
                    <div className="truncate text-xs text-slate-500 dark:text-white/55">
                      {t(client.descriptionKey)}
                    </div>
                  </div>
                </div>
              </div>
              <label className="block space-y-1.5">
                <span className={labelClassName}>
                  {t("ccswitch.settings_auth_field", { client: clientLabel })}
                </span>
                <Select
                  value={claudeApiKeyField}
                  onChange={(value) => onClaudeApiKeyFieldChange(value as CcSwitchClaudeAuthField)}
                  options={claudeApiKeyFieldOptions}
                  aria-label={t("ccswitch.settings_auth_field", { client: clientLabel })}
                  className={controlClassName}
                />
              </label>
            </div>
          ) : (
            <div className="flex min-h-[54px] items-center gap-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200/75 bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900">
                <img src={iconByType[clientType]} alt="" className="h-6 w-6" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-slate-900 dark:text-white">
                  {clientLabel}
                </div>
                <div className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-white/55">
                  {t(client.descriptionKey)}
                </div>
                <div className="mt-1 font-mono text-[11px] text-slate-500 dark:text-white/45">
                  {t("ccswitch.import_endpoint_path_hint", { path: endpointHint })}
                </div>
              </div>
            </div>
          )}
          <div className="mt-3 rounded-xl border border-slate-200/70 bg-slate-50/70 px-3 py-2.5 dark:border-neutral-800 dark:bg-neutral-900/60">
            <div className={labelClassName}>{t("ccswitch.import_base_url")}</div>
            <div className="mt-1.5 truncate rounded-lg bg-white px-2.5 py-2 font-mono text-xs text-slate-700 dark:bg-neutral-950 dark:text-white/70">
              {baseUrl || "--"}
            </div>
          </div>
        </section>

        <div
          data-testid="ccswitch-import-provider-row"
          className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.78fr)]"
        >
          <label className={fieldClassName}>
            <span className={labelClassName}>{t("ccswitch.import_provider_name")}</span>
            <TextInput
              value={providerName}
              onChange={(event) => onProviderNameChange(event.currentTarget.value)}
              placeholder={t("ccswitch.import_provider_name_placeholder")}
              aria-label={t("ccswitch.import_provider_name")}
              className={controlClassName}
            />
          </label>

          <label className={fieldClassName}>
            <span className={labelClassName}>{t("ccswitch.import_channel_group")}</span>
            <Select
              value={channelGroup}
              onChange={onChannelGroupChange}
              options={groupOptions}
              aria-label={t("ccswitch.import_channel_group")}
              className={`${controlClassName} w-full`}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className={fieldClassName}>
            <span className={labelClassName}>{t("ccswitch.import_model")}</span>
            <Select
              value={model}
              onChange={onModelChange}
              options={modelOptions}
              placeholder={
                modelsLoading
                  ? t("ccswitch.import_model_loading")
                  : t("ccswitch.import_model_placeholder")
              }
              aria-label={t("ccswitch.import_model")}
              className={`${controlClassName} w-full`}
            />
          </label>

          <label className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200/75 bg-white px-3 text-sm font-semibold text-slate-700 shadow-none dark:border-neutral-800 dark:bg-neutral-900 dark:text-white/70">
            <Checkbox
              checked={enabled}
              onCheckedChange={onEnabledChange}
              aria-label={t("ccswitch.import_enabled_default")}
              className="h-4 w-4"
            />
            {t("ccswitch.import_enabled_default")}
          </label>
        </div>

      </div>
    </Modal>
  );
}
