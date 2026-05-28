# DataTable 表头拖拽调整列顺序方案

## 1. 目标

为 `src/modules/ui/DataTable.tsx` 增加“表头 hover 显示低调拖拽手柄，按住手柄后拖动整列到任意位置，并按表格独立缓存列顺序”的能力。

这份方案只描述前端管理面板实现，不涉及后端接口、数据库、`config.yaml` 或远端部署。列顺序是浏览器本地偏好，默认落 `localStorage`。

## 2. 需求复述

用户打开任意使用 `DataTable` 的表格时，表头默认保持干净。鼠标 hover 到某个表头单元格后，该表头内显示一个不抢眼的拖拽 icon。用户把鼠标放在 icon 上并按住后进入拖拽状态，拖动过程中可以把这一列移动到表格任意列位。松开鼠标后，表格按新顺序立即重新渲染。

列顺序调整需要按表格隔离持久化：`api-keys` 表格的顺序不能影响 `models-library`、`request-logs` 或其它表格。刷新页面或重新进入页面后，同一个 `tableId` 对应的表格应恢复上次保存的列顺序。

## 3. 当前代码深度分析

### 3.1 通用表格位置

核心组件是 `src/modules/ui/DataTable.tsx`。当前文件约 1113 行，已经承担以下职责：

- 表格结构：`table` / `colgroup` / `thead` / `tbody`。
- 有限行表格与 legacy virtualize 模式。
- 自定义滚动条与 wheel 边界处理。
- 列宽拖拽调整。
- 基于 `tableId` 的列宽 `localStorage` 缓存。
- 单元格 overflow tooltip。
- loading、empty、loading more、all loaded 等状态。

关键现状：

- `DataTableColumn<T>` 位于 `src/modules/ui/DataTable.tsx:20`，目前列定义包含 `key`、`label`、`width`、`resizable`、`minWidthPx`、`maxWidthPx`、`headerClassName`、`cellClassName`、`overflowTooltip`、`headerRender`、`render`。
- `DataTableProps<T>` 位于 `src/modules/ui/DataTable.tsx:45`，`tableId` 当前注释只描述“隔离列宽缓存”。
- 列宽缓存前缀是 `codeProxy.dataTable.columnWidths.v1`，定义于 `src/modules/ui/DataTable.tsx:99`。
- 列宽读取/写入函数 `readStoredColumnWidths`、`writeStoredColumnWidths` 位于 `src/modules/ui/DataTable.tsx:136` 和 `src/modules/ui/DataTable.tsx:156`。
- 列宽缓存已具备异常兜底：JSON 解析失败、无 `window`、`localStorage` 不可用时静默回退。
- `useEffect` 会在 `tableId` 变化时重新读取列宽缓存，位于 `src/modules/ui/DataTable.tsx:265`。
- `useEffect` 会在 `columns` 变化时清理不存在的列宽 key 并 clamp 宽度，位于 `src/modules/ui/DataTable.tsx:273`。
- `colgroup`、`thead`、`tbody` 都直接遍历原始 `columns`，分别位于 `src/modules/ui/DataTable.tsx:879`、`src/modules/ui/DataTable.tsx:888`、`src/modules/ui/DataTable.tsx:981`。

结论：列顺序重排不应该散落到各业务页面。最小改动面是在 `DataTable` 内部把 `columns` 先归一化成 `orderedColumns`，然后让 `colgroup`、`thead`、loading skeleton、body rows、empty colSpan、virtualize spacer 等所有渲染路径统一使用 `orderedColumns` 和 `orderedColumnCount`。

### 3.2 现有列宽拖拽可复用点

当前列宽拖拽已经建立了非常接近列重排所需的基础设施：

- `safeSetPointerCapture` 已封装 pointer capture 的兼容兜底，位于 `src/modules/ui/DataTable.tsx:191`。
- `headerCellsRef` 已按 `column.key` 保存表头 DOM，位于 `src/modules/ui/DataTable.tsx:233`。
- 列宽拖拽状态 `columnResizeRef` 位于 `src/modules/ui/DataTable.tsx:548` 附近。
- `handleColumnResizePointerDown` 在手柄上 `preventDefault` + `stopPropagation`，避免干扰表头其它交互，位于 `src/modules/ui/DataTable.tsx:599`。
- 全局 `pointermove` / `pointerup` / `pointercancel` / `blur` 监听模式位于 `src/modules/ui/DataTable.tsx:636`。
- 拖拽期间会设置 `document.body.style.cursor` 和 `document.body.style.userSelect`，并在结束/卸载时恢复，位于 `src/modules/ui/DataTable.tsx:626`、`src/modules/ui/DataTable.tsx:669`。
- 拖拽预览线和状态 tooltip 位于 `src/modules/ui/DataTable.tsx:1088`。

结论：列重排应继续使用 Pointer Events 和全局监听，不建议引入新的 DnD 依赖。这样与现有表格拖拽模型一致，也避免 HTML5 Drag and Drop 在表格、触控板、嵌套按钮、sticky header 中的不稳定行为。

### 3.3 当前表头渲染限制

当前表头结构：

```tsx
<th className={`group/column relative whitespace-nowrap px-4 py-3 ${col.width ?? ""} ${col.headerClassName ?? ""}`}>
  {col.headerRender ? col.headerRender() : col.label}
  {canResize ? (
    <button data-vt-column-resizer ... />
  ) : null}
</th>
```

这个结构有几个影响列重排的点：

