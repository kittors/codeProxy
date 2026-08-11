import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ipAccessApi, type IpAccessRule } from "@code-proxy/api-client";
import { Button, Modal, Select, TextInput, useToast } from "@code-proxy/ui";

/** Extending an existing ban is the common case, so the options are relative. */
const EXTEND_OPTIONS = [
  { value: "", labelKey: "ip_access.expiry_unchanged" },
  { value: "never", labelKey: "ip_access.duration_permanent" },
  { value: "60", labelKey: "ip_access.duration_1h" },
  { value: "360", labelKey: "ip_access.duration_6h" },
  { value: "1440", labelKey: "ip_access.duration_24h" },
  { value: "10080", labelKey: "ip_access.duration_7d" },
] as const;

/**
 * Edits the fields a rule can meaningfully change: its note and its expiry.
 *
 * The CIDR and effect are deliberately not editable — changing either produces a
 * different rule, and doing it in place would silently rewrite what an audit
 * trail already recorded. Delete and re-create instead.
 */
export function RuleEditModal({
  rule,
  onClose,
  onSaved,
}: {
  rule: IpAccessRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!rule) return;
    setNote(rule.note ?? "");
    setExpiry("");
  }, [rule]);

  const submit = async () => {
    if (!rule) return;
    setSaving(true);
    try {
      const body: { note?: string; expires_at?: string } = { note: note.trim() };
      if (expiry === "never") {
        body.expires_at = "";
      } else if (expiry) {
        body.expires_at = new Date(Date.now() + Number(expiry) * 60_000).toISOString();
      }
      await ipAccessApi.updateRule(rule.id, body);
      notify({ type: "success", message: t("ip_access.rule_updated") });
      onSaved();
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
      open={rule !== null}
      title={t("ip_access.edit_rule")}
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
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("ip_access.col_cidr")}
          </span>
          <p className="font-mono text-sm text-slate-900 dark:text-white">{rule?.cidr}</p>
          <p className="text-xs text-slate-500">{t("ip_access.edit_cidr_locked")}</p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("ip_access.form_duration")}
          </label>
          <Select
            value={expiry}
            onChange={setExpiry}
            options={EXTEND_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            fullWidth
          />
          <p className="text-xs text-slate-500">
            {rule?.expires_at
              ? t("ip_access.expiry_current", {
                  time: new Date(rule.expires_at).toLocaleString(),
                })
              : t("ip_access.expiry_current_never")}
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-slate-700 dark:text-white/80">
            {t("ip_access.form_note")}
          </label>
          <TextInput
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("ip_access.form_note_placeholder")}
          />
        </div>
      </div>
    </Modal>
  );
}
