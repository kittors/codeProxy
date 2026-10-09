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
        <h2 className="text-base font-semibold text-ink">
          {t("providers.page_title")}
        </h2>
        <p className="text-xs text-ink-3">{t("providers.page_desc")}</p>
      </div>
      {!loading && totalProviders > 0 ? (
        // 简约风格：启用是常态用中性字，停用才用琥珀提醒；多彩风格：启用绿、停用红。
        <div className="flex items-center gap-3 text-xs text-ink-3">
          <span>{t("providers.total_configs", { count: totalProviders })}</span>
          <span className="text-ink-2 colorful:text-emerald-600 colorful:dark:text-emerald-400">
            {t("providers.enabled_count", { count: enabledProviders })}
          </span>
          {disabledProviders > 0 ? (
            <span className="text-amber-700 dark:text-amber-300 colorful:text-rose-600 colorful:dark:text-rose-400">
              {t("providers.disabled_count", { count: disabledProviders })}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
