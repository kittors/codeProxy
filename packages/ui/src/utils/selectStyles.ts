import {
  controlHeightBySize,
  controlMultilineSurfaceTrigger,
  controlPaddingBySize,
  controlSurfaceTrigger,
  controlTextBySize,
  type ControlSize,
} from "../utils/controlStyles";

export const cn = (...classes: (string | false | undefined | null)[]) =>
  classes.filter(Boolean).join(" ");

export const getSelectTriggerBase = (
  size: ControlSize = "default",
  shape: "pill" | "multiline" = "pill",
) =>
  [
    "inline-flex min-w-0 items-center justify-between gap-1.5 font-medium",
    controlHeightBySize[size],
    controlTextBySize[size],
    controlPaddingBySize[size],
    shape === "multiline" ? controlMultilineSurfaceTrigger : controlSurfaceTrigger,
  ].join(" ");

/**
 * 触发器的展开/禁用态由 `data-state` 与原生 `disabled` 属性驱动（见 controlSurfaceTrigger）。
 */
export const selectTriggerState = (open: boolean) => (open ? "open" : "closed");

/** 紧凑型触发器（分页条的每页条数等）：跟随 Satin 控件圆角令牌，白底细描边。 */
export const selectTriggerChip = [
  "inline-flex h-7 items-center justify-center gap-1.5 rounded-[var(--sn-btn-r)] bg-surface px-3 shadow-control",
  "text-xs font-medium text-ink-2 outline-none transition-[color,background-color,box-shadow] duration-150 ease-soft",
  "hover:text-ink hover:shadow-control-hover data-[state=open]:text-ink data-[state=open]:shadow-control-hover",
  "disabled:cursor-not-allowed disabled:text-ink-4 disabled:hover:shadow-control disabled:hover:text-ink-4",
].join(" ");

/** 幽灵触发器（顶栏里的切换租户）：无边框无底色，跟随 Satin 控件圆角，悬停与展开共用一层浅灰。 */
export const selectTriggerGhost = [
  "inline-flex h-8 min-w-0 items-center justify-between gap-1.5 rounded-[var(--sn-btn-r)] border-0 bg-transparent px-3",
  "text-sm font-medium text-ink-2 outline-none transition-colors duration-150 ease-soft",
  "hover:bg-hover hover:text-ink data-[state=open]:bg-hover data-[state=open]:text-ink",
  "disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent",
].join(" ");

export const selectChevron =
  "ml-auto shrink-0 text-[var(--sn-label3)] transition-transform duration-200 ease-[var(--sn-ease-out-strong)]";

/**
 * 非下拉菜单型浮层（侧栏收起态飞出、建议列表等）共用的 Satin 表面令牌：
 * --sn-menu-bg / --sn-menu-shadow / --sn-r-lg，零旧 FloatingPanel.css 依赖。
 */
export const floatingPanelSurface =
  "rounded-[var(--sn-r-lg)] bg-[var(--sn-menu-bg,var(--sn-overlay))] text-[var(--sn-label)] shadow-[var(--sn-menu-shadow,var(--sn-e1))]";

/** Satin 原生浮层下拉菜单底座（配合 useSatinFloatingLayer + sn-open/sn-up/sn-end 驱动原生微动效）。 */
export const selectPanel = "sn-menu sn-float sn-solid !p-0 overflow-hidden outline-none";

export const searchableSelectPanel = "sn-menu sn-float sn-solid !p-0 flex flex-col overflow-hidden outline-none";

export const selectSearchRow = "flex items-center gap-2 border-b border-[var(--sn-line)] px-3.5 py-2.5";

export const selectSearchInput =
  "h-6 w-full bg-transparent text-sm text-[var(--sn-label)] outline-none placeholder:text-[var(--sn-label3)]";

/** 选项：对齐 Satin `.sn-item`（圆角行 + --sn-b-ghost-hover 悬停 + 按压反馈）。 */
export const selectOptionBase =
  "sn-item flex w-full items-center gap-2.5 border-0 bg-transparent text-left text-sm text-[var(--sn-label)] outline-none hover:bg-[var(--sn-b-ghost-hover)] focus-visible:bg-[var(--sn-b-ghost-hover)]";

export const selectOptionSelected = "sn-sel font-medium text-[var(--sn-label)]";

export const selectOptionIdle = "text-[var(--sn-label)]";

/** 选中项右侧的对勾。 */
export const selectOptionCheck = "ml-auto shrink-0 text-[var(--sn-label)]";

/**
 * 多选列表里的 Satin 方形勾选框：实心强调色 + 对勾。
 */
export const selectCheckboxBox = (checked: boolean) =>
  cn(
    "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border transition-all duration-150 ease-[var(--sn-ease-overshoot)]",
    checked
      ? "border-[var(--sn-accent)] bg-[var(--sn-accent)] text-[var(--sn-on-primary)]"
      : "border-[var(--sn-line-control-hover)] bg-[var(--sn-field)]",
  );

/** 浮层里的轻量文字操作（全选、清空、取消）。 */
export const selectTextAction = "sn-btn sn-ghost sn-xs text-[var(--sn-label2)]";

export const selectEmptyState = "px-2.5 py-3 text-center text-xs text-[var(--sn-label3)]";
