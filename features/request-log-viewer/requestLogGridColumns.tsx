import {
  DropdownMenu,
  GridCellTooltip,
  copyTextToClipboard,
  formatCompactNumber,
  formatInteger,
  toast,
  type DataGridColumn,
  type GridFilterOption,
} from "@code-proxy/ui";
import { AlertTriangle, Copy, FileInput, FileOutput, MoreHorizontal } from "@code-proxy/ui/icons";
import type { TFunction } from "i18next";
import {
  RequestLogAgentCell,
  RequestLogChannelCell,
  RequestLogCostCell,
  RequestLogIdentityCell,
  RequestLogLatencyCell,
  RequestLogStatusCell,
  RequestLogThroughputCell,
  RequestLogTimeCell,
  RequestLogTokensCell,
} from "./RequestLogGridCells";
import { RequestLogModelCell } from "./RequestLogModelCell";
import type { RequestLogsRow } from "./requestLogsRow";

/**
 * Agent 列的状态：supported 显示真实数据；pending 是还不知道后端支不支持（第一页还没回来、
 * 能力还没读到），先占着位置——列顺序在首次挂载时定下，等能力回来再插列，它会被排到最后；
 * unsupported 是确认旧后端没有这几个字段，整列去掉。
 */
export type RequestLogClientsSupport = "supported" | "pending" | "unsupported";

/** 表头筛选与芯片用的取值列表；不传的列没有筛选。 */
export interface RequestLogFacetOptions {
  identity?: readonly GridFilterOption[];
  model?: readonly GridFilterOption[];
  channel?: readonly GridFilterOption[];
  agent?: readonly GridFilterOption[];
  status?: readonly GridFilterOption[];
}

export interface RequestLogGridOptions {
  /** user：用户 + Key 两行（管理端）；key：只写 Key 名；none：不要这一列（只看一个 Key 时）。 */
  identity: "user" | "key" | "none";
  hideChannel?: boolean;
  masked?: boolean;
  clients: RequestLogClientsSupport;
  /** 相对时间（「3 分钟前」）的基准：这一页数据回来的时刻。 */
  now: number;
  facets?: RequestLogFacetOptions;
  onOpenContent?: (row: RequestLogsRow, side: "input" | "output") => void;
  onOpenError?: (row: RequestLogsRow) => void;
}

const options = (values: readonly GridFilterOption[] | undefined) =>
  values ? ({ type: "options", options: values, searchable: values.length > 8 } as const) : undefined;

function RowActions({
  row,
  t,
  onOpenContent,
  onOpenError,
}: {
  row: RequestLogsRow;
  t: TFunction;
  onOpenContent?: RequestLogGridOptions["onOpenContent"];
  onOpenError?: RequestLogGridOptions["onOpenError"];
}) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={t("request_logs.row_actions", { id: row.id })}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-3 opacity-60 transition-[opacity,background-color,color] duration-150 ease-soft hover:bg-hover hover:text-ink group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-selected data-[state=open]:text-ink data-[state=open]:opacity-100"
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className="min-w-44">
          {row.hasContent && onOpenContent ? (
            <>
              <DropdownMenu.Item onSelect={() => onOpenContent(row, "input")}>
                <FileInput size={14} aria-hidden="true" />
                {t("request_logs.open_input")}
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => onOpenContent(row, "output")}>
                <FileOutput size={14} aria-hidden="true" />
                {t("request_logs.open_output")}
              </DropdownMenu.Item>
            </>
          ) : null}
          {row.failed && onOpenError ? (
            <DropdownMenu.Item onSelect={() => onOpenError(row)}>
              <AlertTriangle size={14} aria-hidden="true" />
              {t("request_logs.view_error_details")}
            </DropdownMenu.Item>
          ) : null}
          <DropdownMenu.Item
            onSelect={() => {
              void copyTextToClipboard(String(row.id)).then((ok) => {
                if (ok) toast.success(t("request_logs.request_id_copied", { id: row.id }));
              });
            }}
          >
            <Copy size={14} aria-hidden="true" />
            {t("request_logs.copy_request_id")}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/**
 * 请求日志的列。服务端分页、按时间倒序，所以这些列都不开表头排序（只排当前页会误导）；
 * 筛选由页面把芯片与表头筛选换成查询参数，表格本身不在本地筛。
 *
 * 默认宽度按「1440 宽的窗口、侧栏展开时默认列一屏放下」定（11-18 验收）：设计像素合计 1312（含展开列 28），
 * 1470 宽正好放下；表格打开 fitColumns，更窄时用户 / Key、模型、渠道、Agent 四列按余量往 minWidth 收：1440、1366 都不横向滚动，
 * 1280 才开始滚（滚动时冻结列边缘有阴影和渐隐）。
 * 模型列给得最宽、下限最高：线上模型名后面常跟思考档位徽章（xhigh），压得太窄只剩「gpt-6.1-…」。
 * 截断处都有悬停全文。加列或加宽前先算一遍这笔账，并跑 e2e/request-logs-fit.spec.ts。
 */