- `headerRender` 可能返回可交互控件，例如 checkbox、tooltip、select，不能把整个 `<th>` 变成拖拽区域。
- 现有 resize 手柄在右边缘，占 `absolute -right-2 top-0 h-full w-4`，列重排手柄不能与它抢同一区域。
- 表头已有 `group/column`，可以用 `group-hover/column` 控制重排 icon 的淡入。
- `aria-label={col.label}` 已用于表头；如果加入手柄按钮，按钮需要自己的 `aria-label`，不能只依赖 `title`。

结论：列重排只能由独立的 drag handle button 触发，不能由表头整体触发。

### 3.4 当前列 key 约束

当前列宽功能已经把 `select`、`action`、`actions` 视为非 resize 特殊列：

```ts
const NON_RESIZABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);
```

业务表格里这些 key 的语义非常明确：

- `select`：批量选择列，通常应固定在最左侧。
- `actions` / `action`：操作按钮列，通常应固定在最右侧。

已发现的特殊列：

- `src/modules/models/ModelsPage.tsx` 的 `select` 列。
- `src/modules/auth-files/hooks/useAuthFilesFilesPresentation.tsx` 的 `select` 列。
- `src/modules/channel-groups/RoutingConfigEditor.tsx` 的 `select` 列。
- API Key、权限配置、代理池、auth files 等表格的 `actions` 列。

结论：默认行为应保护 `select` / `action` / `actions` 不可拖动，并且默认不允许其它列跨过这些锁定列。后续如果某个业务确实需要拖动操作列，再通过列级配置显式开启。

### 3.5 当前 DataTable 使用点

当前仓库内 `DataTable` 使用集中在管理面板核心页面，已配置 `tableId` 的业务表格如下：

| tableId | 位置 | 特征 |
| --- | --- | --- |
| `api-keys` | `src/modules/api-keys/ApiKeysPage.tsx` | 宽表格，含状态列、多个权限列、`actions` 操作列 |
| `api-key-permission-profiles` | `src/modules/api-key-permissions/ApiKeyPermissionsPage.tsx` | 权限模板表，含 `actions` |
| `auth-files` | `src/modules/auth-files/components/AuthFilesFilesTab.tsx` | 宽表格，含 `select`、quota headerRender、`actions` |
| `ccswitch-import-configs` | `src/modules/ccswitch/CcSwitchImportSettingsPage.tsx` | 导入配置表 |
| `routing-channel-groups` | `src/modules/channel-groups/RoutingConfigEditor.tsx` | 渠道组表，含操作列 |
| `routing-channel-group-members` | `src/modules/channel-groups/RoutingConfigEditor.tsx` | Modal 内 naturalFlow 表格，含输入框、操作列 |
| `routing-model-options` | `src/modules/channel-groups/RoutingConfigEditor.tsx` | Modal 内模型选择表，含 `select` |
| `image-generation-request-params` | `src/modules/image-generation/ImageGenerationPage.tsx` | 文档型参数表 |
| `image-generation-response-schema` | `src/modules/image-generation/ImageGenerationPage.tsx` | 文档型响应 schema 表 |
| `models-library` | `src/modules/models/ModelsPage.tsx` | 模型库表，可能含 `select` |
| `model-configs` | `src/modules/models/ModelsPage.tsx` | 模型配置表，共用 modelColumns |
| `request-logs` | `src/modules/monitor/RequestLogsPage.tsx` | 请求日志表，加载 overlay，横向滚动 |
| `proxy-pool` | `src/modules/proxies/ProxiesPage.tsx` | 代理池表，含操作列 |

`SpecTable` 这种封装组件通过 `tableId={tableId}` 透传，也应自动获得独立缓存。

结论：当前 `tableId` 覆盖已经比较完整，列重排可以默认在存在 `tableId` 时启用；没有 `tableId` 的测试/临时表格可不持久化，但仍可选择是否允许临时重排。

### 3.6 当前测试基础

测试文件是 `src/modules/ui/__tests__/DataTable.scrollbar.test.tsx`，约 908 行。现有测试已经覆盖：

- resize 手柄只出现在可调整列之间。
- `select` 列不显示 resize 手柄。
- 按 `tableId` 持久化列宽。
- 不同 `tableId` 的列宽缓存隔离。
- 预览线边界。
- 自定义滚动条、loading、empty、overflow tooltip 等。

结论：列重排测试应优先加在这个文件内，复用已有 DemoRow、localStorage、pointer event、DOM 查询模式。未来如果文件继续膨胀，可单独拆 `DataTable.column-order.test.tsx`，但首轮最小实现保持同目录同组件测试即可。

## 4. 方案对比

### 方案 A：在每个业务页面自行排序 columns

每个页面读取自己的 `localStorage`，再对 `columns` 做排序。

优点：

- 单个页面改动直观。
- 可以按业务页面做定制。

缺点：

- 重复实现缓存、兼容、拖拽状态和测试。
- `DataTable` 仍不知道真实列序，`colgroup` / `thead` / `tbody` 一致性风险高。
- 后续新增表格容易遗漏。

不推荐。

### 方案 B：在 DataTable 内部实现列序状态和持久化

`DataTable` 接收原始 `columns`，内部根据 `tableId` 读取列序缓存，生成 `orderedColumns`，所有渲染路径统一使用 `orderedColumns`。表头手柄只负责更新内部列序。

优点：

- 与现有列宽缓存和 pointer 拖拽模型一致。
- 所有业务表格自动复用。
- 改动面收敛到 `DataTable`、i18n、测试。
- 新增表格只要提供稳定 `tableId` 和稳定 column key，就自然支持。

