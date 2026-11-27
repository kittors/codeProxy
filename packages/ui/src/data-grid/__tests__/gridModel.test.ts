import { describe, expect, test } from "vitest";
import {
  applyGridFilters,
  computeGridLayout,
  firstSortDirection,
  getGridSelectionState,
  getPageCount,
  isGridFilterActive,
  nextGridSort,
  orderGridColumns,
  paginateRows,
  setGridFilter,
  sortGridRows,
  toggleGridRowSelection,
  toggleGridSelectAll,
} from "../gridModel";
import { describeGridFilter, listGridFilterChips } from "../gridFilterText";
import type { DataGridColumn } from "../types";

type Row = { id: string; name: string; ms: number | null; status: string };

const rows: Row[] = [
  { id: "a", name: "beta", ms: 1200, status: "ok" },
  { id: "b", name: "Alpha", ms: null, status: "failed" },
  { id: "c", name: "alpha 2", ms: 40_000, status: "ok" },
  { id: "d", name: "gamma", ms: 8_000, status: "ok" },
];

const columns: DataGridColumn<Row>[] = [
  { id: "end", header: "End", pin: "end", width: 60, cell: () => null },
  {
    id: "name",
    header: "名称",
    width: 160,
    grow: true,
    sortValue: (row) => row.name,
    cell: () => null,
  },
  { id: "start", header: "Start", pin: "start", width: 100, cell: () => null },
  {
    id: "ms",
    header: "耗时",
    align: "end",
    width: 90,
    sortValue: (row) => row.ms,
    filter: { type: "range", unit: "s", scale: 1000, formatValue: (value) => `${value}s` },
    cell: () => null,
  },
  {
    id: "status",
    header: "状态",
    width: 80,
    filter: {
      type: "options",
      options: [
        { value: "ok", label: "成功" },
        { value: "failed", label: "失败" },
        { value: "cancelled", label: "已取消" },
      ],
    },
    filterValue: (row) => row.status,
    cell: () => null,
  },
];

const t = (key: string, options?: Record<string, unknown>) =>
  `${key}${options ? JSON.stringify(options) : ""}`;

describe("orderGridColumns", () => {
  test("固定在左侧的列在前、右侧的在后，组内保持声明顺序，并去掉隐藏列", () => {
    expect(orderGridColumns(columns).map((column) => column.id)).toEqual([
      "start",
      "name",
      "ms",
      "status",
      "end",
    ]);
    expect(orderGridColumns(columns, new Set(["ms"])).map((column) => column.id)).toEqual([
      "start",
      "name",
      "status",
      "end",
    ]);
  });
});

