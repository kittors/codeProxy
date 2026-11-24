// 重组件：satin-ui/markdown、/chat、/flow、/grid、/canvas-grid、/lightbox、/media（各自单独引入，不拉进主入口）
import type { SatinFactory, LightboxItem, LightboxOptions, LightboxHandle, ComposerParts, ComposerPartEvents, ComposerAttachment } from "./components";
export type { LightboxItem, LightboxOptions, LightboxHandle } from "./components";

export interface MarkdownOptions { source?: string; codeMax?: number; imgH?: number | "auto"; tableMax?: number; reduced?(): boolean }
export function renderMarkdown(el: HTMLElement, md: string, opt?: Omit<MarkdownOptions, "source">): { el: HTMLElement; set(next: Omit<MarkdownOptions, "source">): void; update(md: string): void; destroy(): void; readonly options: Omit<MarkdownOptions, "source"> };
/** Markdown 文档：update({ source }) 换内容，改 codeMax / imgH / tableMax 只改高度设置；destroy 停掉文档里的播放器、撤掉监听 */
export const createMarkdown: SatinFactory<MarkdownOptions, { readonly source: string }>;
export function highlightLines(code: string, lang: string): string[];
/** 对话：box 是空容器时按 title / status / placeholder / max 自己填好标记（或用 chatHTML 先填）；respond 返回流式的文字（异步迭代）或一整段 */
/** 工具调用条目：支持 JSON 参数/结果、Shell 命令、Unified Diff、代码片段与多区块语法高亮 */
export interface ChatToolBlock { label?: string; path?: string; content: string | Record<string, unknown>; lang?: string; lines?: boolean; badge?: string }
export interface ChatToolItem { id?: string | number; name?: string; kind?: "read" | "edit" | "bash" | "search" | "code" | "think" | "tool" | string; icon?: string; label?: string; path?: string; command?: string; code?: string; diff?: string; lang?: string; args?: unknown; argsLang?: string; output?: unknown; outputLang?: string; result?: unknown; resultLang?: string; badge?: string; exitCode?: number; status?: "run" | "done" | "error" | "fail" | "stop"; ms?: number; open?: boolean; blocks?: ChatToolBlock[]; [k: string]: unknown }
export interface ChatToolRenderContext { esc(s: unknown): string; icon(name: string, size?: number): string; highlight(code: string, lang?: string): string; codeBox(o: { label?: string; content?: string; lang?: string; showLines?: boolean; badge?: string }): string; formatJSON(v: unknown): string; index: number; style: "timeline" | "card" | "minimal"; traceMode: "visible" | "active" | "collapsed" | "expanded" | "hidden"; expanded: boolean }
export type ChatToolRenderer = (tool: ChatToolItem, ctx: ChatToolRenderContext) => Node | string | { header?: Node | string; body?: Node | string; className?: string } | void | null;
export interface ChatStats { loaded: number; total: number; hasMore: boolean; liveNodes: number }
/** 一条：kind "day" 日期分隔（text 是日期）；"msg" 消息；"ai" 富 AI 回复 */
export interface ChatItem { kind: "day" | "msg" | "ai"; text?: string; me?: boolean; type?: "text" | "image" | "video" | "audio" | "file"; g?: string; cap?: string; dur?: string; src?: string; poster?: string; name?: string; ext?: string; size?: number; status?: "sending" | "sent" | "fail"; think?: string | null; tools?: ChatToolItem[]; [k: string]: unknown }
/** 历史消息：initial() 一开始的条目（从旧到新）；往上翻或按需加载时 older(step?) 要更早的一页（可以是 Promise），hasMore() 说还有没有更早的，total 可选总条数（如 12000） */
export interface ChatHistory { initial(): ChatItem[]; older?(step?: number): ChatItem[] | Promise<ChatItem[]>; hasMore?(): boolean; total?: number | (() => number) }
/** 对话的选项（不含事件回调；Vue 组件的属性就是这些） */
export interface ChatProps extends ComposerParts {
  /** 接模型的口子：异步生成器一段段 yield 字符串（或 { text } / { think } / { tool } / { toolUpdate } / { step } …），或直接返回一整段 */
  respond?(text: string, ctx: { /** 用户点了"停止"以后变成 true（每次读都是现在的值） */ readonly stopped: boolean }): AsyncIterable<unknown> | Promise<string> | string;
  history?: ChatHistory; title?: string; status?: string; placeholder?: string; max?: number; maxLines?: number; attach?: boolean; voice?: boolean;
  /** 新对话：还没有消息时消息区正中的样子。不写有一个默认的（对话图标 + "有什么可以帮你？"）；true 只留空容器（自己画进 emptyEl）；false 不要 */
  empty?: ChatEmpty | boolean;
  /** 底部输入框的选项（输入框还没接上时用）：upload 上传函数；attachments 附件菜单每一项（img / vid / aud / doc）点了以后给出的附件 */
  composer?: { upload?(file: File, onProgress: (p: number) => void): Promise<unknown>; attachments?: Partial<Record<"img" | "vid" | "aud" | "doc", (counter: { n: number }) => ComposerAttachment>> };
  hiRes?(bg: string): string;
  /** 顶栏左边放"会话列表"按钮（单色图标），点了发 menu */
  menu?: boolean;
  /** 顶栏右边放"新对话"按钮（单色图标），点了发 newChat */
  newChat?: boolean;
  /** 侧边迷你定位刻度轨：false 关闭 | "left" | "right" | { side?: "left" | "right"; max?: number }（默认 "left"） */
  rail?: false | "left" | "right" | { side?: "left" | "right"; max?: number };
  /** 回复底栏元信息（时间戳 / 耗时 / 吞吐速率 tok/s）配置 */
  meta?: boolean | { time?: boolean; duration?: boolean; latency?: boolean; tps?: boolean };
  /** 消息操作栏显隐策略："hover"（默认：悬停对应消息内容区才显示）| "latest"（最新一条 AI 回复常显）| "always"（全部常显）| false / "none"（隐藏） */
  actions?: "hover" | "latest" | "always" | false | "none";
  /** 流式输出光标样式："dot" | "bar" | false */
  caret?: "dot" | "bar" | false;
  /** 模型思考与工具过程展示模式："visible" 工具可见 | "active" 仅显示当前执行单行 | "collapsed" 思考与工具全收起活动流 | "expanded" 默认展开高亮详情 | "hidden" 仅正文 */
  traceMode?: "visible" | "active" | "collapsed" | "expanded" | "hidden";
  /** 工具调用外观风格："timeline" 紧凑活动时间流（默认）| "card" 精致卡片 | "minimal" 极简细导引线 */
  toolStyle?: "timeline" | "card" | "minimal";
  /** 自定义单个工具调用渲染器（可自定义外框、代码/Diff 高亮与交互结构） */
  renderTool?: ChatToolRenderer;
  /** 历史消息加载模式："auto" 无缝自动预加载（默认）| "top" 置顶加载 | "demand" 按需加载（适配 10,000+ 条超长会话） */
  historyMode?: "auto" | "top" | "demand";
  /** 排版密度："comfortable" 舒适（默认）| "compact" 紧凑高密度 */
  density?: "comfortable" | "compact";
  /** 用户输入包含 Markdown 时是否渲染（默认 true，可关闭为纯文本；复制与编辑回溯始终保留原始 Markdown） */
  userMarkdown?: boolean;
  /** AI 回复正文是否渲染安全 Markdown 与代码高亮（默认 true） */
  markdown?: boolean;
  /** 输入框发送快捷键："enter"（默认：Enter 直接发送、Shift+Enter 换行）| "mod-enter"（⌘/Ctrl+Enter 发送、Enter 换行） */
  submitKey?: "enter" | "mod-enter";
  /** 底部输入框高斯模糊级别（带不透明度安全下限 ≥78%/76%，绝不允许透明）："none" | "sm" | "md" | "lg" | 0–28px 数值 */
  composerBlur?: "none" | "sm" | "md" | "lg" | number | false;
  /** 是否启用输入框顶部微把手拖拽调高（默认 true，双击微把手恢复自动高度） */
  composerResizable?: boolean;
  /** 手动指定底部输入框文本区高度（px，自动钳制在安全范围内） */
  composerHeight?: number;
}
/** createChat 的选项：上面那些 + 输入框部件的事件回调 + 顶栏按钮的回调 */
export interface ChatOptions extends ChatProps, ComposerPartEvents {
  /** 点了顶栏左边的"会话列表"（menu: true 时才有） */
  onMenu?(): void;
  /** 点了顶栏右边的"新对话"（newChat: true 时才有） */
  onNewChat?(): void;
}
/** 新对话的样子：图标（单色，图标名）、标题、说明、2～4 个建议（点了填进输入框） */
export interface ChatEmpty { icon?: string; title?: string; subtitle?: string; suggestions?: string[] }
export interface ChatApi { send(text: string): void; receive(item: Partial<ChatItem>): unknown; sendText(text: string, o?: { fail?: boolean }): unknown; scrollToOldest(): void;
  /** 滚动定位到某条消息 */
  scrollToId(id: string | number): void;
  /** 主动加载更早历史（默认 1 批，可传批次数快速按需拉取） */
  loadOlder(batches?: number): Promise<number>;
  /** 获取当前对话载入统计（已载条数、总条数、是否还有更早、当前虚拟列表 DOM 节点数） */
  getStats(): ChatStats;
  /** 动态切换侧边刻度轨位置或隐藏 */
  setRail(side: "left" | "right" | "off" | false): void;
  /** 动态切换消息操作栏显隐策略 */
  setActions(mode: "hover" | "latest" | "always" | false | "none"): void;
  /** 动态切换模型思考与工具调用展示模式 */
  setTraceMode(mode: "visible" | "active" | "collapsed" | "expanded" | "hidden"): void;
  /** 动态切换工具调用视觉样式 */
  setToolStyle(style: "timeline" | "card" | "minimal"): void;
  /** 动态设置或清除自定义工具渲染器 */
  setRenderTool(fn?: ChatToolRenderer | null): void;
  /** 动态切换历史加载模式（无缝加载 / 置顶加载 / 按需加载） */
  setHistoryMode(mode: "auto" | "top" | "demand"): void;
  /** 动态切换排版密度（舒适 / 紧凑） */
  setDensity(density: "comfortable" | "compact"): void;
  /** 动态开关用户消息 Markdown 渲染 */
  setUserMarkdown(enabled: boolean): void;
  /** 动态切换发送快捷键模式（Enter 直接发送 / ⌘↵ 发送） */
  setSubmitKey(mode: "enter" | "mod-enter"): void;
  /** 动态调整输入框高斯模糊级别（受安全不透明度下限约束，不允许透明） */
  setComposerBlur(level: "none" | "sm" | "md" | "lg" | number | false): void;
  /** 动态设置输入框文本区高度（px）或传 "auto" 恢复自动伸缩 */
  setComposerHeight(height: number | "auto" | null): void;
  /** 填一段字进底部输入框（字淡入、光标在最后），不发 */
  fill(text: string): void;
  /** 新对话那一块（empty 给 true 时自己往里画）；没有空状态时是 null */
  readonly emptyEl: HTMLElement | null }
