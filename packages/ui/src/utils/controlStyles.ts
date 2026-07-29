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
 * 输入类控件的统一表面。
 *
 * 用「填充」而不是「描边」表达层级：静止态是一块柔和底色，聚焦时底色提亮、并补一条 1px
 * 中性描边。刻意不做彩色发光环——密集表单里那圈光晕会盖住相邻控件，也让界面显得吵。
 */
export const controlSurface =
  "rounded-2xl border-0 bg-slate-100/80 text-slate-800 shadow-none outline-none transition-[color,background-color,box-shadow] duration-150 placeholder:text-slate-400 hover:bg-slate-100 focus:bg-white focus:ring-1 focus:ring-slate-900/12 focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-slate-900/12 dark:bg-white/[0.055] dark:text-slate-100 dark:placeholder:text-white/30 dark:hover:bg-white/[0.08] dark:focus:bg-white/[0.09] dark:focus:ring-white/15 dark:focus-visible:bg-white/[0.09] dark:focus-visible:ring-white/15";
