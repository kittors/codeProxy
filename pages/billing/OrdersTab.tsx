import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "satin-ui/react";
import type { TableColumnReact } from "satin-ui/react";
import {
  billingAdminApi,
  type BillingManualExtendMode,
  type BillingOrder,
  type BillingOrderListResult,
  type BillingPlan,
  type BillingTargetKind,
  type EndUser,
  type EndUserAPIKey,
} from "@code-proxy/api-client";
import {
  Button,
  DataGridPagination,
  EmptyState,
  FormField,
  GridSearchInput,
  Modal,
  SatinTable,
  Select,
  TextInput,
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
  const [manualPaidAtLocal, setManualPaidAtLocal] = useState("");
  const [manualDurationDays, setManualDurationDays] = useState("");
  const [manualExtendMode, setManualExtendMode] = useState<BillingManualExtendMode>("extend_current");
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
    setManualPaidAtLocal("");
    setManualDurationDays(
      firstPlan?.kind === "subscription" && firstPlan.duration_days > 0
        ? String(firstPlan.duration_days)
        : "",
    );
    setManualExtendMode("extend_current");
    setManualNote("");
    setManualOpen(true);
  };

  const handleSync = useCallback(
    async (order: BillingOrder) => {
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
    },
    [loadOrders, notify, onOrderMutated, t],
  );

  const handleFulfill = useCallback(
    async (order: BillingOrder) => {
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
    },
    [loadOrders, notify, onOrderMutated, t],
  );

  const submitManual = async () => {
    if (!manualTargetId || !manualPlanId) return;
    setCreatingManual(true);
    try {
      const cents = Math.max(0, Math.round((Number.parseFloat(manualYuan) || 0) * 100));
      const days = Number.parseInt(manualDurationDays, 10);
      const paidAtIso = manualPaidAtLocal ? new Date(manualPaidAtLocal).toISOString() : undefined;
      await billingAdminApi.createManualOrder({
        target_kind: manualKind,
        target_id: manualTargetId,
        plan_id: manualPlanId,
        amount_cents: cents,
        custom_amount_cents: cents,
        ...(paidAtIso ? { paid_at: paidAtIso } : {}),
        ...(Number.isFinite(days) && days > 0 ? { duration_days: days } : {}),
        extend_mode: manualExtendMode,
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
  const totalOrders = data?.total ?? 0;

  const orderColumns = useMemo<TableColumnReact<BillingOrder>[]>(
    () => [
      {
        key: "order_no",
        title: t("billing_admin.col_order_no"),
        render: (_, o) => (
          <div className="py-1.5">
            <div className="font-mono font-medium text-[var(--sn-label)]">{o.order_no}</div>
            {o.provider_order_id ? (
              <div className="font-mono text-2xs text-[var(--sn-label3)]">{o.provider_order_id}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: "target_label",
        title: t("billing.col_target"),
        className: "font-medium text-[var(--sn-label)]",
      },
      {
        key: "plan_name",
        title: t("billing.col_plan"),
        render: (_, o) => (
          <div className="py-1.5">
            <div>{o.plan_name}</div>
            {o.fulfillment_summary ? (
              <div className="text-2xs text-[var(--sn-success)]">{o.fulfillment_summary}</div>
            ) : o.fulfillment_error ? (
              <div className="text-2xs text-[var(--sn-danger)]">{o.fulfillment_error}</div>
            ) : null}
          </div>
        ),
      },
      {
        key: "pay_channel",
        title: t("billing_admin.col_channel"),
        className: "text-[var(--sn-label2)]",
        format: (_, o) =>
          o.pay_channel === "wechat"
            ? t("billing.channel_wechat")
            : o.pay_channel === "alipay"
              ? t("billing.channel_alipay")
              : t("billing_admin.channel_manual"),
      },
      {
        key: "amount_cents",
        title: t("billing.col_amount"),
        align: "right",
        sortable: true,
        className: "font-mono font-semibold text-[var(--sn-label)]",
        format: (_, o) => formatYuan(o.amount_cents),
      },
      {
        key: "status",
        title: t("billing.col_status"),
        render: (_, o) => {
          const status = orderStatusMeta(o.status, t);
          return (
            <span className={`sn-tag sn-sm ${status.tagTone}`}>
              <i />
              {status.label}
            </span>
          );
        },
      },
      {
        key: "paid_at",
        title: t("billing.col_time"),
        sortable: true,
        sortFirst: "desc",
        sort: (a, b) =>
          new Date(a.paid_at || a.created_at).getTime() -
          new Date(b.paid_at || b.created_at).getTime(),
        className: "sn-num text-[var(--sn-label3)]",
        format: (_, o) => new Date(o.paid_at || o.created_at).toLocaleString(),
      },
      {
        key: "actions",
        title: t("billing.col_action"),
        align: "right",
        render: (_, o) => {
          const busy = busyOrderNo === o.order_no;
          if (!canWrite || o.status === "fulfilled" || o.status === "closed") return null;
          return (
            <div className="inline-flex items-center justify-end gap-1">
              {o.provider === "xunhupay" ? (
                <Button size="sm" variant="secondary" disabled={busy} onClick={() => void handleSync(o)}>
                  {t("billing_admin.sync_order")}
                </Button>
              ) : null}
              <Button size="sm" variant="primary" disabled={busy} onClick={() => void handleFulfill(o)}>
                {t("billing_admin.manual_fulfill")}
              </Button>
            </div>
          );
        },
      },
    ],
    [busyOrderNo, canWrite, handleFulfill, handleSync, t],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: t("billing_admin.kpi_today_revenue"),
            value: formatYuan(summary?.today_amount_cents ?? 0),
            iconName: "receipt",
          },
          {
            label: t("billing_admin.kpi_month_revenue"),
            value: formatYuan(summary?.month_amount_cents ?? 0),
            iconName: "chart-column",
          },
          {
            label: t("billing_admin.kpi_paid_orders"),
            value: String(summary?.paid_count ?? 0),
            iconName: "circle-check",
          },
          {
            label: t("billing_admin.kpi_pending_orders"),
            value: `${summary?.pending_count ?? 0} / ${summary?.failed_count ?? 0}`,
            iconName: "clock",
          },
        ].map((kpi) => (
          <div key={kpi.label} className={`${surface({ tone: "card", radius: "2xl" })} p-4`}>
            <div className="flex items-center justify-between text-xs text-[var(--sn-label3)]">
              <span>{kpi.label}</span>
              <Icon name={kpi.iconName} size={15} />
            </div>
            <div className="mt-2 font-mono text-2xl font-bold tabular-nums text-[var(--sn-label)]">
              {kpi.value}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <GridSearchInput
            className="w-64"
            value={search}
            placeholder={t("billing_admin.order_search_placeholder")}
            onChange={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <div className="w-36">
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
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => void loadOrders()} disabled={loading}>
            <Icon name="refresh-cw" size={14} className={loading ? "animate-spin" : ""} />
            {t("common.refresh")}
          </Button>
          {canWrite ? (
            <Button
              size="sm"
              variant="primary"
              onClick={openManualModal}
              disabled={plans.length === 0}
            >
              <Icon name="plus" size={14} />
              {t("billing_admin.record_manual_order")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="sn-tbl-wrap">
        {items.length === 0 && !loading ? (
          <EmptyState
            scene="inbox"
            title={t("billing.no_orders_title")}
            description={t("billing_admin.no_orders_desc")}
          />
        ) : (
          <SatinTable
            plain
            rowKey="id"
            label={t("billing_admin.col_order_no")}
            loading={loading && items.length === 0}
            columns={orderColumns}
            data={items}
          />
        )}

        {totalOrders > 0 ? (
          <div className="cp-grid-footer px-4 py-2.5">
            <DataGridPagination
              page={page}
              pageSize={20}
              total={totalOrders}
              pending={loading && !data}
              onPageChange={setPage}
            />
          </div>
        ) : null}
      </div>

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
                if (found) {
                  setManualYuan((found.price_cents / 100).toFixed(2));
                  setManualDurationDays(
                    found.kind === "subscription" && found.duration_days > 0
                      ? String(found.duration_days)
                      : "",
                  );
                }
              }}
              options={plans.map((p) => ({
                value: p.id,
                label: `${p.name} (${p.kind === "custom_quota" ? t("billing.custom_price_label") : formatYuan(p.price_cents)})`,
              }))}
            />
          </FormField>
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label={t("billing_admin.manual_amount_label")}>
              <TextInput
                type="number"
                step="0.01"
                min="0"
                value={manualYuan}
                onChange={(e) => setManualYuan(e.target.value)}
              />
            </FormField>
            <FormField
              label={t("billing_admin.manual_paid_at_label")}
              description={t("billing_admin.manual_paid_at_desc")}
            >
              <TextInput
                type="datetime-local"
                value={manualPaidAtLocal}
                onChange={(e) => setManualPaidAtLocal(e.target.value)}
              />
            </FormField>
          </div>
          {plans.find((p) => p.id === manualPlanId)?.kind === "subscription" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormField
                label={t("billing_admin.manual_duration_days_label")}
                description={t("billing_admin.manual_duration_days_desc")}
              >
                <TextInput
                  type="number"
                  min="1"
                  max="3650"
                  value={manualDurationDays}
                  onChange={(e) => setManualDurationDays(e.target.value)}
                />
              </FormField>
              <FormField label={t("billing_admin.manual_extend_mode_label")}>
                <Select
                  value={manualExtendMode}
                  onChange={(v) => setManualExtendMode(v as BillingManualExtendMode)}
                  options={[
                    { value: "extend_current", label: t("billing_admin.extend_mode.extend_current") },
                    { value: "from_paid_at", label: t("billing_admin.extend_mode.from_paid_at") },
                    { value: "record_only", label: t("billing_admin.extend_mode.record_only") },
                  ]}
                />
              </FormField>
            </div>
          ) : null}
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
