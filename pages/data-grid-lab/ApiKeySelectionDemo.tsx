import {
  Button,
  DataGrid,
  DataGridPagination,
  GridCellTooltip,
  formatDateTime,
  formatInteger,
  formatRelativeTime,
  paginateRows,
  sortGridRows,
  toast,
  type DataGridColumn,
  type GridSort,
} from "@code-proxy/ui";
import { KeyRound, Power, PowerOff, Trash2 } from "@code-proxy/ui/icons";
import { useMemo, useState, type ReactNode } from "react";
import { LAB_USERS, maskLabKey } from "./labData";

/**
 * 多选的演示放在 API Key 列表上：请求日志是只读流水，不需要批量操作（用户 11-17 反馈后从请求日志里撤掉），
 * 而 Key 列表天然有「批量启用 / 停用 / 删除」。这里演示：
 * - 表头复选框只管当前页：全选、半选、再点取消；
 * - Shift 连选；
 * - 选中后表头换成选择条，选中整页时提示「选中全部 N 个」，批量操作真的改本地数据；
 * - 翻页后其它页的选择保留。
 */

interface DemoKey {
  id: string;
  name: string;
  key: string;
  owner: string;
  enabled: boolean;
  spentToday: number;
  quotaUsed: number;
  lastUsedMs: number | null;
  createdMs: number;
}

const KEY_NAMES = [
  "生产 · 主力",
  "生产 · 备用",
  "评测流水线",
  "夜间批处理",
  "移动端",
  "内部工具",
  "灰度",
  "客服机器人",
];

function buildKeys(now: number): DemoKey[] {
  return Array.from({ length: 26 }, (_, index) => {
    const owner = LAB_USERS[index % LAB_USERS.length];
    const quotaUsed = ((index * 37) % 100) / 100;
    return {
      id: `key-${index + 1}`,
      name: `${KEY_NAMES[index % KEY_NAMES.length]}${index >= KEY_NAMES.length ? ` ${Math.floor(index / KEY_NAMES.length) + 1}` : ""}`,
      key: `sk-cp-${(0x9f3a21c7 + index * 7919).toString(16)}${(0x51d0be + index * 104729).toString(16)}`,
      owner: owner.name,
      enabled: index % 5 !== 3,
      spentToday: index % 4 === 0 ? 0 : ((index * 1.37) % 9) + 0.05,
      quotaUsed,
      lastUsedMs: index % 6 === 5 ? null : now - (index * 47 + 3) * 60_000,
      createdMs: now - (index * 3 + 2) * 86_400_000,
    };
  });
}

function QuotaBar({ value }: { value: number }) {
  const tone =
    value >= 0.9
      ? "bg-sn-label/50 bar-semantic:bg-rose-500"
      : value >= 0.7
        ? "bg-sn-label/40 bar-semantic:bg-amber-500"
        : "bg-sn-label/30 bar-semantic:bg-emerald-500";
  return (
    <span className="flex w-full min-w-0 items-center gap-2">
      <span
        className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sn-label/[0.07] dark:bg-white/[0.08]"
        aria-hidden="true"
      >
        <span
          className={`block h-full rounded-full ${tone}`}
          style={{ width: `${Math.max(2, value * 100)}%` }}
        />
      </span>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-sn-label2">
        {Math.round(value * 100)}%
      </span>
    </span>
  );
}

const PAGE_SIZE = 10;

