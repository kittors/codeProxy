import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Icon } from "satin-ui/react";
import {
  billingAdminApi,
  type BillingBinding,
  type BillingPlan,
  type BillingTargetKind,
  type EndUser,
  type EndUserAPIKey,
} from "@code-proxy/api-client";
import {
  Button,
  Card,
  Checkbox,
  ConfirmModal,
  CopyButton,
  EmptyState,
  FormField,
  Modal,
  Select,
  TextInput,
  Textarea,
  ToggleSwitch,
  cn,
  surface,
  useToast,
} from "@code-proxy/ui";
import {
  QrCodeSvg,
  downloadQrPng,
  formatExpiryRemaining,
  formatYuan,
} from "@features/portal-billing";
import { AdjustExpiryModal } from "./AdjustExpiryModal";

interface BindingDraft {
  targetKind: BillingTargetKind;
  targetId: string;
  enabled: boolean;
  planIds: string[];
  priceOverridesYuan: Record<string, string>;
  allowPublicPay: boolean;
  note: string;
  setExpiresAt: boolean;
  expiresAtLocal: string;
}

const emptyBindingDraft = (
  kind: BillingTargetKind = "api_key",
  targetId = "",
): BindingDraft => ({
  targetKind: kind,
  targetId,
  enabled: true,
  planIds: [],
  priceOverridesYuan: {},
  allowPublicPay: true,
  note: "",
  setExpiresAt: false,
  expiresAtLocal: "",
});

