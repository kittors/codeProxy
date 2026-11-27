// satin-ui/svelte/<名字>.svelte 的类型（Svelte 5 组件，直接发 .svelte 源码，项目里的 @sveltejs/vite-plugin-svelte 编译）
// 一个一个引：import Select from "satin-ui/svelte/Select.svelte"——导出表 "./svelte/*.svelte" 的类型指到 svelte-<名字>.d.ts，它们从这里转出
import type { Component, Snippet } from "svelte";
import type { SatinFactory, SatinInstance, Item, PickerKind, PickDetail, AvatarOptions, EmptyArtOptions } from "./components";
type Attrs = { class?: string; style?: string; id?: string; [attr: `data-${string}`]: unknown; [attr: `aria-${string}`]: unknown };
type Inst = { /** bind:instance 拿到 Satin 实例（update / destroy / 各组件的方法） */ instance?: SatinInstance | null };
type SelectProps = Attrs & Inst & { items: Item[]; /** bind:value 双向绑定 */ value?: string; placeholder?: string; label?: string; onchange?(value: string): void };
type DatePickerProps = Attrs & Inst & { kind?: PickerKind; placeholder?: string; label?: string; today?: Date; now?: Date; /** 选好、清除时；text 是触发框里显示的文字 */ onchange?(detail: PickDetail): void };
type DialogProps = Attrs & {
  /** bind:open 双向绑定 */ open?: boolean; title?: string; description?: string; icon?: string;
  /** 拦下关闭（Esc、取消、×）：确认要关时调 close() */ guard?(close: () => void): void;
  /** 是否允许按住标题栏拖动弹窗（默认 true；双击标题栏复位） */ draggable?: boolean;
  /** 关完以后（open 同时改回 false） */ onclose?(): void; onsubmit?(e: SubmitEvent): void; footerClass?: string; children?: Snippet; footer?: Snippet;
};
type IconProps = { name: string; size?: number; class?: string };
type EmptyArtProps = Attrs & EmptyArtOptions;
type SatinProps = Attrs & Inst & { create: SatinFactory<any, any>; options?: Record<string, unknown> };
type AvatarProps = Attrs & Inst & AvatarOptions;
type SegmentedProps = Attrs & Inst & { items: Item[]; size?: "sm" | "md"; label?: string; /** bind:value 双向绑定 */ value?: string; onchange?(value: string): void };
type SliderProps = Attrs & Inst & { max?: number; label?: string; /** bind:value 双向绑定 */ value?: number; onchange?(value: number): void };
type TabsProps = Attrs & Inst & { tabs: { label: string; badge?: string | number; content?: string; html?: string }[]; /** bind:value 双向绑定 */ value?: number; onchange?(value: number): void };
type PagerProps = Attrs & Inst & { total: number; count?: number; /** bind:page 双向绑定 */ page?: number; onchange?(page: number): void };
type TagInputProps = Attrs & Inst & { max?: number; placeholder?: string; hint?: string; /** bind:tags 双向绑定 */ tags?: string[]; onchange?(tags: string[]): void };
type StepperProps = Attrs & Inst & { min?: number; max?: number; unit?: string; label?: string; /** bind:value 双向绑定 */ value?: number; onchange?(value: number): void };
type OtpProps = Attrs & Inst & { length?: number; /** 密码隐藏模式（掩码圆点显示） */ mask?: boolean; /** 是否显示明文/密文切换眼睛按钮（开启 mask 时默认为 true） */ reveal?: boolean; oncomplete?(code: string): void };
type CollapseProps = Attrs & Inst & { items: { title: string; content?: string; html?: string }[]; single?: boolean; /** 展开的序号；bind:open 双向绑定 */ open?: number[]; ontoggle?(e: { index: number; open: boolean }): void; onchange?(open: number[]): void };
type NumberFlowProps = Attrs & Inst & { value: number; /** 变化的样子 */ effect?: "roll" | "blur" | "push" | "fade"; format?(v: number): string };
/** 下拉选择：<Select items={…} bind:value label="…" /> */
export const Select: Component<SelectProps, {}, "value" | "instance">;
/** 日期、时间、地址选择器：<DatePicker kind="range" onchange={(d) => …} />；没有 bind:value（现在只能读出选中的结果） */
export const DatePicker: Component<DatePickerProps, {}, "instance">;
/** 弹窗：<Dialog bind:open title="…">内容{#snippet footer()}按钮{/snippet}</Dialog> */
export const Dialog: Component<DialogProps, {}, "open">;
/** 图标：<Icon name="plus" /> */
export const Icon: Component<IconProps>;
/** 空状态场景 SVG 插画：<EmptyArt name="projects" /> */
export const EmptyArt: Component<EmptyArtProps>;
/** 把任意 createXxx 包成组件：<Satin create={createChat} options={{ … }} bind:instance /> */
export const Satin: Component<SatinProps, {}, "instance">;
/** 头像：<Avatar name="林知远" size={24} decorative />；有照片给 src，加载失败退回预设 */
export const Avatar: Component<AvatarProps, {}, "instance">;
/** 分段控件：<Segmented items={["网格", "列表"]} bind:value={view} label="视图" /> */
export const Segmented: Component<SegmentedProps, {}, "value" | "instance">;
/** 滑块：<Slider bind:value={volume} max={100} label="音量" /> */
export const Slider: Component<SliderProps, {}, "value" | "instance">;
/** 标签页：<Tabs tabs={[{ label: "概览", content: "…" }]} bind:value={tab} />（value 是第几个，从 0 数） */
export const Tabs: Component<TabsProps, {}, "value" | "instance">;
/** 分页：<Pager total={24} bind:page={page} /> */
export const Pager: Component<PagerProps, {}, "page" | "instance">;
/** 标签输入：<TagInput bind:tags={tags} max={5} placeholder="输入后回车" /> */
export const TagInput: Component<TagInputProps, {}, "tags" | "instance">;
/** 步进器：<Stepper bind:value={count} min={1} max={10} unit="集" label="集数" /> */
export const Stepper: Component<StepperProps, {}, "value" | "instance">;
/** 验证码：<Otp length={6} oncomplete={(code) => …} /> */
export const Otp: Component<OtpProps, {}, "instance">;
/** 折叠面板：<Collapse items={[{ title: "…", content: "…" }]} single bind:open={open} ontoggle={(e) => …} /> */
export const Collapse: Component<CollapseProps, {}, "open" | "instance">;
/** 数字滚动：<NumberFlow value={count} effect="roll" />（value 变了数字滚过去） */
export const NumberFlow: Component<NumberFlowProps, {}, "instance">;
