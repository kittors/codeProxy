// satin-ui/components：不依赖框架的组件 API
export interface SatinInstance<O = Record<string, unknown>> {
  /** 组件根元素 */
  readonly el: HTMLElement;
  /** 渲染进去的宿主（el 是空容器时）；在已有标记上接交互时为 null */
  readonly host: HTMLElement | null;
  readonly name: string;
  readonly alive: boolean;
  /** 合并新选项；组件自己判断哪些变了（值变了会带动画过去） */
  update(options: Partial<O>): this;
  /** 撤掉挂载时加的监听、观察器、定时器；宿主里渲染的标记也清掉 */
  destroy(): void;
  on(type: string, fn: (detail: any) => void): () => void;
  off(type: string, fn: (detail: any) => void): void;
}
export interface SatinFactory<O, I = {}> {
  (el: HTMLElement, options?: O): SatinInstance<O> & I;
  /** 纯字符串：生成和浏览器第一帧一样的标记（Node / SSR 里也能调） */
  html(options?: O): string;
  readonly componentName: string;
}
export type Item = string | { value: string | number; label?: string; disabled?: boolean };

/** 头像：src 优先、加载失败退回预设；没有 src 按 seed（没给用 name）稳定地挑一张预设，同一个名字永远是同一张。头像里不放文字 */
export interface AvatarOptions {
  /** 照片地址；加载失败原地换成预设 */ src?: string;
  /** 名字：挑预设用，单独出现时也是读屏念的名称 */ name?: string;
  /** 挑预设用的键（比如用户 id）；不给用 name */ seed?: string;
  /** 16 / 20 / 24 / 32 / 40 / 64，默认 32；24 及以下用简化版预设 */ size?: 16 | 20 | 24 | 32 | 40 | 64 | number;
  /** 读屏念的名称（默认 name） */ label?: string;
  /** 旁边已经写了名字：头像只是装饰（aria-hidden） */ decorative?: boolean;
  /** 右下角画在线点 */ online?: boolean;
}
export const createAvatar: SatinFactory<AvatarOptions, {}>;
/** 头像的标记（Node / SSR 里也能调） */
export function avatarHTML(o?: AvatarOptions): string;
/** 按 id 或名字稳定地挑一张预设：{ id, svg }；size ≤ 24 给简化版 */
export function presetAvatar(seed: string, size?: number): { id: string; svg: string };
/** 取某一张预设的 SVG 字符串（id 是 a1 … a12） */
export function avatarSvg(id: string, size?: number): string;
/** 12 张预设的 id */
export const AVATAR_IDS: readonly string[];

