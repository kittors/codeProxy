import { ErrorDetailModal, LogContentModal } from "@features/log-content-viewer";
import type { useApiKeyUsageView } from "../hooks/useApiKeyUsageView";
import { ApiKeyUsageModal } from "./ApiKeyUsageModal";

/**
 * 「查看用量」整套弹窗：用量与日志表，以及从表里点开的日志内容 / 错误详情。
 *
 * API Key 页和用户账号页都用 useApiKeyUsageView 驱动同一套弹窗，以前两边各把
 * 三十多个状态逐个传一遍；hook 的字段名与弹窗参数一一对应，这里整体转交。
 */
export function ApiKeyUsageDialogs({
  view,
  maskedKey,
}: {
  view: ReturnType<typeof useApiKeyUsageView>;
  /** 描述里显示的 Key（单把 Key 的掩码，或「账号下全部密钥」）。 */
  maskedKey: string;
}) {
  return (
    <>
      <ApiKeyUsageModal
        {...view}
        open={view.usageViewKey !== null}
        onClose={view.closeUsageModal}
        maskedKey={maskedKey}
      />
      <LogContentModal
        open={view.usageContentModalOpen}
        logId={view.usageContentModalLogId}
        displayModel={view.usageContentModalModel}
        initialTab={view.usageContentModalTab}
        onClose={() => view.setUsageContentModalOpen(false)}
      />
      <ErrorDetailModal
        open={view.usageErrorModalOpen}
        logId={view.usageErrorModalLogId}
        model={view.usageErrorModalModel}
        onClose={() => view.setUsageErrorModalOpen(false)}
      />
    </>
  );
}