export function buildRequestLogGridColumns(
  t: TFunction,
  opts: RequestLogGridOptions,
): DataGridColumn<RequestLogsRow>[] {
  const masked = opts.masked === true;
  const columns: DataGridColumn<RequestLogsRow>[] = [
    {
      id: "time",
      header: t("request_logs.col_time"),
      pin: "start",
      width: 96,
      minWidth: 88,
      skeleton: "two-line",
      cell: (row) => <RequestLogTimeCell row={row} now={opts.now} />,
    },
  ];
  if (opts.identity !== "none") {
    columns.push({
      id: "identity",
      header:
        opts.identity === "key" ? t("request_logs.col_key_name") : t("request_logs.col_user_key"),
      width: 140,
      minWidth: 104,
      grow: 1,
      filter: options(opts.facets?.identity),
      skeleton: "two-line",
      cell: (row) => <RequestLogIdentityCell row={row} variant={opts.identity === "key" ? "key" : "user"} masked={masked} />,
    });
  }
  columns.push({
    id: "model",
    header: t("request_logs.col_model"),
    width: 200,
    minWidth: 168,
    grow: 2,
    filter: options(opts.facets?.model),
    skeleton: "two-line",
    cell: (row) => <RequestLogModelCell row={row} />,
  });
  if (!opts.hideChannel) {
    columns.push({
      id: "channel",
      header: t("request_logs.col_channel"),
      width: 136,
      minWidth: 104,
      grow: 1,
      filter: options(opts.facets?.channel),
      skeleton: "two-line",
      cell: (row) => <RequestLogChannelCell row={row} masked={masked} />,
    });
  }
  if (opts.clients !== "unsupported") {
    columns.push({
      id: "agent",
      header: t("request_logs.col_agent"),
      headerHint: t("request_logs.agent_hint"),
      width: 156,
      minWidth: 120,
      grow: 0.5,
      filter: opts.clients === "supported" ? options(opts.facets?.agent) : undefined,
      skeleton: "two-line",
      cell: (row) =>
        opts.clients === "supported" ? <RequestLogAgentCell row={row} /> : <span className="text-ink-4">—</span>,
    });
  }
  columns.push(
    {
      // 输入 → 输出 + 缓存命中合成一列（见 RequestLogTokensCell）：原来三列一共 260，放进 1440 宽就得合并。
      // 128 正好放下「142K → 4,854」和「缓存 ▬ 100%」；省下的给 Agent，常见客户端名（Claude Code）在 1440 宽不被截断。
      id: "tokens",
      header: t("request_logs.col_tokens"),
      headerHint: t("request_logs.tokens_hint"),
      align: "end",
      width: 128,
      minWidth: 120,
      skeleton: "two-line",
      cell: (row) => <RequestLogTokensCell row={row} onOpen={opts.onOpenContent} />,
    },
    {
      id: "total",
      header: t("request_logs.col_total_token"),
      align: "end",
      width: 96,
      minWidth: 80,
      defaultHidden: true,
      cell: (row) => (
        <GridCellTooltip content={`${formatInteger(row.totalTokens)} tokens`}>
          <span className="tabular-nums text-ink">{formatCompactNumber(row.totalTokens)}</span>
        </GridCellTooltip>
      ),
    },
    {
      id: "latency",
      header: t("request_logs.col_duration"),
      headerHint: t("request_logs.latency_hint"),
      align: "end",
      width: 88,
      minWidth: 76,
      skeleton: "two-line",
      cell: (row) => <RequestLogLatencyCell row={row} />,
    },
    {
      id: "throughput",
      header: t("request_logs.col_throughput"),
      headerHint: t("request_logs.throughput_hint"),
      align: "end",
      width: 92,
      minWidth: 80,
      cell: (row) => <RequestLogThroughputCell row={row} />,
    },
    {
      id: "cost",
      header: t("request_logs.col_cost"),
      align: "end",
      width: 84,
      minWidth: 72,
      cell: (row) => <RequestLogCostCell row={row} />,
    },
    {
      id: "status",
      header: t("request_logs.col_status"),
      pin: "end",
      width: 116,
      minWidth: 100,
      filter: options(opts.facets?.status),
      skeleton: "pill",
      cell: (row) => <RequestLogStatusCell row={row} onOpenError={opts.onOpenError} />,
    },
  );
  if (opts.onOpenContent || opts.onOpenError) {
    columns.push({
      id: "actions",
      header: t("request_logs.col_actions"),
      hideHeaderLabel: true,
      pin: "end",
      align: "center",
      width: 48,
      minWidth: 48,
      maxWidth: 48,
      resizable: false,
      hideable: false,
      overflowTooltip: false,
      skeleton: "box",
      cell: (row) => (
        <RowActions row={row} t={t} onOpenContent={opts.onOpenContent} onOpenError={opts.onOpenError} />
      ),
    });
  }
  return columns;
}
