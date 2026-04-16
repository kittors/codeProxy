export const cn = (...classes: (string | false | undefined | null)[]) =>
  classes.filter(Boolean).join(" ");

export const selectTriggerBase =
  "inline-flex h-10 items-center gap-1.5 rounded-full border-0 bg-white px-3.5 text-sm font-medium text-[#71717A] shadow-[0_2px_10px_rgb(0_0_0_/_0.10)] outline-none transition-colors hover:bg-white hover:text-[#18181B] focus-visible:ring-2 focus-visible:ring-black/[0.08] dark:bg-[#27272A] dark:text-[#A1A1AA] dark:shadow-none dark:hover:bg-[#303036] dark:hover:text-white dark:focus-visible:ring-white/10";

export const selectTriggerOpen =
  "bg-white text-[#18181B] shadow-[0_2px_10px_rgb(0_0_0_/_0.12)] hover:bg-white dark:bg-[#27272A] dark:text-white dark:shadow-none dark:hover:bg-[#303036]";

export const selectTriggerDisabled =
  "cursor-not-allowed bg-white/70 text-[#A1A1AA] opacity-70 shadow-none dark:bg-[#27272A]/70 dark:text-[#71717A]";

export const selectTriggerChip =
  "inline-flex h-8 items-center justify-center gap-1.5 rounded-full border-0 bg-white px-2.5 text-[11px] font-semibold text-[#71717A] shadow-[0_2px_8px_rgb(0_0_0_/_0.08)] outline-none transition-colors hover:bg-white hover:text-[#18181B] focus-visible:ring-2 focus-visible:ring-black/[0.08] dark:bg-[#27272A] dark:text-[#A1A1AA] dark:shadow-none dark:hover:bg-[#303036] dark:hover:text-white dark:focus-visible:ring-white/10";

export const selectChevron =
  "shrink-0 text-[#71717A] transition-transform duration-200 dark:text-[#A1A1AA]";

export const selectPanel =
  "fixed z-[9999] overflow-hidden rounded-2xl border-0 bg-white p-1 shadow-xl shadow-black/10 dark:bg-[#27272A] dark:shadow-black/30";

export const searchableSelectPanel =
  "fixed z-[9999] flex flex-col overflow-hidden rounded-2xl border-0 bg-white shadow-xl shadow-black/10 dark:bg-[#27272A] dark:shadow-black/30";

export const selectSearchRow =
  "flex items-center gap-2 border-b border-black/[0.06] px-3 py-2 dark:border-white/10";

export const selectSearchInput =
  "h-6 w-full bg-transparent text-sm text-[#18181B] outline-none placeholder:text-[#96969B] dark:text-white dark:placeholder:text-[#9F9FA8]";

export const selectOptionBase =
  "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left text-sm outline-none transition-colors hover:bg-[#EBEBEC] hover:text-[#18181B] dark:hover:bg-[#46464C] dark:hover:text-white";

export const selectOptionSelected =
  "bg-[#EBEBEC] font-medium text-[#18181B] dark:bg-[#46464C] dark:text-white";

export const selectOptionIdle = "text-[#18181B] dark:text-[#9F9FA8]";

export const selectEmptyState =
  "px-2.5 py-3 text-center text-xs text-[#96969B] dark:text-[#9F9FA8]";