export interface ThreadRailItem { id: string | number; summary: string; meta?: string }
export interface ThreadRailOptions { side?: "left" | "right"; max?: number; onSelect?(detail: { item: ThreadRailItem; index: number }): void }
export interface ThreadRailApi { setItems(items: ThreadRailItem[]): void; setActive(id: string | number): void; setSide(side: "left" | "right" | "off" | false): void; destroy(): void }
export function mountThreadRail(host: HTMLElement, o?: { side?: "left" | "right"; max?: number; onSelect?(item: ThreadRailItem, index: number): void }): ThreadRailApi;
export const createThreadRail: SatinFactory<ThreadRailOptions, ThreadRailApi>;
export function mountChat(box: HTMLElement, o?: ChatOptions): ChatApi & { destroy(): void };
/** 对话（统一写法）：空容器按选项渲染；update({ status }) 改顶栏状态；destroy 停掉生成中的回答、撤掉监听、清空容器 */
export const createChat: SatinFactory<ChatOptions, ChatApi>;
export function chatHTML(o?: { title?: string; status?: string; placeholder?: string; max?: number; maxLines?: number; attach?: boolean; voice?: boolean; menu?: boolean; newChat?: boolean }): string;
export interface FlowPort { name: string; type?: string }
export interface FlowGroup { id: string; title: string; x: number; y: number; w: number; h: number; hue?: number; color?: string }
export type FlowEdge = [string, string] | { from: string; to: string; fromPort?: string; toPort?: string; type?: string };
export interface FlowNode {
  id: string; x: number; y: number;
  /** 标题（短名 t） */ title?: string; t?: string;
  /** 图标名（短名 ic） */ icon?: string; ic?: string;
  /** 一行说明（短名 d） */ detail?: string; d?: string;
  /** 类型：决定颜色和能连到哪（短名 k） */ kind?: "text" | "board" | "image" | "audio" | "video" | "out" | string; k?: "text" | "board" | "image" | "audio" | "video" | "out" | string;
  /** 缩略图（CSS 背景） */ bg?: string;
  /** 真实图片预览地址（如 ComfyUI 出图 / 参考图预览） */ preview?: string;
  /** 自定义节点宽度（默认 200，ComfyUI 多参数节点可设 210–280） */ w?: number;
  /** 节点角标（如模型架构或步数标识） */ badge?: string;
  /** 是否为轻量级转接路由点（Reroute） */ reroute?: boolean;
  /** 多输入端口（ComfyUI 风格语义插槽） */ inputs?: (string | FlowPort)[];
  /** 多输出端口（ComfyUI 风格语义插槽） */ outputs?: (string | FlowPort)[];
  /** 节点内部参数键值对 */ params?: [string, string | number][];
}
export interface FlowOptions { nodes?: FlowNode[]; edges?: FlowEdge[]; groups?: FlowGroup[]; label?: string }
export function mountFlow(flow: HTMLElement, o?: FlowOptions): { nodes: Map<string, unknown>; readonly edges: unknown[]; destroy(): void };
export function flowHTML(o?: { label?: string }): string;
/** 流程图（统一写法）：节点、连线只在创建时给；destroy 停掉"运行"、撤掉监听、清空容器 */
export const createFlow: SatinFactory<FlowOptions, { readonly nodes: Map<string, unknown>; readonly edges: unknown[] }>;
/** 数据表格（DOM 版十万行、Canvas 版一百万行也流畅）：columns 列定义 + data 数组（或 dataSource 按块从服务端要） */
/** 选项列的一个选项：字符串，或者 { value, label, tone }（tone：status 列色点的色调 0～4，不写按第几个） */
export type GridOption = string | { value: unknown; label?: string; tone?: number };
/** 列定义 */
export interface GridColumn<Row = any> {
  /** 取数据里的哪个字段（唯一） */ key: string;
  /** 表头文字 */ title?: string;
  /** 列宽 / 拖边改宽时最窄多少（默认 160 / 64） */ width?: number; minWidth?: number;
  align?: "left" | "right";
  /** 点表头排序 */ sortable?: boolean;
  /** 列头筛选："enum" 选项多选、"range" 数值范围 */ filter?: "enum" | "range";
  /** 能不能拖右边缘改宽（默认能） */ resizable?: boolean;
  /** 固定在左边 / 右边（固定列不能拖着换位置） */ pinned?: "left" | "right";
  /** 能不能拖着换位置（默认：没固定的都能） */ fixed?: boolean;
  /** 内置的显示：text（默认）| int | dur（秒 → 分:秒）| status | owner | tag | prog（0～100）| time | money | sel（勾选 + 拖行把手）| act（行末的操作按钮） */
  type?: "text" | "int" | "dur" | "status" | "owner" | "tag" | "prog" | "time" | "money" | "sel" | "act";
  /** 选项列（status / owner / tag、enum 编辑和筛选）的选项 */ options?: GridOption[];
  /** 显示的文字 */ format?(value: any, row: Row): string;
  /** 自己画格子（DOM 版）：返回 HTML 字符串或节点；返回 undefined 表示已经自己改好了 cell */ render?(value: any, row: Row, ctx: { cell: HTMLElement; key: string; index: number }): string | Node | void;
  /** 能编辑（edit 写编辑器类型；不写按 type 猜） */ editable?: boolean; edit?: "text" | "int" | "enum" | "dur" | "money";
  /** 编辑框里的文字 → 存的值；不合法返回 { error }（红框加这句话，不提交） */ parse?(text: string, col: GridColumn<Row>): { value: unknown } | { error: string };
  /** 编辑框里显示的文字 */ editText?(value: any): string;
  /** 编辑的范围（int / dur / money） */ min?: number; max?: number;
  /** 主列：树形的缩进、展开箭头、详情箭头放在这一列（不写是第一列普通列） */ primary?: boolean;
  /** 数组数据时，排序按这个取值 */ sortValue?(row: Row): unknown;
}
/** 每行唯一的字段名，或者从行里取唯一值的函数 */
export type GridRowKey<Row = any> = string | ((row: Row) => unknown);
/** 行详情（展开在行下面）：DOM 版给函数 (el, row, index) 或 { init(el), fill(el, row, index) }，往详情容器里填；Canvas 版给 { draw(ctx) } 画（ctx 有 g、row、r、y、w、h、C 颜色、F 字体、text、trunc、width） */
export type GridDetail<Row = any> = ((el: HTMLElement, row: Row, index: number) => void) | { init?(el: HTMLElement): void; fill?(el: HTMLElement, row: Row, index: number): void; draw?(ctx: Record<string, unknown>): void };
/** 排序 */ export interface GridSort { key: string; dir: 1 | -1 }
/** 筛选：搜索词 + 每一列的筛选（选项列是选项的下标、范围列是 { min, max }） */ export interface GridFilter { q: string; filters: Record<string, number[] | { min?: number | null; max?: number | null } | null> }
/** 服务端数据：按块加载（排序、筛选也交给服务端；filter 里选项列给的是选项的值） */
export interface GridDataSource<Row = any> { total?: number; load(q: { start: number; end: number; sort: GridSort | null; filter: { q: string; [key: string]: unknown } }): Promise<Row[] | { rows: Row[]; total?: number }>; edit?(e: { row: number; key: string; value: unknown }): void; move?(e: { from: number; to: number }): void }
export interface GridEvents<Row = any> {
  onRowClick?(e: { row: Row; rowKey: unknown; key: string; index: number }): void;
  onSortChange?(sort: GridSort | null): void;
  onFilterChange?(filter: GridFilter): void;
  /** 勾选变了：keys 是勾上的行的 rowKey；点了全选时 all 为 true、except 是全选以后又去掉的（数组数据 keys 照样列全；dataSource 按块加载时不知道全部的行，keys 是 null） */
  onSelectionChange?(e: { keys: unknown[] | null; all: boolean; except: unknown[] }): void;
  onColumnResize?(e: { key: string; width: number }): void;
  onColumnReorder?(e: { keys: string[] }): void;
  /** 改了一个值（表格先在本地生效；row 是改之前的行） */ onCellEdit?(e: { row: Row; rowKey: unknown; key: string; value: unknown; oldValue: unknown }): void;
  /** 滚到底 */ onScrollEnd?(): void;
  /** 操作列的按钮（"more" 更多）；"detail" 展开详情、"edit" 编辑主列是表格自己处理的 */ onRowAction?(e: { action: string; row: Row; rowKey: unknown; index: number }): void;
  /** 出错状态里点了"重试" */ onRetry?(): void;
}
export interface GridOptions<Row = any> extends GridEvents<Row> {
  columns: GridColumn<Row>[];
  /** 数组数据（几万行以内：筛选、排序在页面里算；行里带 children 数组可以切树形） */ data?: Row[];
  /** 服务端数据（按块加载），或者自己实现的整套后端（见 table-backends.js） */ dataSource?: GridDataSource<Row> | Record<string, unknown>;
  /** 每行唯一的字段名或取值函数（默认 "id"） */ rowKey?: GridRowKey<Row>;
  /** 勾选：多选 / 单选 / 不能选（写了 sel 列时默认多选；要勾选又没写 sel 列会自动加一列） */ selection?: "multiple" | "single" | "none";
  /** 受控的勾选（rowKey 数组） */ selectedKeys?: unknown[]; defaultSelectedKeys?: unknown[];
  /** 受控的排序 */ sort?: GridSort | null; defaultSort?: GridSort | null;
  /** 能拖行换位置（没筛选、没排序时） */ rowDraggable?: boolean;
  /** 一开始就合并的格子：第 rows[0]～rows[1] 行 × keys 这几列 */ merges?: { rows: [number, number]; keys: string[] }[];
  /** 行详情：给了才有详情箭头 */ detail?: GridDetail<Row>;
  /** 树形：主列名字后面的下级数量文字（"4 集"）；level 是 -1 时是工具条上第一级的个数（"12 个项目"）。返回空字符串不显示 */ treeCount?(count: number, level: number): string;
  /** 三种状态 */ loading?: boolean; error?: string | null; emptyText?: string; noMatchText?: string; errorText?: string; loadingText?: string;
  /** 行线 / 网格（默认网格；合并单元格只在网格下出现） */ lines?: "row" | "grid";
  /** 表格框的高度（表头 + 行，不含工具条）：数字是 px，也可以写 "60vh"；默认 480 */ height?: number | string;
  /** 读屏用的表格名字 */ label?: string;
  /** 空容器时是否带工具条（搜索、筛选标签、行数），controls 再加设计稿演示的几个开关 */ toolbar?: boolean; controls?: boolean;
}
export interface GridApi { readonly sort: GridSort | null; readonly filter: GridFilter; readonly selectedKeys: unknown[] | null; merge(p0: number, p1: number, keys: string[]): void; reload(): void; readonly ready: Promise<unknown> }
export function mountDataGrid(root: HTMLElement, o?: GridOptions): GridApi & { update(o: Partial<GridOptions>, prev?: Partial<GridOptions>): void; destroy(): void; [k: string]: unknown };
export function mountCanvasGrid(root: HTMLElement, o?: GridOptions): GridApi & { update(o: Partial<GridOptions>, prev?: Partial<GridOptions>): void; destroy(): void; [k: string]: unknown };
export function dataGridHTML(o?: { label?: string; toolbar?: boolean; controls?: boolean; columns?: GridColumn[]; height?: number | string }): string;
export function canvasGridHTML(o?: { label?: string; toolbar?: boolean; controls?: boolean; columns?: GridColumn[]; height?: number | string }): string;
/** 数据表格（统一写法）：destroy 撤掉监听、观察器、后台线程，拿掉放进 <head> 的样式，清空容器 */
export const createDataGrid: SatinFactory<GridOptions, GridApi>;
export const createCanvasGrid: SatinFactory<GridOptions, GridApi>;
export function openLightbox(items: LightboxItem[], index: number, o?: LightboxOptions): LightboxHandle;
export function closeLightbox(): void;
/** 页面上真正露出来的区域（视口坐标，比如固定顶栏下面那块）：缩略图被挡住的部分不算，图从露出来的那截飞出去；null 恢复整个窗口 */
export function setLightboxBounds(b: { left: number; top: number; right: number; bottom: number } | null): void;
export function playerHTML(o?: { src?: string; poster?: string; label?: string }): string;
export function mountPlayer(el: HTMLElement, o?: { onError?(e: MediaError | null): void }): { play(): Promise<void>; pause(): void; toggle(): Promise<void> | void; video: HTMLVideoElement; destroy(): void };
export function audioHTML(o?: { src?: string; title?: string; sub?: string; wave?: string }): string;
export function mountAudio(el: HTMLElement, o?: { onError?(e: MediaError | null): void }): { toggle(): void; audio: HTMLAudioElement; destroy(): void };