export function ApiKeySelectionDemo({ switcher }: { switcher: ReactNode }) {
  const now = useMemo(() => Date.now(), []);
  const [keys, setKeys] = useState(() => buildKeys(now));
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<GridSort | null>(null);
  const [page, setPage] = useState(1);

  const columns = useMemo<DataGridColumn<DemoKey>[]>(
    () => [
      {
        id: "name",
        header: "名称",
        pin: "start",
        width: 180,
        sortable: true,
        sortValue: (row) => row.name,
        skeleton: "two-line",
        cell: (row) => (
          <span className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-medium text-sn-label">{row.name}</span>
            <span className="mt-0.5 truncate font-mono text-2xs text-sn-label3">
              {maskLabKey(row.key)}
            </span>
          </span>
        ),
      },
      {
        id: "owner",
        header: "所属账号",
        width: 160,
        grow: true,
        sortable: true,
        sortValue: (row) => row.owner,
        cell: (row) => <span className="truncate text-sn-label2">{row.owner}</span>,
      },
      {
        id: "enabled",
        header: "状态",
        width: 96,
        sortable: true,
        sortValue: (row) => (row.enabled ? 1 : 0),
        cell: (row) => (
          <span className="inline-flex items-center gap-1.5 text-xs text-sn-label2">
            <span
              className={`h-1.5 w-1.5 rounded-full ${row.enabled ? "bg-emerald-500" : "bg-sn-label-off"}`}
              aria-hidden="true"
            />
            {row.enabled ? "启用" : "已停用"}
          </span>
        ),
      },
      {
        id: "spent",
        header: "今日消费",
        align: "end",
        width: 104,
        sortable: true,
        sortValue: (row) => row.spentToday,
        cell: (row) =>
          row.spentToday > 0 ? (
            <span className="tabular-nums text-sn-label">${row.spentToday.toFixed(2)}</span>
          ) : (
            <span className="text-sn-label-off">—</span>
          ),
      },
      {
        id: "quota",
        header: "周期额度",
        width: 168,
        sortable: true,
        sortFirst: "desc",
        sortValue: (row) => row.quotaUsed,
        cell: (row) => <QuotaBar value={row.quotaUsed} />,
      },
      {
        id: "lastUsed",
        header: "最近使用",
        width: 120,
        sortable: true,
        sortFirst: "desc",
        sortValue: (row) => row.lastUsedMs,
        cell: (row) =>
          row.lastUsedMs ? (
            <GridCellTooltip content={formatDateTime(row.lastUsedMs)}>
              <span className="text-sn-label2">{formatRelativeTime(row.lastUsedMs, now, "zh-CN")}</span>
            </GridCellTooltip>
          ) : (
            <span className="text-sn-label-off">从未使用</span>
          ),
      },
      {
        id: "created",
        header: "创建时间",
        width: 120,
        sortable: true,
        sortFirst: "desc",
        sortValue: (row) => row.createdMs,
        cell: (row) => (
          <GridCellTooltip content={formatDateTime(row.createdMs)}>
            <span className="font-mono text-xs tabular-nums text-sn-label2">
              {formatDateTime(row.createdMs).slice(0, 10)}
            </span>
          </GridCellTooltip>
        ),
      },
    ],
    [now],
  );

  const sorted = useMemo(() => sortGridRows(keys, columns, sort, "zh-CN"), [columns, keys, sort]);
  const pageRows = useMemo(() => paginateRows(sorted, page, PAGE_SIZE), [page, sorted]);
  const count = selected.size;

  const updateSelected = (patch: (row: DemoKey) => DemoKey | null, message: string) => {
    setKeys((prev) =>
      prev.flatMap((row) => {
        if (!selected.has(row.id)) return [row];
        const next = patch(row);
        return next ? [next] : [];
      }),
    );
    toast.success(message);
    setSelected(new Set());
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2.5">
          <h2 className="sr-only">API Key</h2>
          {switcher}
          <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-2xs font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
            多选示例 · 假数据
          </span>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-sn-label3">
          <KeyRound size={13} className="shrink-0" aria-hidden="true" />
          表头复选框全选 / 半选本页，Shift
          点击连选；选中后表头换成选择条，批量操作会真的改动下面的数据。
        </p>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        <DataGrid
          id="lab-api-keys"
          label="API Key"
          fill
          columns={columns}
          rows={pageRows}
          rowKey={(row) => row.id}
          sort={sort}
          onSortChange={setSort}
          selectable
          selectedKeys={selected}
          onSelectedKeysChange={setSelected}
          selectionSummary={({ count: selectedCount }) =>
            selectedCount === pageRows.length && keys.length > selectedCount ? (
              <button
                type="button"
                onClick={() => setSelected(new Set(keys.map((row) => row.id)))}
                className="font-medium text-sn-accent-ink underline decoration-sn-label-off underline-offset-2 transition-colors hover:decoration-current"
              >
                选中全部 {formatInteger(keys.length)} 个
              </button>
            ) : null
          }
          selectionActions={() => (
            <>
              <Button
                size="xs"
                onClick={() =>
                  updateSelected(
                    (row) => ({ ...row, enabled: true }),
                    `已启用 ${count} 个 Key（演示）`,
                  )
                }
              >
                <Power size={12} aria-hidden="true" />
                启用
              </Button>
              <Button
                size="xs"
                onClick={() =>
                  updateSelected(
                    (row) => ({ ...row, enabled: false }),
                    `已停用 ${count} 个 Key（演示）`,
                  )
                }
              >
                <PowerOff size={12} aria-hidden="true" />
                停用
              </Button>
              <Button
                size="xs"
                variant="secondary-danger"
                onClick={() => updateSelected(() => null, `已删除 ${count} 个 Key（演示）`)}
              >
                <Trash2 size={12} aria-hidden="true" />
                删除
              </Button>
            </>
          )}
          empty={{ title: "没有 API Key" }}
          footer={
            <DataGridPagination
              page={page}
              pageSize={PAGE_SIZE}
              total={keys.length}
              onPageChange={setPage}
              info={
                count > 0 ? (
                  <span className="text-sn-label2">已选 {formatInteger(count)} 个（跨页保留）</span>
                ) : null
              }
            />
          }
        />
      </div>
    </div>
  );
}