缺点：

- `DataTable.tsx` 已较长，继续增加逻辑会让文件更重。
- 需要谨慎处理 resize、headerRender、special columns 的交互。

推荐采用。它是当前代码结构下更优雅的方案，理由是副作用最小、与现有架构一致、缓存和拖拽实现可复用。

### 方案 C：引入 `@dnd-kit` 或其它拖拽库

使用成熟 DnD 库管理排序、碰撞检测和可访问性。

优点：

- 内置 sortable 语义和更完整的 DnD 工具。
- 后续如果有行排序、卡片排序，也可复用。

缺点：

- 当前仓库没有 DnD 依赖，新增依赖需要额外评估和验证。
- 表格已有 pointer-based resize，自定义滚动条、sticky header、naturalFlow 等状态会增加适配成本。
- 本需求只需要水平列重排，库能力明显偏重。

不推荐首轮引入。只有后续出现多处复杂拖拽需求时再重新评估。

## 5. 推荐实现总览

首轮实现范围：

- 在 `DataTableColumn<T>` 中增加列级重排配置。
- 在 `DataTableProps<T>` 中增加表级重排开关。
- 增加列顺序 `localStorage` key，独立于列宽缓存。
- 增加读取、归一化、写入列序的工具函数。
- 在 `DataTable` 内部维护 `columnOrder` 状态，并生成 `orderedColumns`。
- 把现有 `columns.map` 渲染统一替换为 `orderedColumns.map`。
- 在表头 hover 时显示低调 `GripVertical` 手柄。
- 按住手柄后进入列重排 pointer 状态。
- 拖动时计算目标插入位置，显示细插入线。
- pointer up 后提交新顺序并持久化。
- 增加 i18n 文案。
- 增加单元测试和真实 Chrome 验收清单。

非目标：

- 不做列显示/隐藏。
- 不做列宽与列顺序的统一配置面板。
- 不把列顺序写入后端。
- 不改变业务页面 columns 定义方式。
- 不改变当前 `config.yaml`。
- 不改变 main/dev 发布流程或远端服务。

## 6. 数据模型设计

### 6.1 新增常量

建议放在现有列宽常量附近：

```ts
const COLUMN_ORDER_STORAGE_PREFIX = "codeProxy.dataTable.columnOrder.v1";
const COLUMN_REORDER_ACTIVATION_DELAY_MS = 180;
const COLUMN_REORDER_MIN_DRAG_DISTANCE_PX = 4;
const COLUMN_REORDER_PREVIEW_LINE_WIDTH = 2;
const NON_REORDERABLE_COLUMN_KEYS = new Set(["select", "action", "actions"]);
```

说明：

- `v1` 与列宽缓存一样保留版本，后续如果数据结构升级，可以新增 `v2` 并兼容迁移。
- `COLUMN_REORDER_ACTIVATION_DELAY_MS` 实现“长按后拖动”的语义；桌面端 180ms 足够表达 intentional drag，又不会拖慢操作。
- `COLUMN_REORDER_MIN_DRAG_DISTANCE_PX` 用于过滤误触。
- `NON_REORDERABLE_COLUMN_KEYS` 默认保护选择列和操作列。

### 6.2 新增类型

```ts
type ColumnOrder = string[];

interface ColumnReorderState {
  pointerId: number;
  columnKey: string;
  originIndex: number;
  currentIndex: number;
  startClientX: number;
  startClientY: number;
  activated: boolean;
  activationTimer: number | null;
  allowedMinIndex: number;
  allowedMaxIndex: number;
}

interface ColumnReorderPreview {
  columnKey: string;
  fromIndex: number;
  toIndex: number;
  left: number;
  top: number;
  height: number;
}
```

`allowedMinIndex` / `allowedMaxIndex` 的作用是保护 locked columns：

- 如果第一列是 `select`，普通列不能拖到它左侧。
- 如果最后一列是 `actions`，普通列不能拖到它右侧。
- 被锁定列本身默认不显示拖拽手柄。

### 6.3 扩展 DataTableColumn

```ts
export interface DataTableColumn<T> {
  key: string;
  label: string;
  width?: string;
  resizable?: boolean;
  reorderable?: boolean;
  lockOrder?: "start" | "end";
  minWidthPx?: number;
  maxWidthPx?: number;
  headerClassName?: string;
  cellClassName?: string;
  overflowTooltip?: boolean | ((row: T, index: number) => string | null | undefined);
  headerRender?: () => ReactNode;
  render: (row: T, index: number) => ReactNode;
}
```

字段语义：

- `reorderable?: boolean`：列是否允许被用户拖动。未设置时默认由 `shouldAllowColumnReorder` 判断。
- `lockOrder?: "start" | "end"`：列是否固定在开始或结束区域。首轮可选，如果不想扩大 API，可先只用 `NON_REORDERABLE_COLUMN_KEYS`；但建议保留，因为后续业务可能会有非 `select/actions` 的固定列。

### 6.4 扩展 DataTableProps

```ts
export interface DataTableProps<T> {
  tableId?: string;
  columns: DataTableColumn<T>[];
  columnReorderable?: boolean;
  persistColumnOrder?: boolean;
}
```

建议默认值：

```ts
columnReorderable = true,
persistColumnOrder = true,
```

实际启用条件：

```ts
const canUseColumnOrderStorage = Boolean(tableId && persistColumnOrder);
```

如果没有 `tableId`：