/** 空状态内置场景 SVG 插画名（纯中性灰度、深浅双主题自适应） */
export type EmptyArtName = "projects" | "search" | "error" | "inbox" | "folder" | "lock";
/** 空状态场景插画选项 */
export interface EmptyArtOptions {
  /** 场景名：projects（首次使用 / 还没有项目，默认）| search（筛选无结果）| error（加载失败）| inbox（空收件箱）| folder（空文件夹）| lock（无权限） */
  name?: EmptyArtName;
  /** 读屏描述（省略时插画为纯装饰 aria-hidden） */
  label?: string;
}
export const createEmptyArt: SatinFactory<EmptyArtOptions, {}>;
/** 空状态场景插画的 HTML 标记（Node / SSR 安全） */
export function emptyArtHTML(o?: EmptyArtOptions): string;
/** 取某一款空状态场景插画的纯 SVG 字符串 */
export function emptyArtSvg(name?: EmptyArtName | (string & {})): string;
/** 全部内置空状态场景插画名 */
export const EMPTY_ART_IDS: readonly EmptyArtName[];
export interface SegmentedOptions { items?: Item[]; value?: string; size?: "sm" | "md"; label?: string; onChange?(value: string): void }
export const createSegmented: SatinFactory<SegmentedOptions, { readonly value: string; select(value: string): void }>;
export interface SliderOptions { value?: number; max?: number; label?: string; onChange?(value: number): void }
export const createSlider: SatinFactory<SliderOptions, { readonly value: number }>;
export interface SelectOptions { items?: Item[]; value?: string; placeholder?: string; label?: string; onChange?(value: string): void }
export const createSelect: SatinFactory<SelectOptions, { readonly value: string | null; open(): void; close(refocus?: boolean): void }>;
export interface OtpOptions { length?: number; /** 密码隐藏模式（掩码圆点显示） */ mask?: boolean; /** 是否显示明文/密文切换眼睛按钮（开启 mask 时默认为 true） */ reveal?: boolean; onComplete?(code: string): void }
export const createOtp: SatinFactory<OtpOptions, { readonly value: string; readonly masked: boolean; setMask(masked: boolean): void; clear(): void }>;
export interface TabsOptions { tabs?: { label: string; badge?: string | number; content?: string; html?: string }[]; value?: number; onChange?(index: number): void }
export const createTabs: SatinFactory<TabsOptions, { readonly value: number; select(index: number): void }>;
/** Chrome 浏览器式平滑弧形页标签的一项 */
export interface BrowserTabItem { id: string | number; title: string; icon?: string; dot?: "ok" | "warn" | "bad" | "need" | true; pinned?: boolean; closable?: boolean }
export interface BrowserTabsOptions {
  tabs?: BrowserTabItem[];
  active?: string | number;
  addable?: boolean;
  addLabel?: string;
  label?: string;
  extraHTML?: string;
  onChange?(e: { id: string; tab?: BrowserTabItem }): void;
  onClose?(e: { id: string; tab: BrowserTabItem; active: string | null }): void;
  onAdd?(e: { tabs: BrowserTabItem[] }): void;
}
export interface BrowserTabsApi {
  readonly active: string | null;
  readonly tabs: BrowserTabItem[];
  activate(id: string | number): void;
  add(tab: BrowserTabItem, activate?: boolean): void;
  close(id: string | number): void;
}
export const createBrowserTabs: SatinFactory<BrowserTabsOptions, BrowserTabsApi>;
export function browserTabsHTML(o?: BrowserTabsOptions): string;
export function mountBrowserTabs(root: HTMLElement, o?: BrowserTabsOptions): BrowserTabsApi & { update(next?: Partial<BrowserTabsOptions>, prev?: BrowserTabsOptions): void; destroy(): void };
export interface PagerOptions { total?: number; page?: number; count?: number; onChange?(page: number): void }
/** 分页：update({ total }) 总页数可以变（筛选以后），当前页超出就停在最后一页；update({ page }) 改页码不触发 onChange */
export const createPager: SatinFactory<PagerOptions, { readonly page: number; readonly total: number; go(page: number, silent?: boolean): void }>;
export interface CollapseOptions { items?: { title: string; content?: string; html?: string }[]; single?: boolean; /** 展开的序号；update 里换了（按值比）就照它开合 */ open?: number[]; onToggle?(e: { index: number; open: boolean }): void; /** 一次操作以后现在展开的序号 */ onChange?(open: number[]): void }
export const createCollapse: SatinFactory<CollapseOptions, { open(index: number): void; close(index: number): void; toggle(index: number): void; readonly expanded: number[] }>;
export interface TagInputOptions { /** update 里换了（按值比）就照它显示 */ tags?: string[]; max?: number; placeholder?: string; hint?: string; onChange?(tags: string[]): void }
export const createTagInput: SatinFactory<TagInputOptions, { readonly tags: string[]; add(tag: string): void; clear(): void; /** 换成这些标签，不发 change */ set(tags: string[]): void }>;
export interface StepperOptions { value?: number; min?: number; max?: number; unit?: string; label?: string; onChange?(value: number): void }
export const createStepper: SatinFactory<StepperOptions, { readonly value: number; set(value: number): void }>;
export interface NumberFlowOptions { value?: number; /** 变化的样子 */ effect?: "roll" | "blur" | "push" | "fade"; /** effect 的旧名 */ style?: "roll" | "blur" | "push" | "fade"; format?(v: number): string; reduced?(): boolean }
export const createNumberFlow: SatinFactory<NumberFlowOptions, { readonly value: number; set(value: number): void; get(): number; setStyle(style: "roll" | "blur" | "push" | "fade"): void }>;
export interface ScrollAreaOptions {
  /** 渐隐方向："y"（默认）| "x" | "both" | "none"，或者 "top bottom left right" 任意组合 */ fade?: "y" | "x" | "both" | "none" | (string & {});
  /** 渐隐带宽度（px），默认 24 */ size?: number;
  /** 滚动条："auto"（默认：滚动或悬停时出现）| "hover" | "always" | "gutter"（常驻、占自己的位置）| "none" */ bar?: "auto" | "hover" | "always" | "gutter" | "none";
  /** 滚动条平时的粗细（px），默认 5 */ barSize?: number;
  /** 滚动条离边的距离（px），默认 1 */ barInset?: number;
  /** 滚到头："auto"（默认）| "contain"（两个方向都停住）| "bounce"（回弹）| "chain"（交给外层） */ overscroll?: "auto" | "contain" | "bounce" | "chain";
  /** "auto"（默认）| "x"：竖着滚滚轮也横向滚 */ wheel?: "auto" | "x";
  /** el 自己有定位（fixed / absolute / sticky 的面板）时为 true：在 el 里面套一层滚动视口 */ inner?: boolean;
}
export const createScrollArea: SatinFactory<ScrollAreaOptions, { readonly box: HTMLElement; readonly vp: HTMLElement; refresh(): void; set(options: Partial<ScrollAreaOptions>): void; readonly options: ScrollAreaOptions }>;
interface InputBoxOptions { id?: string; name?: string; label?: string; help?: string; placeholder?: string; size?: "sm" | "lg" | "xl"; autocomplete?: string }
/** 密码框：显示 / 隐藏按钮、大写锁定提示；meter: true 加强度条（注册、改密码用） */
export const createPassword: SatinFactory<InputBoxOptions & { meter?: boolean; value?: string; onChange?(value: string): void }, { readonly value: string; focus(): void }>;
export function passwordHTML(o?: InputBoxOptions & { meter?: boolean }): string;
export function emailHTML(o?: InputBoxOptions): string;
export function searchHTML(o?: { id?: string; name?: string; label?: string; placeholder?: string; size?: "sm" | "lg"; kbd?: string | false }): string;
export function countHTML(o?: { id?: string; name?: string; placeholder?: string; max?: number; value?: string; size?: "sm" | "lg" | "xl" }): string;
/** 邮箱框：停止输入 400ms 后格式对了出现对勾 */
export const createEmail: SatinFactory<InputBoxOptions & { value?: string; onChange?(value: string): void }, { readonly value: string; focus(): void }>;
/** 搜索框：防抖、转圈（300ms 内回来不转）、结果数、清除按钮、按 / 聚焦。search(q) 返回结果数 */
export const createSearch: SatinFactory<{ search?(q: string): number | unknown[] | Promise<number | unknown[]>; debounce?: number; onSearch?(q: string): void; placeholder?: string; label?: string; kbd?: string | false; id?: string; name?: string; size?: "sm" | "lg" | "xl" }>;
/** 带字数的输入框（max 默认 20） */
export const createCount: SatinFactory<{ id?: string; name?: string; placeholder?: string; max?: number; value?: string; size?: "sm" | "lg" | "xl"; onChange?(value: string): void }, { readonly value: string; focus(): void }>;
export interface LongTextOptions { value?: string; max?: number; maxLines?: number; rows?: number; placeholder?: string; hint?: string; label?: string; id?: string; name?: string; onChange?(value: string): void; onSubmit?(value: string): void }
/** 长文本的标记（空容器交给 createLongText 时就用它渲染） */
export function longTextHTML(o?: LongTextOptions): string;
export const createLongText: SatinFactory<LongTextOptions, { readonly value: string; focus(): void }>;
/** 菜单里的一项（上下文栏能点开的那项、权限、模型） */
export interface ComposerOption { value: string; label: string; /** 模型那一项：窄的时候按钮上只显示它（不给就取 label 里最后一个"·"后面的档位） */ short?: string }
/** 输入框顶上上下文栏的一项（项目文件夹、本地 / 云端、分支……）：有 options 的点开是菜单（选了发 contextChange），没有的点了发 contextClick */
export interface ComposerContextItem { icon?: string; text: string; options?: ComposerOption[]; value?: string }
/** 状态色（小圆点）：ok 绿、warn 橙、bad 红、need 主色；不给是灰 */
export type ComposerTone = "ok" | "warn" | "bad" | "need";
/** 底部一行的模式 / 权限标签：有 options 的点开是菜单（选了发 modeChange），label、tone 跟着选中的那项 */
export interface ComposerMode { label?: string; tone?: ComposerTone; options?: (ComposerOption & { tone?: ComposerTone })[]; value?: string }
/** 新对话那一套（都可选，不给时输入框和原来一模一样） */
export interface ComposerParts {
  /** 输入框顶上的上下文栏 */
  context?: ComposerContextItem[];
  /** 模式 / 权限标签（直接给一段字也行） */
  mode?: ComposerMode | string;
  /** 模型选择：label 写成"名称 · 档位" */
  models?: ComposerOption[];
  /** 当前模型（models 里的 value） */
  model?: string;
}
export interface ComposerPartEvents {
  onModelChange?(value: string): void;
  onModeChange?(value: string): void;
  onContextChange?(e: { index: number; value: string; item: ComposerContextItem }): void;
  onContextClick?(e: { index: number; item: ComposerContextItem }): void;
}
/** 附件菜单点了以后给出的一个附件（演示、自己接上传时用；真文件拖进来、粘贴进来的组件自己读） */
export interface ComposerAttachment { kind: "img" | "vid" | "aud" | "doc"; name: string; size: number; g?: string; dur?: string; ext?: string; seed?: number; failAt?: number; bad?: string }
/** 提示词输入框的标记（空容器交给 createComposer 时就用它渲染） */
export function composerHTML(o?: { placeholder?: string; max?: number; maxLines?: number; attach?: boolean; voice?: boolean; send?: string; submitKey?: "enter" | "mod-enter"; external?: boolean; fresh?: boolean } & ComposerParts): string;
/** 提示词输入框：onSend 返回 Promise 时，Promise 结束才退出"生成中"；message.files 是附件行元素（元素上的 _file 是原始 File） */
export const createComposer: SatinFactory<{ placeholder?: string; max?: number; maxLines?: number; attach?: boolean; /** 是否显示语音输入按钮（默认开启） */ voice?: boolean; /** 发送按钮的名字 */ send?: string; /** 发送快捷键："enter"（Enter 直接发送、Shift+Enter 换行，默认）| "mod-enter"（⌘/Ctrl+Enter 发送） */ submitKey?: "enter" | "mod-enter"; external?: boolean; onSend?(message: { text: string; files: HTMLElement[] }): void | Promise<unknown>; onStop?(): void; upload?(file: File, progress: (p: number) => void): Promise<unknown> } & ComposerParts & ComposerPartEvents, { setBusy(on: boolean): void; clear(o?: { smooth?: boolean; dur?: number; ease?: string; phHold?: number }): void; files(): HTMLElement[]; /** 填一段字进输入框（字淡入、光标在最后） */ fill(text: string): void; /** 动态切换回车发送快捷键模式 */ setSubmitKey(mode: "enter" | "mod-enter"): void; /** 开始语音输入 */ startVoice(): void; /** 结束语音输入（cancel 为 true 时取消并还原原文本） */ stopVoice(cancel?: boolean): void }>;
export interface ProgressCardApi { start(title: string, sub?: string, enter?: boolean): void; set(progress: number, sub?: string): void; finish(title?: string, sub?: string): void; cancel(title?: string, sub?: string): void }
export const createProgressCard: SatinFactory<{ onCancel?(): void; onOpen?(): void }, ProgressCardApi>;
/** 选择器选好值时的数据：text 是触发框里显示的文字（清除时是空字符串） */
export interface PickDetail { text: string }
/** 日期、时间、定时、地址选择器：在已有的 [data-pk] 标记上接交互。today / now 默认真实的今天、现在 */
/** 选择器的种类：日期、日期范围、时间、定时发布（日期 + 时间）、省市区 */
export type PickerKind = "date" | "range" | "time" | "datetime" | "region";
/** kind、placeholder、label 给空容器渲染标记时用（createPicker.html）；today、now 固定"今天""现在"；onChange 拿到触发框里显示的文字 */
export interface PickerOptions { kind?: PickerKind; placeholder?: string; label?: string; today?: Date; now?: Date; onChange?(detail: PickDetail): void }
export const createPicker: SatinFactory<PickerOptions>;
export const createUpload: SatinFactory<{ list?: HTMLElement; accept?: RegExp; maxSize?: number; /** 类型不对时那一行的提示 */ badType?: string; /** 超过 maxSize 时那一行的提示 */ tooBig?: string; upload?(file: File, progress: (p: number) => void): Promise<unknown> }, { add(files: FileList | File[]): void }>;
/** 拖拽重排：row 行的选择器（默认 ".sn-drag-row"，拖的把手是行里的 .sn-grip）；onReorder 顺序变了（拖拽、键盘都算）：from 原来第几个、to 放到第几个、row 这一行 */
export interface ReorderOptions { row?: string; onReorder?(e: { from: number; to: number; row: HTMLElement }): void }
/** 行由库直接挪（DOM 顺序就是新顺序）；rows() 按现在的顺序返回行 */
export const createReorder: SatinFactory<ReorderOptions, { rows(): HTMLElement[] }>;
/** 顶栏（.sn-header）：默认 position: fixed 锚定视口顶部并配合 overscroll-behavior-y: none 杜绝滚动/触顶回弹弹跳 */
export interface HeaderLink { key?: string; label: string; href?: string }
export interface HeaderOptions {
  brand?: string;
  sub?: string;
  href?: string;
  links?: (string | HeaderLink)[];
  active?: string;
  actions?: string;
  size?: "sm" | "md" | "lg";
  width?: "default" | "wide" | "fluid";
  solid?: boolean;
  /** 局部/内嵌模式：用于文档预览框或独立分栏内部 */
  static?: boolean;
  scrollTarget?: Window | HTMLElement | null;
  threshold?: number;
  onNavigate?(key: string, el: HTMLElement): void;
}
export interface HeaderApi {
  readonly active: string | null;
  setActive(key: string): void;
  syncScroll(): void;
}
export function headerHTML(o?: HeaderOptions): string;
export function mountHeader(el: HTMLElement, o?: HeaderOptions): HeaderApi & { el: HTMLElement; destroy(): void };
export const createHeader: SatinFactory<HeaderOptions, HeaderApi>;
/** 侧栏布局（.sn-app）：选中切换、收起 / 展开（⌘\\）。collapseBelow：布局窄于这个宽度时自动收成图标栏（手机上用，比如 720） */
export const createSidebar: SatinFactory<{ onNavigate?(link: HTMLElement): void; collapseBelow?: number }, { toggle(): void; select(link: HTMLElement): void; setFx(fx: "slide" | "bar" | "fade" | "text"): void }>;
export const createInfiniteList: SatinFactory<{ loadPage(offset: number, size: number): Promise<unknown[]>; /** 把一行画出来：row 是行元素（会复用，子元素可以缓存在 row._d 上），item 是这一行的数据 */ renderRow(row: HTMLElement, item: any, index: number): void; rowHeight?: number; total?: number; pageSize?: number; /** 数量变了调：loaded 已加载的条数；total 总数（mountInfiniteList 会给；createInfiniteList 现在只转第一个参数，total 是 undefined） */ onCount?(loaded: number, total?: number): void }, { reload(): void; scrollTop(): void; readonly count: number }>;
/** 视频播放器：src 视频地址、poster 封面、label 读屏读的名字；onError 地址打不开、格式不支持时调（播放器画面上不显示错误，要自己告诉用户） */
export interface PlayerOptions { src?: string; poster?: string; label?: string; onError?(e: MediaError | null): void }
/** 音频条：title / sub 两行字；wave 波形数据的地址（不给就从音频本身算）；onError 同视频 */
export interface AudioOptions { src?: string; title?: string; sub?: string; wave?: string; onError?(e: MediaError | null): void }
export const createPlayer: SatinFactory<PlayerOptions, { play(): Promise<void>; pause(): void; toggle(): Promise<void> | void; readonly video: HTMLVideoElement }>;
export const createAudio: SatinFactory<AudioOptions, { toggle(): void; readonly audio: HTMLAudioElement }>;

