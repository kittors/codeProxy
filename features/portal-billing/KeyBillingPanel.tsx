import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Info, KeyRound, QrCode, RefreshCw, Wallet } from "lucide-react";
import {
  apiKeyBillingApi,
  type APIKeyBillingOverview,
  type BillingOrder,
  type PortalBillingPlan,
} from "@code-proxy/api-client";
import { Button, Callout, Card, EmptyState, PageLoader, cn, surface, useToast } from "@code-proxy/ui";
import { formatExpiryRemaining, formatYuan, orderStatusMeta } from "./billingFormat";
import { CheckoutQrModal } from "./CheckoutQrModal";
import { PlanPickerPanel } from "./PlanPickerPanel";

export function KeyBillingPanel({
  apiKey,
  initialOverview,
  onOverviewUpdated,
  onOrderFulfilled,
}: {
  apiKey: string;
  initialOverview?: APIKeyBillingOverview | null;
  onOverviewUpdated?: (overview: APIKeyBillingOverview) => void;
  onOrderFulfilled?: () => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [overview, setOverview] = useState<APIKeyBillingOverview | null>(initialOverview ?? null);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<BillingOrder | null>(null);

  useEffect(() => {
    if (initialOverview) setOverview(initialOverview);
  }, [initialOverview]);

  const loadAll = useCallback(async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    try {
      const [ov, ordRes] = await Promise.all([
        apiKeyBillingApi.overview(trimmed),
        apiKeyBillingApi.listOrders(trimmed, { page: 1, size: 30 }),
      ]);
      setOverview(ov);
      setOrders(ordRes.items ?? []);
      onOverviewUpdated?.(ov);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("billing.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [apiKey, onOverviewUpdated, t]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const handleCheckout = async (payload: {
    plan: PortalBillingPlan;
    channel: "wechat" | "alipay";
    customAmountCents?: number;
  }) => {
    setSubmitting(true);
    try {
      const created = await apiKeyBillingApi.createOrder(apiKey.trim(), {
        plan_id: payload.plan.id,
        pay_channel: payload.channel,
        ...(payload.customAmountCents ? { custom_amount_cents: payload.customAmountCents } : {}),
      });
      setActiveOrder(created);
      void apiKeyBillingApi
        .listOrders(apiKey.trim(), { page: 1, size: 30 })
        .then((r) => setOrders(r.items ?? []));
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing.create_order_failed"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading && !overview) {
    return (
      <div className="flex items-center justify-center py-16">
        <PageLoader variant="inline" text={t("common.loading")} />
      </div>
    );
  }

  if (error && !overview) {
    return (
      <Callout
        tone="danger"
        title={t("billing.load_failed")}
        actions={
          <Button size="sm" variant="secondary" onClick={() => void loadAll()}>
            {t("common.retry")}
          </Button>
        }
      >
        {error}
      </Callout>
    );
  }

  if (!overview || (!overview.enabled && !overview.has_billing_info)) {
    return (
      <Card>
        <EmptyState
          icon={<Wallet size={28} />}
          title={t("billing.portal_unavailable_title")}
          description={t("billing.portal_unavailable_desc")}
        />
      </Card>
    );
  }

  const target = overview.target;
  const expiry = formatExpiryRemaining(target.expires_at, t);
  const remainingUsd = Math.max(0, target.lifetime_limit_usd - target.lifetime_used_usd);

  return (
    <div className="space-y-5">
      <div className={`${surface({ tone: "card", radius: "2xl" })} space-y-3 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent-ink">
              <KeyRound size={18} />
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
                title={target.expires_at ? new Date(target.expires_at).toLocaleString() : undefined}
              >
                <CalendarClock size={13} />
                <span>
                  {target.expires_at
                    ? `${new Date(target.expires_at).toLocaleString()} (${expiry?.text ?? ""})`
                    : t("billing.no_expiry_limit")}
                </span>
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
            <Button size="sm" variant="secondary" onClick={() => void loadAll()} disabled={loading}>
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

      {overview.enabled && target.plans.length > 0 ? (
        <PlanPickerPanel
          target={target}
          channels={overview.channels}
          submitting={submitting}
          onCheckout={(payload) => void handleCheckout(payload)}
        />
      ) : null}

      <Card title={t("billing.key_orders_title")}>
        {orders.length === 0 ? (
          <EmptyState
            icon={<Wallet size={24} />}
            title={t("billing.no_orders_title")}
            description={t("billing.no_orders_desc")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-xs">
              <thead>
                <tr className="border-b border-ink/10 text-ink-3 dark:border-white/10">
                  <th className="py-2 pr-3 font-medium">{t("billing.col_time")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing.col_plan")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing.col_amount")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing.col_status")}</th>
                  <th className="py-2 text-right font-medium">{t("billing.col_action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06] dark:divide-white/[0.06]">
                {orders.map((order) => {
                  const status = orderStatusMeta(order.status, t);
                  return (
                    <tr key={order.id} className="text-ink-2">
                      <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                        {new Date(order.paid_at || order.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="font-medium text-ink">{order.plan_name}</div>
                        {order.fulfillment_summary ? (
                          <div className="text-2xs text-ink-3">{order.fulfillment_summary}</div>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-semibold tabular-nums text-ink">
                        {formatYuan(order.amount_cents)}
                      </td>
                      <td className="py-2.5 pr-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-2xs font-medium",
                            status.className,
                          )}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="py-2.5 text-right">
                        {order.status === "pending" && (order.qrcode_url || order.pay_url) ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setActiveOrder(order)}
                          >
                            <QrCode size={13} />
                            {t("billing.continue_pay")}
                          </Button>
                        ) : (
                          <span className="font-mono text-2xs text-ink-3">{order.order_no}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <CheckoutQrModal
        order={activeOrder}
        pollOrder={(orderNo, sync) => apiKeyBillingApi.getOrder(apiKey.trim(), orderNo, sync)}
        onPaid={() => {
          notify({ type: "success", message: t("billing.pay_success_toast") });
          void loadAll();
          onOrderFulfilled?.();
        }}
        onClose={() => setActiveOrder(null)}
      />
    </div>
  );
}
