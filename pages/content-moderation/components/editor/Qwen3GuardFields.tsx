import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import {
  CONTENT_MODERATION_SCANNERS,
  type ContentModerationControversialAction,
  type ContentModerationScanner,
} from "@code-proxy/api-client";
import { Checkbox, FormField, HoverTooltip, Select, TextInput } from "@code-proxy/ui";

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

export function Qwen3GuardFields({ draft, disabled, onChange }: Qwen3GuardFieldsProps) {
  const { t } = useTranslation();
  const elevatedEnabled = draft.controversialAction === "elevated_only";

  return (
    <div className="mt-5 border-t border-slate-900/8 pt-4 dark:border-white/8">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          {t("content_moderation.scanners")}
        </h3>
        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/45">
          {t("content_moderation.scanners_hint")}
        </p>
      </div>
      <div className="grid gap-x-4 gap-y-2 md:grid-cols-2">
        {CONTENT_MODERATION_SCANNERS.map((scanner) => {
          const label = t(`content_moderation.scanner.${scanner}`);
          const help = t(`content_moderation.scanner_help.${scanner}`);
          return (
            <label
              key={scanner}
              className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm text-slate-700 dark:text-slate-200"
            >
              <Checkbox
                checked={draft.scanners.includes(scanner)}
                disabled={disabled}
                aria-label={label}
                onCheckedChange={(checked) =>
                  onChange({ scanners: toggle(draft.scanners, scanner, checked) })
                }
              />
              <span>{label}</span>
              <HoverTooltip content={help} placement="top">
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={help}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:text-white/40 dark:hover:text-white/75 dark:focus-visible:ring-white/15"
                >
                  <Info size={14} aria-hidden="true" />
                </span>
              </HoverTooltip>
            </label>
          );
        })}
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <FormField
          label={t("content_moderation.controversial_action")}
          description={t("content_moderation.controversial_action_hint")}
          reserveMeta={false}
        >
          <Select
            value={draft.controversialAction}
            disabled={disabled}
            onChange={(value) => {
              if (value !== "allow" && value !== "block" && value !== "elevated_only") return;
              onChange({ controversialAction: value });
            }}
            options={[
              {
                value: "elevated_only",
                label: t("content_moderation.controversial_action_elevated_only"),
              },
              { value: "allow", label: t("content_moderation.controversial_action_allow") },
              { value: "block", label: t("content_moderation.controversial_action_block") },
            ]}
          />
        </FormField>
        <FormField
          label={t("content_moderation.elevated_categories")}
          description={t("content_moderation.elevated_categories_hint")}
          reserveMeta={false}
        >
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {CONTENT_MODERATION_SCANNERS.map((scanner) => (
              <label
                key={scanner}
                className="flex items-center gap-1.5 text-xs text-slate-700 dark:text-slate-200"
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
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <FormField
          label={t("content_moderation.input_limit")}
          description={t("content_moderation.input_limit_hint")}
          required
          reserveMeta={false}
        >
          <TextInput
            value={draft.inputLimit}
            inputMode="numeric"
            disabled={disabled}
            onChange={(event) => onChange({ inputLimit: event.currentTarget.value })}
          />
        </FormField>
        <FormField
          label={t("content_moderation.max_chunks")}
          description={t("content_moderation.max_chunks_hint")}
          required
          reserveMeta={false}
        >
          <TextInput
            value={draft.maxChunks}
            inputMode="numeric"
            disabled={disabled}
            onChange={(event) => onChange({ maxChunks: event.currentTarget.value })}
          />
        </FormField>
      </div>
      <p className="mt-3 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-500/10 dark:text-sky-200">
        {t("content_moderation.guard_latency_notice")}
      </p>
    </div>
  );
}
