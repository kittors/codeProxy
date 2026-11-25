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

  const isSinglePlan = target.plans.length === 1;
  const gridColsClass = isSinglePlan
    ? "grid-cols-1"
    : target.plans.length === 2
      ? "grid-cols-1 sm:grid-cols-2"
      : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3";

  return (
    <div className="space-y-4">
      <div className={cn("grid gap-3", gridColsClass)}>
        {target.plans.map((plan) => {
          const active = selectedPlan?.id === plan.id;
          const benefits = describePlanBenefits(plan, t);
          return (
            <button
              key={plan.id}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setSelectedPlanId(plan.id);
                if (plan.kind === "custom_quota") {
                  setCustomYuan((Math.max(plan.price_cents, plan.min_amount_cents) / 100).toFixed(2));
                }
              }}
              className={cn(
                surface({ tone: "card", radius: "xl", bordered: !active }),
                "group relative flex text-left transition-[background-color,box-shadow] duration-150",
                isSinglePlan
                  ? "flex-col justify-between gap-4 p-5 sm:flex-row sm:items-center"
                  : "flex-col justify-between gap-3 p-4",
                // 深色模式下 --cp-accent 会反转为近纯白，外扩 ring-2 ring-accent 会变成刺眼粗白框；
                // 与 ChoiceCards 一致改用内嵌半透明强调描边 + 轻提亮底色，明暗双主题保持克制清晰。
                active
                  ? "bg-surface-hover shadow-[inset_0_0_0_1.5px_color-mix(in_srgb,var(--cp-accent)_50%,transparent)]"
                  : "hover:bg-surface-hover",
              )}
            >
              <div className={cn("space-y-2.5", isSinglePlan ? "min-w-0 flex-1" : null)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-colors",
                        active
                          ? "bg-accent-soft text-accent-ink"
                          : "bg-ink/[0.06] text-ink-2 dark:bg-white/[0.08]",
                      )}
                    >
                      <PlanKindIcon kind={plan.kind} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{plan.name}</span>
                        {plan.badge ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent-ink">
                            <Sparkles size={11} />
                            {plan.badge}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-2xs text-ink-3">{planKindLabel(plan.kind, t)}</div>
                    </div>
                  </div>
                </div>

                {!isSinglePlan ? (
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
                ) : null}

                {plan.description ? (
                  <p className="text-xs leading-relaxed text-ink-2">{plan.description}</p>
                ) : null}

                <ul className={cn("text-xs text-ink-2", isSinglePlan ? "flex flex-wrap gap-x-4 gap-y-1.5" : "space-y-1")}>
                  {benefits.map((line) => (
                    <li key={line} className="flex items-center gap-1.5">
                      <Check size={13} className="shrink-0 text-emerald-500" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {isSinglePlan ? (
                <div className="flex shrink-0 items-center justify-between gap-4 border-t border-line pt-3 sm:flex-col sm:items-end sm:justify-center sm:gap-2 sm:border-t-0 sm:pt-0">
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
                  <span className="inline-flex items-center gap-1.5 text-2xs font-medium text-accent-ink">
                    <span
                      aria-hidden="true"
                      className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-accent text-accent-fg"
                    >
                      <Check size={10} strokeWidth={3} />
                    </span>
                    {t("billing.selected_plan")}
                  </span>
                </div>
              ) : (
                <div className="flex items-center justify-end gap-1.5 text-2xs font-medium">
                  <span className={active ? "text-accent-ink" : "text-ink-3"}>
                    {active ? t("billing.selected_plan") : t("billing.click_to_select")}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors",
                      active ? "bg-accent text-accent-fg" : "bg-field shadow-control",
                    )}
                  >
                    {active ? <Check size={10} strokeWidth={3} /> : null}
                  </span>
                </div>
              )}
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
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-xs font-medium text-ink-2">{t("billing.pay_channel_label")}</span>
          {channels.map((ch) => {
            const active = selectedChannel === ch;
            const channelDotClass =
              ch === "wechat" ? "bg-emerald-500 text-white" : "bg-sky-500 text-white";
            return (
              <button
                key={ch}
                type="button"
                aria-pressed={active}
                onClick={() => setSelectedChannel(ch)}
                className={cn(
                  // 禁止使用 bg-accent + text-white：深色模式下 --cp-accent 反转为近纯白会导致白底白字，
                  // 且左侧渠道选择不应与右侧 primary 支付主按钮争夺视觉焦点。
                  "sn-btn !h-9 gap-2 !rounded-full !px-3.5 !text-xs font-medium",
                  active
                    ? "!bg-accent-soft !text-ink !shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--cp-accent)_45%,transparent)]"
                    : "!bg-surface !text-ink-2 !shadow-control hover:!bg-surface-hover hover:!text-ink",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-colors",
                    active ? channelDotClass : "bg-field shadow-control",
                  )}
                >
                  {active ? <Check size={10} strokeWidth={3} /> : null}
                </span>
                <span>
                  {ch === "wechat" ? t("billing.channel_wechat") : t("billing.channel_alipay")}
                </span>
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
