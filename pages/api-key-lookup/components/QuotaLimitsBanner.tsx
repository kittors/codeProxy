import type { ComponentType, ReactNode } from "react";
import { Coins, Gauge, Hash, Wallet } from "@code-proxy/ui/icons";
import type { PublicQuotaScope, PublicUsageLimits } from "../types";
import { formatQuotaCount, formatQuotaUsd } from "./kpiValueSize";

export type QuotaKpiItem = {
  key: string;
  title: string;
  used: number;
  limit: number;
  format: (value: number) => string;
  icon: ComponentType<{ size?: number; className?: string }>;
  /**
   * Rolling quotas refill on their own, so used/limit answers "how am I doing
   * this period". The lifetime cap only counts down, so what matters is what is
   * left before the key stops working.
   */
  showRemaining?: boolean;
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
      showRemaining: true,
    });
  }
  return items;
}

/**
 * 独立横向配额概览条带：
 * 与下方 5 项用量指标解耦，按实际配额数量自适应 1~4 等分，彻底避免 6+1 孤儿卡与宽数值截断；
 * 每条配额附带直观扁平进度条，高占用态自动提示。
 */
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

  const gridColsClass =
    items.length === 1
      ? "grid-cols-1"
      : items.length === 2
        ? "grid-cols-1 md:grid-cols-2"
        : items.length === 3
          ? "grid-cols-1 md:grid-cols-3"
          : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";

  return (
    <div
      className={`grid gap-px overflow-hidden rounded-2xl border border-sn-line bg-sn-line ${gridColsClass}`}
    >
      {items.map((item) => {
        const Icon = item.icon;
        const remaining = Math.max(0, item.limit - item.used);
        const ratio = item.limit > 0 ? Math.min(1, Math.max(0, item.used / item.limit)) : 0;
        const usedText = item.showRemaining
          ? t("quota.remaining_value", { remaining: item.format(remaining) })
          : item.format(item.used);
        const limitText = item.format(item.limit);
        const hint = item.showRemaining
          ? t("quota.lifetime_remaining_hint", {
              limit: item.format(item.limit),
              used: item.format(item.used),
            })
          : t("apikey_lookup.quota_used_of_limit");
        const barTone =
          ratio >= 0.95
            ? "bg-rose-500"
            : ratio >= 0.8
              ? "bg-amber-500"
              : "bg-emerald-500 dark:bg-emerald-400";

        return (
          <div
            key={item.key}
            data-testid={`api-key-lookup-quota-${item.key}`}
            className="min-w-0 bg-sn-raised px-5 py-4 transition-colors duration-150 hover:bg-sn-hover/60"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-sn-label3">
                <Icon size={14} className="shrink-0" />
                <span className="truncate">{item.title}</span>
              </div>
              <span className="shrink-0 text-xs tabular-nums text-sn-label3">{hint}</span>
            </div>
            <div className="mt-2.5 text-xl font-semibold tracking-tight text-sn-label">
              {renderValue(
                <span className="block whitespace-nowrap tabular-nums leading-tight">
                  {usedText}
                  <span className="mx-1.5 text-sm font-normal text-sn-label3">/</span>
                  <span className="text-base font-medium text-sn-label2">{limitText}</span>
                </span>,
              )}
            </div>
            <div
              aria-hidden="true"
              className="mt-3 h-1 w-full overflow-hidden rounded-full bg-sn-sunken"
            >
              <div
                className={`h-full w-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)] ${barTone}`}
                style={{ transform: `scaleX(${Math.max(ratio, ratio > 0 ? 0.02 : 0)})` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
