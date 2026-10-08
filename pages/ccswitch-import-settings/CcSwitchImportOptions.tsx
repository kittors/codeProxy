import type { TFunction } from "i18next";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CC_SWITCH_CLIENTS,
  pickCcSwitchDefaultModel,
  type CcSwitchClientConfig,
  type CcSwitchClientType,
} from "@code-proxy/domain/ccswitch/ccswitchImport";
import {
  CC_SWITCH_CLAUDE_AUTH_FIELDS,
  normalizeCcSwitchClaudeAuthField,
  normalizeCcSwitchImportSettings,
  type CcSwitchImportSettings,
  type CcSwitchImportSettingsInput,
} from "@code-proxy/domain/ccswitch/ccswitchImportSettings";
import { Select } from "@code-proxy/ui";
import iconClaude from "@code-proxy/assets/icons/claude.svg";
import iconCodex from "@code-proxy/assets/icons/codex.svg";
import iconGemini from "@code-proxy/assets/icons/gemini.svg";

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
      // 轮廓用阴影描边（shadow-control），和按钮、ChoiceCards 的选项卡同一套；焦点走全局 :focus-visible。
      // 客户端 logo 直接放，不再垫带细边的白底方块。
      className={[
        "group inline-flex min-w-0 items-center bg-surface text-left shadow-control transition-[background-color,box-shadow,color] active:translate-y-px hover:shadow-control-hover",
        compact
          ? "h-8 gap-1.5 rounded-full px-2.5 text-ink-2 hover:text-ink"
          : "gap-3 rounded-2xl px-3.5 py-3 hover:bg-surface-hover",
      ].join(" ")}
    >
      <span className="inline-flex shrink-0 items-center justify-center">
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
            "block truncate font-semibold text-ink",
            compact ? "text-xs" : "text-sm",
          ].join(" ")}
        >
          {label}
        </span>
        {compact ? null : (
          <span className="mt-0.5 block text-xs text-ink-3">
            {t(client.descriptionKey)}
          </span>
        )}
        {model && !compact ? (
          <span className="mt-2 inline-flex max-w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-ink/[0.05] px-1.5 py-0.5 font-mono text-2xs text-ink-3 dark:bg-white/[0.07]">
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
        <span className="text-xs font-semibold text-ink-2">{label}</span>
      )}
      <Select
        fullWidth={!compact}
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
    normalizeCcSwitchImportSettings(settings),
  );
  useEffect(() => {
    setResolvedSettings(normalizeCcSwitchImportSettings(settings));
  }, [settings]);
  const handleClaudeAuthFieldChange = useCallback((value: string) => {
    const normalizedValue = normalizeCcSwitchClaudeAuthField(value);
    setResolvedSettings((current) =>
      normalizeCcSwitchImportSettings({
        ...current,
        claude: {
          ...current.claude,
          apiKeyField: normalizedValue,
        },
      }),
    );
  }, []);

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
      className="inline-flex min-w-0 flex-wrap items-center gap-1 rounded-2xl bg-subtle p-1"
    >
      <span className="px-1.5 text-xs font-semibold text-ink-3">
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
