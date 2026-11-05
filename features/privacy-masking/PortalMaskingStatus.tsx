import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Building2, Lock, RotateCcw, UserRoundCheck } from "lucide-react";
import { Button, Callout, ConfirmModal } from "@code-proxy/ui";
import type { MaskingSettingsView } from "./source";

/**
 * 门户设置页最上面的一条：现在生效的是谁的设置、能不能改，以及门户用户看不到的那部分。
 *
 * - 管理员没开放（allowed 为 false）：只读。请求按管理员的设置脱敏；之前存过的设置服务器还留着，
 *   只是不生效，重新开放后恢复。记录照样能看。
 * - 还没自己设过（own 为 false）：显示的是管理员的默认设置，保存后才成为自己的，之后管理员再改
 *   默认设置就不影响这个用户了。
 * - 自己设过：可以删掉，回到管理员的默认设置，先确认。
 *
 * 管理员的脱敏词、自定义规则和「从不脱敏」对这个用户照样生效，但服务器不给门户看（免得用试一试
 * 把没公开的词试出来），所以每种情况都写明，不让用户以为「我这里没填就不会遮」。
 */
export function PortalMaskingStatus({
  settings,
  busy,
  onReset,
}: {
  settings: MaskingSettingsView;
  busy: boolean;
  /** 没有时不给「恢复默认设置」。 */
  onReset?: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);

  const hidden = (
    <span className="mt-1 block text-ink-3">{t("privacy_masking.portal.hidden_note")}</span>
  );

  if (!settings.allowed) {
    return (
      <Callout
        tone="info"
        role="status"
        icon={<Lock />}
        title={t("privacy_masking.portal.readonly_title")}
      >
        {t("privacy_masking.portal.readonly_desc")}
        {hidden}
      </Callout>
    );
  }

  return (
    <>
      <Callout
        tone="neutral"
        icon={settings.own ? <UserRoundCheck /> : <Building2 />}
        title={
          settings.own
            ? t("privacy_masking.portal.own_title")
            : t("privacy_masking.portal.default_title")
        }
        actions={
          settings.own && onReset ? (
            <Button
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirming(true)}
            >
              <RotateCcw size={14} aria-hidden="true" />
              {t("privacy_masking.portal.reset")}
            </Button>
          ) : null
        }
      >
        {settings.own
          ? t("privacy_masking.portal.own_desc")
          : t("privacy_masking.portal.default_desc")}
        {hidden}
      </Callout>
      <ConfirmModal
        open={confirming && !!onReset}
        variant="warning"
        title={t("privacy_masking.portal.reset_title")}
        description={t("privacy_masking.portal.reset_desc")}
        confirmText={t("privacy_masking.portal.reset_confirm")}
        busy={busy}
        onConfirm={() => void onReset?.().finally(() => setConfirming(false))}
        onClose={() => setConfirming(false)}
      />
    </>
  );
}
