import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  normalizePeriodSpendingLimits,
  portalApi,
  type EndUserAPIKey,
  type QuotaResetPeriod,
} from "@code-proxy/api-client";
import { describeWindowParts, resettableWindows } from "@features/access-policy";
import { PeriodQuotaResetModal } from "@features/period-spending";

export function PortalKeyPeriodQuotaResetModal({
  target,
  busy,
  accessPolicy = false,
  onBusyChange,
  onClose,
  onReset,
}: {
  target: EndUserAPIKey | null;
  busy: boolean;
  /** 后端支持访问策略时，按完整矩阵与 Key 规则列出可重置的窗口（含累计）。 */
  accessPolicy?: boolean;
  onBusyChange: (busy: boolean) => void;
  onClose: () => void;
  onReset: () => Promise<void>;
}) {
  const { t } = useTranslation();
  // 失败原因留在弹窗里（以前交给页面级错误条，整个看板会被它替换掉）。
  const [error, setError] = useState("");

  useEffect(() => {
    if (target) setError("");
  }, [target]);

  const handleConfirm = async (periods: QuotaResetPeriod[]) => {
    if (!target || periods.length === 0) return;
    onBusyChange(true);
    setError("");
    try {
      await portalApi.resetKeyPeriodSpending(target.id, periods);
      onClose();
      await onReset();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : t("api_keys_page.reset_period_spending_failed"),
      );
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <PeriodQuotaResetModal
      open={target !== null}
      scope="key"
      subjectName={target?.name || t("api_keys_page.unnamed")}
      configuredLimits={
        target
          ? normalizePeriodSpendingLimits(
              target["period-spending-limits"],
              target["daily-spending-limit"],
            )
          : undefined
      }
      periodSpendingItems={target?.["period-spending"]}
      windows={
        accessPolicy && target
          ? resettableWindows(target["quota-limits"], target["model-rules"], target["quota-usage"]).map((item) => ({
              period: item.window,
              description: describeWindowParts(t, item.parts),
            }))
          : undefined
      }
      busy={busy}
      error={error}
      onClose={() => {
        if (!busy) onClose();
      }}
      onConfirm={(periods) =>
        // 旧后端的 Key 没有累计额度，只会产出滚动周期；新后端的 Key 可以有累计格子，原样提交。
        void handleConfirm(accessPolicy ? periods : periods.filter((p) => p !== "lifetime"))
      }
    />
  );
}
