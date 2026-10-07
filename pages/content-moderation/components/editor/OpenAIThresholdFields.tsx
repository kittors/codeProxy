import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Gauge } from "lucide-react";
import { FormSection, TextInput, type Rule } from "@code-proxy/ui";

export const THRESHOLD_CATEGORIES = [
  { key: "harassment", i18nKey: "harassment" },
  { key: "harassment/threatening", i18nKey: "harassment_threatening" },
  { key: "hate", i18nKey: "hate" },
  { key: "hate/threatening", i18nKey: "hate_threatening" },
  { key: "illicit", i18nKey: "illicit" },
  { key: "illicit/violent", i18nKey: "illicit_violent" },
  { key: "self-harm", i18nKey: "self_harm" },
  { key: "self-harm/intent", i18nKey: "self_harm_intent" },
  { key: "self-harm/instructions", i18nKey: "self_harm_instructions" },
  { key: "sexual", i18nKey: "sexual" },
  { key: "sexual/minors", i18nKey: "sexual_minors" },
  { key: "violence", i18nKey: "violence" },
  { key: "violence/graphic", i18nKey: "violence_graphic" },
] as const;

export type ThresholdCategory = (typeof THRESHOLD_CATEGORIES)[number]["key"];

export const DEFAULT_THRESHOLDS: Record<ThresholdCategory, number> = {
  harassment: 0.98,
  "harassment/threatening": 0.9,
  hate: 0.65,
  "hate/threatening": 0.65,
  illicit: 0.95,
  "illicit/violent": 0.95,
  "self-harm": 0.65,
  "self-harm/intent": 0.85,
  "self-harm/instructions": 0.65,
  sexual: 0.65,
  "sexual/minors": 0.65,
  violence: 0.95,
  "violence/graphic": 0.95,
};

export const createThresholdDraft = (
  thresholds?: Record<string, number>,
): Record<string, string> => {
  const result: Record<string, string> = {};
  for (const { key } of THRESHOLD_CATEGORIES) {
    result[key] = String(thresholds?.[key] ?? DEFAULT_THRESHOLDS[key]);
  }
  return result;
};

export const parseThresholds = (
  values: Record<string, string>,
): Record<string, number> | null => {
  const result: Record<string, number> = {};
  for (const { key } of THRESHOLD_CATEGORIES) {
    const rawValue = values[key];
    if (rawValue == null || rawValue.trim() === "") return null;

    const threshold = Number(rawValue);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) return null;
    result[key] = threshold;
  }
  return result;
};

/** 每个分类阈值都要是 0–1 之间的数（服务端 types.go 同样拒绝越界值）。 */
const thresholdRule: Rule<string> = (value) => {
  const text = (value ?? "").trim();
  if (!text) return { key: "required" };
  const threshold = Number(text);
  return Number.isFinite(threshold) && threshold >= 0 && threshold <= 1
    ? null
    : { key: "decimal_range", params: { min: 0, max: 1 } };
};

export const thresholdValidationSchema = Object.fromEntries(
  THRESHOLD_CATEGORIES.map(({ key }) => [key, [thresholdRule]]),
) as Record<string, readonly Rule<string>[]>;

export interface OpenAIThresholdFieldsProps {
  thresholds: Record<string, string>;
  disabled: boolean;
  onChange: (thresholds: Record<string, string>) => void;
  /** 该分类要显示的错误（未触碰、未提交时为 undefined）。 */
  errorFor?: (key: string) => string | undefined;
  onFieldBlur?: (key: string) => void;
}

/**
 * OpenAI 分类阈值。
 *
 * 13 个分类的说明以前藏在每个名字旁的 ⓘ 悬停提示里，要挨个移上去才知道「illicit」管什么；
 * 现在常驻显示：两列紧凑排布，左边是名称和一句定义，右边是一个窄输入框，表单不会被撑得太长。
 * 「阈值越低越严格」对所有分类都一样，只在分区说明里写一次。
 */
export function OpenAIThresholdFields({
  thresholds,
  disabled,
  onChange,
  errorFor,
  onFieldBlur,
}: OpenAIThresholdFieldsProps) {
  const { t } = useTranslation();
  const idPrefix = useId();

  return (
    <FormSection
      title={t("content_moderation.thresholds")}
      description={t("content_moderation.thresholds_hint")}
      icon={<Gauge />}
    >
      <div className="grid gap-x-8 md:grid-cols-2">
        {THRESHOLD_CATEGORIES.map(({ key, i18nKey }) => {
          const id = `${idPrefix}-${i18nKey}`;
          const categoryName = t(`content_moderation.threshold_category.${i18nKey}`);
          const error = errorFor?.(key);
          return (
            <div key={key} className="border-b border-line py-3 last:border-b-0">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <label htmlFor={id} className="text-sm font-medium text-ink">
                    {categoryName}
                  </label>
                  <p id={`${id}-desc`} className="mt-0.5 text-xs leading-5 text-ink-3">
                    {t(`content_moderation.threshold_category_desc.${i18nKey}`)}
                  </p>
                </div>
                <div className="w-24 shrink-0">
                  <TextInput
                    id={id}
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    inputMode="decimal"
                    aria-label={categoryName}
                    aria-describedby={error ? `${id}-desc ${id}-error` : `${id}-desc`}
                    invalid={Boolean(error)}
                    className="tabular-nums"
                    value={thresholds[key] ?? ""}
                    disabled={disabled}
                    onBlur={() => onFieldBlur?.(key)}
                    onChange={(event) =>
                      onChange({ ...thresholds, [key]: event.currentTarget.value })
                    }
                  />
                </div>
              </div>
              {error ? (
                <p
                  id={`${id}-error`}
                  role="alert"
                  className="mt-1 text-xs leading-5 text-rose-600 dark:text-rose-400"
                >
                  {error}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </FormSection>
  );
}