// 纯样式组件的标记
export interface ButtonHTMLOptions { text?: string; variant?: "primary" | "secondary" | "tertiary" | "ghost" | "danger" | "danger-soft"; size?: "sm" | "md" | "lg"; icon?: string; iconAfter?: string; round?: boolean; selected?: boolean; disabled?: boolean; busy?: boolean; type?: "button" | "submit" | "reset"; tip?: string; attrs?: Record<string, string> }
export function buttonHTML(o?: ButtonHTMLOptions): string;
export function checkHTML(o?: { label?: string; checked?: boolean; indeterminate?: boolean; disabled?: boolean; name?: string; value?: string }): string;
export function switchHTML(o?: { label?: string; checked?: boolean; disabled?: boolean; name?: string }): string;
export function inputHTML(o?: { value?: string; placeholder?: string; size?: "sm" | "md" | "lg" | "xl"; type?: string; id?: string; name?: string; disabled?: boolean; invalid?: boolean }): string;
/** 字段：标签 + 控件 + 说明 + 错误。error 不传就没有错误区；传字符串就有（空字符串 = 先占好位置，之后 setFieldError 展开）；name 写成 data-f，给 validateForm 找规则 */
export function fieldHTML(o?: { label?: string; control?: string; help?: string; error?: string; id?: string; name?: string }): string;
export function chipHTML(o?: { text?: string; on?: boolean; removable?: boolean }): string;
export type ProgressTone = "run" | "ok" | "warn" | "bad";
export interface ProgressOptions { value?: number; ring?: boolean; svg?: boolean; size?: "sm" | "md" | "lg"; tone?: ProgressTone; active?: boolean; segments?: number; showValue?: boolean; height?: number }
export function progressHTML(o?: ProgressOptions): string;
export type LoaderVariant = "matrix" | "dots" | "arc" | "orbit" | "bars" | "grid" | "radar" | "morph";
export interface LoaderOptions { variant?: LoaderVariant; size?: "xs" | "sm" | "md" | "lg" | "xl" | number; color?: string; speed?: number; label?: string }
export const LOADER_VARIANTS: readonly LoaderVariant[];
export function loaderHTML(o?: LoaderOptions): string;
export const createLoader: SatinFactory<LoaderOptions, Record<string, never>>;
export function spinnerHTML(o?: { size?: "lg" }): string;
export function stepsHTML(o?: { steps?: string[]; current?: number }): string;
export function setStep(steps: HTMLElement, index: number): number;
export function esc(s: unknown): string;
export function icon(name: string, size?: number): string;

