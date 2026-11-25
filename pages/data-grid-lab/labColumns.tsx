import { VendorIcon } from "@code-proxy/assets";
import {
  DropdownMenu,
  formatUsd,
  type DataGridColumn,
  type GridFilterOption,
} from "@code-proxy/ui";
import { Copy, Eye, FileInput, FileOutput, MoreHorizontal } from "@code-proxy/ui/icons";
import {
  CacheCell,
  ChannelCell,
  CostCell,
  FirstTokenCell,
  InputTokensCell,
  LatencyCell,
  ModelCell,
  OutputTokensCell,
  STATUS_LABEL,
  StatusCell,
  ThroughputCell,
  TimeCell,
  UserCell,
} from "./LabCells";
import { LAB_CHANNELS, LAB_USERS, labCacheRatio, labThroughput, type LabLogRow } from "./labData";

export interface LabColumnHandlers {
  now: number;
  onOpenDetails: (row: LabLogRow) => void;
  onAction: (message: string) => void;
}

function countBy<K extends string>(rows: readonly LabLogRow[], pick: (row: LabLogRow) => K) {
  const counts = new Map<K, number>();
  for (const row of rows) counts.set(pick(row), (counts.get(pick(row)) ?? 0) + 1);
  return counts;
}

/** 选项按命中行数从多到少排，筛选面板里的占比条从长到短。 */
function optionsFrom(
  counts: Map<string, number>,
  label: (value: string) => string,
  icon?: (value: string) => GridFilterOption["icon"],
): GridFilterOption[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([value, count]) => ({ value, label: label(value), count, icon: icon?.(value) }));
}

export function buildLabFilterOptions(rows: readonly LabLogRow[]) {
  return {
    users: optionsFrom(
      countBy(rows, (row) => row.user.id),
      (id) => LAB_USERS.find((user) => user.id === id)?.name ?? id,
    ),
    models: optionsFrom(
      countBy(rows, (row) => row.model),
      (model) => model,
      (model) => <VendorIcon modelId={model} size={13} />,
    ),
    channels: optionsFrom(
      countBy(rows, (row) => row.channel.id),
      (id) => LAB_CHANNELS.find((channel) => channel.id === id)?.name ?? id,
      (id) => (
        <VendorIcon
          modelId={LAB_CHANNELS.find((channel) => channel.id === id)?.provider ?? ""}
          size={13}
        />
      ),
    ),
    statuses: optionsFrom(
      countBy(rows, (row) => row.status),
      (status) => STATUS_LABEL[status as LabLogRow["status"]] ?? status,
    ),
  };
}

function RowActions({ row, handlers }: { row: LabLogRow; handlers: LabColumnHandlers }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`请求 #${row.id} 的更多操作`}
          className="inline-flex h-7 w-7 items-center justify-center rounded-full text-ink-3 opacity-60 transition-[opacity,background-color,color] duration-150 ease-soft hover:bg-hover hover:text-ink group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:bg-selected data-[state=open]:text-ink data-[state=open]:opacity-100"
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" className="min-w-44">
        <DropdownMenu.Item onSelect={() => handlers.onOpenDetails(row)}>
          <Eye size={14} aria-hidden="true" />
          查看详情
        </DropdownMenu.Item>
        <DropdownMenu.Item onSelect={() => handlers.onAction(`已复制请求 ID #${row.id}`)}>
          <Copy size={14} aria-hidden="true" />
          复制请求 ID
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Item
          onSelect={() => handlers.onAction("演示页没有接后端，这里会打开输入内容")}
        >
          <FileInput size={14} aria-hidden="true" />
          查看输入
        </DropdownMenu.Item>
        <DropdownMenu.Item
          onSelect={() => handlers.onAction("演示页没有接后端，这里会打开输出内容")}
        >
          <FileOutput size={14} aria-hidden="true" />
          查看输出
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  );
}

const SECOND = 1000;

