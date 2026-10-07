import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, ShieldCheck, UserPlus, UserRound, Wand2 } from "lucide-react";
import {
  Button,
  ChoiceCards,
  FormField,
  FormSection,
  Modal,
  MultiSelect,
  TextInput,
  useFormValidation,
  type MultiSelectOption,
} from "@code-proxy/ui";
import { displayNameRules, passwordRules, usernameRules } from "@features/identity-rules";
import {
  emptyCreateUserForm,
  IDENTITY_DISPLAY_NAME_MAX_BYTES,
  IDENTITY_USERNAME_MAX_BYTES,
  normalizeUsername,
  utf8ByteLength,
  type CreateUserForm,
  type PasswordMode,
} from "./userForm";

const FORM_ID = "create-user-form";

/**
 * 新建管理端用户。
 *
 * 按「这是谁 → 怎么登录 → 能做什么」分三段：账号、初始密码、角色。初始密码方式用卡片单选，
 * 两种方式各自会发生什么直接写在卡片上（自动生成的密码只显示一次）。字段失焦后就地校验，
 * 服务端拒绝的密码（策略和前端不一致时）也显示在密码框下面，而不是一条英文 toast。
 */
export function CreateUserModal({
  open,
  busy,
  showRoles,
  roleOptions,
  onSubmit,
  onClose,
}: {
  open: boolean;
  busy: boolean;
  /** 有读取并分配角色的权限时才显示角色分区。 */
  showRoles: boolean;
  roleOptions: MultiSelectOption[];
  /** 返回服务端给出的密码策略错误（没有则 null），显示在密码框下。 */
  onSubmit: (form: CreateUserForm) => Promise<string | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const focusPasswordRef = useRef(false);
  const [form, setForm] = useState<CreateUserForm>(emptyCreateUserForm);
  const [serverPasswordError, setServerPasswordError] = useState<string | null>(null);
  const validation = useFormValidation(form, {
    username: usernameRules,
    displayName: displayNameRules,
    // 自动生成时密码由服务端产生，不校验这一项。
    password: form.passwordMode === "manual" ? passwordRules : undefined,
  });
  const { reset } = validation;

  useEffect(() => {
    if (!open) return;
    setForm(emptyCreateUserForm());
    setServerPasswordError(null);
    reset();
  }, [open, reset]);

  // 切到「手动设置」后密码框才出现，顺手把焦点送过去，省一次点击。
  useEffect(() => {
    if (form.passwordMode !== "manual" || !focusPasswordRef.current) return;
    focusPasswordRef.current = false;
    passwordRef.current?.focus();
  }, [form.passwordMode]);

  const update = (patch: Partial<CreateUserForm>) =>
    setForm((previous) => ({ ...previous, ...patch }));

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
      title={t("identity_admin.new_user")}
      description={t("identity_admin.new_user_desc")}
      icon={<UserPlus />}
      size="md"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form={FORM_ID} variant="primary" loading={busy}>
            {t("identity_admin.create_user")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id={FORM_ID}
        className="space-y-6"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormSection
          title={t("identity_admin.user_section_account")}
          description={t("identity_admin.user_section_account_desc")}
          icon={<UserRound />}
        >
          <FormField
            label={t("identity_admin.username")}
            required
            description={t("identity_admin.username_hint")}
            error={validation.error("username")}
            maxLength={IDENTITY_USERNAME_MAX_BYTES}
            valueLength={utf8ByteLength(form.username)}
          >
            <TextInput
              value={form.username}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => update({ username: event.target.value })}
              onBlur={() => {
                validation.touch("username");
                // 与服务端一致：保存的是去掉首尾空格、转成小写后的用户名，失焦时先让用户看到。
                setForm((previous) => ({
                  ...previous,
                  username: normalizeUsername(previous.username),
                }));
              }}
            />
          </FormField>
          <FormField
            label={t("identity_admin.display_name")}
            required
            description={t("identity_admin.display_name_hint")}
            error={validation.error("displayName")}
            maxLength={IDENTITY_DISPLAY_NAME_MAX_BYTES}
            valueLength={utf8ByteLength(form.displayName)}
          >
            <TextInput
              value={form.displayName}
              autoComplete="off"
              {...validation.bind("displayName")}
              onChange={(event) => update({ displayName: event.target.value })}
            />
          </FormField>
        </FormSection>

        <FormSection
          title={t("identity_admin.initial_password_mode")}
          description={t("identity_admin.user_section_password_desc")}
          icon={<KeyRound />}
        >
          <ChoiceCards<PasswordMode>
            ariaLabel={t("identity_admin.initial_password_mode")}
            value={form.passwordMode}
            onChange={(passwordMode) => {
              focusPasswordRef.current = passwordMode === "manual";
              update(passwordMode === "auto" ? { passwordMode, password: "" } : { passwordMode });
              setServerPasswordError(null);
            }}
            options={[
              {
                value: "auto",
                label: t("identity_admin.password_mode_auto"),
                description: t("identity_admin.password_mode_auto_desc"),
                icon: <Wand2 />,
              },
              {
                value: "manual",
                label: t("identity_admin.password_mode_manual"),
                description: t("identity_admin.password_mode_manual_desc"),
                icon: <KeyRound />,
              },
            ]}
          />
          {form.passwordMode === "manual" ? (
            <FormField
              label={t("identity_admin.initial_password")}
              required
              description={t("identity_admin.password_requirement")}
              error={validation.error("password") ?? serverPasswordError ?? undefined}
            >
              <TextInput
                ref={passwordRef}
                type="password"
                value={form.password}
                autoComplete="new-password"
                {...validation.bind("password")}
                onChange={(event) => {
                  update({ password: event.target.value });
                  setServerPasswordError(null);
                }}
              />
            </FormField>
          ) : null}
        </FormSection>

        {showRoles ? (
          <FormSection
            title={t("identity_admin.roles")}
            description={t("identity_admin.user_section_roles_desc")}
            icon={<ShieldCheck />}
          >
            <FormField
              label={t("identity_admin.roles")}
              optional
              description={
                roleOptions.length
                  ? t("identity_admin.user_roles_hint")
                  : t("identity_admin.user_roles_none_assignable")
              }
            >
              {/* MultiSelect 默认把「空」读作「全部」（为模型筛选设计）；这里空就是不分配角色。 */}
              <MultiSelect
                options={roleOptions}
                value={form.roleIds}
                emptyLabel={t("identity_admin.no_role")}
                selectAllLabel={t("identity_admin.no_role")}
                disabled={roleOptions.length === 0}
                onChange={(roleIds) => update({ roleIds })}
              />
            </FormField>
          </FormSection>
        ) : null}
      </form>
    </Modal>
  );
}
