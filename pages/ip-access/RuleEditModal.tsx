import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ListChecks, Lock } from "lucide-react";
import { ipAccessApi, type IpAccessRule } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  DetailList,
  FormField,
  Modal,
  Select,
  TextInput,
  surface,
  useToast,
} from "@code-proxy/ui";

/** Extending an existing ban is the common case, so the options are relative. */
const EXTEND_OPTIONS = [
  { value: "", labelKey: "ip_access.expiry_unchanged" },
  { value: "never", labelKey: "ip_access.duration_permanent" },
  { value: "60", labelKey: "ip_access.duration_1h" },
  { value: "360", labelKey: "ip_access.duration_6h" },
  { value: "1440", labelKey: "ip_access.duration_24h" },
  { value: "10080", labelKey: "ip_access.duration_7d" },
] as const;

const EFFECT_BADGE: Record<IpAccessRule["effect"], string> = {
  deny: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
  allow: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
};

/**
 * Edits the fields a rule can meaningfully change: its note and its expiry.
 *
 * The CIDR and effect are deliberately not editable — changing either produces a
 * different rule, and doing it in place would silently rewrite what an audit
 * trail already recorded. Delete and re-create instead.
 *
 * 只读部分用 DetailList 展示（地址、效果、来源、命中次数），可改的有效期下面实时显示保存后的到期时间。
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
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const [note, setNote] = useState("");
  const [expiry, setExpiry] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!rule) return;
    setNote(rule.note ?? "");
    setExpiry("");
    setSubmitError(null);
  }, [rule]);

  const submit = async () => {
    if (!rule) return;
    setSaving(true);
    setSubmitError(null);
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
      setSubmitError(error instanceof Error ? error.message : t("ip_access.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (value: string) => new Date(value).toLocaleString(i18n.language);
  const currentExpiry = rule?.expires_at
    ? t("ip_access.expiry_current", { time: formatTime(rule.expires_at) })
    : t("ip_access.expiry_current_never");
  const expiryDescription =
    expiry === ""
      ? currentExpiry
      : expiry === "never"
        ? t("ip_access.expires_preview_never")
        : t("ip_access.expires_preview", {
            time: formatTime(new Date(Date.now() + Number(expiry) * 60_000).toISOString()),
          });

  return (
    <Modal
      open={rule !== null}
      title={t("ip_access.edit_rule")}
      description={t("ip_access.edit_rule_desc")}
      icon={<ListChecks />}
      size="md"
      onClose={() => {
        if (!saving) onClose();
      }}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="ip-rule-edit-form" variant="primary" loading={saving}>
            {t("ip_access.save_rule")}
          </Button>
        </>
      }
    >
      <form
        id="ip-rule-edit-form"
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {rule ? (
          <div className={`space-y-3 px-4 py-3.5 ${surface({ tone: "inset" })}`}>
            <DetailList
              items={[
                {
                  label: t("ip_access.col_cidr"),
                  value: rule.cidr,
                  mono: true,
                  copyValue: rule.cidr,
                },
                {
                  label: t("ip_access.col_effect"),
                  value: (
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${EFFECT_BADGE[rule.effect]}`}
                    >
                      {t(`ip_access.effect_${rule.effect}`)}
                    </span>
                  ),
                },
                { label: t("ip_access.col_rule_source"), value: t(`ip_access.source_${rule.source}`) },
                {
                  label: t("ip_access.col_hits"),
                  value: new Intl.NumberFormat(i18n.language).format(rule.hit_count),
                },
              ]}
            />
            <p className="flex items-start gap-1.5 text-xs leading-5 text-ink-3">
              <Lock size={12} className="mt-1 shrink-0" aria-hidden="true" />
              <span>{t("ip_access.edit_cidr_locked")}</span>
            </p>
          </div>
        ) : null}

        <FormField label={t("ip_access.form_duration")} description={expiryDescription}>
          <Select
            value={expiry}
            onChange={setExpiry}
            aria-label={t("ip_access.form_duration")}
            options={EXTEND_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
            fullWidth
          />
        </FormField>

        <FormField label={t("ip_access.form_note")} optional reserveMeta={false}>
          <TextInput
            value={note}
            aria-label={t("ip_access.form_note")}
            onChange={(event) => {
              setNote(event.target.value);
              setSubmitError(null);
            }}
            placeholder={t("ip_access.form_note_placeholder")}
          />
        </FormField>

        {submitError ? (
          <Callout tone="danger" role="alert">
            {submitError}
          </Callout>
        ) : null}
      </form>
    </Modal>
  );
}
