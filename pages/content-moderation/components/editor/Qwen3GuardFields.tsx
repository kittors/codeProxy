import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Layers, ShieldAlert } from "lucide-react";
import {
  CONTENT_MODERATION_SCANNERS,
  type ContentModerationControversialAction,
  type ContentModerationScanner,
} from "@code-proxy/api-client";
import { Callout, Checkbox, ChoiceCards, FormField, FormSection, TextInput } from "@code-proxy/ui";

export interface Qwen3GuardDraft {
  scanners: ContentModerationScanner[];
  controversialAction: ContentModerationControversialAction;
  elevatedCategories: ContentModerationScanner[];
  inputLimit: string;
  maxChunks: string;
}

export interface Qwen3GuardFieldsProps {
  draft: Qwen3GuardDraft;
  disabled: boolean;
  onChange: (patch: Partial<Qwen3GuardDraft>) => void;
  errors?: { inputLimit?: string; maxChunks?: string };
  onFieldBlur?: (field: "inputLimit" | "maxChunks") => void;
}

const toggle = (
  values: ContentModerationScanner[],
  scanner: ContentModerationScanner,
  checked: boolean,
): ContentModerationScanner[] => {
  const next = new Set(values);
  if (checked) next.add(scanner);
  else next.delete(scanner);
  // Keep the model card's category order so saved config reads consistently.
  return CONTENT_MODERATION_SCANNERS.filter((item) => next.has(item));
};

/**
 * Qwen3Guard 的判定策略。九个风险类别的说明以前藏在 ⓘ 悬停提示里，现在每一项下面直接写一句；
 * 「有争议内容怎么处理」三种选择各有什么后果，也用卡片写在选项上，而不是只有一个下拉框。
 */
export function Qwen3GuardFields({
  draft,
  disabled,
  onChange,
  errors,
  onFieldBlur,
}: Qwen3GuardFieldsProps) {
  const { t } = useTranslation();
  const idPrefix = useId();
  const elevatedEnabled = draft.controversialAction === "elevated_only";

  return (
    <>
      <FormSection
        title={t("content_moderation.scanners")}
        description={t("content_moderation.scanners_hint")}
        icon={<ShieldAlert />}
      >
        <div className="grid gap-x-6 gap-y-1 md:grid-cols-2">
          {CONTENT_MODERATION_SCANNERS.map((scanner) => {
            const label = t(`content_moderation.scanner.${scanner}`);
            const helpId = `${idPrefix}-${scanner}-help`;
            return (
              <label
                key={scanner}
                className={[
                  "flex items-start gap-2.5 rounded-xl px-2 py-1.5 transition-colors",
                  disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-hover",
                ].join(" ")}
              >
                <Checkbox
                  checked={draft.scanners.includes(scanner)}
                  disabled={disabled}
                  aria-label={label}
                  aria-describedby={helpId}
                  className="mt-0.5"
                  onCheckedChange={(checked) =>
                    onChange({ scanners: toggle(draft.scanners, scanner, checked) })
                  }
                />
                <span className="min-w-0">
                  <span className="block text-sm text-ink">{label}</span>
                  <span id={helpId} className="block text-xs leading-5 text-ink-3">
                    {t(`content_moderation.scanner_help.${scanner}`)}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </FormSection>

      <FormSection
        title={t("content_moderation.guard_policy_section")}
        description={t("content_moderation.controversial_action_hint")}
        icon={<Layers />}
      >
        <ChoiceCards<ContentModerationControversialAction>
          ariaLabel={t("content_moderation.controversial_action")}
          columns={3}
          value={draft.controversialAction}
          disabled={disabled}
          onChange={(controversialAction) => onChange({ controversialAction })}
          options={[
            {
              value: "elevated_only",
              label: t("content_moderation.controversial_action_elevated_only"),
              description: t("content_moderation.controversial_action_elevated_only_desc"),
            },
            {
              value: "allow",
              label: t("content_moderation.controversial_action_allow"),
              description: t("content_moderation.controversial_action_allow_desc"),
            },
            {
              value: "block",
              label: t("content_moderation.controversial_action_block"),
              description: t("content_moderation.controversial_action_block_desc"),
            },
          ]}
        />
        <FormField
          label={t("content_moderation.elevated_categories")}
          description={t("content_moderation.elevated_categories_hint")}
          reserveMeta={false}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {CONTENT_MODERATION_SCANNERS.map((scanner) => (
              <label
                key={scanner}
                className={[
                  "flex items-center gap-1.5 text-xs text-ink-2",
                  disabled || !elevatedEnabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
                ].join(" ")}
              >
                <Checkbox
                  checked={draft.elevatedCategories.includes(scanner)}
                  disabled={disabled || !elevatedEnabled}
                  aria-label={t("content_moderation.elevated_category_label", {
                    category: t(`content_moderation.scanner.${scanner}`),
                  })}
                  onCheckedChange={(checked) =>
                    onChange({
                      elevatedCategories: toggle(draft.elevatedCategories, scanner, checked),
                    })
                  }
                />
                <span>{t(`content_moderation.scanner.${scanner}`)}</span>
              </label>
            ))}
          </div>
        </FormField>

        <div className="grid gap-4 md:grid-cols-2">
          <FormField
            label={t("content_moderation.input_limit")}
            description={t("content_moderation.input_limit_hint")}
            error={errors?.inputLimit}
            required
          >
            <TextInput
              value={draft.inputLimit}
              inputMode="numeric"
              className="tabular-nums"
              disabled={disabled}
              onBlur={() => onFieldBlur?.("inputLimit")}
              onChange={(event) => onChange({ inputLimit: event.currentTarget.value })}
            />
          </FormField>
          <FormField
            label={t("content_moderation.max_chunks")}
            description={t("content_moderation.max_chunks_hint")}
            error={errors?.maxChunks}
            required
          >
            <TextInput
              value={draft.maxChunks}
              inputMode="numeric"
              className="tabular-nums"
              disabled={disabled}
              onBlur={() => onFieldBlur?.("maxChunks")}
              onChange={(event) => onChange({ maxChunks: event.currentTarget.value })}
            />
          </FormField>
        </div>
        <Callout tone="info">{t("content_moderation.guard_latency_notice")}</Callout>
      </FormSection>
    </>
  );
}
