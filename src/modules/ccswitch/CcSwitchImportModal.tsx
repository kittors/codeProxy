import type { TFunction } from "i18next";
import { Button } from "@/modules/ui/Button";
import { Checkbox } from "@/modules/ui/Checkbox";
import { TextInput } from "@/modules/ui/Input";
import { Modal } from "@/modules/ui/Modal";
import { Select } from "@/modules/ui/Select";
import { CcSwitchImportOptions } from "@/modules/ccswitch/CcSwitchImportOptions";
import type { CcSwitchClientType } from "@/modules/ccswitch/ccswitchImport";

export interface CcSwitchImportGroupOption {
  value: string;
  label: string;
  baseUrl: string;
  description?: string;
}

export interface CcSwitchImportSelection {
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
  enabled,
  model,
  models = [],
  modelsLoading = false,
  providerName,
  onChannelGroupChange,
  onClose,
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
  enabled: boolean;
  model: string;
  models?: readonly string[];
  modelsLoading?: boolean;
  providerName: string;
  onChannelGroupChange: (value: string) => void;
  onClose: () => void;
  onEnabledChange: (enabled: boolean) => void;
  onModelChange: (value: string) => void;
  onProviderNameChange: (value: string) => void;
  onSelect: (selection: CcSwitchImportSelection) => void;
}) {
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

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/55">
          <div className="text-xs font-semibold text-slate-500 dark:text-white/45">
            {t("ccswitch.import_base_url")}
          </div>
          <div className="mt-1 truncate font-mono text-xs text-slate-700 dark:text-white/70">
            {baseUrl || "--"}
          </div>
        </div>

        <CcSwitchImportOptions
          t={t}
          models={model ? [model] : models}
          settings={
            model
              ? {
                  claude: { defaultModel: model },
                  codex: { defaultModel: model },
                  gemini: { defaultModel: model },
                }
              : undefined
          }
          onSelect={(clientType) =>
            onSelect({
              baseUrl,
              channelGroup,
              clientType,
              enabled,
              model,
              providerName,
            })
          }
        />
      </div>
    </Modal>
  );
}
