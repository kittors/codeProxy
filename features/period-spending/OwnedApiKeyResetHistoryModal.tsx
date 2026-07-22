import type { ApiKeyDailySpendingResetEvent } from "@code-proxy/api-client/endpoints/api-keys";
import { DataTable, Modal, type DataTableColumn } from "@code-proxy/ui";
import { formatQuotaUsdAmount } from "./PeriodSpendingCell";

const formatResetAt = (value: string): string => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

export function OwnedApiKeyResetHistoryModal({
  t,
  open,
  onClose,
  keyName,
  maskedKey,
  loading,
  events,
}: {
  t: (key: string, options?: Record<string, unknown>) => string;
  open: boolean;
  onClose: () => void;
  keyName: string;
  maskedKey: string;
  loading: boolean;
  events: ApiKeyDailySpendingResetEvent[];
}) {
  const columns: DataTableColumn<ApiKeyDailySpendingResetEvent>[] = [
    {
      key: "reset_at",
      label: t("api_keys_page.reset_history_col_time"),
      width: "w-[180px] min-w-[160px]",
      render: (row) => formatResetAt(row.reset_at),
    },
    {
      key: "day_key",
      label: t("api_keys_page.reset_history_col_day"),
      width: "w-[130px] min-w-[120px]",
      render: (row) => row.day_key || "-",
    },
    {
      key: "actor",
      label: t("api_keys_page.reset_history_col_actor"),
      width: "w-[140px] min-w-[120px]",
      render: (row) =>
        row.actor_username?.trim() ||
        (row.actor_kind === "service_credential"
          ? t("api_keys_page.reset_history_actor_service")
          : t("api_keys_page.reset_history_actor_unknown")),
    },
    {
      key: "effective_used_before",
      label: t("api_keys_page.reset_history_col_cleared"),
      width: "w-[150px] min-w-[130px]",
      render: (row) => formatQuotaUsdAmount(row.effective_used_before),
    },
    {
      key: "raw_today_cost",
      label: t("api_keys_page.reset_history_col_raw_today"),
      width: "w-[150px] min-w-[130px]",
      render: (row) => formatQuotaUsdAmount(row.raw_today_cost),
    },
    {
      key: "cost_baseline",
      label: t("api_keys_page.reset_history_col_baseline"),
      width: "w-[150px] min-w-[130px]",
      render: (row) => formatQuotaUsdAmount(row.cost_baseline),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("api_keys_page.reset_history_title", { name: keyName })}
      description={t("api_keys_page.reset_history_desc", { key: maskedKey })}
      maxWidth="max-w-5xl"
      bodyHeightClassName="max-h-[70vh]"
    >
      <DataTable
        columns={columns}
        rows={events}
        loading={loading}
        emptyText={t("api_keys_page.reset_history_empty")}
        rowKey={(row) => String(row.id)}
        height="h-[360px]"
        minHeight="min-h-[200px]"
        minWidth="min-w-[940px]"
      />
    </Modal>
  );
}
