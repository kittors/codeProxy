import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Lock, ShieldCheck, UserX } from "lucide-react";
import type { UserIdentity } from "@code-proxy/api-client";
import {
  Button,
  Callout,
  ConfirmModal,
  FormField,
  Modal,
  MultiSelect,
  TextInput,
  useFormValidation,
  type MultiSelectOption,
} from "@code-proxy/ui";
import { passwordRules } from "@features/identity-rules";

/** 确认框里的「被操作的人」：显示名 + 等宽用户名，一眼认出是谁。 */
function UserSubject({ name, username }: { name: string; username: string }) {
  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate font-medium">{name}</span>
      <span className="shrink-0 font-mono text-xs text-ink-3">{username}</span>
    </span>
  );
}

/**
 * 管理员替别人重置密码。
 *
 * 重置会立刻踢掉对方所有登录、并要求他下次登录先改密码（服务端行为），所以图标块用琥珀色，
 * 后果写在输入框下面，而不是只有一个「新密码」输入框和一个「保存」。
 */
export function ResetPasswordModal({
  user,
  name,
  busy,
  onSubmit,
  onClose,
}: {
  user: UserIdentity | null;
  name: string;
  busy: boolean;
  /** 返回服务端给出的密码策略错误（没有则 null）。 */
  onSubmit: (password: string) => Promise<string | null>;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [password, setPassword] = useState("");
  const [serverError, setServerError] = useState<string | null>(null);
  const validation = useFormValidation({ password }, { password: passwordRules });
  const { reset } = validation;

  useEffect(() => {
    if (!user) return;
    setPassword("");
    setServerError(null);
    reset();
  }, [user, reset]);

  const submit = async () => {
    if (!validation.validate()) {
      validation.focusFirstInvalid(formRef.current);
      return;
    }
    const policyError = await onSubmit(password);
    if (policyError) setServerError(policyError);
  };

  return (
    <Modal
      open={user !== null}
      title={t("identity_admin.reset_password")}
      description={
        user
          ? t("identity_admin.reset_password_desc", { name, username: user.username })
          : undefined
      }
      icon={<KeyRound />}
      tone="warning"
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" form="reset-user-password-form" variant="primary" loading={busy}>
            {t("identity_admin.reset_password")}
          </Button>
        </>
      }
    >
      <form
        ref={formRef}
        id="reset-user-password-form"
        className="space-y-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <FormField
          label={t("identity_admin.new_password")}
          required
          description={t("identity_admin.password_requirement")}
          error={validation.error("password") ?? serverError ?? undefined}
        >
          <TextInput
            type="password"
            value={password}
            autoComplete="new-password"
            {...validation.bind("password")}
            onChange={(event) => {
              setPassword(event.target.value);
              setServerError(null);
            }}
          />
        </FormField>
        <Callout tone="warning">{t("identity_admin.reset_password_effects")}</Callout>
      </form>
    </Modal>
  );
}

/**
 * 设置用户角色。只列出当前操作者可以委托的角色（他自己拥有其全部权限的租户角色）；
 * 受保护的账号（自己、超级管理员、租户管理员）整组锁定，并在上方说明锁定原因——
 * 以前只是控件变灰，用户不知道为什么改不了。
 */
export function SetRolesModal({
  user,
  busy,
  roleOptions,
  lockedReason,
  onSubmit,
  onClose,
}: {
  user: UserIdentity | null;
  busy: boolean;
  roleOptions: MultiSelectOption[];
  /** 不能修改时的原因；null 表示可以修改。 */
  lockedReason: string | null;
  onSubmit: (roleIds: string[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<string[]>([]);

  useEffect(() => {
    if (user) setDraft([...(user.role_ids ?? [])]);
  }, [user]);

  return (
    <Modal
      open={user !== null}
      title={t("identity_admin.set_roles_title")}
      description={
        user ? t("identity_admin.set_roles_description", { username: user.username }) : undefined
      }
      icon={<ShieldCheck />}
      size="sm"
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button
            type="submit"
            form="set-user-roles-form"
            variant="primary"
            loading={busy}
            disabled={Boolean(lockedReason)}
          >
            {t("identity_admin.save_roles")}
          </Button>
        </>
      }
    >
      <form
        id="set-user-roles-form"
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (lockedReason) return;
          onSubmit(draft);
        }}
      >
        {lockedReason ? (
          <Callout tone="neutral" icon={<Lock />}>
            {lockedReason}
          </Callout>
        ) : null}
        <FormField
          label={t("identity_admin.roles")}
          reserveMeta={false}
          description={
            roleOptions.length
              ? t("identity_admin.user_roles_hint")
              : t("identity_admin.user_roles_none_assignable")
          }
        >
          <MultiSelect
            options={roleOptions}
            value={draft}
            emptyLabel={t("identity_admin.no_role")}
            selectAllLabel={t("identity_admin.no_role")}
            disabled={Boolean(lockedReason)}
            onChange={setDraft}
          />
        </FormField>
      </form>
    </Modal>
  );
}

/**
 * 停用：账号和角色都保留、随时可以重新启用，所以是琥珀色 + 「用户停用」图标，
 * 不是删除用的红色垃圾桶。
 */
export function DisableUserConfirm({
  user,
  name,
  busy,
  onConfirm,
  onClose,
}: {
  user: UserIdentity | null;
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open={user !== null}
      title={t("identity_admin.disable_user")}
      description={t("identity_admin.disable_user_lead")}
      variant="warning"
      icon={<UserX />}
      subject={user ? <UserSubject name={name} username={user.username} /> : null}
      consequences={[
        t("identity_admin.disable_user_consequence_sessions"),
        t("identity_admin.disable_user_consequence_restore"),
      ]}
      confirmText={t("identity_admin.disable_user_confirm_button")}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}

export function DeleteUserConfirm({
  user,
  name,
  busy,
  onConfirm,
  onClose,
}: {
  user: UserIdentity | null;
  name: string;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open={user !== null}
      title={t("identity_admin.delete_user_title", { name })}
      description={t("identity_admin.delete_lead")}
      subject={user ? <UserSubject name={name} username={user.username} /> : null}
      consequences={[
        t("identity_admin.delete_user_consequence_account"),
        t("identity_admin.delete_user_consequence_disable_instead"),
      ]}
      confirmText={t("identity_admin.delete_user")}
      busy={busy}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