- 可以允许当前会话内临时重排，但不写缓存。
- 或直接不显示重排手柄。

推荐首轮选择“没有 `tableId` 不启用列重排”。原因是当前需求明确要求每个表格独立缓存，而 `tableId` 是唯一稳定隔离边界；没有它时启用临时状态容易造成测试和体验不一致。

## 7. localStorage 设计

### 7.1 key 设计

当前列宽：

```txt
codeProxy.dataTable.columnWidths.v1.<tableId>
```

新增列序：

```txt
codeProxy.dataTable.columnOrder.v1.<tableId>
```

示例：

```txt
codeProxy.dataTable.columnOrder.v1.api-keys
```

值：

```json
["status", "name", "key", "dailyLimit", "actions"]
```

只保存 column key 数组，不保存 label、宽度、ReactNode 或业务数据。

### 7.2 读取函数

```ts
function getColumnOrderStorageKey(tableId?: string) {
  const trimmed = tableId?.trim();
  return trimmed ? `${COLUMN_ORDER_STORAGE_PREFIX}.${trimmed}` : null;
}

function readStoredColumnOrder(tableId?: string): ColumnOrder {
  const key = getColumnOrderStorageKey(tableId);
  if (!key || typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is string => typeof value === "string" && value.trim() !== "");
  } catch {
    return [];
  }
}
```

### 7.3 写入函数

```ts
function writeStoredColumnOrder(tableId: string | undefined, order: ColumnOrder) {
  const key = getColumnOrderStorageKey(tableId);
  if (!key || typeof window === "undefined") return;

  try {
    const normalized = Array.from(new Set(order.filter((value) => value.trim() !== "")));
    window.localStorage.setItem(key, JSON.stringify(normalized));
  } catch {
    // localStorage can be unavailable in private browsing or embedded contexts.
  }
}
```

### 7.4 归一化函数

归一化必须处理：

- 缓存里有旧列：忽略。
- 当前新增列：补回默认位置。
- 重复 key：去重。
- locked start/end 列：固定在边界。
- 当前 `columns` 顺序变化：新列按默认 columns 顺序补齐。

建议函数：

```ts
function normalizeColumnOrder<T>(
  columns: DataTableColumn<T>[],
  storedOrder: ColumnOrder,
) {
  const validKeys = new Set(columns.map((column) => column.key));
  const seen = new Set<string>();
  const storedValid = storedOrder.filter((key) => {
    if (!validKeys.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const missing = columns.map((column) => column.key).filter((key) => !seen.has(key));
  const merged = [...storedValid, ...missing];

  const startLocked = columns
    .filter((column) => resolveColumnOrderLock(column) === "start")
    .map((column) => column.key);
  const endLocked = columns
    .filter((column) => resolveColumnOrderLock(column) === "end")
    .map((column) => column.key);
  const locked = new Set([...startLocked, ...endLocked]);
  const movable = merged.filter((key) => !locked.has(key));

  return [...startLocked, ...movable, ...endLocked];
}
```

`resolveColumnOrderLock`：

```ts
function resolveColumnOrderLock<T>(column: DataTableColumn<T>) {
  if (column.lockOrder) return column.lockOrder;
  if (column.key === "select") return "start";
  if (column.key === "action" || column.key === "actions") return "end";
  return null;
}
```

## 8. DataTable 内部状态改造

### 8.1 新增 state

放在列宽 state 附近：

```ts
const [columnOrder, setColumnOrder] = useState<ColumnOrder>(() =>
  normalizeColumnOrder(columns, readStoredColumnOrder(tableId)),
);
const columnOrderRef = useRef<ColumnOrder>(columnOrder);
const [reorderPreview, setReorderPreview] = useState<ColumnReorderPreview | null>(null);
const columnReorderRef = useRef<ColumnReorderState | null>(null);
```

同步 ref：

```ts
useEffect(() => {
  columnOrderRef.current = columnOrder;
}, [columnOrder]);
```

### 8.2 tableId 变化时读取列序

```ts
useEffect(() => {
  setColumnOrder(normalizeColumnOrder(columns, readStoredColumnOrder(tableId)));
}, [columns, tableId]);
```

注意：这里依赖 `columns` 可能导致频繁 normalize。当前各业务列大多用 `useMemo`，但仍应保证 normalize 只处理 key 数组，成本很低。

### 8.3 columns 变化时清理缓存

与列宽清理逻辑类似，列序不需要马上写回 `localStorage`，但 state 必须更新，避免渲染缺列：

```ts
useEffect(() => {
  setColumnOrder((prev) => normalizeColumnOrder(columns, prev));
}, [columns]);
```

是否写回缓存有两个选择：

- 不写回：只在用户完成拖拽后写，避免页面升级时无用户操作也改本地存储。
- 写回：发现缓存含旧列或缺新列就自动纠正。

推荐不写回。用户偏好只在用户动作后持久化，版本兼容通过 render-time normalize 保证。

### 8.4 生成 orderedColumns

```ts
const orderedColumns = useMemo(() => {
  const byKey = new Map(columns.map((column) => [column.key, column]));
  return normalizeColumnOrder(columns, columnOrder)
    .map((key) => byKey.get(key))
    .filter((column): column is DataTableColumn<T> => Boolean(column));
}, [columns, columnOrder]);

const colCount = orderedColumns.length;
```

然后统一替换：

