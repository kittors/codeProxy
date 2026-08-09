import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { FormField, HoverTooltip, TextInput } from "@code-proxy/ui";

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

export interface OpenAIThresholdFieldsProps {
  thresholds: Record<string, string>;
  disabled: boolean;
  onChange: (thresholds: Record<string, string>) => void;
}

export function OpenAIThresholdFields({
  thresholds,
  disabled,
  onChange,
}: OpenAIThresholdFieldsProps) {
  const { t } = useTranslation();

  return (
    <div className="mt-5 border-t border-slate-900/8 pt-4 dark:border-white/8">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t("content_moderation.thresholds")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/45">
          {t("content_moderation.thresholds_hint")}
        </p>
      </div>
      <div className="grid gap-x-4 gap-y-3 md:grid-cols-2">
        {THRESHOLD_CATEGORIES.map(({ key, i18nKey }) => {
          const categoryName = t(`content_moderation.threshold_category.${i18nKey}`);
          const categoryHelp = t(`content_moderation.threshold_category_help.${i18nKey}`);
          return (
            <FormField
              key={key}
              label={
                <span className="inline-flex items-center gap-1.5">
                  <span>{categoryName}</span>
                  <HoverTooltip content={categoryHelp} placement="top">
                    <span
                      role="button"
                      tabIndex={0}
                      aria-label={categoryHelp}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:text-white/40 dark:hover:text-white/75 dark:focus-visible:ring-white/15"
                    >
                      <Info size={14} aria-hidden="true" />
                    </span>
                  </HoverTooltip>
                </span>
              }
              required={!disabled}
              reserveMeta={false}
            >
              <TextInput
                type="number"
                min="0"
                max="1"
                step="0.01"
                inputMode="decimal"
                aria-label={categoryName}
                value={thresholds[key] ?? ""}
                disabled={disabled}
                onChange={(event) =>
                  onChange({ ...thresholds, [key]: event.currentTarget.value })
                }
              />
            </FormField>
          );
        })}
      </div>
    </div>
  );
}
