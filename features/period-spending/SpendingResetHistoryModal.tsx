import { useMemo, type ReactNode } from "react";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { COLUMN_WIDTH, DataTable, Modal, type DataTableColumn } from "@code-proxy/ui";
import { formatQuotaUsdAmount } from "./PeriodSpendingCell";

/** API Key 与用户账号两种重置记录共有的字段（接口里两者结构一致）。 */
export interface SpendingResetEvent {
  id: number;
  day_key?: string;
  reset_at: string;
  actor_username?: string;
  actor_kind?: string;
  cost_baseline?: number;
  effective_used_before?: number;
  raw_today_cost?: number;
}

/** 列名与操作人文案所在的命名空间：两边措辞不同（例如「清零金额」/「重置前消耗额度」）。 */
export type SpendingResetHistoryNamespace = "api_keys_page" | "end_users";

const isAmount = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value);

const formatResetAt = (value: string | undefined): string => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const CELL = "whitespace-nowrap tabular-nums text-ink-2";

/**
 * 手动重置每日消费的历史记录（API Key 与用户账号共用）。
 *
 * 新的在上：按重置时间倒序，时间相同再按记录 ID 倒序。「当日实际消耗」「存储基线」
 * 是重置时的快照，旧记录可能没有——缺失时显示「—」，不把未知写成 $0.00 冒充真实数字。
 * `summary` 放在表格上方（账号版用来展示今日实际消耗与当前有效用量）。
 */
export function SpendingResetHistoryModal({
  open,
  onClose,
  namespace,
  title,
  description,
  loading,
  events,
  showEventId = false,
  summary,
}: {
  open: boolean;
  onClose: () => void;
  namespace: SpendingResetHistoryNamespace;
  title: string;
  description?: ReactNode;
  loading: boolean;
  events: SpendingResetEvent[];
  /** 账号版多一列「重置 ID」，方便和后端日志对账。 */
  showEventId?: boolean;
  summary?: ReactNode;
}) {
  const { t } = useTranslation();
  const label = (suffix: string) => t(`${namespace}.reset_history_${suffix}`);

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) => {
        const timeDiff = Date.parse(b.reset_at) - Date.parse(a.reset_at);
        return Number.isFinite(timeDiff) && timeDiff !== 0 ? timeDiff : b.id - a.id;
      }),
    [events],
  );

  const columns: DataTableColumn<SpendingResetEvent>[] = [
    ...(showEventId
      ? [
          {
            key: "id",
            label: label("col_id"),
            width: COLUMN_WIDTH.compact,
            cellClassName: CELL,
            render: (row: SpendingResetEvent) => row.id,
          },
        ]
      : []),
    {
      key: "reset_at",
      label: label("col_time"),
      width: "w-[190px] min-w-[170px]",
      cellClassName: CELL,
      render: (row) => formatResetAt(row.reset_at),
    },
    {
      key: "day_key",
      label: label("col_day"),
      width: COLUMN_WIDTH.numericWide,
      cellClassName: CELL,
      render: (row) => row.day_key || "—",
    },
    {
      key: "effective_used_before",
      label: label("col_cleared"),
      width: COLUMN_WIDTH.name,
      cellClassName: CELL,
      render: (row) => formatQuotaUsdAmount(row.effective_used_before ?? 0),
    },
    {
      key: "raw_today_cost",
      label: label("col_raw_today"),
      width: COLUMN_WIDTH.name,
      cellClassName: CELL,
      render: (row) => (isAmount(row.raw_today_cost) ? formatQuotaUsdAmount(row.raw_today_cost) : "—"),
    },
    {
      key: "cost_baseline",
      label: label("col_baseline"),
      width: "w-[160px] min-w-[140px]",
      cellClassName: CELL,
      render: (row) => (isAmount(row.cost_baseline) ? formatQuotaUsdAmount(row.cost_baseline) : "—"),
    },
    {
      key: "actor",
      label: label("col_actor"),
      width: COLUMN_WIDTH.numericWide,
      cellClassName: "text-ink-2",
      render: (row) =>
        row.actor_username?.trim() ||
        (row.actor_kind === "service_credential"
          ? label("actor_service")
          : label("actor_unknown")),
    },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={<History />}
      size="xl"
    >
      {summary ? <div className="mb-4">{summary}</div> : null}
      <DataTable
        columns={columns}
        rows={sortedEvents}
        loading={loading}
        emptyText={label("empty")}
        rowKey={(row) => String(row.id)}
        height="h-[360px]"
        minHeight="min-h-[200px]"
        minWidth={showEventId ? "min-w-[1080px]" : "min-w-[940px]"}
      />
    </Modal>
  );
}
