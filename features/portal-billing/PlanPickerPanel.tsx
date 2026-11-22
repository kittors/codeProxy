import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Check, Coins, RotateCcw, Sparkles, Wallet } from "lucide-react";
import type { PortalBillingPlan, PortalBillingTarget } from "@code-proxy/api-client";
import { Button, TextInput, cn, surface } from "@code-proxy/ui";
import { describePlanBenefits, formatYuan, planKindLabel } from "./billingFormat";

function PlanKindIcon({ kind }: { kind: PortalBillingPlan["kind"] }) {
  switch (kind) {
    case "subscription":
      return <CalendarClock size={16} />;
    case "quota_pack":
      return <Coins size={16} />;
    case "custom_quota":
      return <Wallet size={16} />;
    case "daily_reset":
      return <RotateCcw size={16} />;
  }
}

export function PlanPickerPanel({
  target,
  channels,
  submitting,
  onCheckout,
}: {
  target: PortalBillingTarget;
  channels: Array<"wechat" | "alipay">;
  submitting: boolean;
  onCheckout: (payload: {
    plan: PortalBillingPlan;
    channel: "wechat" | "alipay";
    customAmountCents?: number;
  }) => void;
}) {
  const { t } = useTranslation();
  const [selectedPlanId, setSelectedPlanId] = useState<string>(() => target.plans[0]?.id ?? "");
  const [selectedChannel, setSelectedChannel] = useState<"wechat" | "alipay">(
    () => channels[0] ?? "wechat",
  );
  const [customYuan, setCustomYuan] = useState<string>("10");

  useEffect(() => {
    if (!target.plans.some((p) => p.id === selectedPlanId)) {
      const first = target.plans[0];
      setSelectedPlanId(first?.id ?? "");
      if (first?.kind === "custom_quota") {
        setCustomYuan((Math.max(first.price_cents, first.min_amount_cents) / 100).toFixed(2));
      }
    }
  }, [selectedPlanId, target.plans]);

  useEffect(() => {
    if (channels.length > 0 && !channels.includes(selectedChannel)) {
      setSelectedChannel(channels[0]);
    }
  }, [channels, selectedChannel]);

  const selectedPlan = useMemo(
    () => target.plans.find((p) => p.id === selectedPlanId) ?? target.plans[0] ?? null,
    [selectedPlanId, target.plans],
  );

  const customAmountCents = useMemo(() => {
    const parsed = Number.parseFloat(customYuan);
    if (!Number.isFinite(parsed) || parsed <= 0) return 0;
    return Math.round(parsed * 100);
  }, [customYuan]);

  const customError = useMemo(() => {
    if (!selectedPlan || selectedPlan.kind !== "custom_quota") return "";
    if (customAmountCents < selectedPlan.min_amount_cents || customAmountCents > selectedPlan.max_amount_cents) {
      return t("billing.custom_amount_range_error", {
        min: formatYuan(selectedPlan.min_amount_cents),
        max: formatYuan(selectedPlan.max_amount_cents),
      });
    }
    return "";
  }, [customAmountCents, selectedPlan, t]);

  const effectiveCents = selectedPlan
    ? selectedPlan.kind === "custom_quota"
      ? customAmountCents
      : selectedPlan.price_cents
    : 0;

  const estimatedCustomUsd =
    selectedPlan?.kind === "custom_quota" && customAmountCents > 0
      ? ((customAmountCents / 100) * selectedPlan.rate_usd_per_cny).toFixed(2)
      : "0.00";

  if (target.plans.length === 0) {
    return (
      <div className={`${surface({ tone: "inset", radius: "2xl" })} p-5 text-sm text-ink-3`}>
        {t("billing.no_plans_for_target")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {target.plans.map((plan) => {
          const active = selectedPlan?.id === plan.id;
          const benefits = describePlanBenefits(plan, t);
          return (
            <button
              key={plan.id}
              type="button"
              onClick={() => {
                setSelectedPlanId(plan.id);
                if (plan.kind === "custom_quota") {
                  setCustomYuan((Math.max(plan.price_cents, plan.min_amount_cents) / 100).toFixed(2));
                }
              }}
              className={cn(
                surface({ tone: "card", radius: "2xl" }),
                "group relative flex flex-col justify-between gap-3 p-4 text-left transition",
                active
                  ? "ring-2 ring-accent shadow-card"
                  : "hover:ring-1 hover:ring-ink/20 dark:hover:ring-white/20",
              )}
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-xl",
                        active
                          ? "bg-accent/15 text-accent"
                          : "bg-ink/[0.06] text-ink-2 dark:bg-white/[0.08]",
                      )}
                    >
                      <PlanKindIcon kind={plan.kind} />
                    </span>
                    <div>
                      <div className="text-sm font-semibold text-ink">{plan.name}</div>
                      <div className="text-2xs text-ink-3">{planKindLabel(plan.kind, t)}</div>
                    </div>
                  </div>
                  {plan.badge ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-2 py-0.5 text-2xs font-medium text-accent">
                      <Sparkles size={11} />
                      {plan.badge}
                    </span>
                  ) : null}
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-2xl font-bold tabular-nums text-ink">
                    {plan.kind === "custom_quota"
                      ? t("billing.custom_price_label")
                      : formatYuan(plan.price_cents)}
                  </span>
                  {plan.kind === "subscription" ? (
                    <span className="text-xs text-ink-3">
                      / {t("billing.days_short", { days: plan.duration_days })}
                    </span>
                  ) : null}
                </div>

                {plan.description ? (
                  <p className="text-xs leading-relaxed text-ink-2">{plan.description}</p>
                ) : null}

                <ul className="space-y-1 text-xs text-ink-2">
                  {benefits.map((line) => (
                    <li key={line} className="flex items-center gap-1.5">
                      <Check size={13} className="shrink-0 text-emerald-500" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="flex items-center justify-end text-2xs font-medium text-accent">
                {active ? t("billing.selected_plan") : t("billing.click_to_select")}
              </div>
            </button>
          );
        })}
      </div>

      {selectedPlan?.kind === "custom_quota" ? (
        <div
          className={`${surface({ tone: "inset", radius: "2xl" })} flex flex-wrap items-end justify-between gap-3 p-4`}
        >
          <div className="min-w-48 flex-1 space-y-1">
            <label className="block text-xs font-medium text-ink-2">
              {t("billing.custom_amount_input_label", {
                min: formatYuan(selectedPlan.min_amount_cents),
                max: formatYuan(selectedPlan.max_amount_cents),
              })}
            </label>
            <TextInput
              type="number"
              step="0.01"
              min={(selectedPlan.min_amount_cents / 100).toFixed(2)}
              max={(selectedPlan.max_amount_cents / 100).toFixed(2)}
              value={customYuan}
              onChange={(e) => setCustomYuan(e.target.value)}
            />
            {customError ? <p className="text-xs text-rose-500">{customError}</p> : null}
          </div>
          <div className="text-right">
            <div className="text-xs text-ink-3">
              {t("billing.estimated_credit", { usd: estimatedCustomUsd })}
            </div>
            <div className="font-mono text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
              +${estimatedCustomUsd}
            </div>
          </div>
        </div>
      ) : null}

      <div
        className={`${surface({ tone: "card", radius: "2xl" })} flex flex-wrap items-center justify-between gap-4 p-4`}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-ink-2">{t("billing.pay_channel_label")}</span>
          {channels.map((ch) => {
            const active = selectedChannel === ch;
            return (
              <button
                key={ch}
                type="button"
                onClick={() => setSelectedChannel(ch)}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-xl px-3.5 text-xs font-medium transition",
                  active
                    ? "bg-accent text-white shadow-xs"
                    : "bg-ink/[0.05] text-ink-2 hover:bg-ink/[0.09] dark:bg-white/[0.07] dark:hover:bg-white/[0.12]",
                )}
              >
                {ch === "wechat" ? t("billing.channel_wechat") : t("billing.channel_alipay")}
              </button>
            );
          })}
        </div>

        <Button
          variant="primary"
          disabled={
            submitting ||
            !selectedPlan ||
            channels.length === 0 ||
            effectiveCents <= 0 ||
            Boolean(customError)
          }
          onClick={() => {
            if (!selectedPlan) return;
            onCheckout({
              plan: selectedPlan,
              channel: selectedChannel,
              ...(selectedPlan.kind === "custom_quota" ? { customAmountCents } : {}),
            });
          }}
        >
          {submitting
            ? t("billing.creating_order")
            : t("billing.pay_now_amount", { amount: formatYuan(effectiveCents) })}
        </Button>
      </div>
    </div>
  );
}
