import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ipAccessApi,
  type CreateIpAccessRuleBody,
  type IpAccessEffect,
} from "@code-proxy/api-client";
import { Button, Modal, Select, TextInput, useToast } from "@code-proxy/ui";

const DURATION_OPTIONS = [
  { value: "", labelKey: "ip_access.duration_permanent" },
  { value: "60", labelKey: "ip_access.duration_1h" },
  { value: "360", labelKey: "ip_access.duration_6h" },
  { value: "1440", labelKey: "ip_access.duration_24h" },
  { value: "10080", labelKey: "ip_access.duration_7d" },
] as const;

interface RuleFormModalProps {
  open: boolean;
  preset: { cidr: string; effect: IpAccessEffect } | null;
  onClose: () => void;
  onCreated: () => void;
}

export function RuleFormModal({ open, preset, onClose, onCreated }: RuleFormModalProps) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [cidr, setCidr] = useState("");
  const [effect, setEffect] = useState<IpAccessEffect>("deny");
  const [note, setNote] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCidr(preset?.cidr ?? "");
    setEffect(preset?.effect ?? "deny");
    setNote("");
    setDurationMinutes("");
  }, [open, preset]);

  const submit = async () => {
    const trimmed = cidr.trim();
    if (!trimmed) {
      notify({ type: "error", message: t("ip_access.cidr_required") });
      return;
    }
    const body: CreateIpAccessRuleBody = { cidr: trimmed, effect, note: note.trim() };
    if (durationMinutes) {
      body.expires_at = new Date(Date.now() + Number(durationMinutes) * 60_000).toISOString();
    }
    setSaving(true);
    try {
      const response = await ipAccessApi.createRule(body);
      if (response.warning) {
        notify({ type: "warning", message: response.warning });
      } else {
        notify({ type: "success", message: t("ip_access.rule_created") });
      }
      onCreated();
    } catch (error) {
      notify({
        type: "error",
        message: error instanceof Error ? error.message : t("ip_access.save_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("ip_access.add_rule")}
      maxWidth="max-w-lg"
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={saving}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <Field label={t("ip_access.form_cidr")} hint={t("ip_access.form_cidr_hint")}>
          <TextInput
            value={cidr}
            onChange={(event) => setCidr(event.target.value)}
            placeholder="203.0.113.10 / 203.0.113.0/24"
            className="font-mono"
          />
        </Field>

        <Field label={t("ip_access.form_effect")} hint={t(`ip_access.form_effect_hint_${effect}`)}>
          <Select
            value={effect}
            onChange={(value) => setEffect(value as IpAccessEffect)}
            options={[
              { value: "deny", label: t("ip_access.effect_deny") },
              { value: "allow", label: t("ip_access.effect_allow") },
            ]}
            fullWidth
          />
        </Field>

        <Field label={t("ip_access.form_duration")} hint={t("ip_access.form_duration_hint")}>
          <Select
            value={durationMinutes}
            onChange={setDurationMinutes}
            options={DURATION_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            fullWidth
          />
        </Field>

        <Field label={t("ip_access.form_note")}>
          <TextInput
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("ip_access.form_note_placeholder")}
          />
        </Field>
      </div>
    </Modal>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-sm font-medium text-slate-700 dark:text-white/80">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}