// 按钮状态、复制、芯片
/** 按钮等待：work 是毫秒数或 Promise（真实请求）。300ms 内完成不转圈；转圈出现后至少留 500ms；期间点不了。结束后 resolve（没有值） */
export function busy(btn: HTMLElement, work: number | PromiseLike<unknown>): Promise<void>;
export function succeed(btn: HTMLElement, back?: number): void;
export function copied(btn: HTMLElement): void;
/** 移除芯片：先脱离布局淡出，旁边的用弹簧补位；keep 为 true 时不删节点（React、Vue 里由父组件删） */
export function removeChip(chip: HTMLElement, o?: { onRemoved?(): void; keep?: boolean }): void;

// 反馈
export interface ToastOptions { text: string; /** "status"（默认，3 秒）| "action"（倒计时环 + 按钮，5 秒）| "progress"（进度环 + 百分比，直到 update 成结果） */ kind?: "status" | "action" | "progress"; /** 图标颜色："ok"（成功，status 默认）| "danger" | "info" */ tone?: "ok" | "danger" | "info"; icon?: string; duration?: number; action?: { label: string; run(t: ToastHandle): void }; progress?: number; alert?: boolean; done?: boolean }
export interface ToastHandle { readonly el: HTMLElement; update(o: Partial<ToastOptions>): void; /** 暂停 / 继续倒计时（鼠标移上去时自动暂停） */ pause(on: boolean): void; close(): void }
export function toast(o: ToastOptions): ToastHandle;
/** 通知卡片：body 是正文（不是 text）；actions 的 run 收到卡片本身，不写 run 点了就关 */
export interface NotifyHandle { readonly el: HTMLElement; close(): void }
export interface NotifyOptions { title: string; body?: string; icon?: string; /** 图标颜色："ok" 成功 | "bad" 失败 | "warn" 提醒 */ tone?: "ok" | "bad" | "warn"; time?: string; actions?: { label: string; variant?: string; run?(card: NotifyHandle): void }[] }
export function notify(o: NotifyOptions): NotifyHandle;

