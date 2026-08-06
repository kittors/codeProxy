import { useTranslation } from "react-i18next";
import { COLUMN_WIDTH, DataTable, Modal } from "@code-proxy/ui";
import type { DataTableColumn } from "@code-proxy/ui";
import type { ApiKeyDailySpendingResetEvent } from "@code-proxy/api-client/endpoints/api-keys";
import { formatApiKeySpendingAmount } from "../apiKeyPageUtils";

function formatResetAt(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function actorLabel(
  event: ApiKeyDailySpendingResetEvent,
  t: (key: string) => string,
): string {
  const name = event.actor_username?.trim();
  if (name) return name;
  if (event.actor_kind === "service_credential") {
    return t("api_keys_page.reset_history_actor_service");
  }
  return t("api_keys_page.reset_history_actor_unknown");
}

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

  const columns: DataTableColumn<ApiKeyDailySpendingResetEvent>[] = [
    {
      key: "reset_at",
      label: t("api_keys_page.reset_history_col_time"),
      width: COLUMN_WIDTH.badgeGroup,
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => formatResetAt(row.reset_at),
    },
    {
      key: "day_key",
      label: t("api_keys_page.reset_history_col_day"),
      width: COLUMN_WIDTH.numericWide,
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => row.day_key || "—",
    },
    {
      key: "actor",
      label: t("api_keys_page.reset_history_col_actor"),
      width: COLUMN_WIDTH.numericWide,
      cellClassName: "text-slate-700 dark:text-white/70",
      render: (row) => actorLabel(row, t),
    },
    {
      key: "effective_used_before",
      label: t("api_keys_page.reset_history_col_cleared"),
      width: COLUMN_WIDTH.timestamp,
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) =>
        formatApiKeySpendingAmount(row.effective_used_before ?? 0),
    },
    {
      key: "raw_today_cost",
      label: t("api_keys_page.reset_history_col_raw_today"),
      width: "w-[160px] min-w-[140px]",
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => formatApiKeySpendingAmount(row.raw_today_cost ?? 0),
    },
    {
      key: "cost_baseline",
      label: t("api_keys_page.reset_history_col_baseline"),
      width: COLUMN_WIDTH.timestamp,
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => formatApiKeySpendingAmount(row.cost_baseline ?? 0),
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
