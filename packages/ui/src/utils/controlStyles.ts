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
 * Satin 原生禁用态（对齐 form.css `.sn-input:disabled`）：
 * 使用 `--sn-fill-subtle` 柔灰填充 + `--sn-label-off` 弱对比文字 + 淡细描边，
 * 在白面板上依然有明确可见的控件占位，且由 `disabled:` 变体驱动，避免类名顺序覆盖问题。
 */
const controlDisabled = [
  "disabled:cursor-not-allowed",
  "disabled:border-sn-line disabled:bg-sn-subtle disabled:text-sn-label-off disabled:shadow-none",
  "disabled:hover:border-sn-line disabled:hover:bg-sn-subtle disabled:hover:shadow-none",
].join(" ");

/**
 * Satin 原生校验失败态（对齐 form.css `.sn-field.sn-bad .sn-input`）：
 * 红色实线描边 `--sn-danger`，聚焦时展开 3px `--sn-danger-ring` 柔光环。
 */
const controlInvalid = [
  "aria-[invalid=true]:border-sn-danger aria-[invalid=true]:hover:border-sn-danger",
  "aria-[invalid=true]:focus:border-sn-danger aria-[invalid=true]:focus:shadow-[0_0_0_3px_var(--sn-danger-ring)]",
  "aria-[invalid=true]:focus-visible:border-sn-danger aria-[invalid=true]:focus-visible:shadow-[0_0_0_3px_var(--sn-danger-ring)]",
].join(" ");

/**
 * 输入类控件表面（对齐 Satin `.sn-input`）：
 * 1px 内部实线描边 `--sn-line-control` + `--sn-field` 底色，不被祖先 overflow 裁切；
 * 聚焦切换 `--sn-focus` 描边并展开 3px `--sn-ring` 光环。
 */
const controlFieldStates = [
  "border border-sn-line-control bg-sn-field text-sn-label outline-none",
  "transition-[color,background-color,border-color,box-shadow] duration-150 ease-[var(--sn-ease-out)]",
  "placeholder:text-sn-label3 hover:border-sn-line-control-hover",
  "focus:border-sn-focus focus:shadow-[0_0_0_3px_var(--sn-ring)]",
  "focus-visible:border-sn-focus focus-visible:shadow-[0_0_0_3px_var(--sn-ring)]",
  controlInvalid,
  controlDisabled,
].join(" ");

/** 单行输入框：跟随 Satin 控件圆角令牌（默认胶囊 pill，支持 6/8/10/pill 实时切换）。 */
export const controlSurface = ["rounded-[var(--sn-btn-r)]", controlFieldStates].join(" ");

/** 多行输入框：Satin 限制最大 14px 圆角。 */
export const controlMultilineSurface = [
  "rounded-[min(var(--sn-btn-r),14px)]",
  controlFieldStates,
].join(" ");

/**
 * 触发器类控件（下拉、日期选择器等 button）表面（对齐 Satin `.sn-select > .sn-trigger`）：
 * - 1px 内部实线描边 `--sn-line-control` + `--sn-field` 底色；
 * - 鼠标点击展开走 `data-[state=open]` 描边提亮与实色微暗（绝不留键盘焦点光晕，也不闪白）；
 * - 键盘焦点走 `focus-visible` 展开 3px `--sn-ring`；
 * - 按压呈现 Satin `--sn-press` (0.97) 物理弹性反馈。
 */
const controlTriggerStates = [
  "border border-sn-line-control bg-sn-field text-sn-label outline-none",
  "transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-[var(--sn-ease-out)] active:scale-[var(--sn-press)] disabled:active:scale-100",
  "hover:border-sn-line-control-hover",
  "focus-visible:border-sn-focus focus-visible:shadow-[0_0_0_3px_var(--sn-ring)]",
  "data-[state=open]:border-sn-line-control-hover data-[state=open]:bg-sn-hover-solid",
  controlInvalid,
  controlDisabled,
].join(" ");

export const controlSurfaceTrigger = ["rounded-[var(--sn-btn-r)]", controlTriggerStates].join(" ");

/** 会随已选标签换行长高的触发器（MultiSelect）：对齐 Satin 多行控件圆角上限。 */
export const controlMultilineSurfaceTrigger = [
  "rounded-[min(var(--sn-btn-r),14px)]",
  controlTriggerStates,
].join(" ");
