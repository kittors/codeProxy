import { useTranslation } from "react-i18next";
import { Activity, Check, Cpu } from "lucide-react";
import { Card } from "@code-proxy/ui";

interface ModelsStatsCardsProps {
  stats: {
    modelCount: number;
    enabledCount: number;
    pricedCount: number;
  };
  totalCost: number;
}

export function ModelsStatsCards({ stats, totalCost }: ModelsStatsCardsProps) {
  const { t } = useTranslation();

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card padding="compact" bodyClassName="mt-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
          <Cpu size={14} /> {t("models_page.available_models")}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
          {stats.modelCount}
        </div>
      </Card>
      <Card padding="compact" bodyClassName="mt-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
          <Check size={14} /> {t("models_page.enabled_models")}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
          {stats.enabledCount}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-white/45">
          {t("models_page.priced_count", { count: stats.pricedCount })}
        </div>
      </Card>
      <Card padding="compact" bodyClassName="mt-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-white/55">
          <Activity size={14} /> {t("models_page.quota_cost")}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-white">
          ${totalCost.toFixed(4)}
        </div>
        <div className="mt-0.5 text-xs text-slate-500 dark:text-white/45">
          {t("models_page.total_cost")}
        </div>
      </Card>
    </div>
  );
}
