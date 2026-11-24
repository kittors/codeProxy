// satin-ui/react
import type * as React from "react";
import type { SatinInstance, Item, AvatarOptions, EmptyArtOptions, ProgressOptions, LoaderOptions, ToastOptions, ToastHandle, NotifyOptions, PickerOptions, PickDetail, TableOptions, TableColumn, TableCellContext, TableApi, ComposerParts, ComposerPartEvents } from "./components";
import type { SatinIntrinsicElements } from "./elements";
import type { ThemeChoice } from "./theme";
declare module "react" {
  interface CSSProperties {
    [customProp: `--${string}`]: string | number | undefined;
  }
  namespace JSX {
    interface IntrinsicElements extends SatinIntrinsicElements {}
  }
}
type Base = { className?: string; style?: React.CSSProperties; id?: string; [data: `data-${string}`]: unknown };
type Controlled<T, K extends string = "value"> = { [P in K]?: T } & { [P in `default${Capitalize<K>}`]?: T };
type Ref = React.Ref<SatinInstance | null>;
/** 头像：<Avatar name="林知远" size={24} decorative />；有照片给 src，加载失败退回预设 */
export const Avatar: React.ForwardRefExoticComponent<Base & AvatarOptions & React.RefAttributes<SatinInstance>>;
export const Segmented: React.ForwardRefExoticComponent<Base & Controlled<string> & { items: Item[]; size?: "sm" | "md"; label?: string; onChange?(value: string): void } & React.RefAttributes<SatinInstance>>;
export const Slider: React.ForwardRefExoticComponent<Base & Controlled<number> & { max?: number; label?: string; onChange?(value: number): void } & React.RefAttributes<SatinInstance>>;
/** 下拉选择的属性：value 受控、defaultValue 非受控 */
export type SelectProps = Base & Controlled<string> & { items: Item[]; placeholder?: string; label?: string; onChange?(value: string): void };
export const Select: React.ForwardRefExoticComponent<SelectProps & React.RefAttributes<SatinInstance>>;
export const Otp: React.ForwardRefExoticComponent<Base & { length?: number; /** 密码隐藏模式（掩码圆点显示） */ mask?: boolean; /** 是否显示明文/密文切换眼睛按钮（开启 mask 时默认为 true） */ reveal?: boolean; onComplete?(code: string): void } & React.RefAttributes<SatinInstance>>;
export const Tabs: React.ForwardRefExoticComponent<Base & Controlled<number> & { tabs: { label: string; badge?: string | number; content?: string; html?: string }[]; onChange?(index: number): void } & React.RefAttributes<SatinInstance>>;
export const Pager: React.ForwardRefExoticComponent<Base & Controlled<number, "page"> & { total: number; count?: number; onChange?(page: number): void } & React.RefAttributes<SatinInstance>>;
export const Collapse: React.ForwardRefExoticComponent<Base & Controlled<number[], "open"> & { items: { title: string; content?: string; html?: string }[]; single?: boolean; onToggle?(e: { index: number; open: boolean }): void; onChange?(open: number[]): void } & React.RefAttributes<SatinInstance>>;
export const TagInput: React.ForwardRefExoticComponent<Base & Controlled<string[], "tags"> & { max?: number; placeholder?: string; hint?: string; onChange?(tags: string[]): void } & React.RefAttributes<SatinInstance>>;
export const Stepper: React.ForwardRefExoticComponent<Base & Controlled<number> & { min?: number; max?: number; unit?: string; label?: string; onChange?(value: number): void } & React.RefAttributes<SatinInstance>>;
/** 表格的列（React 版：render 可以返回 React 节点，画进这一格里的一个小 React 根，拿不到外面的 Context） */
export type TableColumnReact<R = any> = Omit<TableColumn<R>, "render"> & { render?(value: any, row: R, ctx: TableCellContext): React.ReactNode | string | number | Node | void };
/** 表格的属性：columns + data（树形用 children）；selected / expandedKeys / sort 受控（defaultXxx 非受控，"传进来的值换了"才跟着变）；事件 onXxx；ref 拿到实例 */
export type TableProps<R = any> = Base & Omit<TableOptions<R>, "columns"> & { columns: TableColumnReact<R>[] };
export const Table: React.ForwardRefExoticComponent<TableProps & React.RefAttributes<SatinInstance & TableApi>>;
export const Password: React.ForwardRefExoticComponent<Base & Controlled<string> & { label?: string; help?: string; name?: string; placeholder?: string; meter?: boolean; size?: "sm" | "lg" | "xl"; autocomplete?: string; onChange?(value: string): void } & React.RefAttributes<SatinInstance>>;
/** 搜索框：search(q) 返回结果数（或数组、Promise），超过 300ms 放大镜换成转圈；onSearch(q)；id 写在输入框上 */
export type SearchProps = Base & { search?(q: string): number | unknown[] | Promise<number | unknown[]>; debounce?: number; placeholder?: string; label?: string; kbd?: string | false; name?: string; size?: "sm" | "lg" | "xl"; onSearch?(q: string): void };
export const Search: React.ForwardRefExoticComponent<SearchProps & React.RefAttributes<SatinInstance>>;
/** 字数统计（单行）：value + onChange 受控，max 上限；id 写在输入框上 */
export const CountInput: React.ForwardRefExoticComponent<Base & Controlled<string> & { max?: number; placeholder?: string; name?: string; size?: "sm" | "lg" | "xl"; onChange?(value: string): void } & React.RefAttributes<SatinInstance>>;
/** 长文本：随内容长高、用量环；value + onChange 受控，onSubmit（⌘↵）；id 写在 textarea 上 */
export const LongText: React.ForwardRefExoticComponent<Base & Controlled<string> & { max?: number; maxLines?: number; rows?: number; placeholder?: string; hint?: string; label?: string; name?: string; onChange?(value: string): void; onSubmit?(value: string): void } & React.RefAttributes<SatinInstance>>;
/** 提示词输入框：onSend 返回 Promise 时发送后进入"生成中"，结束回到可发送；send 是发送按钮的名字 */
export type ComposerProps = Base & ComposerParts & ComposerPartEvents & { placeholder?: string; max?: number; maxLines?: number; attach?: boolean; voice?: boolean; send?: string; submitKey?: "enter" | "mod-enter"; upload?(file: File, progress: (p: number) => void): Promise<unknown>; onSend?(message: { text: string; files: HTMLElement[] }): void | Promise<unknown>; onStop?(): void };
export const Composer: React.ForwardRefExoticComponent<ComposerProps & React.RefAttributes<SatinInstance>>;
export const Email: React.ForwardRefExoticComponent<Base & Controlled<string> & { label?: string; help?: string; name?: string; placeholder?: string; size?: "sm" | "lg" | "xl"; autocomplete?: string; onChange?(value: string): void } & React.RefAttributes<SatinInstance>>;
/** 日期、时间、地址选择器的属性：kind 选种类；onChange 拿到 { text }（触发框里显示的文字）。没有 value：现在只能读出选中的结果 */
export type DatePickerProps = Base & Omit<PickerOptions, "onChange"> & { onChange?(detail: PickDetail): void };
export const DatePicker: React.ForwardRefExoticComponent<DatePickerProps & React.RefAttributes<SatinInstance>>;
export const NumberFlow: React.ForwardRefExoticComponent<Base & { value: number; /** 变化的样子 */ effect?: "roll" | "blur" | "push" | "fade"; format?(v: number): string } & React.RefAttributes<SatinInstance>>;
export type Variant = "primary" | "secondary" | "tertiary" | "ghost" | "danger" | "danger-soft";
/** 按钮的属性：原生 <button> 的属性照常能写（onClick、type、aria-label……）；disabled 用 aria-disabled 实现，点了不触发 onClick。
 *  busy：等待（300ms 内结束不转圈，转圈出现后至少留 500ms）；done：原地打勾。写了 busy 或 done 才套等待用的结构，宽度不跳；等待中、打勾时点了不触发 onClick */