export interface ChartSeries { name: string; values: number[]; color?: string; unit?: string; dashed?: boolean }
export interface AreaChartOptions { labels: string[]; series: ChartSeries[]; height?: number | string; unit?: string; legend?: boolean; area?: boolean; tipNote?(index: number, cfg: AreaChartOptions): string }
export interface BarChartOptions { labels: string[]; series: ChartSeries[]; height?: number | string; unit?: string; legend?: boolean; activeIndex?: number; onSelect?(label: string | null, index: number): void }
export interface DonutItem { label: string; value: number; color?: string }
export interface DonutChartOptions { items: DonutItem[]; totalLabel?: string; centerLabel?: string; size?: number; unit?: string; activeIndex?: number; onSelect?(item: DonutItem | null, index: number): void }
export interface Chart3DOptions { rows: string[]; cols: string[]; values: number[][]; height?: number | string; unit?: string; metricLabel?: string; rowColors?: string[]; interactive?: boolean }
export interface SparklineOptions { values: number[]; color?: string; height?: number | string }
export interface Icon3DOptions { name?: string; tone?: "obsidian" | "ceramic" | "cobalt" | "emerald" | "amber" | "crimson" | "violet" | "glass"; size?: "sm" | "md" | "lg"; label?: string }
export const createAreaChart: SatinFactory<AreaChartOptions, { replay(): void }>;
export const createBarChart: SatinFactory<BarChartOptions, { replay(): void }>;
export const createDonutChart: SatinFactory<DonutChartOptions, { replay(): void }>;
export const createChart3D: SatinFactory<Chart3DOptions, { setView(name: "iso" | "top" | "front"): void; replay(): void }>;
export const createSparkline: SatinFactory<SparklineOptions, Record<string, never>>;
export const createIcon3D: SatinFactory<Icon3DOptions, Record<string, never>>;
export function icon3DHTML(o?: Icon3DOptions): string;
export function bindIcons3D(scope?: Document | HTMLElement): () => void;

