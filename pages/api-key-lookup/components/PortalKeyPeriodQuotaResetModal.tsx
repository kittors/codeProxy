import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  normalizePeriodSpendingLimits,
  portalApi,
  type EndUserAPIKey,
  type PeriodSpendingPeriod,
} from "@code-proxy/api-client";
import { PeriodQuotaResetModal } from "@features/period-spending";

export function PortalKeyPeriodQuotaResetModal({
  target,
  busy,
  onBusyChange,
  onClose,
  onReset,
}: {
  target: EndUserAPIKey | null;
  busy: boolean;
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

  const handleConfirm = async (periods: PeriodSpendingPeriod[]) => {
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
      busy={busy}
      error={error}
      onClose={() => {
        if (!busy) onClose();
      }}
      onConfirm={(periods) =>
        // Keys have no cumulative allowance, so this dialog only ever yields
        // rolling periods; narrow before handing them to the key-scoped API.
        void handleConfirm(periods.filter((p): p is PeriodSpendingPeriod => p !== "lifetime"))
      }
    />
  );
}