export type ButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "disabled"> & { variant?: Variant; size?: "sm" | "md" | "lg"; icon?: string; iconAfter?: string; /** 菜单按钮后面的小箭头（菜单开着时转过去） */ caret?: boolean; round?: boolean; selected?: boolean; loading?: boolean; done?: boolean; disabled?: boolean; tip?: string; /** 徽标：数字是右上角的计数，true 是小红点 */ badge?: number | string | boolean };
export const Button: React.ForwardRefExoticComponent<ButtonProps & React.RefAttributes<HTMLButtonElement>>;
export function Icon(p: { name: string; size?: number; className?: string }): React.ReactElement;
/** 空状态场景 SVG 插画：<EmptyArt name="projects" />，6 款纯中性灰度微缩场景，深浅主题自动适配 */
export function EmptyArt(p?: Base & EmptyArtOptions): React.ReactElement;
export type InputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "size"> & { size?: "sm" | "md" | "lg" | "xl"; invalid?: boolean };
export const Input: React.ForwardRefExoticComponent<InputProps & React.RefAttributes<HTMLInputElement>>;
export const Textarea: React.ForwardRefExoticComponent<React.TextareaHTMLAttributes<HTMLTextAreaElement> & React.RefAttributes<HTMLTextAreaElement>>;
export type FieldProps = { label?: React.ReactNode; help?: React.ReactNode; error?: React.ReactNode; htmlFor?: string; className?: string; children?: React.ReactNode };
export function Field(p: FieldProps): React.ReactElement;
export type CheckboxProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: React.ReactNode; indeterminate?: boolean };
export const Checkbox: React.ForwardRefExoticComponent<CheckboxProps & React.RefAttributes<HTMLInputElement>>;
/** 单选：同一组写同一个 name；checked + onChange 受控，defaultChecked 非受控 */
export type RadioProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: React.ReactNode };
export const Radio: React.ForwardRefExoticComponent<RadioProps & React.RefAttributes<HTMLInputElement>>;
export type SwitchProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> & { label?: React.ReactNode };
export const Switch: React.ForwardRefExoticComponent<SwitchProps & React.RefAttributes<HTMLInputElement>>;
/** 芯片：onChange（受控时再给 selected）或 defaultSelected 给了是能切换的筛选芯片（button）；removable 是能移除的标签（收起动画放完才调 onRemove）；都没给只显示（selected 决定选中的样子） */
export type ChipProps = Omit<React.HTMLAttributes<HTMLElement>, "onChange"> & { selected?: boolean; defaultSelected?: boolean; onChange?(selected: boolean): void; removable?: boolean; onRemove?(): void; removeLabel?: string };
export const Chip: React.ForwardRefExoticComponent<ChipProps & React.RefAttributes<HTMLElement>>;
export type ProgressProps = ProgressOptions & { /** 读屏读出来的名字 */ label?: string; className?: string; style?: React.CSSProperties };
export function Progress(p: ProgressProps): React.ReactElement;
/** 动感几何加载器：<Loader variant="matrix" size="lg" />，8 款物理微动效，全面支持 size / color / speed 定制 */
export type LoaderProps = LoaderOptions & { className?: string; style?: React.CSSProperties };
export function Loader(p?: LoaderProps): React.ReactElement;
export function Spinner(p: { size?: "lg"; /** 读屏读出来的名字，默认"加载中" */ label?: string; className?: string }): React.ReactElement;
export function Steps(p: { steps: React.ReactNode[]; current?: number; className?: string }): React.ReactElement;
export function Text(p: React.HTMLAttributes<HTMLElement> & { as?: keyof React.JSX.IntrinsicElements; level?: "display" | "title1" | "title2" | "title3" | "body" | "bodyStrong" | "callout" | "caption" | "micro" | "code"; tone?: "primary" | "secondary" | "tertiary" | "off" | "danger" | "success" | "warning"; num?: boolean; truncate?: boolean }): React.ReactElement;
export type TooltipProps = { text: string; kbd?: string; children: React.ReactElement };
export function Tooltip(p: TooltipProps): React.ReactElement;
/** 弹窗的属性：open 控制开关；关完（Esc、取消、程序关）调 onClose；guard 拦下关闭（比如有填写内容先问一句），确认要关时调它给的 close。
 *  取消按钮写 data-cancel、关闭按钮写 data-x，和 Esc 一样先走 guard；onSubmit 接住表单提交（弹窗不会因为提交自己关）；icon 是标题左边的图标；footerClassName 加在底栏上 */
