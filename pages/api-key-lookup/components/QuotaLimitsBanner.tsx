import type { ComponentType, ReactNode } from "react";
import { Coins, Gauge, Hash, Wallet } from "lucide-react";
import { KpiCard } from "@features/monitor-widgets";
import type { PublicUsageLimits } from "../types";

function formatUsd(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatCount(value: number): string {
  return Math.round(value).toLocaleString();
}

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
): QuotaKpiItem[] {
  if (!limits) return [];

  const items: QuotaKpiItem[] = [];
  if (typeof limits["daily-limit"] === "number" && limits["daily-limit"] > 0) {
    items.push({
      key: "daily-limit",
      title: t("apikey_lookup.quota_daily_requests"),
      used: limits["daily-used"] ?? 0,
      limit: limits["daily-limit"],
      format: formatCount,
      icon: Hash,
    });
  }
  if (typeof limits["total-quota"] === "number" && limits["total-quota"] > 0) {
    items.push({
      key: "total-quota",
      title: t("apikey_lookup.quota_total_requests"),
      used: limits["total-used"] ?? 0,
      limit: limits["total-quota"],
      format: formatCount,
      icon: Gauge,
    });
  }
  if (
    typeof limits["daily-spending-limit"] === "number" &&
    limits["daily-spending-limit"] > 0
  ) {
    items.push({
      key: "daily-spending",
      title: t("apikey_lookup.quota_daily_spending"),
      used: limits["daily-spending-used"] ?? 0,
      limit: limits["daily-spending-limit"],
      format: formatUsd,
      icon: Wallet,
    });
  }
  if (
    typeof limits["spending-limit"] === "number" &&
    limits["spending-limit"] > 0
  ) {
    items.push({
      key: "spending",
      title: t("apikey_lookup.quota_total_spending"),
      used: limits["spending-used"] ?? 0,
      limit: limits["spending-limit"],
      format: formatUsd,
      icon: Coins,
    });
  }
  return items;
}

/** Renders configured quota limits as the same KPI cards used for usage stats. */
export function QuotaLimitKpiCards({
  t,
  limits,
  renderValue,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  limits: PublicUsageLimits | null | undefined;
  renderValue: (value: ReactNode) => ReactNode;
}) {
  const items = buildQuotaKpiItems(t, limits);
  if (items.length === 0) return null;

  return (
    <>
      {items.map((item) => (
        <div key={item.key} data-testid={`api-key-lookup-quota-${item.key}`}>
          <KpiCard
            title={item.title}
            icon={item.icon}
            hint={t("apikey_lookup.quota_used_of_limit")}
            value={renderValue(
              <span className="tabular-nums">
                {item.format(item.used)}
                <span className="mx-1 text-base font-normal text-slate-400 dark:text-white/40">
                  /
                </span>
                {item.format(item.limit)}
              </span>,
            )}
          />
        </div>
      ))}
    </>
  );
}