describe("computeGridLayout", () => {
  test("没有 grow 列时由最宽的普通列吸收剩余宽度，表格正好铺满框", () => {
    const layout = computeGridLayout(
      [
        { id: "__select", width: 40, pin: "start" },
        { id: "name", width: 200 },
        { id: "count", width: 80 },
        { id: "actions", width: 100, pin: "end" },
      ],
      1,
      600,
    );
    expect(layout.widths.name).toBe(380);
    expect(layout.widths.count).toBe(80);
    expect(layout.totalWidth).toBe(600);
  });

  const layoutColumns = [
    { id: "select", width: 40, pin: "start" as const },
    { id: "time", width: 104, pin: "start" as const },
    { id: "model", width: 200, grow: true },
    { id: "cost", width: 84 },
    { id: "status", width: 112, pin: "end" as const },
  ];

  test.each([0.9, 1, 1.25])("按根字号比例 %s 换算宽度、累加冻结偏移", (scale) => {
    const layout = computeGridLayout(layoutColumns, scale, 0);
    const px = (design: number) => Math.round(design * scale);
    expect(layout.widths.time).toBe(px(104));
    expect(layout.startOffsets.select).toBe(0);
    expect(layout.startOffsets.time).toBe(px(40));
    expect(layout.startPinnedWidth).toBe(px(40) + px(104));
    expect(layout.endOffsets.status).toBe(0);
    expect(layout.endPinnedWidth).toBe(px(112));
    // 总宽是逐列取整后的和：和 <col> 实际渲染的宽度一致，冻结偏移才不会和单元格错开。
    expect(layout.totalWidth).toBe(
      Object.values(layout.widths).reduce((sum, width) => sum + width, 0),
    );
    expect(layout.startEdgeId).toBe("time");
    expect(layout.endEdgeId).toBe("status");
  });

  test("视口更宽时把差额全给 grow 列，其它列不被拉伸", () => {
    const layout = computeGridLayout(layoutColumns, 1, 1000);
    expect(layout.totalWidth).toBe(1000);
    expect(layout.widths.cost).toBe(84);
    expect(layout.widths.model).toBe(200 + (1000 - (40 + 104 + 200 + 84 + 112)));
    expect(layout.fluidColumnId).toBe("model");
  });

  test("多列 grow 按权重分剩余宽度，零头给权重最大的列", () => {
    const layout = computeGridLayout(
      [
        { id: "user", width: 100, grow: 1 },
        { id: "model", width: 100, grow: 2 },
        { id: "channel", width: 100, grow: true },
        { id: "cost", width: 50 },
        { id: "status", width: 50, pin: "end" },
      ],
      1,
      501,
    );
    // 剩余 101：user 25、channel 25、model 50 + 零头 1
    expect(layout.widths).toMatchObject({
      user: 125,
      model: 151,
      channel: 125,
      cost: 50,
      status: 50,
    });
    expect(layout.totalWidth).toBe(501);
    expect(layout.fluidColumnId).toBe("model");
  });

  test("视口更窄时不压缩任何列，交给横向滚动", () => {
    const layout = computeGridLayout(layoutColumns, 1, 300);
    expect(layout.totalWidth).toBe(540);
    expect(layout.widths.model).toBe(200);
    expect(layout.fluidColumnId).toBeNull();
  });

  // fitColumns：放不下时先把 shrink 列按余量比例往 minWidth 压，压到底才横向滚动。
  describe("shrink to fit", () => {
    const fit = [
      { id: "time", width: 100, pin: "start" as const },
      { id: "user", width: 160, minWidth: 120, grow: 1, shrink: true },
      { id: "model", width: 200, minWidth: 140, grow: 2, shrink: true },
      { id: "cost", width: 80 },
      { id: "status", width: 100, pin: "end" as const },
    ];

    test("差额按余量比例分摊，正好铺满框，不横向滚动", () => {
      // 合计 640，框 590：差 50，余量 user 40、model 60，按 4:6 分
      const layout = computeGridLayout(fit, 1, 590);
      expect(layout.totalWidth).toBe(590);
      expect(layout.widths).toMatchObject({ time: 100, user: 140, model: 170, cost: 80, status: 100 });
    });

    test("压到最小宽度还放不下才横向滚动，冻结列和不可压的列不动", () => {
      const layout = computeGridLayout(fit, 1, 500);
      expect(layout.widths).toMatchObject({ time: 100, user: 120, model: 140, cost: 80, status: 100 });
      expect(layout.totalWidth).toBe(540);
    });

    test("按实际根字号换算最小宽度", () => {
      // 0.9：设计合计 640 → 576；框 540，差 36；余量 user 36、model 54
      const layout = computeGridLayout(fit, 0.9, 540);
      expect(layout.totalWidth).toBe(540);
      expect(layout.widths.user).toBeGreaterThanOrEqual(Math.round(120 * 0.9));
      expect(layout.widths.model).toBeGreaterThanOrEqual(Math.round(140 * 0.9));
    });

    test("没打开 shrink 的列照旧不压（其它表的行为不变）", () => {
      const layout = computeGridLayout(
        fit.map((column) => ({ ...column, shrink: false })),
        1,
        590,
      );
      expect(layout.totalWidth).toBe(640);
    });

    test("视口还没量出来（0）时不压，避免首帧先压窄再弹回", () => {
      expect(computeGridLayout(fit, 1, 0).widths.model).toBe(200);
    });
  });
});

describe("sortGridRows", () => {
  test("数字按大小排序，空值无论升降序都排最后", () => {
    expect(
      sortGridRows(rows, columns, { columnId: "ms", direction: "asc" }).map((row) => row.id),
    ).toEqual(["a", "d", "c", "b"]);
    expect(
      sortGridRows(rows, columns, { columnId: "ms", direction: "desc" }).map((row) => row.id),
    ).toEqual(["c", "d", "a", "b"]);
  });

  test("文字按语言比较、忽略大小写，数字片段按数值比较，相等时保持原顺序", () => {
    expect(
      sortGridRows(rows, columns, { columnId: "name", direction: "asc" }, "en").map(
        (row) => row.name,
      ),
    ).toEqual(["Alpha", "alpha 2", "beta", "gamma"]);
  });

  test("没有排序或列没有取值函数时原样返回副本", () => {
    const result = sortGridRows(rows, columns, null);
    expect(result).toEqual(rows);
    expect(result).not.toBe(rows);
    expect(sortGridRows(rows, columns, { columnId: "status", direction: "asc" })).toEqual(rows);
  });
});