- `<colgroup>{columns.map(...)}</colgroup>` 改为 `orderedColumns.map`。
- `<thead>{columns.map(...)}</thead>` 改为 `orderedColumns.map`。
- loading skeleton 的 `columns.map` 改为 `orderedColumns.map`。
- body rows 的 `columns.map` 改为 `orderedColumns.map`。
- `isLast` 判断用 `orderedColumns.length`。
- `shouldAllowColumnResize(col, colIndex, columns)` 改为 `shouldAllowColumnResize(col, colIndex, orderedColumns)`。
- `colCount` 用 `orderedColumns.length`。
- 重新测量依赖里 `colCount` 保持不变，但来源变成 ordered count。

这是实现成败的核心：不能只改表头，否则 `colgroup` 和 body 会错位。

## 9. 拖拽交互设计

### 9.1 可拖动判断

```ts
function shouldAllowColumnReorder<T>(column: DataTableColumn<T>) {
  if (column.reorderable !== undefined) return column.reorderable;
  if (NON_REORDERABLE_COLUMN_KEYS.has(column.key)) return false;
  return true;
}
```

表级开关：

```ts
const canRenderColumnReorderHandle =
  columnReorderable && Boolean(tableId) && shouldAllowColumnReorder(col);
```

### 9.2 表头结构建议

当前 `th` 直接渲染 header 内容和 resize button。建议包一层 header content，给左侧/右侧手柄留空间：

```tsx
<th ...>
  <div className="flex min-w-0 items-center gap-1">
    {canReorder ? (
      <button
        type="button"
        data-vt-column-reorder-handle
        aria-label={t("common.reorder_column", { column: col.label })}
        title={t("common.reorder_column", { column: col.label })}
        className="inline-flex h-5 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-slate-400/55 opacity-0 transition-opacity hover:bg-slate-200/60 hover:text-slate-600 group-hover/column:opacity-100 focus-visible:opacity-100 active:cursor-grabbing dark:text-white/30 dark:hover:bg-white/10 dark:hover:text-white/65"
        onPointerDown={(event) => handleColumnReorderPointerDown(col, colIndex, event)}
      >
        <GripVertical size={13} aria-hidden="true" />
      </button>
    ) : null}
    <div className="min-w-0 flex-1 truncate">
      {col.headerRender ? col.headerRender() : col.label}
    </div>
  </div>
  {canResize ? <button data-vt-column-resizer ... /> : null}
</th>
```

为什么放在内容左侧：

- 不与右边缘 resize 手柄冲突。
- hover 后出现但不改变列宽，因为手柄始终占位会影响表头文字；如果完全不占位会 hover 抖动。推荐首轮“占位但透明”，宽度只有 `w-5`，视觉不明显。
- `headerRender` 内部可包含 checkbox、select、tooltip，手柄独立按钮不会抢它们的点击。

如果担心所有表头都多出 20px 空间，可以只在 `group-hover/column` 时 absolute 显示在 `left-1 top-1/2`，但这样容易压住 headerRender。首轮更稳的是 flex 占位。

### 9.3 长按启动

pointer down 时不立刻改变列顺序，而是记录状态并启动 timer：

```ts
const handleColumnReorderPointerDown = useCallback(
  (column: DataTableColumn<T>, columnIndex: number, e: ReactPointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    if (!tableId || !columnReorderable || !shouldAllowColumnReorder(column)) return;

    e.preventDefault();
    e.stopPropagation();
    safeSetPointerCapture(e.currentTarget, e.pointerId);

    const bounds = resolveMovableBounds(orderedColumns);
    const state: ColumnReorderState = {
      pointerId: e.pointerId,
      columnKey: column.key,
      originIndex: columnIndex,
      currentIndex: columnIndex,
      startClientX: e.clientX,
      startClientY: e.clientY,
      activated: false,
      activationTimer: window.setTimeout(() => {
        const active = columnReorderRef.current;
        if (!active || active.pointerId !== e.pointerId) return;
        columnReorderRef.current = { ...active, activated: true };
        document.body.style.cursor = "grabbing";
        document.body.style.userSelect = "none";
      }, COLUMN_REORDER_ACTIVATION_DELAY_MS),
      allowedMinIndex: bounds.min,
      allowedMaxIndex: bounds.max,
    };

    columnReorderRef.current = state;
  },
  [columnReorderable, orderedColumns, tableId],
);
```

同时支持“移动距离超过阈值后立即激活”：

```ts
if (!active.activated) {
  const movedEnough =
    Math.abs(event.clientX - active.startClientX) >= COLUMN_REORDER_MIN_DRAG_DISTANCE_PX ||
    Math.abs(event.clientY - active.startClientY) >= COLUMN_REORDER_MIN_DRAG_DISTANCE_PX;
  if (!movedEnough) return;
  activateColumnReorder(active);
}
```

这样用户体验是：按住会进入拖拽；如果用户一按就拖，也不会感觉卡住。

### 9.4 目标位置计算

使用当前表头 cell 的 DOM rect 计算插入位置。已有 `headerCellsRef` 可复用。

```ts
function findColumnDropIndex<T>(
  orderedColumns: DataTableColumn<T>[],
  clientX: number,
  minIndex: number,
  maxIndex: number,
) {
  let nextIndex = maxIndex;

  for (let index = minIndex; index <= maxIndex; index += 1) {
    const column = orderedColumns[index];
    const rect = column ? headerCellsRef.current[column.key]?.getBoundingClientRect() : null;
    if (!rect) continue;
    const midpoint = rect.left + rect.width / 2;
    if (clientX < midpoint) {
      nextIndex = index;
      break;
    }
    nextIndex = index + 1;
  }

  return Math.max(minIndex, Math.min(maxIndex, nextIndex));
}
```