const toLocalDatetimeInput = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function BindingsTab({
  bindings,
  plans,
  users,
  keysByUser,
  canWrite,
  initialTarget,
  onClearInitialTarget,
  onReload,
}: {
  bindings: BillingBinding[];
  plans: BillingPlan[];
  users: EndUser[];
  keysByUser: Record<string, EndUserAPIKey[]>;
  canWrite: boolean;
  initialTarget?: { kind: BillingTargetKind; id: string } | null;
  onClearInitialTarget?: () => void;
  onReload: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<BindingDraft>(() => emptyBindingDraft());
  const [saving, setSaving] = useState(false);
  const [qrTarget, setQrTarget] = useState<BillingBinding | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<BillingBinding | null>(null);
  const [rotating, setRotating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BillingBinding | null>(null);

  const allKeyOptions = useMemo(() => {
    const out: Array<{ value: string; label: string }> = [];
    for (const user of users) {
      const keys = keysByUser[user.id] ?? [];
      for (const k of keys) {
        if (k.disabled) continue;
        const owner = user.display_name || user.username;
        out.push({
          value: k.id,
          label: `${owner} / ${k.name}${k.key_masked ? ` (${k.key_masked})` : ""}`,
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

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  const openEditBinding = (b: BillingBinding) => {
    const overrides: Record<string, string> = {};
    for (const [pid, cents] of Object.entries(b.price_overrides ?? {})) {
      if (cents > 0) overrides[pid] = (cents / 100).toFixed(2);
    }
    setDraft({
      targetKind: b.target_kind,
      targetId: b.target_id,
      enabled: b.enabled,
      planIds: [...(b.plan_ids ?? [])],
      priceOverridesYuan: overrides,
      allowPublicPay: b.allow_public_pay,
      note: b.note || "",
      setExpiresAt: false,
      expiresAtLocal: toLocalDatetimeInput(b.expires_at),
    });
    setModalOpen(true);
  };

  useEffect(() => {
    if (!initialTarget) return;
    const existing = bindings.find(
      (b) => b.target_kind === initialTarget.kind && b.target_id === initialTarget.id,
    );
    if (existing) {
      openEditBinding(existing);
    } else {
      setDraft({
        ...emptyBindingDraft(initialTarget.kind, initialTarget.id),
        planIds: plans.filter((p) => p.enabled).map((p) => p.id),
      });
      setModalOpen(true);
    }
    onClearInitialTarget?.();
  }, [bindings, initialTarget, onClearInitialTarget, plans]);

  const openCreate = () => {
    const defaultId = allKeyOptions[0]?.value ?? userOptions[0]?.value ?? "";
    const defaultKind: BillingTargetKind = allKeyOptions.length > 0 ? "api_key" : "end_user";
    setDraft({
      ...emptyBindingDraft(defaultKind, defaultId),
      planIds: plans.filter((p) => p.enabled).map((p) => p.id),
    });
    setModalOpen(true);
  };

  const togglePlan = (planId: string) => {
    setDraft((prev) => ({
      ...prev,
      planIds: prev.planIds.includes(planId)
        ? prev.planIds.filter((id) => id !== planId)
        : [...prev.planIds, planId],
    }));
  };

  const handleSave = async () => {
    if (!draft.targetId) return;
    setSaving(true);
    try {
      const price_overrides: Record<string, number> = {};
      for (const pid of draft.planIds) {
        const raw = draft.priceOverridesYuan[pid];
        if (!raw) continue;
        const parsed = Number.parseFloat(raw);
        if (Number.isFinite(parsed) && parsed > 0) {
          price_overrides[pid] = Math.round(parsed * 100);
        }
      }
      const expiresIso = draft.expiresAtLocal
        ? new Date(draft.expiresAtLocal).toISOString()
        : null;
      await billingAdminApi.upsertBinding({
        target_kind: draft.targetKind,
        target_id: draft.targetId,
        enabled: draft.enabled,
        plan_ids: draft.planIds,
        price_overrides,
        allow_public_pay: draft.allowPublicPay,
        note: draft.note.trim(),
        set_expires_at: draft.setExpiresAt,
        ...(draft.setExpiresAt ? { expires_at: expiresIso } : {}),
      });
      setModalOpen(false);
      notify({ type: "success", message: t("billing_admin.binding_saved") });
      await onReload();
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.binding_save_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRotateCode = async (binding: BillingBinding) => {
    setRotating(true);
    try {
      const updated = await billingAdminApi.rotateBindingCode(binding.id);
      setQrTarget(updated);
      notify({ type: "success", message: t("billing_admin.qr_rotated") });
      await onReload();
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.qr_rotate_failed"),
      });
    } finally {
      setRotating(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await billingAdminApi.deleteBinding(deleteTarget.id);
      setDeleteTarget(null);
      notify({ type: "success", message: t("billing_admin.binding_deleted") });
      await onReload();
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.binding_delete_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  const resolvePublicUrl = (b: BillingBinding) => {
    if (!b.public_code) return "";
    if (b.public_pay_url && /^https?:\/\//i.test(b.public_pay_url)) return b.public_pay_url;
    return `${window.location.origin}/#/pay/${b.public_code}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-3">{t("billing_admin.bindings_intro")}</p>
        {canWrite ? (
          <Button size="sm" variant="primary" onClick={openCreate} disabled={plans.length === 0}>
            <Icon name="plus" size={14} />
            {t("billing_admin.create_binding")}
          </Button>
        ) : null}
      </div>

      {bindings.length === 0 ? (
        <Card>
          <EmptyState
            scene="projects"
            title={t("billing_admin.no_bindings_title")}
            description={t("billing_admin.no_bindings_desc")}
            action={
              canWrite && plans.length > 0 ? (
                <Button size="sm" variant="primary" onClick={openCreate}>
                  <Icon name="plus" size={14} />
                  {t("billing_admin.create_binding")}
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="sn-tbl-wrap">
          <div className="sn-tbl-sc">
            <table className="sn-tbl min-w-[760px]">
              <thead>
                <tr>
                  <th>{t("billing_admin.col_target")}</th>
                  <th>{t("billing_admin.col_bound_plans")}</th>
                  <th>{t("billing_admin.col_expiry_quota")}</th>
                  <th>{t("billing_admin.col_public_qr")}</th>
                  <th className="sn-r">{t("billing.col_action")}</th>
                </tr>
              </thead>
              <tbody>
                {bindings.map((b) => {
                  const exp = formatExpiryRemaining(b.expires_at, t);
                  return (
                    <tr key={b.id}>
                      <td>
                        <div className="flex items-center gap-2.5 py-2">
                          <span className="inline-flex shrink-0 items-center text-[var(--sn-label3)]">
                            <Icon name={b.target_kind === "api_key" ? "key-round" : "user"} size={16} />
                          </span>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 font-medium text-[var(--sn-label)]">
                              <span className="truncate">{b.target_label || b.target_id}</span>
                              {!b.enabled ? (
                                <span className="sn-tag sn-sm">
                                  <i />
                                  {t("common.disabled")}
                                </span>
                              ) : null}
                            </div>
                            <div className="font-mono text-2xs text-[var(--sn-label3)]">
                              {b.target_subtitle ? `${b.target_subtitle} · ` : ""}
                              {b.key_masked || t(`billing_admin.target_kind.${b.target_kind}`)}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="flex flex-wrap gap-1 py-1.5">
                          {b.plan_ids.map((pid) => {
                            const p = planById.get(pid);
                            const override = b.price_overrides?.[pid];
                            return (
                              <span key={pid} className="sn-tag sn-sm">
                                {p ? p.name : pid}
                                {override ? ` (${formatYuan(override)})` : ""}
                              </span>
                            );
                          })}
                        </div>
                      </td>
                      <td>
                        <div className="space-y-0.5 py-1.5">
                          <div
                            className={cn(
                              "inline-flex items-center gap-1.5 text-xs",
                              exp?.expired
                                ? "text-[var(--sn-danger)]"
                                : exp?.soon
                                  ? "text-[var(--sn-warning)]"
                                  : "text-[var(--sn-label2)]",
                            )}
                          >
                            <Icon name="calendar" size={13} />
                            <span>{exp ? exp.text : t("billing.no_expiry_limit")}</span>
                          </div>
                          <div className="font-mono text-2xs text-[var(--sn-label3)]">
                            {b.lifetime_limit_usd > 0
                              ? t("billing_admin.lifetime_cap", {
                                  usd: b.lifetime_limit_usd.toFixed(2),
                                })
                              : t("billing.unlimited_quota")}
                          </div>
                        </div>
                      </td>
                      <td>
                        {b.allow_public_pay && b.public_code ? (
                          <Button size="sm" variant="secondary" onClick={() => setQrTarget(b)}>
                            <Icon name="scan" size={13} />
                            {t("billing_admin.view_qr_code")}
                          </Button>
                        ) : (
                          <span className="text-xs text-[var(--sn-label3)]">{t("billing_admin.portal_only")}</span>
                        )}
                      </td>
                      <td className="sn-r">
                        {canWrite ? (
                          <div className="inline-flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setAdjustTarget(b)}
                            >
                              <Icon name="calendar" size={13} />
                              {t("billing_admin.adjust_expiry_btn")}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditBinding(b)}
                              aria-label={t("common.edit")}
                            >
                              <Icon name="pencil" size={14} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => setDeleteTarget(b)}
                              aria-label={t("common.delete")}
                            >
                              <Icon name="trash-2" size={14} />
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
        </div>
      )}

      <Modal
        open={modalOpen}
        title={t("billing_admin.binding_modal_title")}
        size="md"
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={saving || !draft.targetId || draft.planIds.length === 0}
              onClick={() => void handleSave()}
            >
              {saving ? t("common.saving") : t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t("billing_admin.target_kind_label")}>
              <Select
                value={draft.targetKind}
                onChange={(v) => {
                  const nextKind = v as BillingTargetKind;
                  const nextId =
                    nextKind === "api_key"
                      ? (allKeyOptions[0]?.value ?? "")
                      : (userOptions[0]?.value ?? "");
                  setDraft((p) => ({ ...p, targetKind: nextKind, targetId: nextId }));
                }}
                options={[
                  { value: "api_key", label: t("billing_admin.target_kind.api_key") },
                  { value: "end_user", label: t("billing_admin.target_kind.end_user") },
                ]}
              />
            </FormField>
            <FormField label={t("billing_admin.target_select_label")} required>
              <Select
                value={draft.targetId}
                onChange={(v) => setDraft((p) => ({ ...p, targetId: v }))}
                options={draft.targetKind === "api_key" ? allKeyOptions : userOptions}
              />
            </FormField>
          </div>

          <FormField
            label={t("billing_admin.allowed_plans_label")}
            description={t("billing_admin.allowed_plans_desc")}
          >
            <div className="space-y-2">
              {plans.map((plan) => {
                const checked = draft.planIds.includes(plan.id);
                return (
                  <div
                    key={plan.id}
                    className={`${surface({ tone: "inset", radius: "xl" })} flex flex-wrap items-center justify-between gap-2 px-3 py-2`}
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-ink">
                      <Checkbox checked={checked} onCheckedChange={() => togglePlan(plan.id)} />
                      <span className="font-medium">{plan.name}</span>
                      <span className="font-mono text-2xs text-ink-3">
                        {plan.kind === "custom_quota"
                          ? t("billing.custom_price_label")
                          : formatYuan(plan.price_cents)}
                      </span>
                    </label>
                    {checked && plan.kind !== "custom_quota" ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-2xs text-ink-3">
                          {t("billing_admin.override_price_label")}
                        </span>
                        <TextInput
                          size="sm"
                          type="number"
                          step="0.01"
                          min="0.01"
                          className="w-24"
                          placeholder={(plan.price_cents / 100).toFixed(2)}
                          value={draft.priceOverridesYuan[plan.id] ?? ""}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              priceOverridesYuan: {
                                ...p.priceOverridesYuan,
                                [plan.id]: e.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-ink">
                  {t("billing_admin.binding_enabled_label")}
                </div>
                <p className="text-2xs text-ink-3">{t("billing_admin.binding_enabled_desc")}</p>
              </div>
              <ToggleSwitch
                checked={draft.enabled}
                onCheckedChange={(checked) => setDraft((p) => ({ ...p, enabled: checked }))}
                ariaLabel={t("billing_admin.binding_enabled_label")}
              />
            </div>

            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-medium text-ink">
                  {t("billing_admin.allow_public_qr_label")}
                </div>
                <p className="text-2xs text-ink-3">{t("billing_admin.allow_public_qr_desc")}</p>
              </div>
              <ToggleSwitch
                checked={draft.allowPublicPay}
                onCheckedChange={(checked) => setDraft((p) => ({ ...p, allowPublicPay: checked }))}
                ariaLabel={t("billing_admin.allow_public_qr_label")}
              />
            </div>
          </div>

          <FormField label={t("billing_admin.binding_note_label")}>
            <Textarea
              rows={2}
              value={draft.note}
              placeholder={t("billing_admin.binding_note_placeholder")}
              onChange={(e) => setDraft((p) => ({ ...p, note: e.target.value }))}
            />
          </FormField>

          <div className={`${surface({ tone: "inset", radius: "xl" })} space-y-2 p-3`}>
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ink">
              <Checkbox
                checked={draft.setExpiresAt}
                onCheckedChange={(checked) => setDraft((p) => ({ ...p, setExpiresAt: checked }))}
              />
              <span>{t("billing_admin.manual_expiry_toggle")}</span>
            </label>
            {draft.setExpiresAt ? (
              <div className="flex flex-wrap items-center gap-2">
                <TextInput
                  type="datetime-local"
                  value={draft.expiresAtLocal}
                  onChange={(e) => setDraft((p) => ({ ...p, expiresAtLocal: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setDraft((p) => ({ ...p, expiresAtLocal: "" }))}
                >
                  {t("billing_admin.clear_expiry")}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(qrTarget)}
        title={t("billing_admin.qr_modal_title")}
        size="sm"
        onClose={() => setQrTarget(null)}
      >
        {qrTarget ? (
          <div className="flex flex-col items-center gap-4 py-1 text-center">
            <div>
              <div className="text-sm font-semibold text-ink">{qrTarget.target_label}</div>
              {qrTarget.key_masked ? (
                <div className="font-mono text-xs text-ink-3">{qrTarget.key_masked}</div>
              ) : null}
            </div>
            <div className="rounded-xl bg-white p-3 shadow-sm ring-1 ring-ink/10">
              <QrCodeSvg
                value={resolvePublicUrl(qrTarget)}
                size={216}
                label={qrTarget.target_label}
              />
            </div>
            <div
              className={`${surface({ tone: "inset", radius: "xl" })} flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs`}
            >
              <span className="truncate font-mono text-ink-2">{resolvePublicUrl(qrTarget)}</span>
              <CopyButton value={resolvePublicUrl(qrTarget)} label={t("common.copy")} />
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  downloadQrPng(resolvePublicUrl(qrTarget), `pay-${qrTarget.public_code}.png`)
                }
              >
                <Icon name="download" size={14} />
                {t("billing_admin.download_qr_png")}
              </Button>
              <a
                href={resolvePublicUrl(qrTarget)}
                target="_blank"
                rel="noreferrer"
                className="sn-btn sn-tertiary sn-sm"
              >
                <Icon name="external-link" size={13} />
                {t("billing_admin.open_pay_page")}
              </a>
              {canWrite ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={rotating}
                  onClick={() => void handleRotateCode(qrTarget)}
                >
                  <Icon name="refresh-cw" size={13} className={rotating ? "animate-spin" : ""} />
                  {t("billing_admin.rotate_qr_code")}
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      <AdjustExpiryModal
        target={adjustTarget}
        onClose={() => setAdjustTarget(null)}
        onSaved={onReload}
      />

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title={t("billing_admin.delete_binding_title")}
        description={t("billing_admin.delete_binding_desc", {
          label: deleteTarget?.target_label ?? "",
        })}
        confirmText={t("common.delete")}
        variant="danger"
        busy={saving}
        onConfirm={() => void confirmDelete()}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  );
}
