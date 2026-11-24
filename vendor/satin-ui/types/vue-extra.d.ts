// satin-ui/vue 的第二部分（vue/extra.js，主入口一起转出）
import type { DefineComponent } from "vue";
import type { ScrollAreaOptions } from "./components";
// ———— 菜单、右键菜单、Popover、命令面板、看图、上传、侧栏、无限列表、滚动区域、视频、音频（satin-ui/vue 主入口） ————
/** 菜单的一条：key 不给就用 label；children 是子菜单。分隔线 { type: "divider" }，分组标题 { type: "group", label } */
export type MenuItem = { type?: undefined; key?: string; label: string; icon?: string; kbd?: string; danger?: boolean; disabled?: boolean; checked?: boolean; children?: MenuItem[] } | { type: "divider" } | { type: "group"; label: string };
/** 菜单按钮：默认插槽是触发器；@select(key, item) */
export const Menu: DefineComponent<{ items: MenuItem[]; align?: "start" | "center" | "end"; label?: string; bound?: HTMLElement | "window"; surface?: "solid" | "blur" }>;
/** 右键菜单：默认插槽是右键区域；@select(key, item) */
export const ContextMenu: DefineComponent<{ items: MenuItem[]; label?: string; bound?: HTMLElement | "window"; surface?: "solid" | "blur" }>;
/** Popover：默认插槽是触发按钮，#content 是面板内容；v-model:open */
export const Popover: DefineComponent<{ title?: string; align?: "start" | "center" | "end"; open?: boolean; defaultOpen?: boolean; label?: string }>;
/** 命令面板：⌘K 打开；@run(item)、v-model:open；模板 ref 能调 open() / close() / toggle() */
export const CommandPalette: DefineComponent<{ groups: { name: string; items: import("./components").CommandItem[] }[]; placeholder?: string; hotkey?: boolean; enterLabel?: string; empty?(q: string): string; open?: boolean }>;
/** 看图的一张（和 satin-ui 的 LightboxItem 一样）：src / bg、ratio / size、alt；视频 type: "video" + poster */
export type LightboxItem = import("./components").LightboxItem;
/** 气泡确认：默认插槽是触发按钮；@confirm / @cancel；打开时焦点先落在"取消"上 */
export const Popconfirm: DefineComponent<{ title: string; description?: string; confirmText?: string; cancelText?: string; danger?: boolean; align?: "start" | "center" | "end" }>;
/** 看图：v-model:index（数字打开到那一张，关上时回写 null）；@close */
export const Lightbox: DefineComponent<{ items: LightboxItem[]; index?: number | null; thumbOf?(i: number): HTMLElement | null | undefined; enabled?(i: number): boolean }>;
/** 上传：拖放区 + 文件列表 */
export const Upload: DefineComponent<{ accept?: string | RegExp; maxSize?: number; upload?(file: File, progress: (p: number) => void): Promise<unknown>; title?: string; pick?: string; hint?: string; label?: string; multiple?: boolean; badType?: string; tooBig?: string }>;
export type SidebarItem = { type?: undefined; key?: string; label: string; icon?: string; badge?: string | number; href?: string } | { type: "group"; label: string };
/** 侧栏布局：默认插槽是主区；v-model 绑选中的 key；@navigate(key, item) */
export const Sidebar: DefineComponent<{ items: SidebarItem[]; footer?: SidebarItem[]; modelValue?: string; title?: string; logo?: boolean; collapsible?: boolean; collapseBelow?: number; fx?: "slide" | "bar" | "fade" | "text" }>;
/** 无限列表：#row="{ item, index }" 插槽画一行；@count */
export const InfiniteList: DefineComponent<{ loadPage(offset: number, size: number): Promise<unknown[]>; renderRow?(row: HTMLElement, item: any, index: number): void; rowHeight?: number; total?: number; pageSize?: number }>;
/** 滚动区域：写法和 div 一样，as 换标签 */
export const ScrollArea: DefineComponent<Omit<ScrollAreaOptions, "inner"> & { as?: string }>;
export const Player: DefineComponent<{ src?: string; poster?: string; label?: string }>;
export const AudioPlayer: DefineComponent<{ src?: string; title?: string; sub?: string; wave?: string }>;