注意：

- 如果从左往右拖，移除原列后目标 index 要做一次修正，否则会偏一位。
- 目标 index 应理解为“移除当前列后插入到哪个位置”。
- locked end 列存在时，`maxIndex` 应是最后一个可移动列的后一位，而不是数组最后一位。

### 9.5 重排数组函数

建议抽成纯函数，便于单测：

```ts
function moveColumnKey(order: ColumnOrder, fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= order.length) return order;
  const next = [...order];
  const [item] = next.splice(fromIndex, 1);
  if (!item) return order;
  const normalizedTo = fromIndex < toIndex ? toIndex - 1 : toIndex;
  next.splice(Math.max(0, Math.min(next.length, normalizedTo)), 0, item);
  return next;
}
```

### 9.6 pointermove

```ts
useEffect(() => {
  const handlePointerMove = (event: PointerEvent) => {
    const active = columnReorderRef.current;
    if (!active || active.pointerId !== event.pointerId) return;

    event.preventDefault();

    const activated = ensureColumnReorderActivated(active, event);
    if (!activated) return;

    const fromIndex = columnOrderRef.current.indexOf(active.columnKey);
    if (fromIndex < 0) return;

    const toIndex = findColumnDropIndex(
      orderedColumnsRef.current,
      event.clientX,
      active.allowedMinIndex,
      active.allowedMaxIndex,
    );

    setReorderPreview(buildColumnReorderPreview(active.columnKey, fromIndex, toIndex));
  };

  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", finishColumnReorder);
  window.addEventListener("pointercancel", cancelColumnReorder);
  window.addEventListener("blur", cancelColumnReorder);

  return () => {
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", finishColumnReorder);
    window.removeEventListener("pointercancel", cancelColumnReorder);
    window.removeEventListener("blur", cancelColumnReorder);
  };
}, [finishColumnReorder, cancelColumnReorder]);
```

因为 `orderedColumns` 会变化，建议新增：

```ts
const orderedColumnsRef = useRef(orderedColumns);
useEffect(() => {
  orderedColumnsRef.current = orderedColumns;
}, [orderedColumns]);
```

避免全局 listener 高频重绑。

### 9.7 pointerup 提交

```ts
const finishColumnReorder = useCallback((event?: PointerEvent) => {
  const active = columnReorderRef.current;
  if (!active) return;
  if (event && active.pointerId !== event.pointerId) return;

  clearColumnReorderTimer(active);
  columnReorderRef.current = null;
  setReorderPreview(null);
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
  document.documentElement.style.cursor = "";

  if (!active.activated || !reorderPreviewRef.current) return;

  setColumnOrder((prev) => {
    const normalizedPrev = normalizeColumnOrder(columnsRef.current, prev);
    const fromIndex = normalizedPrev.indexOf(active.columnKey);
    const next = moveColumnKey(normalizedPrev, fromIndex, reorderPreviewRef.current.toIndex);
    if (next.join("\u0000") === normalizedPrev.join("\u0000")) return prev;
    writeStoredColumnOrder(tableId, next);
    return next;
  });
}, [tableId]);
```

建议用 `reorderPreviewRef` 保存最新 preview，避免 pointerup 读取 stale state。

## 10. 视觉与交互细节

### 10.1 手柄视觉

建议使用 `lucide-react` 的 `GripVertical`：

```ts
import { GripVertical } from "lucide-react";
```

样式建议：

- 默认 `opacity-0`。
- `group-hover/column:opacity-100`。
- 颜色 `text-slate-400/55 dark:text-white/30`。
- hover 提升到 `text-slate-600 dark:text-white/65`。
- 尺寸 `size={13}`。
- button 尺寸 `h-5 w-5`。
- cursor：默认 `grab`，active/grabbing 时 `grabbing`。

### 10.2 拖拽反馈

首轮建议两类反馈：

- 被拖动的表头添加轻微背景：`data-vt-column-reorder-active` 或 class 中条件添加 `bg-slate-200/45 dark:bg-white/10`。
- 插入位置显示竖线，复用列宽 preview line 风格，但颜色略淡：`bg-blue-500/65` 或 `bg-slate-500/70`。

不要让整列 body 高亮，原因：

- body 行数可能很多，会造成 repaint 成本。
- 当前表格有虚拟滚动、custom scrollbar、loading overlay 等层级，整列高亮更容易带来遮挡风险。

### 10.3 与列宽拖拽的冲突处理

必须保证：

- 重排手柄在表头左侧或内容旁边。
- resize 手柄仍在右侧边缘。
- `columnResizeRef.current` 存在时，不允许开始 column reorder。
- `columnReorderRef.current` 存在时，不允许开始 column resize。

代码判断：

```ts
if (columnResizeRef.current) return;
if (columnReorderRef.current) return;
```

### 10.4 与 headerRender 的冲突处理

业务现状中 `headerRender` 可能包含：

- checkbox：models、auth-files、routing model options。
- tooltip：API Keys 的 spending/rpm/tpm。
- select：auth-files quota preview。

手柄必须是独立按钮，并且 `onPointerDown` 中 `stopPropagation`。不能把 pointer 事件挂在 `<th>`，否则会影响这些控件。

### 10.5 naturalFlow 表格

`routing-channel-group-members` 使用 `naturalFlow`。这个模式没有内部滚动条和 sticky header overlay，但仍使用相同的 `<table>`、`thead`、`tbody`。列重排应该天然可用。

