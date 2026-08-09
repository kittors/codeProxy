export type ControlSize = "sm" | "default" | "lg";

export const controlHeightBySize: Record<ControlSize, string> = {
  sm: "h-8",
  default: "h-9",
  lg: "h-10",
};

export const controlTextBySize: Record<ControlSize, string> = {
  sm: "text-xs",
  default: "text-sm",
  lg: "text-sm",
};

export const controlPaddingBySize: Record<ControlSize, string> = {
  sm: "px-3",
  default: "px-3.5",
  lg: "px-4",
};

/**
 * 禁用态：保留和静止态同强度的填充，只把文字和图标降到弱对比。
 *
 * 早期版本用 `bg-white/70 + opacity-70` 表达禁用，结果在白色面板上禁用控件比可用控件
 * 还浅，整个控件看起来「消失」了——用户读到的不是「不可用」，而是「这里没有东西」。
 * 禁用态必须仍然占住视觉位置，可用性差异靠文字对比度和 not-allowed 光标传达。
 *
 * 用 `disabled:` 变体而不是条件拼接类名：`.disabled\:x:disabled` 的特异性高于裸类，
 * 覆盖关系由选择器决定，不再受 Tailwind 输出顺序影响（旧写法正是栽在这上面）。
 */
const controlDisabled = [
  "disabled:cursor-not-allowed",
  "disabled:bg-slate-100/80 disabled:text-slate-400 disabled:shadow-none",
  "disabled:hover:bg-slate-100/80",
  "dark:disabled:bg-white/[0.05] dark:disabled:text-white/30",
  "dark:disabled:hover:bg-white/[0.05]",
].join(" ");

/**
 * 输入类控件（input / textarea）的统一表面。
 *
 * 用「填充」而不是「描边」表达层级：静止态是一块柔和底色，聚焦时底色提亮、并补一条 1px
 * 中性描边。刻意不做彩色发光环——密集表单里那圈光晕会盖住相邻控件，也让界面显得吵。
 * 输入框保留 `focus:` 提亮是有意为之：那一下变亮就是「光标在这里，可以打字了」。
 */
export const controlSurface = [
  "rounded-2xl border-0 bg-slate-100/80 text-slate-800 shadow-none outline-none",
  "transition-[color,background-color,box-shadow] duration-150",
  "placeholder:text-slate-400 hover:bg-slate-100",
  "focus:bg-white focus:ring-1 focus:ring-slate-900/12",
  "focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-slate-900/12",
  "dark:bg-white/[0.055] dark:text-slate-100 dark:placeholder:text-white/30 dark:hover:bg-white/[0.08]",
  "dark:focus:bg-white/[0.09] dark:focus:ring-white/15",
  "dark:focus-visible:bg-white/[0.09] dark:focus-visible:ring-white/15",
  controlDisabled,
].join(" ");

/**
 * 触发器类控件（下拉、日期选择器等 button）的统一表面。
 *
 * 与输入框刻意不同：鼠标点开一个下拉不该把控件刷成白底加描边。那圈描边在筛选栏里读起来
 * 像「这里出错了」，而且鼠标松开后焦点仍留在按钮上，白底会一直挂着，不是一闪而过。
 * 所以焦点态只留给键盘（focus-visible），鼠标交互由 hover 和「已展开」两个态表达，
 * 且这两个态共用同一块底色——从悬停到展开没有任何颜色跳变，也就没有「闪一下」。
 *
 * 展开态走 `data-[state=open]`，同样是为了让特异性而非类名顺序决定覆盖关系。
 */
export const controlSurfaceTrigger = [
  "rounded-2xl border-0 bg-slate-100/80 text-slate-800 shadow-none outline-none",
  "transition-[color,background-color,box-shadow] duration-150",
  "hover:bg-slate-200/70",
  "focus-visible:ring-1 focus-visible:ring-slate-900/12",
  "data-[state=open]:bg-slate-200/70 data-[state=open]:text-slate-900",
  "dark:bg-white/[0.055] dark:text-slate-100 dark:hover:bg-white/[0.10]",
  "dark:focus-visible:ring-white/15",
  "dark:data-[state=open]:bg-white/[0.10] dark:data-[state=open]:text-white",
  controlDisabled,
].join(" ");
