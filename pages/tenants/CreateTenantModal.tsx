import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, UserCog } from "lucide-react";
import {
  Button,
  DateTimePicker,
  FormField,
  FormSection,
  Modal,
  TextInput,
  rules,
  useFormValidation,
} from "@code-proxy/ui";
import { displayNameRules, passwordRules, usernameRules } from "@features/identity-rules";
import {
  dateTimeRule,
  futureDateTimeRule,
  TENANT_DESCRIPTION_MAX_BYTES,
  TENANT_NAME_MAX_LENGTH,
} from "./tenantForm";

export const emptyCreateTenantForm = () => ({
  name: "",
  expires_at: "",
  admin_username: "",
  admin_display_name: "",
  admin_password: "",
  description: "",
});
export type CreateTenantForm = ReturnType<typeof emptyCreateTenantForm>;

type DateTimePickerLabels = Parameters<typeof DateTimePicker>[0]["labels"];

/**
 * 新建租户。
 *
 * 六个字段分成两段：「租户信息」（名称、到期时间、描述）和「首个管理员」（建好后用来登录这个租户的账号）。
 * 以前六个输入框混在一个两列网格里、描述排在最后，看不出哪些是租户的、哪些是管理员的。
 * 规则与服务端一致（名称 128 字节、描述 1000 字节、用户名字符集、密码策略、到期时间要晚于现在），
 * 失焦后就地提示，提交时把焦点送到第一处错误。
 */
export function CreateTenantModal({
  open,
  busy,
  locale,
  dateTimePickerLabels,
  onSubmit,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  locale: string;
  dateTimePickerLabels: DateTimePickerLabels;
  /** 返回服务端给出的管理员密码策略错误（没有则 null）。 */
  onSubmit: (form: CreateTenantForm) => Promise<string | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [form, setForm] = useState<CreateTenantForm>(emptyCreateTenantForm);
  const [serverPasswordError, setServerPasswordError] = useState<string | null>(null);
  const validation = useFormValidation(form, {
    name: [rules.required(), rules.maxBytes(TENANT_NAME_MAX_LENGTH)],
    expires_at: [rules.required(), dateTimeRule, futureDateTimeRule],
    admin_username: usernameRules,
    admin_display_name: displayNameRules,
    admin_password: passwordRules,
    description: [rules.maxBytes(TENANT_DESCRIPTION_MAX_BYTES)],
  });
  const { reset } = validation;

  useEffect(() => {
    if (!open) return;
    setForm(emptyCreateTenantForm());
    setServerPasswordError(null);
    reset();
  }, [open, reset]);

  const update = <K extends keyof CreateTenantForm>(key: K, value: CreateTenantForm[K]) =>
    setForm((previous) => ({ ...previous, [key]: value }));

  const submit = async () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    const policyError = await onSubmit(form);
    if (policyError) setServerPasswordError(policyError);
  };

  return (
    <Modal
      open={open}
      title={t("identity_admin.new_tenant")}
      description={t("identity_admin.new_tenant_desc")}
      icon={<Building2 />}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="create-tenant-form" variant="primary" loading={busy}>
            {t("identity_admin.create_tenant")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id="create-tenant-form"
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormSection
          title={t("identity_admin.tenant_section_info")}
          description={t("identity_admin.tenant_section_info_desc")}
          icon={<Building2 />}
        >
          {/* 网格包一层：FormSection 自带 space-y，直接给它加 grid 会和行距叠加。 */}
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label={t("identity_admin.name")}
              required
              error={validation.error("name")}
              description={t("identity_admin.tenant_name_hint")}
            >
              <TextInput
                aria-label={t("identity_admin.name")}
                value={form.name}
                autoComplete="off"
                {...validation.bind("name")}
                onChange={(event) => update("name", event.target.value)}
              />
            </FormField>
            <FormField
              label={t("identity_admin.expires_at")}
              required
              error={validation.error("expires_at")}
              description={t("identity_admin.tenant_expires_hint")}
            >
              <DateTimePicker
                value={form.expires_at}
                onChange={(value) => {
                  update("expires_at", value);
                  validation.touch("expires_at");
                }}
                aria-label={t("identity_admin.expires_at")}
                locale={locale}
                labels={dateTimePickerLabels}
              />
            </FormField>
            <FormField
              label={t("identity_admin.description")}
              optional
              error={validation.error("description")}
              className="md:col-span-2"
              reserveMeta={false}
            >
              <TextInput
                aria-label={t("identity_admin.description")}
                value={form.description}
                {...validation.bind("description")}
                onChange={(event) => update("description", event.target.value)}
              />
            </FormField>
          </div>
        </FormSection>

        <FormSection
          title={t("identity_admin.tenant_section_admin")}
          description={t("identity_admin.tenant_section_admin_desc")}
          icon={<UserCog />}
        >
          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              label={t("identity_admin.admin_username")}
              required
              error={validation.error("admin_username")}
              description={t("identity_admin.username_hint")}
            >
              <TextInput
                aria-label={t("identity_admin.admin_username")}
                value={form.admin_username}
                autoComplete="off"
                spellCheck={false}
                {...validation.bind("admin_username")}
                onChange={(event) => update("admin_username", event.target.value)}
              />
            </FormField>
            <FormField
              label={t("identity_admin.admin_display_name")}
              required
              error={validation.error("admin_display_name")}
              description={t("identity_admin.display_name_hint")}
            >
              <TextInput
                aria-label={t("identity_admin.admin_display_name")}
                value={form.admin_display_name}
                autoComplete="off"
                {...validation.bind("admin_display_name")}
                onChange={(event) => update("admin_display_name", event.target.value)}
              />
            </FormField>
            <FormField
              label={t("identity_admin.admin_password")}
              required
              error={validation.error("admin_password") ?? serverPasswordError ?? undefined}
              description={t("identity_admin.password_requirement")}
              className="md:col-span-2"
            >
              <TextInput
                aria-label={t("identity_admin.admin_password")}
                type="password"
                value={form.admin_password}
                autoComplete="new-password"
                {...validation.bind("admin_password")}
                onChange={(event) => {
                  update("admin_password", event.target.value);
                  setServerPasswordError(null);
                }}
              />
            </FormField>
          </div>
        </FormSection>
      </form>
    </Modal>
  );
}
