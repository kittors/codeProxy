import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { contentModerationApi, type SecretMaskingState } from "@code-proxy/api-client";
import { ToggleSwitch, useToast } from "@code-proxy/ui";

/**
 * 租户的出站密钥脱敏开关。只在后端声明 secret_masking 时挂载（见 ContentModerationPage）：
 * 旧后端没有这个接口。占位符密钥由后端生成和保管，面板只开关。
 */
export function SecretMaskingSwitch({ canWrite }: { canWrite: boolean }) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const [state, setState] = useState<SecretMaskingState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    contentModerationApi.getSecretMasking().then(
      (loaded) => {
        if (!cancelled) setState(loaded);
      },
      (error: unknown) => {
        if (cancelled) return;
        notify({
          type: "error",
          message:
            error instanceof Error
              ? error.message
              : t("content_moderation.secret_masking.load_failed"),
        });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [notify, t]);

  // 读不到当前状态时不画开关：画出来就得猜一个开或关。
  if (!state) return null;

  const toggle = async (next: boolean) => {
    setSaving(true);
    try {
      setState(await contentModerationApi.setSecretMasking(next));
      notify({
        type: "success",
        message: t(
          next
            ? "content_moderation.secret_masking.enabled_toast"
            : "content_moderation.secret_masking.disabled_toast",
        ),
      });
    } catch (error) {
      notify({
        type: "error",
        message:
          error instanceof Error
            ? error.message
            : t("content_moderation.secret_masking.save_failed"),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ToggleSwitch
      checked={state.enabled}
      disabled={!canWrite || !state.persistent || saving}
      label={t("content_moderation.secret_masking.label")}
      description={t("content_moderation.secret_masking.description")}
      onCheckedChange={(next) => void toggle(next)}
    />
  );
}
