import { useTranslation } from "react-i18next";
import type { ProviderAccessSummary } from "../provider-access";

interface ProviderAccessChipsProps {
  accessSummary: ProviderAccessSummary | null;
}

export function ProviderAccessChips({ accessSummary }: ProviderAccessChipsProps) {
  const { t } = useTranslation();

  if (accessSummary === null) return null;

  // 只用淡底、不描边：没有密钥是中性；全部可达简约时中性、多彩时绿色；部分可达琥珀，全部不可达红色。
  const accessTone =
    accessSummary.totalKeys === 0
      ? "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07]"
      : accessSummary.reachableKeys >= accessSummary.totalKeys
        ? "bg-ink/[0.05] text-ink-2 dark:bg-white/[0.07] colorful:bg-emerald-50 colorful:text-emerald-700 colorful:dark:bg-emerald-500/10 colorful:dark:text-emerald-100"
        : accessSummary.reachableKeys === 0
          ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "bg-amber-500/10 text-amber-700 dark:text-amber-300";

  const label =
    accessSummary.totalKeys === 0
      ? t("providers.access_no_keys")
      : accessSummary.reachableKeys === 0
        ? t("providers.access_none")
        : accessSummary.reachableKeys < accessSummary.totalKeys
          ? t("providers.access_limited", {
              reachable: accessSummary.reachableKeys,
              total: accessSummary.totalKeys,
            })
          : t("providers.access_all", { total: accessSummary.totalKeys });

  return (
    <div className="flex flex-wrap gap-1.5 text-xs">
      <span className={`rounded-full px-2 py-0.5 font-medium ${accessTone}`}>{label}</span>
      {accessSummary.exactOverrideKeys > 0 ? (
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-amber-700 dark:text-amber-300">
          {t("providers.access_exact_overrides", {
            count: accessSummary.exactOverrideKeys,
          })}
        </span>
      ) : null}
    </div>
  );
}
