import { type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@code-proxy/ui";
import type { ProviderKeyDraft } from "../providers-helpers";

/**
 * 一组字段。弹窗本身就是一层，组与组之间靠留白分开，不再各自套一张描边卡片——以前一个页签里
 * 叠着五六张描边小卡，读起来像一摞框。
 */
const FieldGroup = ({ children }: { children: React.ReactNode }) => <div>{children}</div>;

export function ExcludedModelsEditor({
  count,
  editKeyEnabledToggle,
  keyDraft,
  setKeyDraft,
}: {
  count: number;
  editKeyEnabledToggle: (checked: boolean) => void;
  keyDraft: ProviderKeyDraft;
  setKeyDraft: Dispatch<SetStateAction<ProviderKeyDraft>>;
}) {
  const { t } = useTranslation();

  return (
    <FieldGroup>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink">
          {t("providers.excluded_models_label")}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => editKeyEnabledToggle(false)}>
            {t("providers.add_disable_all")}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => editKeyEnabledToggle(true)}>
            {t("providers.remove_disable_all")}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setKeyDraft((prev) => ({ ...prev, excludedModelsText: "" }))}
          >
            {t("providers.clear")}
          </Button>
        </div>
      </div>

      <textarea
        value={keyDraft.excludedModelsText}
        onChange={(e) => {
          const val = e.currentTarget.value;
          setKeyDraft((prev) => ({ ...prev, excludedModelsText: val }));
        }}
        placeholder={t("providers.excluded_placeholder")}
        aria-label="excludedModels"
        // 多行输入框和共享 Textarea 同一套阴影描边；单独写是因为这里要等宽小字号。
        className="mt-3 min-h-[140px] w-full resize-y rounded-2xl bg-field px-3.5 py-3 font-mono text-xs text-ink shadow-control outline-none transition-[box-shadow] duration-150 placeholder:text-ink-3 hover:shadow-control-hover focus:shadow-control-focus"
      />

      <p className="mt-2 text-xs text-ink-3">
        {t("providers.excluded_count_hint", { count })}
      </p>
    </FieldGroup>
  );
}
