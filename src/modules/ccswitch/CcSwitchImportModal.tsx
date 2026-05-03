import type { TFunction } from "i18next";
import { Button } from "@/modules/ui/Button";
import { Checkbox } from "@/modules/ui/Checkbox";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { Select } from "@/modules/ui/Select";
import {
  CC_SWITCH_CLIENTS,
  getCcSwitchClientConfig,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import {
  CC_SWITCH_CLAUDE_AUTH_FIELDS,
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
  const clientOptions = CC_SWITCH_CLIENTS.map((item) => ({
    value: item.type,
    label: t(item.labelKey),
  }));
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

  return (
    <Modal
      open={open}
      title={t("ccswitch.import_to_ccswitch")}
      description={t("ccswitch.import_modal_desc")}
      maxWidth="max-w-xl"
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      }
    >
      <div className="space-y-4">
        <label className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600 dark:text-white/55">
            {t("ccswitch.import_client_type")}
          </span>
          <Select
            value={clientType}
            onChange={(value) => onClientTypeChange(value as CcSwitchClientType)}
            options={clientOptions}
            aria-label={t("ccswitch.import_client_type")}
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600 dark:text-white/55">
              {t("ccswitch.import_provider_name")}
            </span>
            <TextInput
              value={providerName}
              onChange={(event) => onProviderNameChange(event.currentTarget.value)}
              placeholder={t("ccswitch.import_provider_name_placeholder")}
              aria-label={t("ccswitch.import_provider_name")}
            />
          </label>

          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600 dark:text-white/55">
              {t("ccswitch.import_channel_group")}
            </span>
            <Select
              value={channelGroup}
              onChange={onChannelGroupChange}
              options={groupOptions}
              aria-label={t("ccswitch.import_channel_group")}
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600 dark:text-white/55">
              {t("ccswitch.import_model")}
            </span>
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
              className="w-full"
            />
          </label>

          <label className="inline-flex h-10 items-center gap-2 text-sm font-medium text-slate-700 dark:text-white/70">
            <Checkbox
              checked={enabled}
              onCheckedChange={onEnabledChange}
              aria-label={t("ccswitch.import_enabled_default")}
            />
            {t("ccswitch.import_enabled_default")}
          </label>
        </div>

        {clientType === "claude" ? (
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600 dark:text-white/55">
              {t("ccswitch.settings_auth_field", { client: clientLabel })}
            </span>
            <Select
              value={claudeApiKeyField}
              onChange={(value) => onClaudeApiKeyFieldChange(value as CcSwitchClaudeAuthField)}
              options={claudeApiKeyFieldOptions}
              aria-label={t("ccswitch.settings_auth_field", { client: clientLabel })}
            />
          </label>
        ) : null}

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/55">
          <div className="text-xs font-semibold text-slate-500 dark:text-white/45">
            {t("ccswitch.import_base_url")}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-white/70">
            {baseUrl || "--"}
          </div>
        </div>

        <div className="flex justify-end">
          <Button
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
        </div>
      </div>
    </Modal>
  );
}
