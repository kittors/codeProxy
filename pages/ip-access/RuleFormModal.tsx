import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, ListChecks, ShieldCheck } from "lucide-react";
import {
  ipAccessApi,
  type CreateIpAccessRuleBody,
  type IpAccessEffect,
} from "@code-proxy/api-client";
import {
  Button,
  Callout,
  ChoiceCards,
  FormField,
  Modal,
  SegmentedControl,
  TextInput,
  rules,
  useFormValidation,
  useToast,
} from "@code-proxy/ui";
import { describeCidr } from "./cidrPreview";

const DURATION_OPTIONS = [
  { value: "", labelKey: "ip_access.duration_permanent" },
  { value: "60", labelKey: "ip_access.duration_1h" },
  { value: "360", labelKey: "ip_access.duration_6h" },
  { value: "1440", labelKey: "ip_access.duration_24h" },
  { value: "10080", labelKey: "ip_access.duration_7d" },
] as const;

type DurationValue = (typeof DURATION_OPTIONS)[number]["value"];

interface RuleFormModalProps {
  open: boolean;
  preset: { cidr: string; effect: IpAccessEffect } | null;
  onClose: () => void;
  onCreated: () => void;
}

/**
 * 新增 IP 规则。
 *
 * 地址就地校验（IP 或 CIDR），并实时说明会存成什么：「单个 IPv4 地址，保存为 …/32」「IPv4 网段，共 256 个地址」；
 * 拒绝 / 放行用卡片把各自的效果写清楚；有效期是几个快捷选项，下面直接显示到期时间。
 * 保存失败（例如命中受保护地址）显示在弹窗里，而不是一闪而过的 toast。
 */
export function RuleFormModal({ open, preset, onClose, onCreated }: RuleFormModalProps) {
  const { t, i18n } = useTranslation();
  const { notify } = useToast();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [cidr, setCidr] = useState("");
  const [effect, setEffect] = useState<IpAccessEffect>("deny");
  const [note, setNote] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<DurationValue>("");
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const validation = useFormValidation({ cidr }, { cidr: [rules.required(), rules.cidr()] });
  const { reset } = validation;

  useEffect(() => {
    if (!open) return;
    setCidr(preset?.cidr ?? "");
    setEffect(preset?.effect ?? "deny");
    setNote("");
    setDurationMinutes("");
    setSubmitError(null);
    reset();
  }, [open, preset, reset]);

  const preview = validation.issues.cidr ? null : describeCidr(cidr);
  const numberFormat = new Intl.NumberFormat(i18n.language);
  const cidrDescription = preview
    ? preview.single
      ? t(`ip_access.cidr_preview_single_v${preview.family}`, { cidr: preview.normalized })
      : preview.family === 4
        ? t("ip_access.cidr_preview_range_v4", {
            count: preview.addresses ?? 0,
            formatted: numberFormat.format(preview.addresses ?? 0),
          })
        : t("ip_access.cidr_preview_range_v6", { prefix: preview.prefix })
    : t("ip_access.form_cidr_hint");

  const expiryPreview = durationMinutes
    ? t("ip_access.expires_preview", {
        time: new Date(Date.now() + Number(durationMinutes) * 60_000).toLocaleString(i18n.language),
      })
    : t("ip_access.expires_preview_never");

  const submit = async () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    const body: CreateIpAccessRuleBody = { cidr: cidr.trim(), effect, note: note.trim() };
    if (durationMinutes) {
      body.expires_at = new Date(Date.now() + Number(durationMinutes) * 60_000).toISOString();
    }
    setSaving(true);
    setSubmitError(null);
    try {
      const response = await ipAccessApi.createRule(body);
      if (response.warning) {
        notify({ type: "warning", message: response.warning });
      } else {
        notify({ type: "success", message: t("ip_access.rule_created") });
      }
      onCreated();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : t("ip_access.save_failed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={t("ip_access.add_rule")}
      description={t("ip_access.rule_form_desc")}
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
          <Button type="submit" form="ip-rule-form" variant="primary" loading={saving}>
            {t("ip_access.add_rule")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id="ip-rule-form"
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField
          label={t("ip_access.form_cidr")}
          required
          description={cidrDescription}
          error={validation.error("cidr")}
        >
          <TextInput
            value={cidr}
            aria-label={t("ip_access.form_cidr")}
            placeholder="203.0.113.10 / 203.0.113.0/24"
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
            {...validation.bind("cidr")}
            onChange={(event) => {
              setCidr(event.target.value);
              setSubmitError(null);
            }}
          />
        </FormField>

        <FormField label={t("ip_access.form_effect")} reserveMeta={false}>
          <ChoiceCards<IpAccessEffect>
            value={effect}
            onChange={setEffect}
            options={[
              {
                value: "deny",
                label: t("ip_access.effect_deny"),
                description: t("ip_access.form_effect_hint_deny"),
                icon: <Ban />,
              },
              {
                value: "allow",
                label: t("ip_access.effect_allow"),
                description: t("ip_access.form_effect_hint_allow"),
                icon: <ShieldCheck />,
              },
            ]}
          />
        </FormField>

        <FormField
          label={t("ip_access.form_duration")}
          description={`${expiryPreview} · ${t("ip_access.form_duration_hint")}`}
        >
          <SegmentedControl<DurationValue>
            ariaLabel={t("ip_access.form_duration")}
            value={durationMinutes}
            onChange={setDurationMinutes}
            options={DURATION_OPTIONS.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            }))}
          />
        </FormField>

        <FormField label={t("ip_access.form_note")} optional reserveMeta={false}>
          <TextInput
            value={note}
            aria-label={t("ip_access.form_note")}
            onChange={(event) => setNote(event.target.value)}
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
