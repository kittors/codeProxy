import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Info,
  KeyRound,
  RefreshCw,
  UserRound,
  Wallet,
} from "@code-proxy/ui/icons";
import {
  publicBillingApi,
  type BillingOrder,
  type PortalBillingPlan,
  type PublicBillingPayInfo,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  Card,
  EmptyState,
  PageBackground,
  PageLoader,
  cn,
  surface,
  useToast,
} from "@code-proxy/ui";
import {
  CheckoutQrModal,
  PlanPickerPanel,
  formatExpiryRemaining,
  formatYuan,
} from "@features/portal-billing";

export function PublicPayPage() {
  const { code = "" } = useParams<{ code: string }>();
  const { t } = useTranslation();
  const { notify } = useToast();
  const [info, setInfo] = useState<PublicBillingPayInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<BillingOrder | null>(null);
  const [lastPaidOrder, setLastPaidOrder] = useState<BillingOrder | null>(null);

  const loadInfo = useCallback(async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setError(t("billing.public_link_invalid"));
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await publicBillingApi.getPayInfo(trimmed);
      setInfo(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("billing.public_link_invalid"));
    } finally {
      setLoading(false);
    }
  }, [code, t]);

  useEffect(() => {
    void loadInfo();
  }, [loadInfo]);

  const handleCheckout = async (payload: {
    plan: PortalBillingPlan;
    channel: "wechat" | "alipay";
    customAmountCents?: number;
  }) => {
    if (!code.trim()) return;
    setSubmitting(true);
    try {
      const order = await publicBillingApi.createOrder(code.trim(), {
        plan_id: payload.plan.id,
        pay_channel: payload.channel,
        ...(payload.customAmountCents ? { custom_amount_cents: payload.customAmountCents } : {}),
      });
      setActiveOrder(order);
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing.create_order_failed"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const target = info?.target ?? null;
  const expiry = formatExpiryRemaining(target?.expires_at, t);
  const remainingUsd = target
    ? Math.max(0, target.lifetime_limit_usd - target.lifetime_used_usd)
    : 0;

  return (
    <PageBackground variant="app">
      <div className="min-h-dvh bg-canvas px-4 py-8 sm:px-6 sm:py-12">
        <div className="mx-auto max-w-3xl space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
                <Wallet size={20} />
              </span>
              <div>
                <h1 className="text-lg font-semibold text-ink">{t("billing.public_page_title")}</h1>
                <p className="text-xs text-ink-3">{t("billing.public_page_subtitle")}</p>
              </div>
            </div>
            <Link
              to="/"
              className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-ink-2 transition hover:bg-hover hover:text-ink"
            >
              <ArrowLeft size={14} />
              {t("billing.back_to_portal")}
            </Link>
          </div>

          {loading && !info ? (
            <Card>
              <div className="flex items-center justify-center py-16">
                <PageLoader variant="inline" text={t("common.loading")} />
              </div>
            </Card>
          ) : error ? (
            <Callout
              tone="danger"
              title={t("billing.public_link_invalid_title")}
              actions={
                <Button size="sm" variant="secondary" onClick={() => void loadInfo()}>
                  {t("common.retry")}
                </Button>
              }
            >
              {error}
            </Callout>
          ) : !info || !target ? (
            <Card>
              <EmptyState
                icon={<Wallet size={28} />}
                title={t("billing.portal_unavailable_title")}
                description={t("billing.portal_unavailable_desc")}
              />
            </Card>
          ) : (
            <>
              {lastPaidOrder ? (
                <Callout tone="success" title={t("billing.pay_success_title")}>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <span className="inline-flex items-center gap-1 font-medium">
                      <CheckCircle2 size={14} />
                      {lastPaidOrder.plan_name} · {formatYuan(lastPaidOrder.amount_cents)}
                    </span>
                    {lastPaidOrder.fulfillment_summary ? (
                      <span>{lastPaidOrder.fulfillment_summary}</span>
                    ) : null}
                  </div>
                </Callout>
              ) : null}

              <div className={`${surface({ tone: "card", radius: "2xl" })} space-y-3 p-4 sm:p-5`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-ink/[0.06] text-ink dark:bg-white/[0.08]">
                      {target.target_kind === "api_key" ? (
                        <KeyRound size={18} />
                      ) : (
                        <UserRound size={18} />
                      )}
                    </span>
                    <div>
                      <div className="text-xs text-ink-3">{t("billing.current_target_label")}</div>
                      <div className="text-sm font-semibold text-ink">
                        {target.label}
                        {target.key_masked ? (
                          <span className="ml-2 font-mono text-xs font-normal text-ink-3">
                            {target.key_masked}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs">
                    <div className="space-y-0.5">
                      <div className="text-ink-3">{t("billing.subscription_expiry_label")}</div>
                      <div
                        className={cn(
                          "inline-flex items-center gap-1 font-medium",
                          expiry?.expired
                            ? "text-rose-600 dark:text-rose-400"
                            : expiry?.soon
                              ? "text-amber-600 dark:text-amber-400"
                              : "text-ink",
                        )}
                      >
                        <CalendarClock size={13} />
                        <span>{expiry ? expiry.text : t("billing.no_expiry_limit")}</span>
                      </div>
                    </div>
                    <div className="space-y-0.5">
                      <div className="text-ink-3">{t("billing.lifetime_quota_label")}</div>
                      <div className="font-mono font-semibold tabular-nums text-ink">
                        {target.lifetime_limit_usd > 0
                          ? `$${remainingUsd.toFixed(2)} / $${target.lifetime_limit_usd.toFixed(2)}`
                          : t("billing.unlimited_quota")}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => void loadInfo()}
                      disabled={loading}
                    >
                      <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                      {t("common.refresh")}
                    </Button>
                  </div>
                </div>

                {target.note ? (
                  <div className="flex items-center gap-2 border-t border-line pt-3 text-xs text-ink-3">
                    <Info size={14} className="shrink-0" />
                    <span>{target.note}</span>
                  </div>
                ) : null}
              </div>

              <PlanPickerPanel
                target={target}
                channels={info.channels}
                submitting={submitting}
                onCheckout={(payload) => void handleCheckout(payload)}
              />
            </>
          )}
        </div>

        <CheckoutQrModal
          order={activeOrder}
          pollOrder={(orderNo, sync) => publicBillingApi.getOrder(code.trim(), orderNo, sync)}
          onPaid={(fulfilled) => {
            setLastPaidOrder(fulfilled);
            notify({ type: "success", message: t("billing.pay_success_toast") });
            void loadInfo();
          }}
          onClose={() => setActiveOrder(null)}
        />
      </div>
    </PageBackground>
  );
}
