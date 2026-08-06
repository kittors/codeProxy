import { useTranslation } from "react-i18next";
import { apiKeyEntriesApi, type ApiKeyEntry } from "@code-proxy/api-client/endpoints/api-keys";
import { endUsersApi } from "@code-proxy/api-client/endpoints/end-users";
import { normalizePeriodSpendingLimits, type PeriodSpendingPeriod } from "@code-proxy/api-client";
import { useToast } from "@code-proxy/ui";
import { PeriodQuotaResetModal } from "@features/period-spending";

export function ApiKeyPeriodQuotaResetModal({
  entry,
  endUserId,
  busyKey,
  onBusyKeyChange,
  onClose,
  onReset,
}: {
  entry: ApiKeyEntry | null;
  endUserId: string;
  busyKey: string | null;
  onBusyKeyChange: (key: string | null) => void;
  onClose: () => void;
  onReset: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const { notify } = useToast();
  const busy = busyKey !== null;

  const handleConfirm = async (periods: PeriodSpendingPeriod[]) => {
    if (!entry || periods.length === 0) return;
    onBusyKeyChange(entry.id ?? entry.key);
    try {
      if (endUserId) {
        if (!entry.id) return;
        await endUsersApi.resetKeyPeriodSpending(endUserId, entry.id, periods);
      } else {
        await apiKeyEntriesApi.resetPeriodSpending(
          entry.id ? { id: entry.id, periods } : { key: entry.key, periods },
        );
      }
      notify({
        type: "success",
        message: t("api_keys_page.reset_period_spending_success"),
      });
      onClose();
      await onReset();
    } catch (err: unknown) {
      notify({
        type: "error",
        message:
          err instanceof Error
            ? err.message
            : t("api_keys_page.reset_period_spending_failed"),
      });
    } finally {
      onBusyKeyChange(null);
    }
  };

  return (
    <PeriodQuotaResetModal
      open={entry !== null}
      scope="key"
      subjectName={entry?.name?.trim() || t("api_keys_page.unnamed")}
      configuredLimits={
        entry
          ? normalizePeriodSpendingLimits(
              entry["period-spending-limits"],
              entry["daily-spending-limit"],
            )
          : undefined
      }
      periodSpendingItems={entry?.["period-spending"]}
      busy={busy}
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