describe("filters", () => {
  test("空选项、空区间、空文字都不算生效", () => {
    expect(isGridFilterActive({ type: "options", values: [] })).toBe(false);
    expect(isGridFilterActive({ type: "range" })).toBe(false);
    expect(isGridFilterActive({ type: "text", query: "  " })).toBe(false);
    expect(isGridFilterActive({ type: "range", max: 0 })).toBe(true);
  });

  test("setGridFilter 清空时删除键，而不是留一个空筛选", () => {
    const filters = setGridFilter({}, "status", { type: "options", values: ["ok"] });
    expect(filters).toEqual({ status: { type: "options", values: ["ok"] } });
    expect(setGridFilter(filters, "status", { type: "options", values: [] })).toEqual({});
  });

  test("区间按列的换算比例比较（耗时以秒输入、行里存毫秒），没有取值的行不命中", () => {
    const result = applyGridFilters(rows, columns, { ms: { type: "range", min: 5, max: 10 } });
    expect(result.map((row) => row.id)).toEqual(["d"]);
  });

  test("多列条件取交集", () => {
    const result = applyGridFilters(rows, columns, {
      ms: { type: "range", min: 1 },
      status: { type: "options", values: ["ok"] },
    });
    expect(result.map((row) => row.id)).toEqual(["a", "c", "d"]);
  });

  test("芯片文字：选项超过两个折成 +N，区间用列给的格式", () => {
    const status = columns.find((column) => column.id === "status");
    expect(
      describeGridFilter(
        status,
        "status",
        { type: "options", values: ["ok", "failed", "cancelled"] },
        t,
      ),
    ).toBe(
      'data_grid.chip_options_more{"column":"状态","values":"成功data_grid.list_separator失败","rest":1}',
    );
    const ms = columns.find((column) => column.id === "ms");
    expect(describeGridFilter(ms, "ms", { type: "range", min: 10 }, t)).toBe(
      'data_grid.chip_min{"column":"耗时","value":"10s"}',
    );
    expect(describeGridFilter(ms, "ms", { type: "range", min: 1, max: 5 }, t)).toBe(
      'data_grid.chip_between{"column":"耗时","min":"1s","max":"5s"}',
    );
  });

  test("芯片按列的声明顺序排列，跳过没生效的筛选", () => {
    const chips = listGridFilterChips(
      columns,
      {
        status: { type: "options", values: ["ok"] },
        ms: { type: "range", min: 1 },
        name: { type: "text", query: "" },
      },
      t,
    );
    expect(chips.map((chip) => chip.columnId)).toEqual(["ms", "status"]);
  });
});

describe("selection", () => {
  const keys = ["a", "b", "c", "d"];

  test("表头复选框的三态只看当前页", () => {
    expect(getGridSelectionState(keys, new Set())).toBe("none");
    expect(getGridSelectionState(keys, new Set(["a", "x"]))).toBe("some");
    expect(getGridSelectionState(keys, new Set(keys))).toBe("all");
    expect(getGridSelectionState(keys, new Set(["x"]))).toBe("none");
  });

  test("全选只动当前页，保留其它页已选的 key", () => {
    expect([...toggleGridSelectAll(keys, new Set(["x"]))].sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
      "x",
    ]);
    expect([...toggleGridSelectAll(keys, new Set([...keys, "x"]))]).toEqual(["x"]);
  });

  test("Shift 连选把锚点到目标之间整段设成目标的新状态", () => {
    const selected = toggleGridRowSelection(keys, new Set(["a"]), "d", {
      anchorKey: "a",
      range: true,
    });
    expect([...selected].sort()).toEqual(keys);
    const cleared = toggleGridRowSelection(keys, selected, "b", { anchorKey: "d", range: true });
    expect([...cleared]).toEqual(["a"]);
  });
});

describe("sort cycle and paging", () => {
  test("首选方向 → 反方向 → 取消", () => {
    const first = nextGridSort(null, "ms", "desc");
    expect(first).toEqual({ columnId: "ms", direction: "desc" });
    const second = nextGridSort(first, "ms", "desc");
    expect(second).toEqual({ columnId: "ms", direction: "asc" });
    expect(nextGridSort(second, "ms", "desc")).toBeNull();
    expect(nextGridSort(second, "name", "asc")).toEqual({ columnId: "name", direction: "asc" });
  });

  test("数字列默认先降序，文字列先升序，列可以自己指定", () => {
    expect(firstSortDirection(columns[3])).toBe("desc");
    expect(firstSortDirection(columns[1])).toBe("asc");
    expect(firstSortDirection({ ...columns[1], sortFirst: "desc" })).toBe("desc");
  });

  test("页码越界时夹到合法范围", () => {
    expect(getPageCount(0, 50)).toBe(1);
    expect(getPageCount(101, 50)).toBe(3);
    expect(paginateRows(rows, 9, 3).map((row) => row.id)).toEqual(["d"]);
    expect(paginateRows(rows, 0, 3).map((row) => row.id)).toEqual(["a", "b", "c"]);
  });
});