// 浮层
export function openDialog(dialog: HTMLDialogElement, trigger?: HTMLElement | null): void;
export function closeDialog(dialog: HTMLDialogElement, refocus?: boolean): Promise<void>;
export function wireDialog(dialog: HTMLDialogElement): void;
export function openDrawer(drawer: HTMLElement, o?: { trigger?: HTMLElement | null; scrim?: HTMLElement; focus?: HTMLElement; onClose?(): void }): { close(refocus?: boolean): void };
export function closeDrawer(refocus?: boolean): void;
export interface PopoverHandle { readonly pop: HTMLElement; close(refocus?: boolean): void }
export function openPopoverAt(pop: HTMLElement, trigger: HTMLElement, o?: { align?: "start" | "center" | "end"; onClose?(): void }): PopoverHandle;
/** 正开着的那一个弹出面板（没开返回 undefined） */
export function popoverOf(pop: HTMLElement): PopoverHandle | undefined;
/** 菜单选中一项时给的东西（openMenu 的 onSelect，和根菜单上冒泡的 menuselect 事件的 detail） */
export interface MenuSelectDetail { item: HTMLElement; label: string; /** 子菜单里的项：从根菜单往下经过的那几行的文字 */ path: string[]; menu: HTMLElement }
export function openMenu(menu: HTMLElement, o?: { trigger?: HTMLElement; x?: number; y?: number; anchor?: HTMLElement; keyboard?: boolean; align?: string; bound?: HTMLElement | "window"; surface?: "solid" | "blur"; onSelect?(detail: MenuSelectDetail): void; onClose?(): void }): void;
export function closeMenu(refocus?: boolean): void;
/** 命令面板的一条：name 显示的名字；sub 灰色的补充；key 右边显示的快捷键；keys 额外的搜索词（比如英文名）。可以带自己的字段，onRun 原样拿到 */
export interface CommandItem { name: string; icon?: string; sub?: string; key?: string; keys?: string; [k: string]: unknown }
/** 命令面板（整页一个）：empty(q) 是没有结果时显示的 HTML，里面带 data-empty-act 的按钮点了（或直接回车）调 onEmpty；destroy() 撤掉这次加的行和 ⌘K 监听（组件卸载时调） */
export function createCommandPalette<T extends CommandItem = CommandItem>(groups: { name: string; items: T[] }[], o?: { onRun?(item: T): void; placeholder?: string; empty?(q: string): string; onEmpty?(q: string): void; hotkey?: boolean; enterLabel?: string }): { open(): void; close(): void; toggle(): void; destroy(): void; readonly input: HTMLInputElement; readonly list: HTMLElement };
/** 看图的一张：src 图片地址，或 bg 直接给 CSS 背景（"url(…) center / cover"、渐变、颜色）；size 原图 [宽, 高]（适应窗口时不放大超过原图），只知道比例时给 ratio（宽 ÷ 高，都不给按 16:9）；alt 读屏读的说明。视频：type: "video"，src 是视频地址、poster 是封面 */
export interface LightboxItem { src?: string; bg?: string; ratio?: number; size?: [number, number]; alt?: string; type?: "video"; poster?: string }
/** thumbOf(i) 第 i 张的缩略图：从它那里放大、关上时沿原路缩回去（不给就在中间淡入淡出）；enabled(i) 左右翻页能不能停在这一张（加载失败的跳过）；onClose 关上以后 */
export interface LightboxOptions { thumbOf?(i: number): HTMLElement | null | undefined; enabled?(i: number): boolean; onClose?(): void }
/** 打开着的看图层：step(±1) 翻页、zoom(±1) 缩放、rotate(±1) 旋转 90°、reset() 还原、close() 关上 */
export interface LightboxHandle { close(): void; step(d: number): void; zoom(d: number): void; rotate(d: number): void; reset(): void }
export function openLightbox(items: LightboxItem[], index: number, o?: LightboxOptions): LightboxHandle;
export function closeLightbox(): void;

