import { useMemo, type ReactNode } from "react";
import { History } from "@code-proxy/ui/icons";
import { useTranslation } from "react-i18next";
import { DataGrid, GRID_WIDTH, Modal, type DataGridColumn } from "@code-proxy/ui";
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

  /** 等宽数字的取值：时间、日期、金额都按位对齐。 */
  const numeric = (value: ReactNode) => (
    <span className="truncate whitespace-nowrap tabular-nums text-sn-label2">{value}</span>
  );
  const amount = (value: number | undefined) =>
    numeric(isAmount(value) ? formatQuotaUsdAmount(value) : "—");

  const columns: DataGridColumn<SpendingResetEvent>[] = [
    ...(showEventId
      ? [
          {
            id: "id",
            header: label("col_id"),
            align: "end" as const,
            width: GRID_WIDTH.compact,
            cell: (row: SpendingResetEvent) => numeric(row.id),
          },
        ]
      : []),
    {
      id: "reset_at",
      header: label("col_time"),
      width: 190,
      minWidth: 170,
      cell: (row) => numeric(formatResetAt(row.reset_at)),
    },
    {
      id: "day_key",
      header: label("col_day"),
      width: GRID_WIDTH.numericWide,
      cell: (row) => numeric(row.day_key || "—"),
    },
    {
      id: "effective_used_before",
      header: label("col_cleared"),
      align: "end",
      width: GRID_WIDTH.name,
      cell: (row) => amount(row.effective_used_before ?? 0),
    },
    {
      id: "raw_today_cost",
      header: label("col_raw_today"),
      align: "end",
      width: GRID_WIDTH.name,
      cell: (row) => amount(row.raw_today_cost),
    },
    {
      id: "cost_baseline",
      header: label("col_baseline"),
      align: "end",
      width: 160,
      minWidth: 140,
      cell: (row) => amount(row.cost_baseline),
    },
    {
      id: "actor",
      header: label("col_actor"),
      width: GRID_WIDTH.numericWide,
      grow: true,
      cell: (row) => (
        <span className="truncate text-sn-label2">
          {row.actor_username?.trim() ||
            (row.actor_kind === "service_credential"
              ? label("actor_service")
              : label("actor_unknown"))}
        </span>
      ),
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
      {/* 弹窗里的小表：不套外框，按行收高、最高 360px 后表内滚动。 */}
      <DataGrid
        frame={false}
        label={title}
        columns={columns}
        rows={sortedEvents}
        loading={loading}
        empty={{ title: label("empty") }}
        rowKey={(row) => String(row.id)}
        maxHeight="360px"
      />
    </Modal>
  );
}
