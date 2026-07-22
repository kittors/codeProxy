import type { ComponentType, ReactNode } from "react";
import { Coins, Gauge, Hash, Wallet } from "lucide-react";
import { KpiCard } from "@features/monitor-widgets";
import type { PublicQuotaScope, PublicUsageLimits } from "../types";
import { formatQuotaCount, formatQuotaUsd, kpiValueSizeClass } from "./kpiValueSize";

export type QuotaKpiItem = {
  key: string;
  title: string;
  used: number;
  limit: number;
  format: (value: number) => string;
  icon: ComponentType<{ size?: number; className?: string }>;
};

export function buildQuotaKpiItems(
  t: (key: string, options?: Record<string, unknown>) => string,
  limits: PublicUsageLimits | null | undefined,
  quotaScopes?: PublicQuotaScope[] | null,
): QuotaKpiItem[] {
  if (quotaScopes?.length) {
    return quotaScopes.flatMap((scope) =>
      scope["period-spending"].map((period) => ({
        key: `${scope.scope}-${period.period}`,
        title: `${t(`apikey_lookup.${scope.scope}_scope`)} · ${t(`quota.period.${period.period}`)}`,
        used: period.used,
        limit: period.limit,
        format: formatQuotaUsd,
        icon: Wallet,
      })),
    );
  }
  if (!limits) return [];

  const items: QuotaKpiItem[] = [];
  if (typeof limits["daily-limit"] === "number" && limits["daily-limit"] > 0) {
    items.push({
      key: "daily-limit",
      title: t("apikey_lookup.quota_daily_requests"),
      used: limits["daily-used"] ?? 0,
      limit: limits["daily-limit"],
      format: formatQuotaCount,
      icon: Hash,
    });
  }
  if (typeof limits["total-quota"] === "number" && limits["total-quota"] > 0) {
    items.push({
      key: "total-quota",
      title: t("apikey_lookup.quota_total_requests"),
      used: limits["total-used"] ?? 0,
      limit: limits["total-quota"],
      format: formatQuotaCount,
      icon: Gauge,
    });
  }
  if (typeof limits["daily-spending-limit"] === "number" && limits["daily-spending-limit"] > 0) {
    items.push({
      key: "daily-spending",
      title: t("apikey_lookup.quota_daily_spending"),
      used: limits["daily-spending-used"] ?? 0,
      limit: limits["daily-spending-limit"],
      format: formatQuotaUsd,
      icon: Wallet,
    });
  }
  if (typeof limits["spending-limit"] === "number" && limits["spending-limit"] > 0) {
    items.push({
      key: "spending",
      title: t("apikey_lookup.quota_total_spending"),
      used: limits["spending-used"] ?? 0,
      limit: limits["spending-limit"],
      format: formatQuotaUsd,
      icon: Coins,
    });
  }
  return items;
}

/** Renders configured quota limits as fixed-width KPI cards. */
export function QuotaLimitKpiCards({
  t,
  limits,
  quotaScopes,
  renderValue,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  limits: PublicUsageLimits | null | undefined;
  quotaScopes?: PublicQuotaScope[] | null;
  renderValue: (value: ReactNode) => ReactNode;
}) {
  const items = buildQuotaKpiItems(t, limits, quotaScopes);
  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) => {
        const usedText = item.format(item.used);
        const limitText = item.format(item.limit);
        const display = `${usedText} / ${limitText}`;
        const sizeClass = kpiValueSizeClass(display);
        return (
          <div key={item.key} className="min-w-0" data-testid={`api-key-lookup-quota-${item.key}`}>
            <KpiCard
              title={item.title}
              icon={item.icon}
              hint={t("apikey_lookup.quota_used_of_limit")}
              valueClassName={sizeClass}
              value={renderValue(
                <span className="block whitespace-nowrap tabular-nums leading-tight">
                  {usedText}
                  <span className="mx-1 font-normal text-slate-400 dark:text-white/40">/</span>
                  {limitText}
                </span>,
              )}
            />
          </div>
        );
      })}
    </>
  );
}
