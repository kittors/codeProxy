import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "satin-ui/react";
import {
  portalBillingApi,
  type BillingOrder,
  type PortalBillingOverview,
  type PortalBillingPlan,
} from "@code-proxy/api-client";
import { Button, Callout, Card, EmptyState, PageLoader, Select, cn, surface, useToast } from "@code-proxy/ui";
import { formatExpiryRemaining, formatYuan, orderStatusMeta } from "./billingFormat";
import { CheckoutQrModal } from "./CheckoutQrModal";
import { PlanPickerPanel } from "./PlanPickerPanel";

export function PortalBillingTab({
  active,
  onOrderFulfilled,
}: {
  active: boolean;
  onOrderFulfilled?: () => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [overview, setOverview] = useState<PortalBillingOverview | null>(null);
  const [orders, setOrders] = useState<BillingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedBindingId, setSelectedBindingId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [activeOrder, setActiveOrder] = useState<BillingOrder | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [ov, ordRes] = await Promise.all([
        portalBillingApi.overview(),
        portalBillingApi.listOrders({ page: 1, size: 30 }),
      ]);
      setOverview(ov);
      setOrders(ordRes.items ?? []);
      setSelectedBindingId((prev) => {
        if (prev && ov.targets.some((item) => item.binding_id === prev)) return prev;
        return ov.targets[0]?.binding_id ?? "";
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("billing.load_failed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    if (active) void loadAll();
  }, [active, loadAll]);

  const currentTarget = useMemo(
    () =>
      overview?.targets.find((item) => item.binding_id === selectedBindingId) ??
      overview?.targets[0] ??
      null,
    [overview, selectedBindingId],
  );

  const handleCheckout = async (payload: {
    plan: PortalBillingPlan;
    channel: "wechat" | "alipay";
    customAmountCents?: number;
  }) => {
    if (!currentTarget) return;
    setSubmitting(true);
    try {
      const created = await portalBillingApi.createOrder({
        binding_id: currentTarget.binding_id,
        plan_id: payload.plan.id,
        pay_channel: payload.channel,
        ...(payload.customAmountCents ? { custom_amount_cents: payload.customAmountCents } : {}),
      });
      setActiveOrder(created);
      void portalBillingApi.listOrders({ page: 1, size: 30 }).then((r) => setOrders(r.items ?? []));
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

  if (error) {
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

  if (!overview || !overview.enabled || overview.targets.length === 0) {
    return (
      <Card>
        <EmptyState
          scene="inbox"
          title={t("billing.portal_unavailable_title")}
          description={t("billing.portal_unavailable_desc")}
        />
      </Card>
    );
  }

  const expiry = formatExpiryRemaining(currentTarget?.expires_at, t);
  const remainingUsd = currentTarget
    ? Math.max(0, currentTarget.lifetime_limit_usd - currentTarget.lifetime_used_usd)
    : 0;

  return (
    <div className="space-y-5">
      {currentTarget ? (
        <div className={`${surface({ tone: "card", radius: "2xl" })} space-y-3 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex shrink-0 items-center text-[var(--sn-label2)]">
                <Icon name={currentTarget.target_kind === "api_key" ? "key-round" : "user"} size={20} />
              </span>
              <div>
                <div className="text-xs text-[var(--sn-label3)]">{t("billing.current_target_label")}</div>
                {overview.targets.length > 1 ? (
                  <Select
                    size="sm"
                    value={currentTarget.binding_id}
                    onChange={(value) => setSelectedBindingId(value)}
                    options={overview.targets.map((item) => ({
                      value: item.binding_id,
                      label: item.key_masked ? `${item.label} (${item.key_masked})` : item.label,
                    }))}
                  />
                ) : (
                  <div className="text-sm font-semibold text-[var(--sn-label)]">
                    {currentTarget.label}
                    {currentTarget.key_masked ? (
                      <span className="ml-2 font-mono text-xs font-normal text-[var(--sn-label3)]">
                        {currentTarget.key_masked}
                      </span>
                    ) : null}
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 text-xs">
              <div className="space-y-0.5">
                <div className="text-[var(--sn-label3)]">{t("billing.subscription_expiry_label")}</div>
                <div
                  className={cn(
                    "inline-flex items-center gap-1.5 font-medium",
                    expiry?.expired
                      ? "text-[var(--sn-danger)]"
                      : expiry?.soon
                        ? "text-[var(--sn-warning)]"
                        : "text-[var(--sn-label)]",
                  )}
                >
                  <Icon name="calendar" size={13} />
                  <span>{expiry ? expiry.text : t("billing.no_expiry_limit")}</span>
                </div>
              </div>
              <div className="space-y-0.5">
                <div className="text-[var(--sn-label3)]">{t("billing.lifetime_quota_label")}</div>
                <div className="font-mono font-semibold tabular-nums text-[var(--sn-label)]">
                  {currentTarget.lifetime_limit_usd > 0
                    ? `$${remainingUsd.toFixed(2)} / $${currentTarget.lifetime_limit_usd.toFixed(2)}`
                    : t("billing.unlimited_quota")}
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => void loadAll()} disabled={loading}>
                <Icon name="refresh-cw" size={14} className={loading ? "animate-spin" : ""} />
                {t("common.refresh")}
              </Button>
            </div>
          </div>

          {currentTarget.note ? (
            <div className="flex items-center gap-2 border-t border-[var(--sn-line)] pt-3 text-xs text-[var(--sn-label3)]">
              <Icon name="info" size={14} className="shrink-0" />
              <span>{currentTarget.note}</span>
            </div>
          ) : null}
        </div>
      ) : null}

      {currentTarget ? (
        <PlanPickerPanel
          target={currentTarget}
          channels={overview.channels}
          submitting={submitting}
          onCheckout={(payload) => void handleCheckout(payload)}
        />
      ) : null}

      <Card title={t("billing.my_orders_title")}>
        {orders.length === 0 ? (
          <EmptyState
            scene="inbox"
            compact
            title={t("billing.no_orders_title")}
            description={t("billing.no_orders_desc")}
          />
        ) : (
          <div className="sn-tbl-wrap sn-plain">
            <div className="sn-tbl-sc">
              <table className="sn-tbl min-w-[640px]">
                <thead>
                  <tr>
                    <th>{t("billing.col_time")}</th>
                    <th>{t("billing.col_target")}</th>
                    <th>{t("billing.col_plan")}</th>
                    <th className="sn-r">{t("billing.col_amount")}</th>
                    <th>{t("billing.col_status")}</th>
                    <th className="sn-r">{t("billing.col_action")}</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const status = orderStatusMeta(order.status, t);
                    return (
                      <tr key={order.id}>
                        <td className="sn-num text-[var(--sn-label3)]">
                          {new Date(order.paid_at || order.created_at).toLocaleString()}
                        </td>
                        <td className="font-medium text-[var(--sn-label)]">{order.target_label}</td>
                        <td>
                          <div className="py-1.5">
                            <div>{order.plan_name}</div>
                            {order.fulfillment_summary ? (
                              <div className="text-2xs text-[var(--sn-label3)]">
                                {order.fulfillment_summary}
                              </div>
                            ) : null}
                          </div>
                        </td>
                        <td className="sn-r sn-num font-mono font-semibold text-[var(--sn-label)]">
                          {formatYuan(order.amount_cents)}
                        </td>
                        <td>
                          <span className={`sn-tag sn-sm ${status.tagTone}`}>
                            <i />
                            {status.label}
                          </span>
                        </td>
                        <td className="sn-r">
                          {order.status === "pending" && (order.qrcode_url || order.pay_url) ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setActiveOrder(order)}
                            >
                              <Icon name="scan" size={13} />
                              {t("billing.continue_pay")}
                            </Button>
                          ) : (
                            <span className="font-mono text-2xs text-[var(--sn-label3)]">
                              {order.order_no}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <CheckoutQrModal
        order={activeOrder}
        pollOrder={(orderNo, sync) => portalBillingApi.getOrder(orderNo, sync)}
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
