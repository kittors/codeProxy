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
 * 现在静止态是白底描边，禁用态反过来铺一层浅灰，比可用态略深，同样满足这条。
 *
 * 用 `disabled:` 变体而不是条件拼接类名：`.disabled\:x:disabled` 的特异性高于裸类，
 * 覆盖关系由选择器决定，不再受 Tailwind 输出顺序影响（旧写法正是栽在这上面）。
 * 悬停时的描边同理用 `disabled:hover:` 叠加变体压住 `hover:`。
 */
const controlDisabled = [
  "disabled:cursor-not-allowed",
  "disabled:border-line disabled:bg-slate-100/80 disabled:text-slate-400 disabled:shadow-none",
  "disabled:hover:border-line disabled:hover:bg-slate-100/80",
  "dark:disabled:bg-white/[0.05] dark:disabled:text-white/30",
  "dark:disabled:hover:bg-white/[0.05]",
].join(" ");

/**
 * 校验失败：由 `aria-invalid="true"` 属性驱动，红色描边，聚焦时补一圈很淡的红色光晕。
 * Tailwind 没有内置 aria-invalid 变体，只能写成 `aria-[invalid=true]:`。
 * 用叠加变体（`…:hover:` 等）是为了让特异性高过普通的悬停/聚焦描边。
 */
const controlInvalid = [
  "aria-[invalid=true]:border-err aria-[invalid=true]:hover:border-err",
  "aria-[invalid=true]:focus:border-err aria-[invalid=true]:focus:ring-err/[0.12]",
  "aria-[invalid=true]:focus-visible:border-err aria-[invalid=true]:focus-visible:ring-err/[0.12]",
].join(" ");

/**
 * 输入类控件（input / textarea）的状态，不含圆角——单行和多行的圆角不同，由下面两个
 * 导出各自补上。
 *
 * 白底（深色是轻微提亮）+ 1px 中性描边成形；悬停描边加深一档；聚焦时描边再加深，
 * 外面补一圈 4px、6% 不透明度的中性光晕。刻意不用彩色发光环——密集表单里那圈彩光会
 * 盖住相邻控件，也让界面显得吵。描边是真实的 border 而不是 inset 阴影，box-shadow 只
 * 留给聚焦光晕，避免两者互相覆盖。
 * 输入框保留 `focus:`（不只是 focus-visible）是有意为之：鼠标点进去那一下变化就是
 * 「光标在这里，可以打字了」。
 */
const controlFieldStates = [
  "border border-line-strong bg-field text-ink shadow-xs outline-none dark:shadow-none",
  "transition-[color,background-color,border-color,box-shadow] duration-150 ease-soft",
  "placeholder:text-ink-3 hover:border-ink-4",
  "focus:border-ink-3 focus:ring-4 focus:ring-ink/[0.06]",
  "focus-visible:border-ink-3 focus-visible:ring-4 focus-visible:ring-ink/[0.06]",
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
 * 描边颜色、不动底色——展开时底色不会突然变亮，也就没有「闪一下」。
 * e2e/control-surface-states.spec.ts 在真实渲染里守着这两条。
 *
 * 展开态走 `data-[state=open]`，同样是为了让特异性而非类名顺序决定覆盖关系。
 */
const controlTriggerStates = [
  "border border-line-strong bg-field text-ink shadow-xs outline-none dark:shadow-none",
  "transition-[color,background-color,border-color,box-shadow] duration-150 ease-soft",
  "hover:border-ink-4",
  "focus-visible:border-ink-3 focus-visible:ring-4 focus-visible:ring-ink/[0.06]",
  "data-[state=open]:border-ink-3",
  controlInvalid,
  controlDisabled,
].join(" ");

export const controlSurfaceTrigger = ["rounded-full", controlTriggerStates].join(" ");

/** 会随已选标签换行长高的触发器（MultiSelect）：长高后胶囊形会变成跑道形，改用 16px 圆角。 */
export const controlMultilineSurfaceTrigger = ["rounded-2xl", controlTriggerStates].join(" ");
