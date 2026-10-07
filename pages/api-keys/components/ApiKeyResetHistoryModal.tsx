import { useTranslation } from "react-i18next";
import type { ApiKeyDailySpendingResetEvent } from "@code-proxy/api-client/endpoints/api-keys";
import { SpendingResetHistoryModal } from "@features/period-spending";

/** 单把 API Key 的手动重置记录；表格与排序由共享的 SpendingResetHistoryModal 负责。 */
export function ApiKeyResetHistoryModal({
  open,
  onClose,
  keyName,
  maskedKey,
  loading,
  events,
}: {
  open: boolean;
  onClose: () => void;
  keyName: string;
  maskedKey: string;
  loading: boolean;
  events: ApiKeyDailySpendingResetEvent[];
}) {
  const { t } = useTranslation();
  return (
    <SpendingResetHistoryModal
      open={open}
      onClose={onClose}
      namespace="api_keys_page"
      title={t("api_keys_page.reset_history_title", { name: keyName })}
      description={t("api_keys_page.reset_history_desc", { key: maskedKey })}
      loading={loading}
      events={events}
    />
  );
}
