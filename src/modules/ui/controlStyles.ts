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
  "rounded-2xl border-0 bg-white text-[#71717A] shadow-[0_3px_12px_rgb(0_0_0_/_0.12)] outline-none transition-colors placeholder:text-[#96969B] hover:bg-white hover:text-[#18181B] focus-visible:ring-2 focus-visible:ring-black/[0.08] dark:bg-[#27272A] dark:text-[#A1A1AA] dark:shadow-[0_8px_24px_rgb(0_0_0_/_0.24)] dark:placeholder:text-[#9F9FA8] dark:hover:bg-[#303036] dark:hover:text-white dark:focus-visible:ring-white/10";
