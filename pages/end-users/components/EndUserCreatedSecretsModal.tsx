import type { CreateEndUserResult } from "@code-proxy/api-client";
import { SecretRevealModal } from "@code-proxy/ui";
import { useTranslation } from "react-i18next";

export interface EndUserCreatedSecretsModalProps {
  createdSecrets: CreateEndUserResult | null;
  onClose: () => void;
}

/**
 * 创建账号后一次性展示的凭证：用户名、生成的密码、初始 API Key 各一行、各自可复制，
 * 底部「复制全部」按「名称：值」逐行拼好，方便整段发给用户。用户名本身不是秘密，
 * 一起列出来是为了「复制全部」时交付的是一份完整的登录信息。
 */
export function EndUserCreatedSecretsModal({
  createdSecrets,
  onClose,
}: EndUserCreatedSecretsModalProps) {
  const { t } = useTranslation();

  return (
    <SecretRevealModal
      open={Boolean(createdSecrets)}
      onClose={onClose}
      title={t("end_users.copy_secrets", { defaultValue: "请立即复制凭证" })}
      warning={t("end_users.secrets_one_time_hint")}
      items={[
        { label: t("end_users.username"), value: createdSecrets?.user.username ?? "" },
        { label: t("end_users.password_label"), value: createdSecrets?.generated_password ?? "" },
        {
          label: t("end_users.initial_api_key", { defaultValue: "初始 API Key" }),
          value: createdSecrets?.default_api_key?.key ?? "",
        },
      ]}
    />
  );
}
