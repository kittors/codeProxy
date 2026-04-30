import type { TFunction } from "i18next";
import { useCallback, useMemo, useState } from "react";
import {
  CC_SWITCH_CLIENTS,
  pickCcSwitchDefaultModel,
  type CcSwitchClientConfig,
  type CcSwitchClientType,
} from "@/modules/ccswitch/ccswitchImport";
import {
  CC_SWITCH_CLAUDE_AUTH_FIELDS,
  normalizeCcSwitchClaudeAuthField,
  normalizeCcSwitchImportSettings,
  readCcSwitchImportSettings,
  writeCcSwitchImportSettings,
  type CcSwitchImportSettings,
  type CcSwitchImportSettingsInput,
} from "@/modules/ccswitch/ccswitchImportSettings";
import { Select } from "@/modules/ui/Select";
import iconClaude from "@/assets/icons/claude.svg";
import iconCodex from "@/assets/icons/codex.svg";
import iconGemini from "@/assets/icons/gemini.svg";

const iconByType: Record<CcSwitchClientType, string> = {
  claude: iconClaude,
  codex: iconCodex,
  gemini: iconGemini,
};

function ImportOptionButton({
  t,
  client,
  models,
  settings,
  compact,
  onSelect,
}: {
  t: TFunction;
  client: CcSwitchClientConfig;
  models: readonly string[];
  settings?: CcSwitchImportSettingsInput;
  compact?: boolean;
  onSelect: (clientType: CcSwitchClientType) => void;
}) {
  const icon = iconByType[client.type];
  const model = pickCcSwitchDefaultModel(client.type, models, settings);
  const label = t(client.labelKey);
  const importLabel = t("ccswitch.import_client", { client: label });

  return (
    <button
      type="button"
      aria-label={importLabel}
      title={model ? `${importLabel} · ${model}` : importLabel}
      onClick={() => onSelect(client.type)}
      className={[
        "group inline-flex min-w-0 items-center text-left transition active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-900/10 dark:focus-visible:ring-white/15",
        compact
          ? "h-8 gap-1.5 rounded-lg border border-transparent bg-white/80 px-2 text-slate-700 hover:border-slate-200 hover:bg-white hover:text-slate-950 dark:bg-neutral-950/60 dark:text-white/70 dark:hover:border-neutral-700 dark:hover:bg-neutral-900 dark:hover:text-white"
          : "gap-3 rounded-xl border border-black/[0.06] bg-slate-50/55 p-3 shadow-[0_1px_2px_rgb(15_23_42_/_0.035)] hover:border-slate-200 hover:bg-white hover:shadow-sm dark:border-white/[0.06] dark:bg-neutral-900/55 dark:hover:border-neutral-700 dark:hover:bg-neutral-900",
      ].join(" ")}
    >
      <span
        className={[
          "inline-flex shrink-0 items-center justify-center rounded-lg border bg-white dark:bg-neutral-950",
          compact
            ? "h-5 w-5 border-transparent"
            : "h-10 w-10 border-slate-200/70 shadow-xs dark:border-neutral-800",
        ].join(" ")}
      >
        <img
          src={icon}
          alt=""
          data-testid={`ccswitch-client-icon-${client.type}`}
          className={compact ? "h-4 w-4" : "h-5 w-5"}
        />
      </span>
      <span className="min-w-0">
        <span
          className={[
            "block truncate font-semibold text-slate-900 dark:text-white",
            compact ? "text-xs" : "text-sm",
          ].join(" ")}
        >
          {label}
        </span>
        {compact ? null : (
          <span className="mt-0.5 block text-xs text-slate-500 dark:text-white/55">
            {t(client.descriptionKey)}
          </span>
        )}
        {model && !compact ? (
          <span className="mt-2 inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-slate-200/70 bg-white px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-white/45">
            {t("ccswitch.model_hint", { model })}
          </span>
        ) : null}
      </span>
    </button>
  );
}

function ClaudeAuthFieldSelect({
  t,
  settings,
  compact,
  onChange,
}: {
  t: TFunction;
  settings: CcSwitchImportSettings;
  compact: boolean;
  onChange: (value: string) => void;
}) {
  const label = t("ccswitch.settings_auth_field", {
    client: t("ccswitch.client_claude_code"),
  });
  const options = useMemo(
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

  return (
    <div
      className={
        compact
          ? "inline-flex min-w-0 items-center"
          : "flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between"
      }
    >
      {compact ? null : (
        <span className="text-xs font-semibold text-slate-600 dark:text-white/55">{label}</span>
      )}
      <Select
        value={settings.claude.apiKeyField ?? "ANTHROPIC_API_KEY"}
        onChange={onChange}
        options={options}
        aria-label={label}
        size="sm"
        className={compact ? "w-44" : "w-full sm:w-64"}
      />
    </div>
  );
}

export function CcSwitchImportOptions({
  t,
  models = [],
  settings,
  compact = false,
  onSelect,
}: {
  t: TFunction;
  models?: readonly string[];
  settings?: CcSwitchImportSettingsInput;
  compact?: boolean;
  onSelect: (clientType: CcSwitchClientType) => void;
}) {
  const [resolvedSettings, setResolvedSettings] = useState<CcSwitchImportSettings>(() =>
    normalizeCcSwitchImportSettings(settings ?? readCcSwitchImportSettings()),
  );
  const handleClaudeAuthFieldChange = useCallback(
    (value: string) => {
      const normalizedValue = normalizeCcSwitchClaudeAuthField(value);
      const nextSettings = writeCcSwitchImportSettings({
        ...resolvedSettings,
        claude: {
          ...resolvedSettings.claude,
          apiKeyField: normalizedValue,
        },
      });
      setResolvedSettings(nextSettings);
    },
    [resolvedSettings],
  );

  const buttons = CC_SWITCH_CLIENTS.map((client) => (
    <ImportOptionButton
      key={client.type}
      t={t}
      client={client}
      models={models}
      settings={resolvedSettings}
      compact={compact}
      onSelect={onSelect}
    />
  ));

  return compact ? (
    <div
      role="group"
      aria-label={t("ccswitch.import_to_ccswitch")}
      className="inline-flex min-w-0 flex-wrap items-center gap-1 rounded-xl border border-slate-200/70 bg-slate-50/75 p-1 dark:border-neutral-800 dark:bg-neutral-900/45"
    >
      <span className="px-1.5 text-[11px] font-semibold text-slate-500 dark:text-white/45">
        {t("ccswitch.import_to_ccswitch")}
      </span>
      <ClaudeAuthFieldSelect
        t={t}
        settings={resolvedSettings}
        compact
        onChange={handleClaudeAuthFieldChange}
      />
      {buttons}
    </div>
  ) : (
    <div className="space-y-2.5">
      <ClaudeAuthFieldSelect
        t={t}
        settings={resolvedSettings}
        compact={false}
        onChange={handleClaudeAuthFieldChange}
      />
      <div className="grid gap-2.5 sm:grid-cols-3">{buttons}</div>
    </div>
  );
}
