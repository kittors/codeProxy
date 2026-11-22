import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Clock,
  Coins,
  Plus,
  RefreshCw,
  Search,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  billingAdminApi,
  type BillingOrder,
  type BillingOrderListResult,
  type BillingPlan,
  type BillingTargetKind,
  type EndUser,
  type EndUserAPIKey,
} from "@code-proxy/api-client";
import {
  Button,
  Card,
  EmptyState,
  FormField,
  Modal,
  Select,
  TextInput,
  cn,
  surface,
  useToast,
} from "@code-proxy/ui";
import { formatYuan, orderStatusMeta } from "@features/portal-billing";

export function OrdersTab({
  plans,
  users,
  keysByUser,
  canWrite,
  onOrderMutated,
}: {
  plans: BillingPlan[];
  users: EndUser[];
  keysByUser: Record<string, EndUserAPIKey[]>;
  canWrite: boolean;
  onOrderMutated: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [data, setData] = useState<BillingOrderListResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [busyOrderNo, setBusyOrderNo] = useState<string | null>(null);

  const [manualOpen, setManualOpen] = useState(false);
  const [manualKind, setManualKind] = useState<BillingTargetKind>("api_key");
  const [manualTargetId, setManualTargetId] = useState("");
  const [manualPlanId, setManualPlanId] = useState("");
  const [manualYuan, setManualYuan] = useState("");
  const [manualNote, setManualNote] = useState("");
  const [creatingManual, setCreatingManual] = useState(false);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    try {
      const res = await billingAdminApi.listOrders({
        status: statusFilter,
        search: search.trim() || undefined,
        page,
        size: 20,
      });
      setData(res);
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing.load_failed"),
      });
    } finally {
      setLoading(false);
    }
  }, [notify, page, search, statusFilter, t]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const keyOptions = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    for (const u of users) {
      for (const k of keysByUser[u.id] ?? []) {
        if (k.disabled) continue;
        out.push({
          value: k.id,
          label: `${u.display_name || u.username} / ${k.name}${k.key_masked ? ` (${k.key_masked})` : ""}`,
        });
      }
    }
    return out;
  }, [keysByUser, users]);

  const userOptions = useMemo(
    () =>
      users.map((u) => ({
        value: u.id,
        label: `${u.display_name || u.username} (${u.username})`,
      })),
    [users],
  );

  const openManualModal = () => {
    const firstKind: BillingTargetKind = keyOptions.length > 0 ? "api_key" : "end_user";
    const firstTarget = firstKind === "api_key" ? (keyOptions[0]?.value ?? "") : (userOptions[0]?.value ?? "");
    const firstPlan = plans[0];
    setManualKind(firstKind);
    setManualTargetId(firstTarget);
    setManualPlanId(firstPlan?.id ?? "");
    setManualYuan(firstPlan ? (firstPlan.price_cents / 100).toFixed(2) : "");
    setManualNote("");
    setManualOpen(true);
  };

  const handleSync = async (order: BillingOrder) => {
    setBusyOrderNo(order.order_no);
    try {
      const updated = await billingAdminApi.syncOrder(order.order_no);
      notify({
        type: updated.status === "fulfilled" ? "success" : "info",
        message:
          updated.status === "fulfilled"
            ? t("billing_admin.order_synced_fulfilled")
            : t("billing_admin.order_synced_unchanged"),
      });
      await Promise.all([loadOrders(), onOrderMutated()]);
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.order_action_failed"),
      });
    } finally {
      setBusyOrderNo(null);
    }
  };

  const handleFulfill = async (order: BillingOrder) => {
    setBusyOrderNo(order.order_no);
    try {
      await billingAdminApi.fulfillOrder(order.order_no);
      notify({ type: "success", message: t("billing_admin.order_fulfilled_toast") });
      await Promise.all([loadOrders(), onOrderMutated()]);
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.order_action_failed"),
      });
    } finally {
      setBusyOrderNo(null);
    }
  };

  const submitManual = async () => {
    if (!manualTargetId || !manualPlanId) return;
    setCreatingManual(true);
    try {
      const cents = Math.round((Number.parseFloat(manualYuan) || 0) * 100);
      await billingAdminApi.createManualOrder({
        target_kind: manualKind,
        target_id: manualTargetId,
        plan_id: manualPlanId,
        amount_cents: cents,
        custom_amount_cents: cents,
        note: manualNote.trim(),
      });
      setManualOpen(false);
      notify({ type: "success", message: t("billing_admin.manual_order_created") });
      await Promise.all([loadOrders(), onOrderMutated()]);
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.order_action_failed"),
      });
    } finally {
      setCreatingManual(false);
    }
  };

  const summary = data?.summary;
  const items = data?.items ?? [];
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: t("billing_admin.kpi_today_revenue"),
            value: formatYuan(summary?.today_amount_cents ?? 0),
            icon: Coins,
          },
          {
            label: t("billing_admin.kpi_month_revenue"),
            value: formatYuan(summary?.month_amount_cents ?? 0),
            icon: TrendingUp,
          },
          {
            label: t("billing_admin.kpi_paid_orders"),
            value: String(summary?.paid_count ?? 0),
            icon: CheckCircle2,
          },
          {
            label: t("billing_admin.kpi_pending_orders"),
            value: `${summary?.pending_count ?? 0} / ${summary?.failed_count ?? 0}`,
            icon: Clock,
          },
        ].map((kpi) => (
          <div key={kpi.label} className={`${surface({ tone: "card", radius: "2xl" })} p-4`}>
            <div className="flex items-center justify-between text-xs text-ink-3">
              <span>{kpi.label}</span>
              <kpi.icon size={15} />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-ink">
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-60">
              <Search
                size={14}
                className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-3"
              />
              <TextInput
                size="sm"
                className="pl-8"
                value={search}
                placeholder={t("billing_admin.order_search_placeholder")}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <Select
              size="sm"
              value={statusFilter}
              onChange={(v) => {
                setStatusFilter(v);
                setPage(1);
              }}
              options={[
                { value: "all", label: t("billing_admin.filter_all_status") },
                { value: "fulfilled", label: t("billing.order_status.fulfilled") },
                { value: "pending", label: t("billing.order_status.pending") },
                { value: "failed", label: t("billing.order_status.failed") },
                { value: "expired", label: t("billing.order_status.expired") },
              ]}
            />
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => void loadOrders()} disabled={loading}>
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              {t("common.refresh")}
            </Button>
            {canWrite ? (
              <Button
                size="sm"
                variant="primary"
                onClick={openManualModal}
                disabled={plans.length === 0}
              >
                <Plus size={14} />
                {t("billing_admin.record_manual_order")}
              </Button>
            ) : null}
          </div>
        </div>

        {items.length === 0 ? (
          <EmptyState
            icon={<Wallet size={24} />}
            title={t("billing.no_orders_title")}
            description={t("billing_admin.no_orders_desc")}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-xs">
              <thead>
                <tr className="border-b border-ink/10 text-ink-3 dark:border-white/10">
                  <th className="py-2 pr-3 font-medium">{t("billing_admin.col_order_no")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing.col_target")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing.col_plan")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing_admin.col_channel")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing.col_amount")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing.col_status")}</th>
                  <th className="py-2 pr-3 font-medium">{t("billing.col_time")}</th>
                  <th className="py-2 text-right font-medium">{t("billing.col_action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/[0.06] dark:divide-white/[0.06]">
                {items.map((o) => {
                  const status = orderStatusMeta(o.status, t);
                  const busy = busyOrderNo === o.order_no;
                  return (
                    <tr key={o.id} className="text-ink-2">
                      <td className="py-2.5 pr-3">
                        <div className="font-mono font-medium text-ink">{o.order_no}</div>
                        {o.provider_order_id ? (
                          <div className="font-mono text-2xs text-ink-3">{o.provider_order_id}</div>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 font-medium text-ink">{o.target_label}</td>
                      <td className="py-2.5 pr-3">
                        <div>{o.plan_name}</div>
                        {o.fulfillment_summary ? (
                          <div className="text-2xs text-emerald-600 dark:text-emerald-400">
                            {o.fulfillment_summary}
                          </div>
                        ) : o.fulfillment_error ? (
                          <div className="text-2xs text-rose-500">{o.fulfillment_error}</div>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3">
                        {o.pay_channel === "wechat"
                          ? t("billing.channel_wechat")
                          : o.pay_channel === "alipay"
                            ? t("billing.channel_alipay")
                            : t("billing_admin.channel_manual")}
                      </td>
                      <td className="py-2.5 pr-3 font-mono font-semibold tabular-nums text-ink">
                        {formatYuan(o.amount_cents)}
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
                      <td className="py-2.5 pr-3 whitespace-nowrap tabular-nums">
                        {new Date(o.created_at).toLocaleString()}
                      </td>
                      <td className="py-2.5 text-right">
                        {canWrite && o.status !== "fulfilled" && o.status !== "closed" ? (
                          <div className="inline-flex items-center gap-1">
                            {o.provider === "xunhupay" ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={busy}
                                onClick={() => void handleSync(o)}
                              >
                                {t("billing_admin.sync_order")}
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              variant="primary"
                              disabled={busy}
                              onClick={() => void handleFulfill(o)}
                            >
                              {t("billing_admin.manual_fulfill")}
                            </Button>
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 ? (
          <div className="mt-4 flex items-center justify-end gap-2 text-xs text-ink-2">
            <Button
              size="sm"
              variant="secondary"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              {t("common.previous")}
            </Button>
            <span className="tabular-nums">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              {t("common.next")}
            </Button>
          </div>
        ) : null}
      </Card>

      <Modal
        open={manualOpen}
        title={t("billing_admin.record_manual_order")}
        size="sm"
        onClose={() => setManualOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setManualOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={creatingManual || !manualTargetId || !manualPlanId}
              onClick={() => void submitManual()}
            >
              {creatingManual ? t("common.saving") : t("billing_admin.confirm_manual_order")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <FormField label={t("billing_admin.target_kind_label")}>
            <Select
              value={manualKind}
              onChange={(v) => {
                const next = v as BillingTargetKind;
                setManualKind(next);
                setManualTargetId(
                  next === "api_key" ? (keyOptions[0]?.value ?? "") : (userOptions[0]?.value ?? ""),
                );
              }}
              options={[
                { value: "api_key", label: t("billing_admin.target_kind.api_key") },
                { value: "end_user", label: t("billing_admin.target_kind.end_user") },
              ]}
            />
          </FormField>
          <FormField label={t("billing_admin.target_select_label")}>
            <Select
              value={manualTargetId}
              onChange={setManualTargetId}
              options={manualKind === "api_key" ? keyOptions : userOptions}
            />
          </FormField>
          <FormField label={t("billing_admin.manual_plan_label")}>
            <Select
              value={manualPlanId}
              onChange={(pid) => {
                setManualPlanId(pid);
                const found = plans.find((p) => p.id === pid);
                if (found) setManualYuan((found.price_cents / 100).toFixed(2));
              }}
              options={plans.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.kind === "custom_quota" ? t("billing.custom_price_label") : formatYuan(p.price_cents)})`,
              }))}
            />
          </FormField>
          <FormField label={t("billing_admin.manual_amount_label")}>
            <TextInput
              type="number"
              step="0.01"
              min="0.01"
              value={manualYuan}
              onChange={(e) => setManualYuan(e.target.value)}
            />
          </FormField>
          <FormField label={t("billing_admin.manual_note_label")}>
            <TextInput
              value={manualNote}
              placeholder={t("billing_admin.manual_note_placeholder")}
              onChange={(e) => setManualNote(e.target.value)}
            />
          </FormField>
        </div>
      </Modal>
    </div>
  );
}
