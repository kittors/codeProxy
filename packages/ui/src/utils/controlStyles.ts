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

export const controlSurface =
  "rounded-xl border border-slate-200 bg-white text-slate-700 shadow-none outline-none transition-colors placeholder:text-slate-400 hover:border-slate-300 hover:bg-white hover:text-slate-900 focus-visible:border-slate-400 focus-visible:ring-0 focus-visible:ring-transparent dark:border-neutral-700 dark:bg-neutral-950 dark:text-slate-200 dark:shadow-none dark:placeholder:text-slate-500 dark:hover:border-neutral-600 dark:hover:bg-neutral-950 dark:hover:text-white dark:focus-visible:border-neutral-500 dark:focus-visible:ring-transparent";