export function buildLabColumns(
  rows: readonly LabLogRow[],
  handlers: LabColumnHandlers,
): DataGridColumn<LabLogRow>[] {
  const options = buildLabFilterOptions(rows);
  return [
    {
      id: "time",
      header: "时间",
      pin: "start",
      width: 96,
      minWidth: 88,
      sortable: true,
      sortFirst: "desc",
      sortValue: (row) => row.timestampMs,
      skeleton: "two-line",
      cell: (row) => <TimeCell row={row} now={handlers.now} />,
    },
    {
      id: "user",
      header: "用户 / Key",
      grow: 1,
      width: 160,
      minWidth: 140,
      sortable: true,
      sortValue: (row) => row.user.name,
      filter: { type: "options", options: options.users },
      filterValue: (row) => row.user.id,
      skeleton: "two-line",
      cell: (row) => <UserCell row={row} />,
    },
    {
      id: "model",
      header: "模型",
      grow: 2,
      width: 200,
      minWidth: 168,
      sortable: true,
      sortValue: (row) => row.model,
      filter: { type: "options", options: options.models },
      filterValue: (row) => row.model,
      skeleton: "two-line",
      cell: (row) => <ModelCell row={row} />,
    },
    {
      id: "channel",
      header: "渠道",
      grow: 1,
      width: 168,
      minWidth: 140,
      sortable: true,
      sortValue: (row) => row.channel.name,
      filter: { type: "options", options: options.channels },
      filterValue: (row) => row.channel.id,
      cell: (row) => <ChannelCell row={row} />,
    },
    {
      id: "input",
      header: "输入",
      headerHint: "本次请求发给上游的输入 token，含缓存读取与写入；悬停单元格看拆分",
      align: "end",
      width: 80,
      minWidth: 72,
      sortable: true,
      sortValue: (row) => row.inputTokens,
      filter: {
        type: "range",
        unit: "tokens",
        presets: [
          { label: "≥ 10K", min: 10_000 },
          { label: "≥ 100K", min: 100_000 },
          { label: "≥ 300K", min: 300_000 },
        ],
      },
      cell: (row) => <InputTokensCell row={row} />,
    },
    {
      id: "output",
      header: "输出",
      align: "end",
      width: 72,
      minWidth: 64,
      sortable: true,
      sortValue: (row) => row.outputTokens,
      filter: {
        type: "range",
        unit: "tokens",
        presets: [
          { label: "≥ 1K", min: 1_000 },
          { label: "≥ 4K", min: 4_000 },
        ],
      },
      cell: (row) => <OutputTokensCell row={row} />,
    },
    {
      id: "cache",
      header: "缓存命中",
      headerHint: "缓存读取 ÷ 输入合计。命中越高，同样的上下文越便宜、首字越快",
      align: "end",
      width: 92,
      minWidth: 84,
      sortable: true,
      sortValue: (row) => labCacheRatio(row),
      filter: {
        type: "range",
        unit: "%",
        scale: 0.01,
        formatValue: (value) => `${value}%`,
        presets: [
          { label: "< 20%", max: 20 },
          { label: "≥ 80%", min: 80 },
        ],
      },
      cell: (row) => <CacheCell row={row} />,
    },
    {
      id: "firstToken",
      header: "首字",
      headerHint: "从发出请求到收到第一个 token 的时间（「耗时」列第二行也有）",
      align: "end",
      defaultHidden: true,
      width: 80,
      minWidth: 64,
      sortable: true,
      sortValue: (row) => (row.firstTokenMs > 0 ? row.firstTokenMs : null),
      filter: {
        type: "range",
        unit: "s",
        scale: SECOND,
        formatValue: (value) => `${value}s`,
        presets: [
          { label: "≥ 5s", min: 5 },
          { label: "≥ 10s", min: 10 },
        ],
      },
      cell: (row) => <FirstTokenCell row={row} />,
    },
    {
      id: "latency",
      header: "耗时",
      headerHint: "第一行是总耗时，第二行是首字时间；10 秒以上标琥珀、30 秒以上标红",
      align: "end",
      width: 92,
      minWidth: 76,
      sortable: true,
      sortValue: (row) => row.latencyMs,
      filter: {
        type: "range",
        unit: "s",
        scale: SECOND,
        formatValue: (value) => `${value}s`,
        presets: [
          { label: "≥ 10s", min: 10 },
          { label: "≥ 30s", min: 30 },
          { label: "≥ 60s", min: 60 },
        ],
      },
      cell: (row) => <LatencyCell row={row} />,
    },
    {
      // 吞吐（TPS）：输出 token ÷ 生成时间。列表接口已有 output_tokens、latency_ms、first_token_ms，
      // 不需要后端新字段；算法与现有 computeOutputTokensPerSecond 一致（见 labThroughput）。
      id: "throughput",
      header: "吞吐",
      headerHint:
        "输出 token ÷ 生成时间（总耗时减首字；非流式或没有首字时间按总耗时）。悬停单元格看算式",
      align: "end",
      width: 88,
      minWidth: 76,
      sortable: true,
      sortValue: (row) => labThroughput(row)?.tokensPerSecond ?? null,
      filter: {
        type: "range",
        unit: "tok/s",
        formatValue: (value) => `${value} tok/s`,
        presets: [
          { label: "< 30 tok/s", max: 30 },
          { label: "≥ 100 tok/s", min: 100 },
        ],
      },
      filterValue: (row) => labThroughput(row)?.tokensPerSecond ?? null,
      cell: (row) => <ThroughputCell row={row} />,
    },
    {
      id: "cost",
      header: "费用",
      align: "end",
      width: 80,
      minWidth: 72,
      sortable: true,
      sortValue: (row) => row.cost.total,
      filter: {
        type: "range",
        unit: "USD",
        formatValue: (value) => formatUsd(value),
        presets: [
          { label: "≥ $0.01", min: 0.01 },
          { label: "≥ $0.1", min: 0.1 },
          { label: "≥ $0.5", min: 0.5 },
        ],
      },
      cell: (row) => <CostCell row={row} />,
    },
    {
      id: "status",
      header: "状态",
      pin: "end",
      width: 112,
      minWidth: 96,
      sortable: true,
      sortValue: (row) => row.status,
      filter: { type: "options", options: options.statuses },
      filterValue: (row) => row.status,
      skeleton: "pill",
      cell: (row) => <StatusCell row={row} onOpenError={() => handlers.onOpenDetails(row)} />,
    },
    {
      id: "actions",
      header: "操作",
      hideHeaderLabel: true,
      pin: "end",
      align: "center",
      width: 48,
      minWidth: 48,
      resizable: false,
      hideable: false,
      skeleton: "box",
      cell: (row) => <RowActions row={row} handlers={handlers} />,
    },
  ];
}
