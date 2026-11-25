import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarClock, Infinity as InfinityIcon, Minus, Plus } from "@code-proxy/ui/icons";
import { billingAdminApi, type BillingBinding } from "@code-proxy/api-client";
import { Button, FormField, Modal, SegmentedControl, TextInput, surface, useToast } from "@code-proxy/ui";
import { formatExpiryRemaining } from "@features/portal-billing";

const QUICK_ADD_DAYS = [7, 15, 30, 60, 90, 180, 365] as const;
const QUICK_SUB_DAYS = [-7, -30] as const;

const toLocalDatetimeInput = (iso: string | null | undefined): string => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export function AdjustExpiryModal({
  target,
  onClose,
  onSaved,
}: {
  target: BillingBinding | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [mode, setMode] = useState<"add_days" | "set">("add_days");
  const [deltaDaysText, setDeltaDaysText] = useState("30");
  const [exactLocal, setExactLocal] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!target) return;
    setMode("add_days");
    setDeltaDaysText("30");
    setExactLocal(toLocalDatetimeInput(target.expires_at));
  }, [target]);

  const parsedDelta = Number.parseInt(deltaDaysText, 10);
  const deltaValid =
    Number.isFinite(parsedDelta) && parsedDelta !== 0 && Math.abs(parsedDelta) <= 3650;

  const previewDate = useMemo(() => {
    if (!target) return null;
    if (mode === "set") {
      if (!exactLocal) return null;
      const d = new Date(exactLocal);
      return Number.isNaN(d.getTime()) ? null : d;
    }
    if (!deltaValid) return null;
    const now = new Date();
    const currentMs = target.expires_at ? Date.parse(target.expires_at) : Number.NaN;
    let baseMs = now.getTime();
    if (!Number.isNaN(currentMs)) {
      if (parsedDelta > 0) {
        if (currentMs > baseMs) baseMs = currentMs;
      } else {
        baseMs = currentMs;
      }
    }
    return new Date(baseMs + parsedDelta * 24 * 3600 * 1000);
  }, [deltaValid, exactLocal, mode, parsedDelta, target]);

  const currentExpiry = formatExpiryRemaining(target?.expires_at, t);

  const submit = async (clearToUnlimited = false) => {
    if (!target) return;
    setSaving(true);
    try {
      if (clearToUnlimited) {
        await billingAdminApi.adjustEntitlement({
          target_kind: target.target_kind,
          target_id: target.target_id,
          mode: "set",
          expires_at: null,
        });
      } else if (mode === "add_days") {
        if (!deltaValid) return;
        await billingAdminApi.adjustEntitlement({
          target_kind: target.target_kind,
          target_id: target.target_id,
          mode: "add_days",
          delta_days: parsedDelta,
        });
      } else {
        const iso = exactLocal ? new Date(exactLocal).toISOString() : null;
        await billingAdminApi.adjustEntitlement({
          target_kind: target.target_kind,
          target_id: target.target_id,
          mode: "set",
          expires_at: iso,
        });
      }
      notify({ type: "success", message: t("billing_admin.expiry_adjusted") });
      onClose();
      await onSaved();
    } catch (err) {
      notify({
        type: "error",
        message: err instanceof Error ? err.message : t("billing_admin.expiry_adjust_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(target)}
      title={t("billing_admin.adjust_expiry_title")}
      size="sm"
      onClose={onClose}
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={saving || !target?.expires_at}
            onClick={() => void submit(true)}
          >
            <InfinityIcon size={14} />
            {t("billing_admin.clear_expiry")}
          </Button>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={onClose}>
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={saving || (mode === "add_days" && !deltaValid)}
              onClick={() => void submit(false)}
            >
              {saving ? t("common.saving") : t("billing_admin.confirm_adjust_expiry")}
            </Button>
          </div>
        </div>
      }
    >
      {target ? (
        <div className="space-y-4">
          <div className={`${surface({ tone: "inset", radius: "xl" })} space-y-1 px-3.5 py-2.5 text-xs`}>
            <div className="font-semibold text-ink">
              {target.target_label}
              {target.key_masked ? (
                <span className="ml-1.5 font-mono font-normal text-ink-3">{target.key_masked}</span>
              ) : null}
            </div>
            <div className="flex items-center gap-1.5 text-ink-2">
              <CalendarClock size={13} className="shrink-0 text-ink-3" />
              <span>
                {t("billing_admin.current_expiry_line", {
                  value: target.expires_at
                    ? `${new Date(target.expires_at).toLocaleString()} (${currentExpiry?.text ?? ""})`
                    : t("billing.no_expiry_limit"),
                })}
              </span>
            </div>
          </div>

          <SegmentedControl
            size="sm"
            className="w-full"
            ariaLabel={t("billing_admin.adjust_expiry_title")}
            value={mode}
            onChange={(next) => setMode(next)}
            options={[
              { value: "add_days", label: t("billing_admin.adjust_mode_days") },
              { value: "set", label: t("billing_admin.adjust_mode_exact") },
            ]}
          />

          {mode === "add_days" ? (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="text-2xs font-medium text-ink-3">
                  {t("billing_admin.quick_extend_days")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {QUICK_ADD_DAYS.map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={parsedDelta === d ? "primary" : "secondary"}
                      onClick={() => setDeltaDaysText(String(d))}
                    >
                      <Plus size={12} />
                      {t("billing.days_short", { days: d })}
                    </Button>
                  ))}
                  {QUICK_SUB_DAYS.map((d) => (
                    <Button
                      key={d}
                      size="sm"
                      variant={parsedDelta === d ? "primary" : "secondary"}
                      onClick={() => setDeltaDaysText(String(d))}
                    >
                      <Minus size={12} />
                      {t("billing.days_short", { days: Math.abs(d) })}
                    </Button>
                  ))}
                </div>
              </div>

              <FormField
                label={t("billing_admin.custom_delta_days_label")}
                description={t("billing_admin.custom_delta_days_desc")}
              >
                <TextInput
                  type="number"
                  min={-3650}
                  max={3650}
                  value={deltaDaysText}
                  onChange={(e) => setDeltaDaysText(e.target.value)}
                />
              </FormField>
            </div>
          ) : (
            <FormField
              label={t("billing_admin.exact_expiry_label")}
              description={t("billing_admin.exact_expiry_desc")}
            >
              <TextInput
                type="datetime-local"
                value={exactLocal}
                onChange={(e) => setExactLocal(e.target.value)}
              />
            </FormField>
          )}

          <div
            className={`${surface({ tone: "inset", radius: "xl" })} flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs`}
          >
            <span className="text-ink-3">{t("billing_admin.preview_new_expiry")}</span>
            <span className="font-mono font-semibold text-ink">
              {previewDate ? previewDate.toLocaleString() : t("billing.no_expiry_limit")}
            </span>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
