import { type Dispatch, type SetStateAction } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@code-proxy/ui";
import type { ProviderKeyDraft } from "../providers-helpers";

const SectionCard = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
    {children}
  </div>
);

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
    <SectionCard>
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
        className="mt-3 min-h-[140px] w-full resize-y rounded-xl border border-line bg-surface px-3 py-2 font-mono text-xs text-ink outline-none transition placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-slate-400/35 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/15"
      />

      <p className="mt-2 text-xs text-ink-3">
        {t("providers.excluded_count_hint", { count })}
      </p>
    </SectionCard>
  );
}
