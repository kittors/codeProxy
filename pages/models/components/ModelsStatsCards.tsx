import { useTranslation } from "react-i18next";
import { Activity, Check, Cpu } from "lucide-react";
import { Card, DialogIcon } from "@code-proxy/ui";

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
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-3">
          <DialogIcon size="xs">
            <Cpu />
          </DialogIcon>
          {t("models_page.available_models")}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums text-ink">
          {stats.modelCount}
        </div>
      </Card>
      <Card padding="compact" bodyClassName="mt-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-3">
          <DialogIcon size="xs" tone="emerald">
            <Check />
          </DialogIcon>
          {t("models_page.enabled_models")}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums text-ink">
          {stats.enabledCount}
        </div>
        <div className="mt-0.5 text-xs text-ink-3">
          {t("models_page.priced_count", { count: stats.pricedCount })}
        </div>
      </Card>
      <Card padding="compact" bodyClassName="mt-0">
        <div className="flex items-center gap-2 text-xs font-semibold text-ink-3">
          {/* 费用沿用全站图表的「费用琥珀」。 */}
          <DialogIcon size="xs" tone="amber">
            <Activity />
          </DialogIcon>
          {t("models_page.quota_cost")}
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums text-ink">
          ${totalCost.toFixed(4)}
        </div>
        <div className="mt-0.5 text-xs text-ink-3">
          {t("models_page.total_cost")}
        </div>
      </Card>
    </div>
  );
}
