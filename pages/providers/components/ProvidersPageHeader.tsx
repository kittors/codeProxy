import { useTranslation } from "react-i18next";

type ProvidersPageHeaderProps = {
  totalProviders: number;
  enabledProviders: number;
  disabledProviders: number;
  loading?: boolean;
};

export function ProvidersPageHeader({
  totalProviders,
  enabledProviders,
  disabledProviders,
  loading,
}: ProvidersPageHeaderProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-0.5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">
          {t("providers.page_title")}
        </h2>
        <p className="text-xs text-slate-500 dark:text-white/55">{t("providers.page_desc")}</p>
      </div>
      {!loading && totalProviders > 0 ? (
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-white/55">
          <span>{t("providers.total_configs", { count: totalProviders })}</span>
          <span className="text-emerald-600 dark:text-emerald-400">
            {t("providers.enabled_count", { count: enabledProviders })}
          </span>
          {disabledProviders > 0 ? (
            <span className="text-rose-600 dark:text-rose-400">
              {t("providers.disabled_count", { count: disabledProviders })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