// ———— 其余公开函数 ————
/** 表单校验：表单里每个 .sn-field[data-f="名字"] 按 rules[名字](值, 输入框) 查，返回错误文字就标红并写到字段下面；第一个错的获得焦点。全部通过返回 true */
export function validateForm(form: HTMLElement, rules: Record<string, (value: string, input: HTMLInputElement) => string | null | undefined | false>): boolean;
/** 给一个 .sn-field 标错（红框 + 下面一行错误文字 + aria-invalid） */
export function setFieldError(field: HTMLElement, message: string): void;
export function clearFieldError(field: HTMLElement): void;
/** 提前把按钮内容包成 busy() 需要的结构（避免第一次等待时排版跳一下） */
export function prepBusy(button: HTMLElement): HTMLElement;
/** 在已有的 .sn-slider 标记上接交互（一般用 createSlider） */
export function initSlider(el: HTMLElement): void;
/** 在已有的 .sn-select 标记上接交互（一般用 createSelect） */
export function mountSelect(el: HTMLElement, options?: { onChange?(value: string, item: HTMLElement): void }): { readonly value: string | null; open(): void; close(refocus?: boolean): void; set(value: string): void };
/** 把 root 里所有 .sn-select 都接上 */
export function bindSelects(root?: ParentNode): void;
/** 插入一行：其余行平滑让位（FLIP） */
export function insertWithFlip(container: HTMLElement, el: HTMLElement, before?: Element | null): void;
/** 删掉一行：先脱离布局淡出，其余行用弹簧补位；Promise 在动画走完后完成。keep：不从页面上拿掉（框架里用：Promise 完成后再改数据，让框架删节点） */
export function removeWithFlip(el: HTMLElement, options?: { keep?: boolean }): Promise<void>;
/** 框架里加一项：改数据之前调，记下容器里每个子元素现在的位置；DOM 更新以后调返回的函数——留下的元素平滑移到新位置，传进来的新元素按"新增"的方式出现 */
export function flipSnapshot(container: HTMLElement): (entering?: Element | Element[] | null) => void;
/** 乐观更新：先 apply() 显示结果，再 save()；失败时 revert()、抖一下 shake 元素、弹出带"重试"的 Toast */
/** apply 马上改界面；revert 保存失败时改回去；save 保存（返回 Promise，reject 算失败）；shake 失败时左右抖两下的元素；failText 失败提示（默认"没保存上，已恢复原样"），带"重试" */
export interface OptimisticOptions { apply(): void; revert(): void; save(): Promise<unknown> | unknown; shake?: HTMLElement | null; failText?: string }
export function optimistic(options: OptimisticOptions): Promise<unknown>;
/** load() 超过一小会儿还没回来才显示骨架屏 skeleton；回来以后换成 render(数据) 的内容（逐行错开淡入）。shown：骨架屏有没有出现过，waited：等了多少毫秒 */
export function loadWithSkeleton<T>(el: HTMLElement, options: { load(): Promise<T> | T; skeleton?: string; render?(data: T): string; stagger?: number }): Promise<{ shown: boolean; waited: number }>;
/** Toast 出现的位置：顶部居中（默认）或底部居中；记在 localStorage，刷新后保持 */
export function setToastPos(pos: "top" | "bottom"): void;
/** 在已有的生成进度卡片标记上接交互（一般用 createProgressCard） */
export function mountProgress(el: HTMLElement, options?: { onCancel?(api: ProgressCardApi): void; onOpen?(api: ProgressCardApi): void }): ProgressCardApi;
/** 在 trigger 旁边打开一个浮层（.sn-pop），点外面、Esc 关；onClose 在关掉时调 */
export function openPopover(pop: HTMLElement, trigger: HTMLElement, options?: { align?: "start" | "center" | "end"; onClose?(): void }): PopoverHandle;
/** 把 root 里浮层的触发器（data-pop、data-dialog、data-drawer、data-menu……）都接上 */
export function bindOverlays(root?: ParentNode): void;
/** 把 root 里的折叠面板（.sn-acc）都接上 */
export function bindCollapses(root?: ParentNode): void;
/** 把 root 里的输入框（密码、邮箱、搜索、计数、长文本、提示词输入框）都接上 */
export function bindInputs(root?: ParentNode, options?: { composer?: Record<string, unknown> }): void;
/** 把 root 里的日期 / 时间选择器都接上 */
export function bindPickers(root?: ParentNode, options?: Pick<PickerOptions, "today" | "now">): void;

