import { RotateCcw, Save } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGemini from "@/assets/icons/gemini.svg";
import { Button } from "@/modules/ui/Button";
import { Card } from "@/modules/ui/Card";
import { TextInput } from "@/modules/ui/Input";
import { Select } from "@/modules/ui/Select";
import { useToast } from "@/modules/ui/ToastProvider";
import { CC_SWITCH_CLIENTS, type CcSwitchClientType } from "@/modules/ccswitch/ccswitchImport";
import {
  CC_SWITCH_CLAUDE_AUTH_FIELDS,
  normalizeCcSwitchImportSettings,
  normalizeCcSwitchClaudeAuthField,
  readCcSwitchImportSettings,
  resetCcSwitchImportSettings,
  writeCcSwitchImportSettings,
  type CcSwitchClaudeAuthField,
  type CcSwitchImportSettings,
} from "@/modules/ccswitch/ccswitchImportSettings";

type FormSettings = Record<
  CcSwitchClientType,
  {
    endpointPath: string;
    defaultModel: string;
    usageAutoInterval: string;
    apiKeyField?: CcSwitchClaudeAuthField;
  }
>;

const iconByType: Record<CcSwitchClientType, string> = {
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
};

function toFormSettings(settings: CcSwitchImportSettings): FormSettings {
  return {
    claude: {
      endpointPath: settings.claude.endpointPath,
      defaultModel: settings.claude.defaultModel,
      usageAutoInterval: String(settings.claude.usageAutoInterval),
      apiKeyField: settings.claude.apiKeyField,
    },
    codex: {
      endpointPath: settings.codex.endpointPath,
      defaultModel: settings.codex.defaultModel,
      usageAutoInterval: String(settings.codex.usageAutoInterval),
    },
    gemini: {
      endpointPath: settings.gemini.endpointPath,
      defaultModel: settings.gemini.defaultModel,
      usageAutoInterval: String(settings.gemini.usageAutoInterval),
    },
  };
}

function fromFormSettings(form: FormSettings): CcSwitchImportSettings {
  return normalizeCcSwitchImportSettings({
    claude: {
      endpointPath: form.claude.endpointPath,
      defaultModel: form.claude.defaultModel,
      usageAutoInterval: Number(form.claude.usageAutoInterval),
      apiKeyField: form.claude.apiKeyField,
    },
    codex: {
      endpointPath: form.codex.endpointPath,
      defaultModel: form.codex.defaultModel,
      usageAutoInterval: Number(form.codex.usageAutoInterval),
    },
    gemini: {
      endpointPath: form.gemini.endpointPath,
      defaultModel: form.gemini.defaultModel,
      usageAutoInterval: Number(form.gemini.usageAutoInterval),
    },
  });
}

export function CcSwitchImportSettingsPage() {
  const { t } = useTranslation();
  const { notify } = useToast();
  const clients = useMemo(() => CC_SWITCH_CLIENTS, []);
  const authFieldOptions = useMemo(
    () =>
      CC_SWITCH_CLAUDE_AUTH_FIELDS.map((value) => ({
        value,
        label: t(
          value === "ANTHROPIC_AUTH_TOKEN"
            ? "ccswitch.auth_field_anthropic_auth_token"
            : "ccswitch.auth_field_anthropic_api_key",
        ),
      })),
    [t],
  );
  const [form, setForm] = useState<FormSettings>(() =>
    toFormSettings(readCcSwitchImportSettings()),
  );

  const updateClient = useCallback(
    (clientType: CcSwitchClientType, patch: Partial<FormSettings[CcSwitchClientType]>) => {
      setForm((prev) => ({
        ...prev,
        [clientType]: {
          ...prev[clientType],
          ...patch,
        },
      }));
    },
    [],
  );

  const handleSave = useCallback(() => {
    const normalized = writeCcSwitchImportSettings(fromFormSettings(form));
    setForm(toFormSettings(normalized));
    notify({ type: "success", message: t("ccswitch.settings_saved") });
  }, [form, notify, t]);

  const handleReset = useCallback(() => {
    const defaults = resetCcSwitchImportSettings();
    setForm(toFormSettings(defaults));
    notify({ type: "info", message: t("ccswitch.settings_reset") });
  }, [notify, t]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold tracking-normal text-slate-950 dark:text-white">
            {t("ccswitch.settings_title")}
          </h2>
          <p className="max-w-3xl text-sm text-slate-600 dark:text-white/60">
            {t("ccswitch.settings_description")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleReset}>
            <RotateCcw size={14} />
            {t("ccswitch.settings_restore_defaults")}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            aria-label={t("ccswitch.settings_save")}
          >
            <Save size={14} />
            {t("ccswitch.settings_save")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {clients.map((client) => {
          const label = t(client.labelKey);
          const endpointPathId = `ccswitch-${client.type}-endpoint-path`;
          const defaultModelId = `ccswitch-${client.type}-default-model`;
          const usageIntervalId = `ccswitch-${client.type}-usage-interval`;
          const authFieldLabel = t("ccswitch.settings_auth_field", { client: label });

          return (
            <Card
              key={client.type}
              className="rounded-2xl"
              title={label}
              description={t(client.descriptionKey)}
              actions={
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
                  <img src={iconByType[client.type]} alt="" className="h-5 w-5" />
                </span>
              }
            >
              <div className="space-y-4">
                <label className="block space-y-1.5" htmlFor={endpointPathId}>
                  <span className="text-xs font-semibold text-slate-700 dark:text-white/75">
                    {t("ccswitch.settings_endpoint_path", { client: label })}
                  </span>
                  <TextInput
                    id={endpointPathId}
                    value={form[client.type].endpointPath}
                    onChange={(event) =>
                      updateClient(client.type, { endpointPath: event.target.value })
                    }
                    placeholder={t("ccswitch.settings_endpoint_path_placeholder")}
                  />
                </label>

                <label className="block space-y-1.5" htmlFor={defaultModelId}>
                  <span className="text-xs font-semibold text-slate-700 dark:text-white/75">
                    {t("ccswitch.settings_default_model", { client: label })}
                  </span>
                  <TextInput
                    id={defaultModelId}
                    value={form[client.type].defaultModel}
                    onChange={(event) =>
                      updateClient(client.type, { defaultModel: event.target.value })
                    }
                    placeholder={t("ccswitch.settings_default_model_placeholder")}
                  />
                </label>

                <label className="block space-y-1.5" htmlFor={usageIntervalId}>
                  <span className="text-xs font-semibold text-slate-700 dark:text-white/75">
                    {t("ccswitch.settings_usage_interval", { client: label })}
                  </span>
                  <TextInput
                    id={usageIntervalId}
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={form[client.type].usageAutoInterval}
                    onChange={(event) =>
                      updateClient(client.type, { usageAutoInterval: event.target.value })
                    }
                    placeholder="30"
                  />
                </label>

                {client.type === "claude" ? (
                  <div className="block space-y-1.5">
                    <span className="text-xs font-semibold text-slate-700 dark:text-white/75">
                      {authFieldLabel}
                    </span>
                    <Select
                      value={form.claude.apiKeyField ?? "ANTHROPIC_API_KEY"}
                      onChange={(value) =>
                        updateClient("claude", {
                          apiKeyField: normalizeCcSwitchClaudeAuthField(value),
                        })
                      }
                      options={authFieldOptions}
                      aria-label={authFieldLabel}
                    />
                  </div>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
