import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { EndUserDailySpendingResetEvent } from "@code-proxy/api-client";
import { DataTable, Modal, type DataTableColumn } from "@code-proxy/ui";
import { formatApiKeySpendingAmount } from "../../api-keys/apiKeyPageUtils";

function formatResetAt(value: string | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function actorLabel(
  event: EndUserDailySpendingResetEvent,
  t: (key: string) => string,
): string {
  const name = event.actor_username?.trim();
  if (name) return name;
  if (event.actor_kind === "service_credential") {
    return t("end_users.reset_history_actor_service");
  }
  return t("end_users.reset_history_actor_unknown");
}

function isAmount(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function EndUserResetHistoryModal({
  open,
  onClose,
  userName,
  loading,
  events,
  rawTodayCost,
  dailySpendingUsed,
}: {
  open: boolean;
  onClose: () => void;
  userName: string;
  loading: boolean;
  events: EndUserDailySpendingResetEvent[];
  rawTodayCost?: number;
  dailySpendingUsed?: number;
}) {
  const { t } = useTranslation();
  const hasRawTodayCost = isAmount(rawTodayCost);
  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const timeDiff = Date.parse(b.reset_at) - Date.parse(a.reset_at);
        return Number.isFinite(timeDiff) && timeDiff !== 0
          ? timeDiff
          : b.id - a.id;
      }),
    [events],
  );

  const columns: DataTableColumn<EndUserDailySpendingResetEvent>[] = [
    {
      key: "id",
      label: t("end_users.reset_history_col_id"),
      width: "w-[90px] min-w-[80px]",
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => row.id,
    },
    {
      key: "reset_at",
      label: t("end_users.reset_history_col_time"),
      width: "w-[190px] min-w-[170px]",
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => formatResetAt(row.reset_at),
    },
    {
      key: "day_key",
      label: t("end_users.reset_history_col_day"),
      width: "w-[130px] min-w-[120px]",
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) => row.day_key || "—",
    },
    {
      key: "effective_used_before",
      label: t("end_users.reset_history_col_cleared"),
      width: "w-[160px] min-w-[140px]",
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) =>
        formatApiKeySpendingAmount(row.effective_used_before ?? 0),
    },
    {
      key: "raw_today_cost",
      label: t("end_users.reset_history_col_raw_today"),
      width: "w-[180px] min-w-[160px]",
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) =>
        isAmount(row.raw_today_cost)
          ? formatApiKeySpendingAmount(row.raw_today_cost)
          : "—",
    },
    {
      key: "cost_baseline",
      label: t("end_users.reset_history_col_baseline"),
      width: "w-[160px] min-w-[140px]",
      cellClassName:
        "whitespace-nowrap tabular-nums text-slate-700 dark:text-white/70",
      render: (row) =>
        isAmount(row.cost_baseline)
          ? formatApiKeySpendingAmount(row.cost_baseline)
          : "—",
    },
    {
      key: "actor",
      label: t("end_users.reset_history_col_actor"),
      width: "w-[140px] min-w-[120px]",
      cellClassName: "text-slate-700 dark:text-white/70",
      render: (row) => actorLabel(row, t),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("end_users.reset_history_title", { name: userName })}
      description={t(
        hasRawTodayCost
          ? "end_users.reset_history_desc"
          : "end_users.reset_history_desc_effective_only",
      )}
      maxWidth="max-w-5xl"
      bodyHeightClassName="max-h-[70vh]"
    >
      <div className="mb-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-orange-200/70 bg-orange-50/70 px-4 py-3 dark:border-orange-500/20 dark:bg-orange-500/10">
          <div className="text-xs font-medium text-orange-700 dark:text-orange-300">
            {t("end_users.reset_history_raw_today_summary")}
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
            {hasRawTodayCost
              ? formatApiKeySpendingAmount(rawTodayCost)
              : t("end_users.reset_history_amount_unavailable")}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-xs font-medium text-slate-500 dark:text-white/50">
            {t("end_users.reset_history_effective_used_summary")}
          </div>
          <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900 dark:text-white">
            {isAmount(dailySpendingUsed)
              ? formatApiKeySpendingAmount(dailySpendingUsed)
              : t("end_users.reset_history_amount_unavailable")}
          </div>
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={sortedEvents}
        loading={loading}
        emptyText={t("end_users.reset_history_empty")}
        rowKey={(row) => String(row.id)}
        height="h-[360px]"
        minHeight="min-h-[200px]"
        minWidth="min-w-[1080px]"
      />
    </Modal>
  );
}
