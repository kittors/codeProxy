import { KeyRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { EndUser } from "@code-proxy/api-client";
import { ConfirmModal, SecretRevealModal } from "@code-proxy/ui";

/** 确认框里的账号卡片：昵称 + 等宽的用户名（登录用的那个）。 */
function EndUserSubject({ user }: { user: EndUser | null }) {
  if (!user) return null;
  return (
    <span className="flex min-w-0 items-center justify-between gap-3">
      <span className="truncate font-medium">{user.display_name || user.username}</span>
      <code className="shrink-0 font-mono text-xs text-ink-3">{user.username}</code>
    </span>
  );
}

/**
 * 重置用户密码。不删任何东西、之后还能再改，但会让该账号所有会话失效：属于「可恢复但
 * 影响大」，用琥珀色 + 钥匙图标，不用删除的红色垃圾桶。
 */
export function EndUserResetPasswordModal({
  user,
  busy,
  onClose,
  onConfirm,
}: {
  user: EndUser | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open={Boolean(user)}
      onClose={onClose}
      title={t("end_users.reset_password_title")}
      description={t("end_users.reset_password_lead")}
      variant="warning"
      icon={<KeyRound />}
      subject={<EndUserSubject user={user} />}
      consequences={[
        t("end_users.reset_password_consequence_sessions"),
        t("end_users.reset_password_consequence_once"),
      ]}
      confirmText={t("end_users.reset_password")}
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}

/** 重置后的新密码：只显示这一次。 */
export function EndUserNewPasswordModal({
  password,
  onClose,
}: {
  password: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SecretRevealModal
      open={Boolean(password)}
      onClose={onClose}
      title={t("end_users.new_password_title", { defaultValue: "新密码（请立即复制）" })}
      secret={password}
      secretLabel={t("end_users.new_password_label")}
      warning={t("end_users.new_password_warning", {
        defaultValue: "请立即复制新密码，关闭后将无法再次查看。",
      })}
    />
  );
}

/** 删除用户账号：不可恢复，红色；后果写明名下 Key 的去向。 */
export function EndUserDeleteModal({
  user,
  busy,
  onClose,
  onConfirm,
}: {
  user: EndUser | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  return (
    <ConfirmModal
      open={Boolean(user)}
      onClose={onClose}
      title={t("end_users.delete_title", { defaultValue: "删除用户账号" })}
      description={t("end_users.delete_lead")}
      subject={<EndUserSubject user={user} />}
      consequences={[t("end_users.delete_consequence_keys")]}
      confirmText={t("end_users.delete_confirm")}
      busy={busy}
      onConfirm={onConfirm}
    />
  );
}
