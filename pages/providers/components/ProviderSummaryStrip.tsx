import { useTranslation } from "react-i18next";

type ProviderSummaryStripProps = {
  count: number;
  enabledCount: number;
  disabledCount: number;
};

/**
 * 一行汇总，不画分隔线。简约风格数字用墨色，状态只靠前面的小圆点区分（启用绿、停用琥珀）；
 * 多彩风格整段跟着状态色（启用绿、停用红）。
 */
export function ProviderSummaryStrip({
  count,
  enabledCount,
  disabledCount,
}: ProviderSummaryStripProps) {
  const { t } = useTranslation();

  if (count === 0) return null;

  return (
    <div className="flex items-center gap-3 px-4 py-2 text-xs">
      <span className="font-medium text-ink-3">
        {t("providers.total_configs", { count })}
      </span>
      <span className="inline-flex items-center gap-1 text-ink-2 colorful:text-emerald-600 colorful:dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        {t("providers.enabled_count", { count: enabledCount })}
      </span>
      {disabledCount > 0 ? (
        <span className="inline-flex items-center gap-1 text-ink-2 colorful:text-rose-600 colorful:dark:text-rose-400">
          <span className="size-1.5 rounded-full bg-amber-500 colorful:bg-rose-500" />
          {t("providers.disabled_count", { count: disabledCount })}
        </span>
      ) : null}
    </div>
  );
}
