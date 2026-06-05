import { useTranslation } from "react-i18next";
import type { ProviderAccessSummary } from "../provider-access";

interface ProviderAccessChipsProps {
  accessSummary: ProviderAccessSummary | null;
}

export function ProviderAccessChips({ accessSummary }: ProviderAccessChipsProps) {
  const { t } = useTranslation();

  if (accessSummary === null) return null;

  const accessTone =
    accessSummary.totalKeys === 0
      ? "border-slate-200 bg-slate-50 text-slate-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white/65"
      : accessSummary.reachableKeys === 0
        ? "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200"
        : accessSummary.reachableKeys < accessSummary.totalKeys
          ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100"
          : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-100";

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
    <div className="flex flex-wrap gap-1.5 text-[11px]">
      <span className={`rounded-full border px-2 py-0.5 font-medium ${accessTone}`}>{label}</span>
      {accessSummary.exactOverrideKeys > 0 ? (
        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {t("providers.access_exact_overrides", {
            count: accessSummary.exactOverrideKeys,
          })}
        </span>
      ) : null}
    </div>
  );
}
