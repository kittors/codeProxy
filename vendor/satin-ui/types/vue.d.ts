// satin-ui/vue
import type { DefineComponent, Plugin, Ref } from "vue";
import type { Item, AvatarOptions, EmptyArtOptions, ProgressOptions, LoaderOptions, ToastOptions, ToastHandle, NotifyOptions, PickerOptions, TableOptions, ComposerParts } from "./components";
import type { ThemeChoice } from "./theme";
type C<P> = DefineComponent<P & { modelValue?: any }>;
export const Password: C<{ value?: string; label?: string; help?: string; name?: string; id?: string; placeholder?: string; meter?: boolean; size?: "sm" | "lg" | "xl"; autocomplete?: string }>;
export const Search: DefineComponent<{ search?(q: string): number | unknown[] | Promise<number | unknown[]>; debounce?: number; placeholder?: string; label?: string; kbd?: string | false; id?: string; name?: string; size?: "sm" | "lg" | "xl" }>;
export const CountInput: C<{ value?: string; max?: number; placeholder?: string; size?: "sm" | "lg" | "xl"; id?: string; name?: string }>;
export const LongText: C<{ value?: string; max?: number; maxLines?: number; rows?: number; placeholder?: string; hint?: string; label?: string; id?: string; name?: string }>;
/** 提示词输入框：@send 返回 Promise 时发送后进入"生成中"，结束回到可发送；send 是发送按钮的名字 */
export const Composer: DefineComponent<{ placeholder?: string; max?: number; maxLines?: number; attach?: boolean; voice?: boolean; send?: string; submitKey?: "enter" | "mod-enter"; upload?(file: File, progress: (p: number) => void): Promise<unknown> } & ComposerParts>;
export const Email: C<{ value?: string; label?: string; help?: string; name?: string; id?: string; placeholder?: string; size?: "sm" | "lg" | "xl"; autocomplete?: string }>;
/** 表格：v-model 绑勾上的行（selected），v-model:expanded 绑展开着的行（expandedKeys），v-model:sort 绑排序；事件写 @sort、@select、@row-click、@expand-change、@row-reorder……；插槽 #cell-<key>="{ value, row, index }" */
export const Table: C<Omit<TableOptions, "onSort" | "onSelect" | "onRowClick" | "onExpandChange" | "onRowReorder" | "onColumnReorder" | "onColumnResize" | "onRowResize" | "onCellEdit" | "onPageChange" | "onRetry" | "onLayout"> & { /** v-model:expanded：展开着的行 */ expanded?: (string | number)[] }>;
/** 头像：<SnAvatar name="林知远" :size="24" decorative />；有照片给 src，加载失败退回预设 */
export const Avatar: DefineComponent<AvatarOptions>; // 只显示，没有 v-model
export const Segmented: C<{ items: Item[]; value?: string; size?: "sm" | "md"; label?: string }>;
export const Slider: C<{ value?: number; max?: number; label?: string }>;
export const Select: C<{ items: Item[]; value?: string; placeholder?: string; label?: string }>;
/** 验证码：不用 v-model（填满时发 complete，参数是整串数字）；mask 开启密码隐藏，reveal 控制显隐切换按钮 */
export const Otp: DefineComponent<{ length?: number; mask?: boolean; reveal?: boolean }>;
export const Tabs: C<{ tabs: { label: string; badge?: string | number; content?: string; html?: string }[]; value?: number }>;
export const Pager: C<{ total: number; page?: number; count?: number }>;
export const Collapse: C<{ items: { title: string; content?: string; html?: string }[]; single?: boolean; open?: number[] }>;
export const TagInput: C<{ tags?: string[]; max?: number; placeholder?: string; hint?: string }>;
export const Stepper: C<{ value?: number; min?: number; max?: number; unit?: string; label?: string }>;
export const NumberFlow: DefineComponent<{ value: number; /** 变化的样子 */ effect?: "roll" | "blur" | "push" | "fade"; format?(v: number): string }>; // 只显示，没有 v-model
/** 日期、时间、地址选择器：@change 拿到 { text }（触发框里显示的文字）；没有 v-model（现在只能读出选中的结果） */
export const DatePicker: DefineComponent<Omit<PickerOptions, "onChange">>;
export const Icon: DefineComponent<{ name: string; size?: number }>;
/** 空状态场景 SVG 插画：<EmptyArt name="projects" />（全局注册为 SnEmptyArt） */
export const EmptyArt: DefineComponent<EmptyArtOptions>;
export const Button: DefineComponent<{ variant?: "primary" | "secondary" | "tertiary" | "ghost" | "danger" | "danger-soft"; size?: "sm" | "md" | "lg"; icon?: string; iconAfter?: string; caret?: boolean; round?: boolean; selected?: boolean; loading?: boolean; done?: boolean; disabled?: boolean; tip?: string; badge?: number | string | boolean; type?: string }>;
export const Input: C<{ size?: "sm" | "md" | "lg" | "xl"; invalid?: boolean }>;
export const Field: DefineComponent<{ label?: string; help?: string; error?: string; for?: string }>;
export const Checkbox: C<{ label?: string; indeterminate?: boolean; disabled?: boolean }>;
/** 单选：v-model 绑这一组选中的值，value 是这一项的值 */
export const Radio: C<{ value?: string | number; name?: string; label?: string; disabled?: boolean }>;
export const Switch: C<{ label?: string; disabled?: boolean }>;
/** 芯片：v-model（布尔）给了是能切换的筛选芯片；removable 是能移除的标签（@remove 在收起动画放完以后发）；selected 只显示选中的样子 */
export const Chip: DefineComponent<{ modelValue?: boolean; selected?: boolean; removable?: boolean; removeLabel?: string }>;
export const Progress: DefineComponent<ProgressOptions & { label?: string }>;
/** 动感几何加载器：<SnLoader variant="matrix" size="lg" /> */
export const Loader: DefineComponent<LoaderOptions>;
export const Spinner: DefineComponent<{ size?: "lg"; label?: string }>;
export const Steps: DefineComponent<{ steps: string[]; current?: number }>;
export const Text: DefineComponent<{ as?: string; level?: string; tone?: string; num?: boolean; truncate?: boolean }>;
export const Tooltip: DefineComponent<{ text: string; kbd?: string }>;
/** 弹窗：v-model:open；@close 关完以后、@submit 表单提交；guard 拦下关闭；footerClass 加在底栏上；draggable 默认 true 支持按住标题栏拖动；#footer 插槽放按钮 */
export const Dialog: DefineComponent<{ open: boolean; title?: string; description?: string; icon?: string; guard?(close: () => void): void; footerClass?: string; draggable?: boolean }>;
export const Drawer: DefineComponent<{ open: boolean; title?: string }>;
/** 局部主题作用域：<SnThemeScope mode="dark" accent="blue">…</SnThemeScope> */
export const ThemeScope: DefineComponent<Partial<ThemeChoice> & { as?: string; mode?: "light" | "dark" }>;
/** 响应式主题 Composable */
export function useTheme(): { mode: Ref<"auto" | "light" | "dark">; theme: Ref<ThemeChoice>; setMode(mode: "auto" | "light" | "dark", options?: { animate?: boolean; persist?: boolean }): void; setTheme(patch: Partial<ThemeChoice>): void; resetTheme(): void };
/** 响应式多语言 Composable */
export function useLocale(): { locale: Ref<string>; setLocale(nameOrMessages: string | Record<string, string>, messages?: Record<string, string>): void };
/** v-enhance：照设计稿写好的一段标记放进这个元素，挂上时接上交互、卸载时撤掉（和 <sn-enhance> 一样） */
export const vEnhance: import("vue").ObjectDirective<HTMLElement>;
export function toast(o: ToastOptions): ToastHandle;
export function notify(o: NotifyOptions): import("./components").NotifyHandle;
export interface SatinPluginOptions { mode?: "auto" | "light" | "dark"; theme?: Partial<ThemeChoice>; locale?: string; messages?: Record<string, string>; persist?: boolean }
declare const plugin: Plugin<[SatinPluginOptions?]>;
export default plugin;

/** 把任意 createXxx（包括重组件）包成 Vue 组件：props 列出要传给组件的选项名 */
export function wrapSatin(create: import("./components").SatinFactory<any, any>, opts: { name: string; props?: string[]; valueKey?: string; events?: string[]; modelEvent?: string }): import("vue").DefineComponent<Record<string, unknown>>;
export * from "./vue-extra";
export type { EmptyArtName, ComposerMode, ComposerContextItem, ComposerOption, TableColumn, TableRowReorderEvent, TableSpan, TableSort, TableExpandEvent, TableCellEditEvent, LightboxItem } from "./components";