预览线计算要兼容 `naturalFlow`：

- `rootRef` 仍存在。
- `containerRef` 仍存在。
- `containerRect` 可以直接取。
- 不需要考虑 horizontal scrollbar bottom inset。

## 11. 关键代码改动清单

### 11.1 `src/modules/ui/DataTable.tsx`

需要修改：

- import 增加 `GripVertical`。
- `DataTableColumn<T>` 增加 `reorderable`、可选 `lockOrder`。
- `DataTableProps<T>` 增加 `columnReorderable`、`persistColumnOrder`。
- constants 增加 column order storage、拖拽阈值、非重排列 key。
- 新增 `ColumnOrder`、`ColumnReorderState`、`ColumnReorderPreview` 类型。
- 新增 storage helpers：`getColumnOrderStorageKey`、`readStoredColumnOrder`、`writeStoredColumnOrder`。
- 新增 order helpers：`resolveColumnOrderLock`、`shouldAllowColumnReorder`、`normalizeColumnOrder`、`moveColumnKey`。
- 新增 state/ref：`columnOrder`、`columnOrderRef`、`orderedColumnsRef`、`reorderPreview`、`reorderPreviewRef`、`columnReorderRef`。
- 新增 pointer handlers：`handleColumnReorderPointerDown`、`finishColumnReorder`、`cancelColumnReorder`。
- 统一将渲染用 `columns` 替换成 `orderedColumns`。
- 渲染 reorder handle。
- 渲染 reorder preview line。

### 11.2 `src/i18n/locales/zh-CN.json`

新增：

```json
"reorder_column": "拖拽调整 {{column}} 列位置",
"column_reorder_target": "移动到第 {{index}} 列"
```

### 11.3 `src/i18n/locales/en.json`

新增：

```json
"reorder_column": "Drag to reorder {{column}} column",
"column_reorder_target": "Move to column {{index}}"
```

### 11.4 `src/i18n/locales/ru.json`

新增对应俄文文案，保持 common 分组一致。

### 11.5 `src/modules/ui/__tests__/DataTable.scrollbar.test.tsx`

新增测试：

- hover/结构测试：可重排列渲染 `[data-vt-column-reorder-handle]`，`select` / `actions` 不渲染。
- 拖拽测试：从 `name` 拖到 `id` 后，表头和 body 顺序都改变。
- 缓存测试：写入 `codeProxy.dataTable.columnOrder.v1.<tableId>`，unmount 后重新 mount 恢复。
- 隔离测试：两个 `tableId` 的列序互不影响。
- 兼容测试：缓存里含不存在列时忽略；新增列自动补齐。
- 冲突测试：resize handle 仍存在且不会被 reorder handle 覆盖。

## 12. 建议测试用例代码草案

### 12.1 渲染手柄

```tsx
test("renders subtle reorder handles only for movable columns", () => {
  const twoColumns: DataTableColumn<DemoRow>[] = [
    { key: "select", label: "Select", width: "w-12", render: () => "x" },
    { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
    { key: "actions", label: "Actions", width: "w-24", render: () => "..." },
  ];

  const { container } = render(
    <DataTable
      tableId="test-reorder-handles"
      rows={[{ id: "1", name: "Row 1" }]}
      columns={twoColumns}
      rowKey={(row) => row.id}
      height="h-[160px]"
      minHeight="min-h-0"
      virtualize={false}
    />,
  );

  const handles = container.querySelectorAll("[data-vt-column-reorder-handle]");
  expect(handles).toHaveLength(1);
  expect(handles[0]).toHaveAttribute("title", "Drag to reorder Name column");
});
```

### 12.2 拖动后表头和 body 同步重排

```tsx
test("reorders header and body cells after dragging a column handle", async () => {
  window.localStorage.clear();
  const columns: DataTableColumn<DemoRow>[] = [
    { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
    { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
  ];

  const { container } = render(
    <DataTable
      tableId="test-column-reorder"
      rows={[{ id: "1", name: "Row 1" }]}
      columns={columns}
      rowKey={(row) => row.id}
      height="h-[160px]"
      minHeight="min-h-0"
      virtualize={false}
    />,
  );

  const nameHeader = screen.getByRole("columnheader", { name: /Name/ });
  const idHeader = screen.getByRole("columnheader", { name: /ID/ });
  mockHeaderRect(nameHeader, { left: 0, width: 160 });
  mockHeaderRect(idHeader, { left: 160, width: 96 });

  const handle = container.querySelector("[data-vt-column-reorder-handle]") as HTMLButtonElement;
  fireEvent.pointerDown(handle, { button: 0, pointerId: 1, clientX: 20, clientY: 20 });
  window.dispatchEvent(new PointerEvent("pointermove", { pointerId: 1, clientX: 220, clientY: 20 }));
  window.dispatchEvent(new PointerEvent("pointerup", { pointerId: 1, clientX: 220, clientY: 20 }));

  await waitFor(() => {
    const headers = screen.getAllByRole("columnheader").map((node) => node.textContent);
    expect(headers.join("|")).toContain("ID|Name");
  });

  expect(window.localStorage.getItem("codeProxy.dataTable.columnOrder.v1.test-column-reorder")).toBe(
    JSON.stringify(["id", "name"]),
  );
});
```

### 12.3 缓存兼容新增/删除列

