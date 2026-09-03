import type { CreateEndUserResult } from "@code-proxy/api-client";
import { Button, Modal } from "@code-proxy/ui";
import { useTranslation } from "react-i18next";

export interface EndUserCreatedSecretsModalProps {
  createdSecrets: CreateEndUserResult | null;
  onClose: () => void;
}

export function EndUserCreatedSecretsModal({
  createdSecrets,
  onClose,
}: EndUserCreatedSecretsModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      open={Boolean(createdSecrets)}
      onClose={onClose}
      title={t("end_users.copy_secrets", { defaultValue: "请立即复制凭证" })}
    >
      {createdSecrets ? (
        <div className="space-y-3 text-sm">
          <p className="font-medium text-amber-600">{t("end_users.secrets_one_time_hint")}</p>
          <div>
            用户名：<code>{createdSecrets.user.username}</code>
          </div>
          {createdSecrets.generated_password ? (
            <div>
              密码：
              <code className="select-all break-all">{createdSecrets.generated_password}</code>
            </div>
          ) : null}
          {createdSecrets.default_api_key?.key ? (
            <div>
              {t("end_users.initial_api_key", { defaultValue: "初始 API Key" })}：
              <code className="select-all break-all">{createdSecrets.default_api_key.key}</code>
            </div>
          ) : null}
          <Button onClick={onClose}>{t("end_users.secrets_copied_close")}</Button>
        </div>
      ) : null}
    </Modal>
  );
}
