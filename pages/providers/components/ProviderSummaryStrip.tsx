import { useTranslation } from "react-i18next";

type ProviderSummaryStripProps = {
  count: number;
  enabledCount: number;
  disabledCount: number;
};

export function ProviderSummaryStrip({
  count,
  enabledCount,
  disabledCount,
}: ProviderSummaryStripProps) {
  const { t } = useTranslation();

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-2 text-xs dark:border-neutral-800">
      <span className="font-medium text-slate-500 dark:text-white/55">
        {t("providers.total_configs", { count })}
      </span>
      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {t("providers.enabled_count", { count: enabledCount })}
      </span>
      {disabledCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400">
          <span className="size-1.5 rounded-full bg-rose-500" />
          {t("providers.disabled_count", { count: disabledCount })}
        </span>
      ) : null}
    </div>
  );
}
