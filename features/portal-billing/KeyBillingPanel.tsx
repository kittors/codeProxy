import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "satin-ui/react";
import type { TableColumnReact } from "satin-ui/react";
import {
  apiKeyBillingApi,
  type APIKeyBillingOverview,
  type BillingOrder,
  type PortalBillingPlan,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  Card,
  EmptyState,
  PageLoader,
  SatinTable,
  cn,
  surface,
  useToast,
} from "@code-proxy/ui";
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

  const orderColumns = useMemo<TableColumnReact<BillingOrder>[]>(
    () => [
      {
        key: "paid_at",
        title: t("billing.col_time"),
        sortable: true,
        sortFirst: "desc",
        sort: (a, b) =>
          new Date(a.paid_at || a.created_at).getTime() -
          new Date(b.paid_at || b.created_at).getTime(),
        className: "sn-num text-[var(--sn-label3)]",
        format: (_, order) => new Date(order.paid_at || order.created_at).toLocaleString(),
      },
      {
        key: "plan_name",
        title: t("billing.col_plan"),
        render: (_, order) => (
          <div className="py-1.5">
            <div className="font-medium text-[var(--sn-label)]">{order.plan_name}</div>
            {order.fulfillment_summary ? (
              <div className="text-2xs text-[var(--sn-label3)]">{order.fulfillment_summary}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: "amount_cents",
        title: t("billing.col_amount"),
        align: "right",
        sortable: true,
        className: "font-mono font-semibold text-[var(--sn-label)]",
        format: (_, order) => formatYuan(order.amount_cents),
      },
      {
        key: "status",
        title: t("billing.col_status"),
        render: (_, order) => {
          const status = orderStatusMeta(order.status, t);
          return (
            <span className={`sn-tag sn-sm ${status.tagTone}`}>
              <i />
              {status.label}
            </span>
          );
        },
      },
      {
        key: "actions",
        title: t("billing.col_action"),
        align: "right",
        render: (_, order) =>
          order.status === "pending" && (order.qrcode_url || order.pay_url) ? (
            <Button size="sm" variant="secondary" onClick={() => setActiveOrder(order)}>
              <Icon name="scan" size={13} />
              {t("billing.continue_pay")}
            </Button>
          ) : (
            <span className="font-mono text-2xs text-[var(--sn-label3)]">{order.order_no}</span>
          ),
      },
    ],
    [t],
  );

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
          scene="inbox"
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
            <span className="inline-flex shrink-0 items-center text-[var(--sn-label2)]">
              <Icon name="key-round" size={20} />
            </span>
            <div>
              <div className="text-xs text-[var(--sn-label3)]">{t("billing.current_target_label")}</div>
              <div className="text-sm font-semibold text-[var(--sn-label)]">
                {target.label}
                {target.key_masked ? (
                  <span className="ml-2 font-mono text-xs font-normal text-[var(--sn-label3)]">
                    {target.key_masked}
                  </span>
                ) : null}
              </div>
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
                title={target.expires_at ? new Date(target.expires_at).toLocaleString() : undefined}
              >
                <Icon name="calendar" size={13} />
                <span>
                  {target.expires_at
                    ? `${new Date(target.expires_at).toLocaleString()} (${expiry?.text ?? ""})`
                    : t("billing.no_expiry_limit")}
                </span>
              </div>
            </div>
            <div className="space-y-0.5">
              <div className="text-[var(--sn-label3)]">{t("billing.lifetime_quota_label")}</div>
              <div className="font-mono font-semibold tabular-nums text-[var(--sn-label)]">
                {target.lifetime_limit_usd > 0
                  ? `$${remainingUsd.toFixed(2)} / $${target.lifetime_limit_usd.toFixed(2)}`
                  : t("billing.unlimited_quota")}
              </div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => void loadAll()} disabled={loading}>
              <Icon name="refresh-cw" size={14} className={loading ? "animate-spin" : ""} />
              {t("common.refresh")}
            </Button>
          </div>
        </div>

        {target.note ? (
          <div className="flex items-center gap-2 border-t border-[var(--sn-line)] pt-3 text-xs text-[var(--sn-label3)]">
            <Icon name="info" size={14} className="shrink-0" />
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
            scene="inbox"
            compact
            title={t("billing.no_orders_title")}
            description={t("billing.no_orders_desc")}
          />
        ) : (
          <SatinTable
            plain
            rowKey="id"
            label={t("billing.key_orders_title")}
            columns={orderColumns}
            data={orders}
          />
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
