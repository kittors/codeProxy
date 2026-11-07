import { useTranslation } from "react-i18next";
import { FormField, TextInput } from "@code-proxy/ui";
import { parseInteger } from "./model";

/**
 * 整数输入框。草稿里它是字符串，用户清空、输到一半都不会被改成 0；范围不对时就地标红并说明范围，
 * 不用等保存被后端退回。`serverError` 是后端按字段退回的原因（details.field 对上这个字段时）。
 */
export function NumberField({
  label,
  description,
  value,
  onChange,
  min,
  max,
  unit,
  disabled,
  serverError,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (next: string) => void;
  min: number;
  max: number;
  unit?: string;
  disabled?: boolean;
  serverError?: string;
}) {
  const { t } = useTranslation();
  const invalid = parseInteger(value, min, max) === null;
  const error = invalid ? t("alerts_page.range_error", { min, max }) : serverError;
  return (
    <FormField label={label} description={description} error={error} reserveMeta={false}>
      <TextInput
        inputMode="numeric"
        autoComplete="off"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        endAdornment={unit ? <span className="pr-1 text-xs text-ink-3">{unit}</span> : undefined}
      />
    </FormField>
  );
}
