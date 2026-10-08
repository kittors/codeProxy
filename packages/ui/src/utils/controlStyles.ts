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
 * 现在静止态是白底 + 阴影描边，禁用态反过来铺一层浅灰、描边减到一条细线，同样满足这条。
 *
 * 用 `disabled:` 变体而不是条件拼接类名：`.disabled\:x:disabled` 的特异性高于裸类，
 * 覆盖关系由选择器决定，不再受 Tailwind 输出顺序影响（旧写法正是栽在这上面）。
 * 悬停同理用 `disabled:hover:` 叠加变体压住 `hover:`。
 */
const controlDisabled = [
  "disabled:cursor-not-allowed",
  "disabled:bg-slate-100/80 disabled:text-slate-400 disabled:shadow-[0_0_0_1px_var(--cp-line)]",
  "disabled:hover:bg-slate-100/80 disabled:hover:shadow-[0_0_0_1px_var(--cp-line)]",
  "dark:disabled:bg-white/[0.05] dark:disabled:text-white/30",
  "dark:disabled:hover:bg-white/[0.05]",
].join(" ");

/**
 * 校验失败：由 `aria-invalid="true"` 属性驱动，红色阴影描边，聚焦时补一圈很淡的红色光晕。
 * Tailwind 没有内置 aria-invalid 变体，只能写成 `aria-[invalid=true]:`。
 * 用叠加变体（`…:hover:` 等）是为了让特异性高过普通的悬停/聚焦描边。
 */
const INVALID_RING = "shadow-[0_0_0_1px_rgb(229_72_77/0.8)]";
const INVALID_FOCUS = "shadow-[0_0_0_1px_rgb(229_72_77/0.85),0_0_0_4px_rgb(229_72_77/0.14)]";
const controlInvalid = [
  `aria-[invalid=true]:${INVALID_RING} aria-[invalid=true]:hover:${INVALID_RING}`,
  `aria-[invalid=true]:focus:${INVALID_FOCUS}`,
  `aria-[invalid=true]:focus-visible:${INVALID_FOCUS}`,
].join(" ");

/**
 * 输入类控件（input / textarea）的状态，不含圆角——单行和多行的圆角不同，由下面两个
 * 导出各自补上。
 *
 * 不用 border：白底（深色是轻微提亮）靠 `shadow-control`——一圈 1px 阴影描边加一道 1px
 * 投影——成形，读起来是「微微凸起、可以填的格子」，而不是画出来的框线（input 挂不了
 * 伪元素，所以控件用阴影描边，卡片才用 .cp-edge）。悬停描边加深一档；聚焦时描边换成
 * 强调蓝，外面补一圈很淡的同色光晕——全站只有一个强调色，焦点用它不会和别的颜色打架。
 * 输入框保留 `focus:`（不只是 focus-visible）是有意为之：鼠标点进去那一下变化就是
 * 「光标在这里，可以打字了」。
 */
const controlFieldStates = [
  "bg-field text-ink shadow-control outline-none",
  "transition-[color,background-color,box-shadow] duration-150 ease-soft",
  "placeholder:text-ink-3 hover:shadow-control-hover",
  "focus:shadow-control-focus focus-visible:shadow-control-focus",
  controlInvalid,
  controlDisabled,
].join(" ");

/** 单行输入框：胶囊形，和按钮、下拉触发器放在同一条工具栏里时轮廓一致。 */
export const controlSurface = ["rounded-full", controlFieldStates].join(" ");

/** 多行输入框：胶囊形撑不住多行内容，改用 16px 圆角，其余状态与单行一致。 */
export const controlMultilineSurface = ["rounded-2xl", controlFieldStates].join(" ");

/**
 * 触发器类控件（下拉、日期选择器等 button）的统一表面。
 *
 * 与输入框刻意不同：鼠标点开一个下拉不该给控件套上聚焦光晕。那圈光晕在筛选栏里读起来
 * 像「这里出错了」，而且鼠标松开后焦点仍留在按钮上，光晕会一直挂着，不是一闪而过。
 * 所以光晕只留给键盘（focus-visible）；鼠标交互由悬停和「已展开」两个态表达，都只动
 * 阴影描边的深浅、不动底色——展开时底色不会突然变亮，也就没有「闪一下」。
 * e2e/control-surface-states.spec.ts 在真实渲染里守着这两条。
 *
 * 展开态走 `data-[state=open]`，同样是为了让特异性而非类名顺序决定覆盖关系。
 */
const controlTriggerStates = [
  "bg-field text-ink shadow-control outline-none",
  "transition-[color,background-color,box-shadow] duration-150 ease-soft",
  "hover:shadow-control-hover",
  "focus-visible:shadow-control-focus",
  "data-[state=open]:shadow-control-hover",
  controlInvalid,
  controlDisabled,
].join(" ");

export const controlSurfaceTrigger = ["rounded-full", controlTriggerStates].join(" ");

/** 会随已选标签换行长高的触发器（MultiSelect）：长高后胶囊形会变成跑道形，改用 16px 圆角。 */
export const controlMultilineSurfaceTrigger = ["rounded-2xl", controlTriggerStates].join(" ");
