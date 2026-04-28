import {
  controlHeightBySize,
  controlPaddingBySize,
  controlSurface,
  controlTextBySize,
  type ControlSize,
} from "@/modules/ui/controlStyles";

export const cn = (...classes: (string | false | undefined | null)[]) =>
  classes.filter(Boolean).join(" ");

export const getSelectTriggerBase = (size: ControlSize = "default") =>
  [
    "inline-flex min-w-0 items-center justify-between gap-1.5 font-medium",
    controlHeightBySize[size],
    controlTextBySize[size],
    controlPaddingBySize[size],
    controlSurface,
  ].join(" ");

export const selectTriggerBase = getSelectTriggerBase();

export const selectTriggerOpen = "";

export const selectTriggerDisabled =
  "cursor-not-allowed bg-white/70 text-[#A1A1AA] opacity-70 shadow-none dark:bg-[#27272A]/70 dark:text-[#71717A]";

export const selectTriggerChip =
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-xl border-0 bg-white px-2.5 text-[11px] font-semibold text-[#71717A] shadow-[0_2px_8px_rgb(0_0_0_/_0.10)] outline-none transition-colors hover:bg-white hover:text-[#18181B] focus-visible:ring-2 focus-visible:ring-black/[0.08] dark:bg-[#27272A] dark:text-[#A1A1AA] dark:shadow-[0_6px_18px_rgb(0_0_0_/_0.22)] dark:hover:bg-[#303036] dark:hover:text-white dark:focus-visible:ring-white/10";

export const selectChevron =
  "ml-auto shrink-0 text-[#71717A] transition-transform duration-200 dark:text-[#A1A1AA]";

export const selectPanel =
  "fixed z-[9999] overflow-hidden rounded-2xl border-0 bg-white p-1 shadow-[0_8px_28px_rgb(0_0_0_/_0.16)] dark:bg-[#27272A] dark:shadow-[0_14px_36px_rgb(0_0_0_/_0.38)]";

export const searchableSelectPanel =
  "fixed z-[9999] flex flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-[0_8px_28px_rgb(0_0_0_/_0.16)] dark:bg-[#27272A] dark:shadow-[0_14px_36px_rgb(0_0_0_/_0.38)]";

export const selectSearchRow =
  "flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 dark:border-white/10";

export const selectSearchInput =
  "h-6 w-full bg-transparent text-sm text-[#18181B] outline-none placeholder:text-[#96969B] dark:text-white dark:placeholder:text-[#9F9FA8]";

export const selectOptionBase =
  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-[#EBEBEC] hover:text-[#18181B] dark:hover:bg-[#46464C] dark:hover:text-white";

export const selectOptionSelected = "font-medium text-[#18181B] dark:text-white";

export const selectOptionIdle = "text-[#18181B] dark:text-[#9F9FA8]";

export const selectEmptyState =
  "px-2.5 py-3 text-center text-xs text-[#96969B] dark:text-[#9F9FA8]";

export const getSelectDropdownMotion = (placement: "bottom" | "top" = "bottom") => {
  const exitOffset = placement === "top" ? 2 : -2;

  return {
    initial: { opacity: 1, scale: 1, y: 0 },
    animate: { opacity: 1, scale: 1, y: 0 },
    exit: { opacity: 0, scale: 0.98, y: exitOffset },
  } as const;
};

export const selectDropdownTransition = {
  duration: 0.14,
  ease: [0.4, 0, 0.2, 1],
} as const;