export interface TreeNode {
  id: string;
  label: string;
  icon?: string;
  meta?: string;
  badge?: string | number;
  disabled?: boolean;
  hasChildren?: boolean;
  children?: TreeNode[];
}
export type TreeActiveStyle =
  | "subtle"
  | "bar"
  | "tint"
  | { bg?: string; color?: string; ring?: string; bar?: string; hoverBg?: string };

export interface TreeOptions {
  items?: TreeNode[];
  expanded?: string[];
  defaultExpanded?: string[];
  selected?: string | null;
  defaultSelected?: string | null;
  selectable?: boolean;
  checked?: string[];
  defaultChecked?: string[];
  checkable?: boolean;
  searchable?: boolean;
  draggable?: boolean;
  virtual?: boolean;
  rowHeight?: number;
  height?: number | string;
  activeStyle?: TreeActiveStyle;
  loadChildren?(node: TreeNode): Promise<TreeNode[]> | TreeNode[];
  label?: string;
  onSelect?(e: { id: string; node: TreeNode }): void;
  onCheck?(e: { ids: string[]; id: string; checked: boolean; node: TreeNode }): void;
  onExpand?(e: { id: string; expanded: boolean; node: TreeNode; expandedIds: string[] }): void;
  onMove?(e: { dragId: string; targetId: string; position: "before" | "inside" | "after"; node: TreeNode; items: TreeNode[] }): void;
}
export interface TreeApi {
  expand(id: string, open?: boolean): Promise<void> | void;
  expandAll(open?: boolean): void;
  filter(q: string): void;
  select(id: string | null): void;
  setItems(items: TreeNode[]): void;
  getVisibleCount(): number;
  getRenderedCount(): number;
}
export function treeHTML(o?: { height?: number | string; label?: string; searchable?: boolean; checkable?: boolean }): string;
export const createTree: SatinFactory<TreeOptions, TreeApi>;