```tsx
test("normalizes stale column order cache against current columns", () => {
  window.localStorage.clear();
  window.localStorage.setItem(
    "codeProxy.dataTable.columnOrder.v1.test-column-order-normalize",
    JSON.stringify(["stale", "id"]),
  );

  const { container } = render(
    <DataTable
      tableId="test-column-order-normalize"
      rows={[{ id: "1", name: "Row 1" }]}
      columns={[
        { key: "name", label: "Name", width: "w-40", render: (row) => row.name },
        { key: "id", label: "ID", width: "w-24", render: (row) => row.id },
      ]}
      rowKey={(row) => row.id}
      height="h-[160px]"
      minHeight="min-h-0"
      virtualize={false}
    />,
  );

  const colElements = container.querySelectorAll("col");
  expect(colElements).toHaveLength(2);
  expect(screen.getAllByRole("columnheader").map((node) => node.textContent).join("|")).toContain(
    "ID|Name",
  );
});
```

## 13. 真实界面验收方案

因为这是用户可见交互，实际实现后必须用 Chrome DevTools MCP 控制真实 Chrome 验收，不能只看测试。

建议覆盖：

1. 桌面视口打开 API Keys 表格。
2. hover `名称` 或 `密钥` 表头，确认手柄淡入且不抢眼。
3. hover 表头文字、tooltip 图标、select headerRender 时，确认原交互不被遮挡。
4. 按住手柄拖动列到左/右任意位置，确认表头、body、colgroup 宽度同步。
5. 刷新页面，确认列顺序恢复。
6. 打开另一个表格，例如 Models 或 Request Logs，确认不受 API Keys 顺序影响。
7. 尝试拖动 `select`、`actions`，确认没有手柄或无法拖动。
8. 调整列宽后再调整列顺序，确认列宽仍绑定对应 column key，而不是绑定 index。
9. 移动版视口检查 hover 不可用时不会出现破坏性布局；首轮可不支持触屏长按拖动，但不能遮挡表头。
10. dark mode 检查手柄、预览线、tooltip 对比度。

## 14. 风险与应对

### 14.1 列宽和列顺序错位

风险：如果列宽按 index 应用，拖动后宽度会错列。

当前代码按 `column.key` 查 `columnWidths`，`resolveColumnStyle(col)` 只依赖 key，所以只要 `colgroup`、`th`、`td` 都使用同一个 `orderedColumns`，就不会错位。

### 14.2 action/select 被拖乱

风险：批量选择列和操作列被移动后影响用户肌肉记忆。

应对：默认 `select` 固定 start，`action/actions` 固定 end；没有显式 `reorderable: true` 不显示手柄。

### 14.3 headerRender 交互被挡

风险：表头 checkbox/select/tooltip 被手柄覆盖。

应对：手柄独立占位，`headerRender` 放入 `flex-1 min-w-0` 容器；手柄只在自己的 button 上处理 pointer。

### 14.4 拖拽过程中频繁 setState

风险：pointermove 高频 setState 导致表格抖动。

应对：拖动过程中只更新 preview，不实时重排 columns；pointerup 后一次性提交顺序。首轮不做实时列移动动画。

### 14.5 localStorage 异常

风险：隐私模式或嵌入环境不可写。

应对：与列宽缓存一致，读取失败返回默认，写入失败吞掉异常，不阻塞渲染。

### 14.6 旧缓存升级

风险：业务新增/删除列后缓存与当前列不一致。

应对：每次 render-time normalize；旧列忽略，新列补齐；锁定列重新放回边界。

## 15. 实施步骤

1. 修改 `DataTable.tsx` 类型和常量。
2. 实现 column order storage helpers。
3. 实现 pure helpers：`resolveColumnOrderLock`、`shouldAllowColumnReorder`、`normalizeColumnOrder`、`moveColumnKey`。
4. 新增 `columnOrder`、`orderedColumns`、相关 refs。
5. 将所有渲染路径从 `columns` 切到 `orderedColumns`。
6. 加入 `GripVertical` 手柄和 i18n 文案。
7. 实现 pointer down / move / up / cancel 状态机。
8. 加入 reorder preview line。
9. 添加单元测试。
10. 跑 `bun run lint`、`bun run build`、相关 vitest。
11. 启动本地 dev server。
12. 用 Chrome DevTools MCP 做桌面和移动真实界面验收。
13. 推送功能分支并通过 PR 合回 `dev`。

## 16. 建议验收标准

- 表头 hover 才显示低调拖拽手柄。
- 只有按住手柄才触发列重排。
- 可把普通列拖到任意普通列位置。
- `select` 默认保持最左，不显示手柄。
- `actions` / `action` 默认保持最右，不显示手柄。
- 拖拽结束后表头、body、colgroup 顺序一致。
- 列宽缓存仍按 column key 生效。
- `localStorage` key 按 `tableId` 隔离。
- 刷新页面恢复该表格列序。
- 不同表格互不影响。
- 缓存含旧列或缺新列时表格仍完整渲染。
- loading、empty、virtualize spacer、naturalFlow 表格不破坏。
- Chrome 桌面和移动视口无重叠、裁切、横向滚动异常。

## 17. 最小落地建议

最小可交付版本建议只做以下能力：

- 有 `tableId` 的 `DataTable` 默认启用列重排。
- `select` / `action` / `actions` 默认不可拖并固定边界。
- 拖动时只显示插入线，不实时移动整列。
- pointerup 后一次性更新顺序并写入 `localStorage`。
- 不引入第三方 DnD 依赖。

这能满足当前需求，同时保持改动面可控。后续如果要扩展“列显示/隐藏、列宽重置、列顺序重置、用户级同步”，可以在同一个 `tableId` 偏好体系上继续演进。
