import type { BillingOrderStatus, BillingPlan, BillingPlanKind, PortalBillingPlan } from "@code-proxy/api-client";

type Translate = (key: string, options?: Record<string, unknown>) => string;

export function formatYuan(cents: number): string {
  return `¥${(cents / 100).toFixed(2)}`;
}

export function formatExpiryRemaining(
  iso: string | null | undefined,
  t: Translate,
): { expired: boolean; soon: boolean; text: string; dateText: string } | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  const dateText = new Date(ms).toLocaleDateString();
  const diffMs = ms - Date.now();
  if (diffMs <= 0) {
    return {
      expired: true,
      soon: true,
      dateText,
      text: t("billing.expiry_expired", { date: dateText }),
    };
  }
  const days = Math.ceil(diffMs / (24 * 3600 * 1000));
  return {
    expired: false,
    soon: days <= 3,
    dateText,
    text: t("billing.expiry_remaining_days", { days, date: dateText }),
  };
}

export function planKindLabel(kind: BillingPlanKind, t: Translate): string {
  return t(`billing.plan_kind.${kind}`);
}

export function orderStatusMeta(
  status: BillingOrderStatus,
  t: Translate,
): { label: string; className: string; tagTone: string } {
  switch (status) {
    case "fulfilled":
      return {
        label: t("billing.order_status.fulfilled"),
        className: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
        tagTone: "sn-ok",
      };
    case "paid":
      return {
        label: t("billing.order_status.paid"),
        className: "bg-sky-500/10 text-sky-700 dark:text-sky-300",
        tagTone: "sn-need",
      };
    case "pending":
      return {
        label: t("billing.order_status.pending"),
        className: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
        tagTone: "sn-warn",
      };
    case "failed":
      return {
        label: t("billing.order_status.failed"),
        className: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
        tagTone: "sn-bad",
      };
    case "expired":
    case "closed":
    default:
      return {
        label: t(`billing.order_status.${status}`),
        className: "bg-sn-label/[0.06] text-sn-label3 dark:bg-white/[0.08]",
        tagTone: "",
      };
  }
}

export function describePlanBenefits(
  plan: Pick<
    BillingPlan | PortalBillingPlan,
    | "kind"
    | "duration_days"
    | "quota_amount_usd"
    | "quota_requests"
    | "quota_tokens"
    | "rate_usd_per_cny"
    | "min_amount_cents"
    | "max_amount_cents"
  >,
  t: Translate,
): string[] {
  const lines: string[] = [];
  if (plan.kind === "subscription") {
    lines.push(t("billing.benefit_duration_days", { days: plan.duration_days }));
    if (plan.quota_amount_usd > 0) {
      lines.push(t("billing.benefit_bonus_usd", { usd: plan.quota_amount_usd.toFixed(2) }));
    }
  } else if (plan.kind === "quota_pack") {
    if (plan.quota_amount_usd > 0) {
      lines.push(t("billing.benefit_add_usd", { usd: plan.quota_amount_usd.toFixed(2) }));
    }
    if (plan.quota_requests > 0) {
      lines.push(t("billing.benefit_add_requests", { count: plan.quota_requests.toLocaleString() }));
    }
    if (plan.quota_tokens > 0) {
      lines.push(t("billing.benefit_add_tokens", { count: plan.quota_tokens.toLocaleString() }));
    }
  } else if (plan.kind === "custom_quota") {
    lines.push(t("billing.benefit_custom_rate", { rate: plan.rate_usd_per_cny.toFixed(2) }));
    lines.push(
      t("billing.benefit_custom_range", {
        min: formatYuan(plan.min_amount_cents),
        max: formatYuan(plan.max_amount_cents),
      }),
    );
  } else if (plan.kind === "daily_reset") {
    lines.push(t("billing.benefit_daily_reset"));
  }
  return lines;
}