export interface DialogProps { open: boolean; onClose?(): void; title?: React.ReactNode; description?: React.ReactNode; icon?: string; footer?: React.ReactNode; footerClassName?: string; /** 是否允许按住标题栏拖动弹窗（默认 true；双击标题栏复位） */ draggable?: boolean; children?: React.ReactNode; className?: string; guard?(close: () => void): void; onSubmit?(e: React.FormEvent<HTMLFormElement>): void }
export function Dialog(p: DialogProps): React.ReactElement;
export type DrawerProps = { open: boolean; onClose?(): void; title?: React.ReactNode; footer?: React.ReactNode; children?: React.ReactNode; className?: string };
export function Drawer(p: DrawerProps): React.ReactElement;
/** 应用根部装一次页面级行为，并支持声明式配置全局深浅模式、主题与多语言：<SatinProvider mode="auto" locale="en" messages={en} theme={{ accent: "blue", radius: "8" }}><App /></SatinProvider> */
export interface SatinProviderProps { mode?: "auto" | "light" | "dark"; theme?: Partial<ThemeChoice>; /** 界面语言（如 "zh-CN" | "en" | 自定义语言代码） */ locale?: string; /** 语言消息表（可传入 satin-ui/locales/en 或局部覆写表） */ messages?: Record<string, string>; /** 是否同步持久化到 localStorage（默认 false，不覆盖用户已选偏好） */ persist?: boolean; children?: React.ReactNode }
export function SatinProvider(p: SatinProviderProps): React.ReactNode;
/** 响应式多语言 Hook：读取当前语言并切换（支持 setLocale("en", en) / setLocale("zh-CN")） */
export function useLocale(): { locale: string; setLocale(nameOrMessages: string | Record<string, string>, messages?: Record<string, string>): void };
/** 局部主题作用域：<ThemeScope mode="dark" accent="blue">…</ThemeScope>，仅作用于当前容器 */
export type ThemeScopeProps = React.HTMLAttributes<HTMLElement> & Partial<ThemeChoice> & { as?: keyof React.JSX.IntrinsicElements; mode?: "light" | "dark" };
export const ThemeScope: React.ForwardRefExoticComponent<ThemeScopeProps & React.RefAttributes<HTMLElement>>;
/** 响应式主题 Hook：读写深浅模式与主色 / 圆角 / 线条 / 动效令牌 */
export function useTheme(): { mode: "auto" | "light" | "dark"; theme: ThemeChoice; setMode(mode: "auto" | "light" | "dark", options?: { animate?: boolean; persist?: boolean }): void; setTheme(patch: Partial<ThemeChoice>): void; resetTheme(): void };
export function toast(o: ToastOptions): ToastHandle;
export function notify(o: NotifyOptions): import("./components").NotifyHandle;
export function useSatin(): React.MutableRefObject<SatinInstance | null>;
export function useToast(): (o: ToastOptions) => ToastHandle;

/** 把任意 createXxx（包括重组件 createChat、createMarkdown、createFlow……）包成 React 组件：props 就是组件的选项，ref 拿到实例 */
export function wrapSatin<O>(create: import("./components").SatinFactory<O, any>, opts?: { valueKey?: string; events?: string[]; displayName?: string }): import("react").ForwardRefExoticComponent<O & { className?: string; style?: import("react").CSSProperties; id?: string; [k: string]: unknown } & import("react").RefAttributes<unknown>>;
export * from "./react-extra";
export type { EmptyArtName, ComposerMode, ComposerContextItem, ComposerOption, TableRowReorderEvent, TableSpan, TableSort, TableExpandEvent, TableCellEditEvent } from "./components";
