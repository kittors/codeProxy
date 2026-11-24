// satin-ui/react 的第二部分（react/extra.js，主入口一起转出）
import type * as React from "react";
import type { SatinInstance, ScrollAreaOptions, PlayerOptions, AudioOptions } from "./components";
type Base = { className?: string; style?: React.CSSProperties; id?: string };
// ———— 菜单、右键菜单、Popover、命令面板、看图、上传、侧栏、无限列表、滚动区域、视频、音频（satin-ui/react 主入口） ————
/** 菜单的一条：key 不给就用 label；children 是子菜单。分隔线 { type: "divider" }，分组标题 { type: "group", label } */
export type MenuItem = { type?: undefined; key?: string; label: string; icon?: string; kbd?: string; danger?: boolean; disabled?: boolean; checked?: boolean; children?: MenuItem[] } | { type: "divider" } | { type: "group"; label: string };
type Bound = HTMLElement | React.RefObject<HTMLElement | null> | "window";
/** 菜单按钮：子元素是触发器（一个按钮），点了贴着它弹出；onSelect(key, item) */
export interface MenuProps { items: MenuItem[]; onSelect?(key: string, item: MenuItem | undefined): void; align?: "start" | "center" | "end"; label?: string; bound?: Bound; surface?: "solid" | "blur"; children: React.ReactElement }
export function Menu(p: MenuProps): React.ReactElement;
/** 右键菜单：子元素是右键区域（右键、触屏长按、Shift+F10 在指针处弹出） */
export function ContextMenu(p: Omit<MenuProps, "align">): React.ReactElement;
/** Popover：子元素是触发按钮，content 是面板内容；open 受控（onOpenChange 里更新），只给 defaultOpen 就是非受控 */
export interface PopoverProps { content: React.ReactNode; title?: React.ReactNode; align?: "start" | "center" | "end"; open?: boolean; defaultOpen?: boolean; onOpenChange?(open: boolean): void; label?: string; className?: string; style?: React.CSSProperties; children: React.ReactElement }
export function Popover(p: PopoverProps): React.ReactElement;
/** 气泡确认：子元素是触发按钮；只给单条、属于自己、不能撤销的操作；打开时焦点先落在"取消"上 */
export interface PopconfirmProps { title: React.ReactNode; description?: React.ReactNode; confirmText?: React.ReactNode; cancelText?: React.ReactNode; danger?: boolean; align?: "start" | "center" | "end"; onConfirm?(): void; onCancel?(): void; children: React.ReactElement }
export function Popconfirm(p: PopconfirmProps): React.ReactElement;
export interface CommandPaletteHandle { open(): void; close(): void; toggle(): void }
/** 命令面板：⌘K 打开（hotkey={false} 关掉快捷键）；选中一条 onRun(item)；open 受控 */
export interface CommandPaletteProps<T extends import("./components").CommandItem = import("./components").CommandItem> { groups: { name: string; items: T[] }[]; onRun?(item: T): void; placeholder?: string; /** 没有结果时显示的 HTML；里面带 data-empty-act 的按钮点了（或直接回车）调 onEmpty */ empty?(q: string): string; onEmpty?(q: string): void; hotkey?: boolean; enterLabel?: string; open?: boolean; onOpenChange?(open: boolean): void }
export const CommandPalette: React.ForwardRefExoticComponent<CommandPaletteProps & React.RefAttributes<CommandPaletteHandle>>;
/** 看图的一张（和 satin-ui 的 LightboxItem 一样）：src / bg、ratio / size、alt；视频 type: "video" + poster */
export type LightboxItem = import("./components").LightboxItem;
/** 看图：index 是数字就打开到那一张，null 关上（onClose 里设回 null）；thumbOf(i) 返回第 i 张缩略图元素 */
export function Lightbox(p: { items: LightboxItem[]; index?: number | null; onClose?(): void; thumbOf?(i: number): HTMLElement | null | undefined; enabled?(i: number): boolean }): null;
/** 上传：拖放区 + 文件列表。accept：".txt,.docx" 或正则；maxSize：字节；upload(file, progress) 返回 Promise */
export interface UploadProps extends Base { accept?: string | RegExp; maxSize?: number; upload?(file: File, progress: (p: number) => void): Promise<unknown>; title?: string; pick?: string; hint?: string; label?: string; multiple?: boolean; badType?: string; tooBig?: string }
export const Upload: React.ForwardRefExoticComponent<UploadProps & React.RefAttributes<SatinInstance & { add(files: FileList | File[]): void }>>;
export type SidebarItem = { type?: undefined; key?: string; label: string; icon?: string; badge?: string | number; href?: string } | { type: "group"; label: string };
/** 侧栏布局：左边侧栏（选中切换、收起 ⌘\），children 是右边主区；value 是选中的 key */
export interface SidebarProps { items: SidebarItem[]; footer?: SidebarItem[]; value?: string; defaultValue?: string; onNavigate?(key: string, item: SidebarItem | undefined): void; title?: string; logo?: boolean; collapsible?: boolean; collapseBelow?: number; fx?: "slide" | "bar" | "fade" | "text"; className?: string; style?: React.CSSProperties; children?: React.ReactNode }
export const Sidebar: React.ForwardRefExoticComponent<SidebarProps & React.RefAttributes<SatinInstance & { toggle(): void; select(link: HTMLElement): void }>>;
/** 无限列表：loadPage 返回一页数据；renderItem 返回一行的 React 节点（或 renderRow 直接改 DOM） */
export interface InfiniteListProps<T = any> extends Base { loadPage(offset: number, size: number): Promise<T[]>; renderItem?(item: T, index: number): React.ReactNode; renderRow?(row: HTMLElement, item: T, index: number): void; rowHeight?: number; total?: number; pageSize?: number; onCount?(loaded: number): void }
export const InfiniteList: React.ForwardRefExoticComponent<InfiniteListProps & React.RefAttributes<SatinInstance & { reload(): void; scrollTop(): void; readonly count: number }>>;
/** 滚动区域：写法和 div 一样（限高写在 style 上），as 换标签 */
export type ScrollAreaProps = React.HTMLAttributes<HTMLElement> & Omit<ScrollAreaOptions, "inner"> & { as?: keyof React.JSX.IntrinsicElements };
export const ScrollArea: React.ForwardRefExoticComponent<ScrollAreaProps & React.RefAttributes<SatinInstance & { refresh(): void; set(o: Partial<ScrollAreaOptions>): void }>>;
export type PlayerHandle = SatinInstance & { play(): Promise<void>; pause(): void; toggle(): Promise<void> | void; readonly video: HTMLVideoElement };
export const Player: React.ForwardRefExoticComponent<Base & PlayerOptions & React.RefAttributes<PlayerHandle>>;
export const AudioPlayer: React.ForwardRefExoticComponent<Base & AudioOptions & React.RefAttributes<SatinInstance & { toggle(): void; readonly audio: HTMLAudioElement }>>;