export type FileKind = "folder" | "pdf" | "word" | "ppt" | "vue" | "tsx" | "txt" | "doc" | "image" | "video" | "audio" | "code" | "file";
export type FileView = "card" | "list" | "tree";
export type FolderColorPreset = "default" | "blue" | "amber" | "sage" | "violet" | "rose";
export interface FileNode {
  id: string;
  name: string;
  kind?: FileKind;
  color?: FolderColorPreset | (string & {});
  size?: string | number;
  updated?: string;
  preview?: string;
  duration?: string;
  excerpt?: string;
  pages?: number;
  hasChildren?: boolean;
  children?: FileNode[];
}
export interface FileExplorerOptions {
  items?: FileNode[];
  view?: FileView;
  path?: string[];
  height?: number | string;
  searchable?: boolean;
  rootName?: string;
  activeStyle?: TreeActiveStyle;
  menuSurface?: "solid" | "blur";
  loadChildren?(node: FileNode): Promise<FileNode[]> | FileNode[];
  label?: string;
  onChange?(e: { items: FileNode[]; action: string }): void;
  onOpen?(e: { id: string; node: FileNode }): void;
  onSelect?(e: { ids: string[] }): void;
  onViewChange?(e: { view: FileView }): void;
  onNavigate?(e: { path: string[]; folder: FileNode | null }): void;
  onMove?(e: { ids: string[]; nodes: FileNode[]; targetId: string | null }): void;
  onCreate?(e: { node: FileNode; parentId: string | null }): void;
  onRename?(e: { id: string; name: string; oldName: string; node: FileNode }): void;
  onDelete?(e: { ids: string[]; nodes: FileNode[] }): void;
  onColorChange?(e: { ids: string[]; color: string }): void;
}
export interface FileExplorerApi {
  setView(view: FileView): void;
  openFolder(id: string): Promise<void>;
  goUp(): void;
  createItem(kind?: FileKind, parentId?: string | null): FileNode;
  renameItem(id: string, name: string): boolean;
  setFolderColor(ids: string | string[], color?: string): boolean;
  moveItems(ids: string[], targetFolderId: string): boolean;
  deleteItems(ids: string[]): boolean;
  undo(): boolean;
  getItems(): FileNode[];
  getView(): FileView;
  getPath(): string[];
}
export function fileExplorerHTML(o?: { height?: number | string; label?: string; view?: FileView; searchable?: boolean }): string;
export const createFileExplorer: SatinFactory<FileExplorerOptions, FileExplorerApi>;