// ———— 表格（真数据） ————
/** render 的第三个参数：cell 是这一格（字符串阶段——服务端渲染、第一帧——是 null，返回 HTML 字符串或先空着）；index 是现在的顺序里第几行（树形按整棵树数）；level 是第几级（0 起） */
export interface TableCellContext { cell: HTMLElement | null; key: string; index: number; level: number }
export interface TableColumn<R = any> {
  /** 取行里的哪个字段；拖列、改宽、合并、事件都按它认列 */ key: string;
  /** 表头文字 */ title?: string;
  /** "actions"：行末的操作列（固定在最右边，不排序、不拖、不改宽；悬停这一行时按钮才变实） */ type?: "actions";
  /** 数字列 "right"：右对齐 + 等宽数字 */ align?: "left" | "right";
  /** 列宽；开了改宽 / 拖列时写数字（px），不写是弹性列（分剩下的宽度） */ width?: number | string;
  /** 拖边线改宽时最窄多少（px），默认 64 */ minWidth?: number;
  sortable?: boolean;
  /** 第一次点按哪个方向排（时间列常用 "desc"：先看最新的） */ sortFirst?: "asc" | "desc";
  /** 自定义排序（升序时 a 在 b 前面返回负数） */ sort?(a: R, b: R): number;
  /** 拖表头右边缘改宽（双击按内容定宽）：左边这列宽多少，右边那列就窄多少 */ resizable?: boolean;
  /** 开了 draggableColumns 时这一列不能拖；传 "left" / "right" 还可横向滚动固定到左 / 右边缘（带自动边缘投影） */ fixed?: boolean | "left" | "right";
  /** 树形时展开箭头放在这一列（默认第一列） */ primary?: boolean;
  /** 双击（或选中后回车）改这一格，改完发 onCellEdit */ editable?: boolean;
  /** 连续相同的值合成一格：true 按这一列的值比，或者给"算不算相同"的函数；只在网格线下合并 */ merge?: boolean | ((a: R, b: R) => boolean);
  /** 显示的文字（会转义） */ format?(value: any, row: R): string | number;
  /** 显示的 HTML（标签、头像这类标记；自己保证安全） */ html?(value: any, row: R): string;
  /** 自己画格子：返回 HTML 字符串、节点，或者自己改好 ctx.cell 返回 undefined */ render?(value: any, row: R, ctx: TableCellContext): string | number | Node | void;
  num?: boolean; className?: string;
}
/** spans 返回的一块合并：row 是看得见的行里第几行，key 是从哪一列开始，往下 rowSpan 行、往右 colSpan 列（按现在的列顺序） */
export interface TableSpan { row: number; key: string; rowSpan?: number; colSpan?: number }
export interface TableSort { key: string; dir: "asc" | "desc" }
/** 展开 / 收起：keys 是现在展开着的所有行（有筛选时是筛选前的展开状态），key 是点的那一行 */
export interface TableExpandEvent { keys: string[]; key: string; expanded: boolean }
/** 拖行松手：key 是拖的那一行，parentKey 它的上级（第一级是 null），from / to 在兄弟里的位置，keys 是这一组兄弟的新顺序 */
export interface TableRowReorderEvent { key: string; parentKey: string | null; from: number; to: number; keys: string[] }
/** 改完一格：表格已经把新值写进行里（row[key]），再发这个 */
export interface TableCellEditEvent<R = any> { row: R; key: string; value: unknown; oldValue: unknown }
/** 表格翻页或改每页条数事件 */
export interface TablePageEvent { page: number; pageSize: number }
/** 表格行详情展开回调上下文 */
export interface TableDetailContext { key: string; index: number; level: number }
/** 表格内置贴底分页配置（传 true 启用默认每页 10 条的本地分页） */
export interface TablePagination {
  page?: number;
  pageSize?: number;
  total?: number;
  pageSizes?: number[] | false;
  local?: boolean;
  onChange?(e: TablePageEvent): void;
}
export interface TableOptions<R = any> {
  columns: TableColumn<R>[];
  /** 数据：一行一个对象；行里带 children 就是多级树 */ data?: R[];
  /** data 的旧名 */ rows?: R[];
  /** 行的唯一键：字段名或函数，默认 "id" */ rowKey?: string | ((row: R, index: number) => string | number);
  /** 行展开详情：返回跨全列展示的 HTML 字符串或 DOM 节点（返回 null / "" 表示该行不可展开），与 expandedKeys / expand / expandAll 统一联动 */ detail?(row: R, ctx: TableDetailContext): string | number | Node | false | null | undefined;
  /** 控制哪些行允许展开详情（可选；提供后详情面板仅在展开时按需懒渲染） */ rowExpandable?(row: R, ctx: TableDetailContext): boolean;
  /** 点击整行空白处是否同时切换该行的展开收起（默认 false） */ expandOnRowClick?: boolean;
  /** 展开着的行（受控：传进来的值换了才跟着变） */ expandedKeys?: (string | number)[];
  /** 一开始展开的行（非受控） */ defaultExpandedKeys?: (string | number)[];
  sort?: TableSort | null; defaultSort?: TableSort | null;
  /** 默认在表格里排；false：只发 onSort，由外面排好再 update({ data }) */ sortLocal?: boolean;
  selectable?: boolean; selected?: (string | number)[]; defaultSelected?: (string | number)[];
  /** 筛选：显示匹配的行和它的所有上级（上级自动展开）；null 不筛 */ filter?: ((row: R) => boolean) | null;
  /** 合并规则：拿看得见的行，返回要合并的块（排序、展开、筛选、拖行以后都重算）；只在网格线下合并 */ spans?(rows: R[]): TableSpan[];
  /** 拖左边的把手换行的位置（同一个上级里，整棵子树一起走） */ draggableRows?: boolean;
  /** 按住表头拖列 */ draggableColumns?: boolean;
  /** 拖一行的下边线改行高（双击恢复） */ resizableRows?: boolean;
  /** 单击格子选中、方向键走格子（树形那一列左右键收起 / 展开 / 回到上级） */ cellSelect?: boolean;
  /** 给每一行加的属性（data-*、aria-*……；class、style、hidden 和表格自己用的 data-id / data-lv / data-parent 不认） */ rowAttrs?(row: R, ctx: { key: string; level: number; parent: R | null }): Record<string, string | number | boolean | null | undefined>;
  /** 没有数据时那一行：字符串按文字放；函数返回 HTML（filtered：是筛选以后没有结果） */ empty?: string | ((ctx: { filtered: boolean }) => string);
  loading?: boolean; skeleton?: number;
  /** 出错：true 或说明文字；那一行带"重试"（发 onRetry） */ error?: boolean | string;
  label?: string; striped?: boolean; compact?: boolean; plain?: boolean; fill?: boolean; lines?: "row" | "grid"; maxHeight?: number | string; pagination?: boolean | TablePagination;
  onSort?(sort: TableSort | null): void;
  onSelect?(keys: string[]): void;
  onRowClick?(row: R): void;
  onExpandChange?(e: TableExpandEvent): void;
  onRowReorder?(e: TableRowReorderEvent): void;
  onColumnReorder?(e: { keys: string[] }): void;
  onColumnResize?(e: { key: string; width: number; widths: Record<string, number> }): void;
  onRowResize?(e: { key: string; height: number | null }): void;
  onCellEdit?(e: TableCellEditEvent<R>): void;
  onPageChange?(e: TablePageEvent): void;
  onRetry?(): void;
  onLayout?(e: { rows: R[] }): void;
}
/** createTable 的实例（React / Vue 的 ref 拿到的也是它） */
export interface TableApi {
  readonly selected: string[];
  readonly sort: TableSort | null;
  readonly expanded: string[];
  readonly columnOrder: string[];
  isExpanded(key: string | number): boolean;
  expand(keys: string | number | (string | number)[], open?: boolean): void;
  expandAll(open?: boolean): void;
  select(keys: (string | number)[]): void;
  refresh(): void;
  edit(key: string | number, colKey?: string): void;
}
export const createTable: SatinFactory<TableOptions, TableApi>;
export function tableHTML(o: TableOptions): string;
export function sortRows<R>(rows: R[], columns: TableColumn<R>[], sort: TableSort | null): R[];

