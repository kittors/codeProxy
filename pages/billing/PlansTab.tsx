import { useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Coins, Pencil, Plus, RotateCcw, Sparkles, Trash2, Wallet } from "@code-proxy/ui/icons";
import {
  billingAdminApi,
  type ApiKeyPermissionProfile,
  type BillingPlan,
  type BillingPlanInput,
  type BillingPlanKind,
} from "@code-proxy/api-client";
import {
  Button,
  ConfirmModal,
  EmptyState,
  EntityCard,
  FormField,
  Modal,
  Select,
  TextInput,
  Textarea,
  ToggleSwitch,
  entityCardGridClass,
  useToast,
} from "@code-proxy/ui";
import { describePlanBenefits, formatYuan, planKindLabel } from "@features/portal-billing";

interface PlanFormState {
  name: string;
  description: string;
  kind: BillingPlanKind;
  priceYuan: string;
  durationDays: string;
  quotaUsd: string;
  quotaRequests: string;
  quotaTokens: string;
  rateUsdPerCny: string;
  minYuan: string;
  maxYuan: string;
  permissionProfileId: string;
  badge: string;
  sortOrder: string;
  enabled: boolean;
}

const emptyPlanForm = (): PlanFormState => ({
  name: "",
  description: "",
  kind: "subscription",
  priceYuan: "30",
  durationDays: "30",
  quotaUsd: "0",
  quotaRequests: "0",
  quotaTokens: "0",
  rateUsdPerCny: "0.5",
  minYuan: "5",
  maxYuan: "500",
  permissionProfileId: "",
  badge: "",
  sortOrder: "0",
  enabled: true,
});

const planToForm = (p: BillingPlan): PlanFormState => ({
  name: p.name,
  description: p.description,
  kind: p.kind,
  priceYuan: (p.price_cents / 100).toFixed(2),
  durationDays: String(p.duration_days || 30),
  quotaUsd: String(p.quota_amount_usd || 0),
  quotaRequests: String(p.quota_requests || 0),
  quotaTokens: String(p.quota_tokens || 0),
  rateUsdPerCny: String(p.rate_usd_per_cny || 0.5),
  minYuan: ((p.min_amount_cents || 100) / 100).toFixed(2),
  maxYuan: ((p.max_amount_cents || 100000) / 100).toFixed(2),
  permissionProfileId: p.permission_profile_id || "",
  badge: p.badge || "",
  sortOrder: String(p.sort_order || 0),
  enabled: p.enabled,
});

const toYuanCents = (raw: string): number => {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};

