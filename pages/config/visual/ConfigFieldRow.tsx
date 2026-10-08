import { Eye, EyeOff } from "lucide-react";
import { useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { ProxyUrlInput } from "@features/proxy-pool";
import type { VisualConfigValues } from "@features/visual-config-editor";
import {
  Callout,
  ChoiceCards,
  SettingRow,
  Textarea,
  TextInput,
  ToggleSwitch,
} from "@code-proxy/ui";
import {
  isFieldModified,
  validateField,
  type ConfigBadge,
  type ConfigFieldDef,
} from "./configSchema";
import { fieldDescriptionKey, fieldLabelKey } from "./configSearch";

// 「需重启」是要留意的变更（琥珀），「安全相关」是说明（天蓝）；「影响费用」简约风格同为琥珀
// （红色只留给错误），多彩风格是红色。
const BADGE_TONE: Record<ConfigBadge, string> = {
  restart: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  security: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
  cost: "bg-amber-500/10 text-amber-700 dark:text-amber-300 colorful:bg-rose-500/10 colorful:text-rose-700 colorful:dark:text-rose-300",
};

export function configFieldDomId(fieldId: string) {
  return `config-field-${fieldId}`;
}

/** 一项设置：名称、常驻说明与 YAML 键在左，控件在右；改过的项可以单独撤销。 */
export function ConfigFieldRow({
  field,
  values,
  baseline,
  disabled,
  highlighted,
  onChange,
}: {
  field: ConfigFieldDef;
  values: VisualConfigValues;
  baseline: VisualConfigValues;
  disabled?: boolean;
  highlighted?: boolean;
  onChange: (patch: Partial<VisualConfigValues>) => void;
}) {
  const { t } = useTranslation();
  const controlId = useId();
  const label = t(fieldLabelKey(field));
  const descriptionKey = fieldDescriptionKey(field);
  const description = t(descriptionKey, { defaultValue: "" });
  const value = field.get(values);
  const modified = isFieldModified(field, values, baseline);
  const unit = field.unit ? t(`config_ui.units.${field.unit}`) : null;
  const [revealed, setRevealed] = useState(false);
  const invalid = validateField(field, values);
  const errorText = invalid ? t(`config_ui.errors.${invalid.key}`, invalid.params) : null;

  const update = (next: string | boolean) => onChange(field.set(values, next));

  let control;
  switch (field.kind) {
    case "switch":
      control = (
        <ToggleSwitch
          id={controlId}
          checked={Boolean(value)}
          onCheckedChange={update}
          disabled={disabled}
          ariaLabel={label}
        />
      );
      break;
    case "multiline":
      control = (
        <Textarea
          id={controlId}
          value={String(value)}
          onChange={(event) => update(event.currentTarget.value)}
          disabled={disabled}
          aria-label={label}
          placeholder={field.placeholder}
          rows={5}
          spellCheck={false}
          className="font-mono text-xs leading-5"
        />
      );
      break;
    case "proxy":
      control = (
        <ProxyUrlInput
          value={String(value)}
          onChange={(url) => update(url)}
          disabled={disabled}
        />
      );
      break;
    case "choice":
      control = (
        <ChoiceCards
          ariaLabel={label}
          value={String(value)}
          onChange={update}
          disabled={disabled}
          options={(field.options ?? []).map((option) => ({
            value: option,
            label: t(`config_ui.fields.${field.id}.options.${option}.label`),
            description: t(`config_ui.fields.${field.id}.options.${option}.desc`),
          }))}
        />
      );
      break;
    default:
      control = (
        <TextInput
          id={controlId}
          value={String(value)}
          onChange={(event) => update(event.currentTarget.value)}
          disabled={disabled}
          aria-label={label}
          placeholder={field.placeholder}
          type={field.secret && !revealed ? "password" : "text"}
          inputMode={field.kind === "number" ? "numeric" : undefined}
          spellCheck={false}
          autoComplete={field.secret ? "new-password" : "off"}
          invalid={Boolean(invalid)}
          className={field.kind === "number" ? "tabular-nums" : undefined}
          endAdornment={
            field.secret ? (
              <button
                type="button"
                onClick={() => setRevealed((previous) => !previous)}
                aria-label={revealed ? t("common.hide") : t("common.show")}
                aria-pressed={revealed}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-hover hover:text-ink"
              >
                {revealed ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              </button>
            ) : unit ? (
              <span className="pr-2 text-xs text-ink-3 select-none">{unit}</span>
            ) : undefined
          }
        />
      );
  }

  const warningKey = field.warningKey ?? `config_ui.fields.${field.id}.warning`;

  return (
    <SettingRow
      id={configFieldDomId(field.id)}
      label={label}
      description={description || undefined}
      meta={field.yamlKey}
      htmlFor={field.kind === "choice" ? undefined : controlId}
      controlWidth={field.width ?? "md"}
      modified={modified}
      onReset={() => onChange(field.set(values, field.get(baseline)))}
      error={errorText}
      highlighted={highlighted}
      badges={
        field.badges?.length ? (
          <span className="flex flex-wrap gap-1">
            {field.badges.map((badge) => (
              <span
                key={badge}
                className={[
                  "rounded-full px-2 py-px text-2xs font-medium",
                  BADGE_TONE[badge],
                ].join(" ")}
              >
                {t(`config_ui.badges.${badge}`)}
              </span>
            ))}
          </span>
        ) : null
      }
      control={field.width === "full" ? undefined : control}
    >
      {field.width === "full" || field.warning ? (
        <div className="space-y-3">
          {field.width === "full" ? control : null}
          {field.warning ? (
            <Callout tone={field.id === "cors_origins" ? "info" : "warning"}>
              {t(warningKey)}
            </Callout>
          ) : null}
        </div>
      ) : null}
    </SettingRow>
  );
}