/** 照设计稿写好的标记，在 root 里一次接上交互（下拉、复制、芯片、清除、显示密码、自动长高、滑块、验证码、输入框、折叠面板、日期选择器、浮层触发器、横幅），并把 data-i 换成图标。
 *  返回撤销函数（撤掉监听、观察器、包上去的滚动区域和"已接过"标记，同一段标记可以再接一次）。wire：同一个作用域里跑的自己的接线，撤销时一起撤 */
export function enhance(root?: ParentNode | null, wire?: (root: ParentNode) => void): () => void;
/** 表单类的标记一次接上（enhance 里已经包含） */
export function bindForms(root?: ParentNode): void;
export function bindBanners(root?: ParentNode): void;
/** 收起横幅（传 .sn-banner-wrap，高度平滑收起） */
export function closeBanner(wrap: HTMLElement): void;
/** 输入框随内容长高（传包着 textarea 的容器，data-max-lines 限最多几行） */
export function autoGrow(box: HTMLElement): void;
/** 长文本的用量环（传包着 textarea 和 .sn-ta-count 的容器，data-max 是上限） */
export function longCount(box: HTMLElement, o?: { showFrom?: number }): void;

// ———— 设计感轮播图与体积感追光 ————
export interface CarouselItem {
  title?: string;
  sub?: string;
  badge?: string;
  tag?: string;
  lightBadge?: boolean;
  price?: string;
  image?: string;
  alt?: string;
  vol?: "jelly" | "aurora" | "amber" | "prism" | "rose" | "stone" | string;
  float?: boolean;
  meta?: (string | { icon?: string; text: string })[];
  html?: string;
}
export interface CarouselOptions {
  items?: CarouselItem[];
  variant?: "arc" | "focus" | "peek" | "deck";
  index?: number;
  loop?: boolean;
  arrows?: boolean;
  dots?: false | "pill" | "bars";
  autoplay?: number;
  height?: number | string;
  cardWidth?: number | string;
  label?: string;
  onChange?(index: number, slide?: HTMLElement): void;
}
export interface CarouselApi {
  readonly index: number;
  readonly variant: "arc" | "focus" | "peek" | "deck";
  go(index: number, options?: { silent?: boolean; instant?: boolean }): void;
  next(): void;
  prev(): void;
  setVariant(variant: "arc" | "focus" | "peek" | "deck"): void;
}
export const createCarousel: SatinFactory<CarouselOptions, CarouselApi>;
export function carouselHTML(o?: CarouselOptions): string;
export function mountCarousel(el: HTMLElement, o?: CarouselOptions): CarouselApi & { update(o?: CarouselOptions): void; destroy(): void };
/** 给容器内带 data-vol-tilt 的体积感渐变卡片绑定 60fps 3D 追光交互，返回撤销函数 */
export function bindVolumetric(scope?: ParentNode | null): () => void;