const toNonNegFloat = (raw: string): number => {
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const toNonNegInt = (raw: string): number => {
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

function KindBadgeIcon({ kind }: { kind: BillingPlanKind }) {
  switch (kind) {
    case "subscription":
      return <CalendarClock size={14} />;
    case "quota_pack":
      return <Coins size={14} />;
    case "custom_quota":
      return <Wallet size={14} />;
    case "daily_reset":
      return <RotateCcw size={14} />;
  }
}

export function PlansTab({
  plans,
  profiles,
  canWrite,
  onReload,
}: {
  plans: BillingPlan[];
  profiles: ApiKeyPermissionProfile[];
  canWrite: boolean;
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [editing, setEditing] = useState<BillingPlan | "new" | null>(null);
  const [form, setForm] = useState<PlanFormState>(() => emptyPlanForm());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BillingPlan | null>(null);

  const openCreate = () => {
    setForm(emptyPlanForm());
    setEditing("new");
  };

  const openEdit = (plan: BillingPlan) => {
    setForm(planToForm(plan));
    setEditing(plan);
  };

  const submitPlan = async () => {
    setSaving(true);
    try {
      const payload: BillingPlanInput = {
        name: form.name.trim(),
        description: form.description.trim(),
        kind: form.kind,
        price_cents: toYuanCents(form.priceYuan),
        duration_days: toNonNegInt(form.durationDays),
        quota_amount_usd: toNonNegFloat(form.quotaUsd),
        quota_requests: toNonNegInt(form.quotaRequests),
        quota_tokens: toNonNegInt(form.quotaTokens),
        rate_usd_per_cny: toNonNegFloat(form.rateUsdPerCny),
        min_amount_cents: toYuanCents(form.minYuan),
        max_amount_cents: toYuanCents(form.maxYuan),
        permission_profile_id: form.permissionProfileId,
        badge: form.badge.trim(),
        sort_order: Number.parseInt(form.sortOrder, 10) || 0,
        enabled: form.enabled,
      };
      if (editing === "new") {
        await billingAdminApi.createPlan(payload);
        notify({ type: "success", message: t("billing_admin.plan_created") });
      } else if (editing) {
        await billingAdminApi.updatePlan(editing.id, payload);
        notify({ type: "success", message: t("billing_admin.plan_updated") });
      }
      setEditing(null);
      await onReload();
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.plan_save_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await billingAdminApi.deletePlan(deleteTarget.id);
      setDeleteTarget(null);
      notify({ type: "success", message: t("billing_admin.plan_deleted") });
      await onReload();
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.plan_delete_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const profileName = (id: string) => profiles.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">{t("billing_admin.plans_intro")}</p>
        {canWrite ? (
          <Button size="sm" variant="primary" onClick={openCreate}>
            <Plus size={14} />
            {t("billing_admin.create_plan")}
          </Button>
        ) : null}
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={<Coins size={28} />}
          title={t("billing_admin.no_plans_title")}
          description={t("billing_admin.no_plans_desc")}
          action={
            canWrite ? (
              <Button size="sm" variant="primary" onClick={openCreate}>
                <Plus size={14} />
                {t("billing_admin.create_plan")}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className={entityCardGridClass({ columns: 3 })}>
          {plans.map((plan) => {
            const benefits = describePlanBenefits(plan, t);
            return (
              <EntityCard
                key={plan.id}
                title={plan.name}
                dimmed={!plan.enabled}
                titleAdornment={
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.06] px-2 py-0.5 text-2xs font-medium text-ink-2 dark:bg-white/[0.08]">
                    <KindBadgeIcon kind={plan.kind} />
                    {planKindLabel(plan.kind, t)}
                  </span>
                }
                headerControls={
                  canWrite ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(plan)}>
                        <Pencil size={14} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteTarget(plan)}>
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ) : undefined
                }
                header={
                  plan.description ? (
                    <p className="text-xs text-ink-3">{plan.description}</p>
                  ) : undefined
                }
              >
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-mono text-2xl font-bold tabular-nums text-ink">
                      {plan.kind === "custom_quota"
                        ? t("billing.custom_price_label")
                        : formatYuan(plan.price_cents)}
                    </span>
                    {plan.badge ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-2xs font-medium text-accent-ink">
                        <Sparkles size={11} />
                        {plan.badge}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {benefits.map((line) => (
                      <span
                        key={line}
                        className="rounded-lg bg-ink/[0.05] px-2 py-0.5 text-2xs text-ink-2 dark:bg-white/[0.07]"
                      >
                        {line}
                      </span>
                    ))}
                    {plan.permission_profile_id ? (
                      <span className="rounded-lg bg-violet-500/10 px-2 py-0.5 text-2xs text-violet-700 dark:text-violet-300">
                        {t("billing_admin.plan_profile_tag", {
                          name: profileName(plan.permission_profile_id),
                        })}
                      </span>
                    ) : null}
                  </div>
                </div>
              </EntityCard>
            );
          })}
        </div>
      )}

      <Modal
        open={editing !== null}
        title={
          editing === "new" ? t("billing_admin.create_plan") : t("billing_admin.edit_plan")
        }
        size="md"
        onClose={() => setEditing(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={saving || !form.name.trim()}
              onClick={() => void submitPlan()}
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("billing_admin.plan_name_label")} required>
              <TextInput
                value={form.name}
                placeholder={t("billing_admin.plan_name_placeholder")}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              />
            </FormField>
            <FormField label={t("billing_admin.plan_kind_label")}>
              <Select
                value={form.kind}
                onChange={(v) => setForm((p) => ({ ...p, kind: v as BillingPlanKind }))}
                options={[
                  { value: "subscription", label: t("billing.plan_kind.subscription") },
                  { value: "quota_pack", label: t("billing.plan_kind.quota_pack") },
                  { value: "custom_quota", label: t("billing.plan_kind.custom_quota") },
                  { value: "daily_reset", label: t("billing.plan_kind.daily_reset") },
                ]}
              />
            </FormField>
          </div>

          <FormField label={t("billing_admin.plan_desc_label")}>
            <Textarea
              rows={2}
              value={form.description}
              placeholder={t("billing_admin.plan_desc_placeholder")}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            />
          </FormField>

          {form.kind !== "custom_quota" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label={t("billing_admin.plan_price_yuan_label")} required>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.priceYuan}
                  onChange={(e) => setForm((p) => ({ ...p, priceYuan: e.target.value }))}
                />
              </FormField>
              {form.kind === "subscription" ? (
                <FormField label={t("billing_admin.plan_duration_days_label")} required>
                  <TextInput
                    type="number"
                    min="1"
                    max="3650"
                    value={form.durationDays}
                    onChange={(e) => setForm((p) => ({ ...p, durationDays: e.target.value }))}
                  />
                </FormField>
              ) : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label={t("billing_admin.plan_rate_label")} required>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.rateUsdPerCny}
                  onChange={(e) => setForm((p) => ({ ...p, rateUsdPerCny: e.target.value }))}
                />
              </FormField>
              <FormField label={t("billing_admin.plan_min_yuan_label")}>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={form.minYuan}
                  onChange={(e) => setForm((p) => ({ ...p, minYuan: e.target.value }))}
                />
              </FormField>
              <FormField label={t("billing_admin.plan_max_yuan_label")}>
                <TextInput
                  type="number"
                  step="0.01"
                  min="1"
                  value={form.maxYuan}
                  onChange={(e) => setForm((p) => ({ ...p, maxYuan: e.target.value }))}
                />
              </FormField>
            </div>
          )}

          {form.kind === "subscription" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                label={t("billing_admin.plan_bonus_usd_label")}
                description={t("billing_admin.plan_bonus_usd_desc")}
              >
                <TextInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.quotaUsd}
                  onChange={(e) => setForm((p) => ({ ...p, quotaUsd: e.target.value }))}
                />
              </FormField>
              <FormField
                label={t("billing_admin.plan_profile_label")}
                description={t("billing_admin.plan_profile_desc")}
              >
                <Select
                  value={form.permissionProfileId}
                  onChange={(v) => setForm((p) => ({ ...p, permissionProfileId: v }))}
                  options={[
                    { value: "", label: t("billing_admin.plan_profile_none") },
                    ...profiles.map((prof) => ({ value: prof.id, label: prof.name })),
                  ]}
                />
              </FormField>
            </div>
          ) : null}

          {form.kind === "quota_pack" ? (
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label={t("billing_admin.plan_quota_usd_label")}>
                <TextInput
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.quotaUsd}
                  onChange={(e) => setForm((p) => ({ ...p, quotaUsd: e.target.value }))}
                />
              </FormField>
              <FormField label={t("billing_admin.plan_quota_requests_label")}>
                <TextInput
                  type="number"
                  min="0"
                  value={form.quotaRequests}
                  onChange={(e) => setForm((p) => ({ ...p, quotaRequests: e.target.value }))}
                />
              </FormField>
              <FormField label={t("billing_admin.plan_quota_tokens_label")}>
                <TextInput
                  type="number"
                  min="0"
                  value={form.quotaTokens}
                  onChange={(e) => setForm((p) => ({ ...p, quotaTokens: e.target.value }))}
                />
              </FormField>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField label={t("billing_admin.plan_badge_label")}>
              <TextInput
                value={form.badge}
                placeholder={t("billing_admin.plan_badge_placeholder")}
                onChange={(e) => setForm((p) => ({ ...p, badge: e.target.value }))}
              />
            </FormField>
            <FormField label={t("billing_admin.plan_sort_label")}>
              <TextInput
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((p) => ({ ...p, sortOrder: e.target.value }))}
              />
            </FormField>
            <FormField label={t("billing_admin.plan_enabled_label")}>
              <div className="flex h-9 items-center">
                <ToggleSwitch
                  checked={form.enabled}
                  onCheckedChange={(checked) => setForm((p) => ({ ...p, enabled: checked }))}
                  ariaLabel={t("billing_admin.plan_enabled_label")}
                />
              </div>
            </FormField>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={t("billing_admin.delete_plan_title")}
        description={t("billing_admin.delete_plan_desc", { name: deleteTarget?.name ?? "" })}
        confirmText={t("common.delete")}
        variant="danger"
        busy={saving}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
