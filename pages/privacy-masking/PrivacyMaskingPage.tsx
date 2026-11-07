import { useTranslation } from "react-i18next";
import { ShieldOff } from "lucide-react";
import { Button, Callout, EmptyState, PageLoader } from "@code-proxy/ui";
import { useOptionalAuth } from "@app/providers/AuthProvider";
import { useConfigCapabilities } from "@features/backend-capabilities";
import { PrivacyMaskingWorkspace } from "@features/privacy-masking";

/**
 * 「隐私脱敏」页（运行观测下）。
 *
 * 面板会自动更新到最新 release，旧后端没有 /privacy-masking 接口：先看 GET /config 有没有声明
 * `privacy-masking`，没声明就只给一张说明，不发任何请求（旧后端的开关仍在「内容审核 › 密钥脱敏」）；
 * 「读不到声明」和「没声明」分开处理，前者可以重试。
 */
export function PrivacyMaskingPage() {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const capabilities = useConfigCapabilities();
  const canWrite = auth?.can("content_moderation.write") ?? true;

  if (capabilities.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <PageLoader variant="inline" text={t("common.loading")} />
      </div>
    );
  }
  if (capabilities.status === "error") {
    return (
      <Callout
        tone="danger"
        role="alert"
        title={t("privacy_masking.capability_failed")}
        actions={
          <Button size="sm" variant="secondary" onClick={capabilities.reload}>
            {t("common.retry")}
          </Button>
        }
      >
        {capabilities.message}
      </Callout>
    );
  }
  if (!capabilities.capabilities.privacyMasking) {
    return (
      <EmptyState
        icon={<ShieldOff size={20} aria-hidden="true" />}
        title={t("privacy_masking.unsupported_title")}
        description={t("privacy_masking.unsupported_desc")}
      />
    );
  }
  return <PrivacyMaskingWorkspace scope="tenant" canWrite={canWrite} />;
}
