import { useEffect, useRef } from "react";
import { Gauge, KeyRound, Tag } from "lucide-react";
import type { PeriodSpendingLimits, PeriodSpendingPeriod } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  FormField,
  FormSection,
  Modal,
  TextInput,
  rules,
  useFormValidation,
  type Rule,
} from "@code-proxy/ui";
import { formatQuotaUsd } from "./PeriodSpendingCell";
import {
  PeriodSpendingFields,
  periodSpendingDraftToLimits,
  type PeriodSpendingDraft,
} from "./PeriodSpendingFields";

export interface OwnedApiKeyQuotaForm {
  name: string;
  periods: PeriodSpendingDraft;
}

/**
 * 新建 / 编辑账号名下的 Key（名称 + 四个周期的子额度）。
 *
 * 分两段：先起名字（在请求日志里靠它区分来源），再设子额度。每个周期输入框下面常驻
 * 「账号上限 $X」；超过账号上限、名称为空或与已有 Key 重名，都在对应字段下就地报错
 * （失焦或点提交后出现），不再只是把按钮置灰让人猜原因。服务端拒绝的原因放在表单末尾。
 */
export function OwnedApiKeyQuotaModal({
  t,
  open,
  mode,
  value,
  accountLimits,
  saving,
  serverError,
  existingNames,
  onChange,
  onClose,
  onSubmit,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  mode: "create" | "edit";
  value: OwnedApiKeyQuotaForm;
  accountLimits: PeriodSpendingLimits;
  saving: boolean;
  serverError?: string;
  /** 已有 Key 的名称：传入时在前端拦下重名（比较时忽略大小写与首尾空格）。 */
  existingNames?: string[];
  onChange: (next: OwnedApiKeyQuotaForm) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  const formId = `owned-key-quota-${mode}`;
  const formRef = useRef<HTMLFormElement | null>(null);
  const limits = periodSpendingDraftToLimits(value.periods);
  const takenNames = new Set((existingNames ?? []).map((name) => name.trim().toLowerCase()));

  // Key 子额度不能超过账号同周期的上限（账号该周期不限制时不检查）。
  const withinAccount =
    (period: PeriodSpendingPeriod): Rule<string> =>
    () => {
      const accountLimit = accountLimits[period] ?? 0;
      return limits[period] > 0 && accountLimit > 0 && limits[period] > accountLimit
        ? { key: "exceeds_account_limit", params: { limit: formatQuotaUsd(accountLimit) } }
        : null;
    };
  const validation = useFormValidation(
    { name: value.name, ...value.periods },
    {
      name: [
        rules.required(),
        rules.custom((name: string) => !takenNames.has(name.trim().toLowerCase()) || "duplicate_name"),
      ],
      "5h": [withinAccount("5h")],
      day: [withinAccount("day")],
      week: [withinAccount("week")],
      month: [withinAccount("month")],
    },
  );
  const { reset } = validation;

  useEffect(() => {
    if (open) reset();
  }, [open, reset]);

  const periodErrors: Partial<Record<PeriodSpendingPeriod, string>> = {
    "5h": validation.error("5h"),
    day: validation.error("day"),
    week: validation.error("week"),
    month: validation.error("month"),
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? t("api_keys_page.create_key") : t("api_keys_page.edit_key_quota")}
      description={
        mode === "create"
          ? t("api_keys_page.owned_key_create_desc")
          : t("api_keys_page.owned_key_edit_desc")
      }
      icon={<KeyRound />}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={formId} variant="primary" loading={saving}>
            {mode === "create" ? t("api_keys_page.create_btn") : t("api_keys_page.save_btn")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={formId}
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (!validation.validate()) {
            validation.focusFirstInvalid(formRef.current);
            return;
          }
          onSubmit();
        }}
      >
        <FormSection title={t("api_keys_page.owned_key_basics_section")} icon={<Tag />}>
          <FormField
            label={t("api_keys_page.form_name_label")}
            required
            description={t("api_keys_page.owned_key_name_hint")}
            error={validation.error("name")}
          >
            <TextInput
              value={value.name}
              onChange={(event) => onChange({ ...value, name: event.target.value })}
              placeholder={t("api_keys_page.form_name_placeholder")}
              aria-label={t("api_keys_page.form_name_label")}
              {...validation.bind("name")}
            />
          </FormField>
        </FormSection>

        <FormSection
          title={t("api_keys_page.key_quota_title")}
          description={t("quota.key_fields_hint")}
          icon={<Gauge />}
        >
          <PeriodSpendingFields
            t={t}
            value={value.periods}
            onChange={(periods) => onChange({ ...value, periods })}
            accountLimits={accountLimits}
            errors={periodErrors}
            onFieldBlur={validation.touch}
            idPrefix={`owned-key-${mode}`}
          />
        </FormSection>

        {serverError ? (
          <Callout tone="danger" role="alert">
            {serverError}
          </Callout>
        ) : null}
      </form>
    </Modal>
  );
}
